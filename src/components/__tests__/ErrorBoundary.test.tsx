import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import { ErrorBoundary } from "../ErrorBoundary";

// 与实现保持一致的 sessionStorage 守卫键
const AUTO_RECOVER_KEY = "code-manager:error-boundary:last-recover";

// 渲染期必定抛错的子组件，用于触发 ErrorBoundary
function Boom(): never {
  throw new Error("boom");
}

function renderBoundary() {
  return render(
    <I18nProvider>
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    </I18nProvider>,
  );
}

describe("ErrorBoundary 自动恢复", () => {
  const reloadMock = vi.fn();
  const originalLocation = window.location;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    reloadMock.mockClear();
    window.sessionStorage.clear();
    // 抑制 React 错误边界捕获时打印的报错噪声
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // 用可控的 location 替身拦截整页重载
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "http://localhost:1420/", reload: reloadMock },
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("首次瞬时错误自动刷新一次且不显示手动兜底", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    renderBoundary();

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("页面出现错误")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(AUTO_RECOVER_KEY)).toBe("1000000");
  });

  it("自动刷新窗口内再次抛错时显示手动兜底且不再刷新", () => {
    window.sessionStorage.setItem(AUTO_RECOVER_KEY, "1000000");
    vi.spyOn(Date, "now").mockReturnValue(1_005_000); // 距上次 5s，仍在 10s 窗口内

    renderBoundary();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(screen.getByText("页面出现错误")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新加载" })).toBeInTheDocument();
  });

  it("超出窗口后再次抛错重新自愈刷新", () => {
    window.sessionStorage.setItem(AUTO_RECOVER_KEY, "1000000");
    vi.spyOn(Date, "now").mockReturnValue(1_020_000); // 距上次 20s，已超出 10s 窗口

    renderBoundary();

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("页面出现错误")).not.toBeInTheDocument();
  });
});
