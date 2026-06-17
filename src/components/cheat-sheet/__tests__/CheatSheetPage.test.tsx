import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import { ThemeProvider } from "../../theme-provider";
import CheatSheetPage from "../CheatSheetPage";

// CheatSheetPage 通过 MarkdownPreview / 自身按钮间接依赖 openUrl，mock 掉避免触达真实 Tauri
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => undefined),
}));

vi.mock("../../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function renderPage() {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <CheatSheetPage />
      </ThemeProvider>
    </I18nProvider>,
  );
}

describe("CheatSheetPage 目录", () => {
  it("根据正文标题构建目录，列出分区与子区", () => {
    renderPage();

    const toc = screen.getByRole("navigation", { name: "目录" });
    // H2 分区
    expect(within(toc).getByRole("button", { name: /键盘快捷键/ })).toBeInTheDocument();
    expect(within(toc).getByRole("button", { name: /斜杠命令/ })).toBeInTheDocument();
    // H3 子区
    expect(within(toc).getByRole("button", { name: /常用控制/ })).toBeInTheDocument();
  });

  it("点击目录项滚动到对应标题", () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    renderPage();

    const toc = screen.getByRole("navigation", { name: "目录" });
    fireEvent.click(within(toc).getByRole("button", { name: /斜杠命令/ }));

    expect(scrollSpy).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    scrollSpy.mockRestore();
  });
});
