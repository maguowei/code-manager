import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// mock useWorkSummaries，控制返回值
const mockUseWorkSummaries = vi.fn();
vi.mock("../../hooks/useWorkSummaries", () => ({
  useWorkSummaries: (...args: unknown[]) => mockUseWorkSummaries(...args),
}));

// ThemeProvider 不在测试环境中挂载，mock useTheme 返回 isDark: false
vi.mock("../theme-provider", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn(), isDark: false }),
}));

import { I18nProvider } from "../../i18n";
import WorkSummaryPage from "../WorkSummaryPage";

function defaultHookReturn() {
  return {
    items: [],
    selected: null,
    loading: false,
    generating: false,
    cliAvailable: true,
    reload: vi.fn(),
    select: vi.fn(),
    summarizeYesterday: vi.fn(),
    generateWeek: vi.fn(),
  };
}

describe("WorkSummaryPage", () => {
  it("renders action buttons and empty state", () => {
    mockUseWorkSummaries.mockReturnValue(defaultHookReturn());
    render(
      <I18nProvider>
        <WorkSummaryPage />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "总结昨日" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成本周" })).toBeInTheDocument();
    // items 为空且无 selected 时，左栏与主区都渲染 empty 文案，用 getAllByText 处理多匹配
    expect(screen.getAllByText("还没有任何总结，点击「总结昨日」开始。").length).toBeGreaterThan(0);
  });

  it("disables buttons when cliAvailable is false and shows cliMissing hint", () => {
    mockUseWorkSummaries.mockReturnValue({ ...defaultHookReturn(), cliAvailable: false });
    render(
      <I18nProvider>
        <WorkSummaryPage />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "总结昨日" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "生成本周" })).toBeDisabled();
    expect(
      screen.getByText("未检测到 claude CLI，请确认 Claude Code 已安装并在 PATH 中。"),
    ).toBeInTheDocument();
  });

  it("shows generating message when generating is true", () => {
    mockUseWorkSummaries.mockReturnValue({ ...defaultHookReturn(), generating: true });
    render(
      <I18nProvider>
        <WorkSummaryPage />
      </I18nProvider>,
    );
    expect(screen.getByText("正在生成总结…")).toBeInTheDocument();
    // generating 时按钮也应 disabled
    expect(screen.getByRole("button", { name: "总结昨日" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "生成本周" })).toBeDisabled();
  });
});
