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
    process: null,
    cliAvailable: true,
    reload: vi.fn(),
    select: vi.fn(),
    viewSummary: vi.fn(),
    summarizeYesterday: vi.fn(),
    generateWeek: vi.fn(),
  };
}

function renderPage() {
  render(
    <I18nProvider>
      <WorkSummaryPage />
    </I18nProvider>,
  );
}

describe("WorkSummaryPage", () => {
  it("renders action buttons and empty state", () => {
    mockUseWorkSummaries.mockReturnValue(defaultHookReturn());
    renderPage();
    expect(screen.getByRole("button", { name: "总结昨日" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成本周" })).toBeInTheDocument();
    expect(screen.getAllByText("还没有任何总结，点击「总结昨日」开始。").length).toBeGreaterThan(0);
  });

  it("disables buttons when cliAvailable is false and shows cliMissing hint", () => {
    mockUseWorkSummaries.mockReturnValue({ ...defaultHookReturn(), cliAvailable: false });
    renderPage();
    expect(screen.getByRole("button", { name: "总结昨日" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "生成本周" })).toBeDisabled();
    expect(
      screen.getByText("未检测到 claude CLI，请确认 Claude Code 已安装并在 PATH 中。"),
    ).toBeInTheDocument();
  });

  it("disables buttons while a process is running", () => {
    mockUseWorkSummaries.mockReturnValue({
      ...defaultHookReturn(),
      process: { kind: "daily", phase: "scanning" },
    });
    renderPage();
    expect(screen.getByText("扫描项目变更中…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "总结昨日" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "生成本周" })).toBeDisabled();
  });

  it("renders scan detail, branch commits and uncommitted hint in the process view", () => {
    mockUseWorkSummaries.mockReturnValue({
      ...defaultHookReturn(),
      process: {
        kind: "daily",
        phase: "summarizing",
        candidateCount: 5,
        prompt: "## 项目\n素材",
        projects: [
          {
            project: "/x/proj",
            shortName: "proj",
            isConventional: true,
            intents: ["实现登录"],
            scanError: null,
            branches: [
              {
                branch: "main",
                isMain: true,
                hasUncommitted: true,
                uncommittedMaterial: "",
                commits: [
                  {
                    hash: "h1",
                    subject: "feat: add login",
                    body: "",
                    author: "A",
                    timestamp: 1,
                    filesChanged: 1,
                    insertions: 1,
                    deletions: 0,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    renderPage();
    // 扫描计数
    expect(screen.getByText("扫描 5 个项目 · 1 个有变更")).toBeInTheDocument();
    // 分支提交列表
    expect(screen.getByText("feat: add login")).toBeInTheDocument();
    // 未提交提示（不纳入总结）
    expect(screen.getByText(/有未提交变更（不纳入总结）/)).toBeInTheDocument();
    // 调用 Claude 中
    expect(screen.getByText("调用 Claude 生成中（可能需要 1-2 分钟）…")).toBeInTheDocument();
    // 提示词折叠入口
    expect(screen.getByText("查看最终提示词")).toBeInTheDocument();
  });

  it("shows the view-summary link on done and wires onView", () => {
    const viewSummary = vi.fn();
    const doc = { kind: "daily", key: "2026-06-23", path: "/p/2026-06-23.md", content: "# 总结" };
    mockUseWorkSummaries.mockReturnValue({
      ...defaultHookReturn(),
      viewSummary,
      process: { kind: "daily", phase: "done", candidateCount: 1, projects: [], doc },
    });
    renderPage();
    const link = screen.getByRole("button", { name: "查看总结 →" });
    expect(link).toBeInTheDocument();
    expect(screen.getByText("总结已生成并保存")).toBeInTheDocument();
    link.click();
    expect(viewSummary).toHaveBeenCalledWith(doc);
  });
});
