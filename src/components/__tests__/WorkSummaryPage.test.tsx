import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// 控制 hook 返回值
const mockHook = vi.fn();
vi.mock("../../hooks/useSummaryConversation", () => ({
  useSummaryConversation: (...args: unknown[]) => mockHook(...args),
}));

// Thread 来自本地脚手架；mock 成占位避免拉起整个 runtime
vi.mock("../assistant-ui/thread", () => ({
  Thread: () => <div data-testid="thread" />,
}));

// AssistantRuntimeProvider 来自 @assistant-ui/react；mock 成 passthrough
vi.mock("@assistant-ui/react", () => ({
  AssistantRuntimeProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { I18nProvider } from "../../i18n";
import WorkSummaryPage from "../WorkSummaryPage";

function base() {
  return { runtime: {}, cliAvailable: true, runQuickAction: vi.fn() };
}

function renderPage() {
  render(
    <I18nProvider>
      <WorkSummaryPage />
    </I18nProvider>,
  );
}

describe("WorkSummaryPage", () => {
  it("渲染快捷按钮与 Thread", () => {
    mockHook.mockReturnValue(base());
    renderPage();
    expect(screen.getByRole("button", { name: "总结昨日" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成本周" })).toBeInTheDocument();
    expect(screen.getByTestId("thread")).toBeInTheDocument();
  });

  it("cliAvailable=false 时禁用快捷按钮并提示", () => {
    mockHook.mockReturnValue({ ...base(), cliAvailable: false });
    renderPage();
    expect(screen.getByRole("button", { name: "总结昨日" })).toBeDisabled();
    expect(
      screen.getByText("未检测到 claude CLI，请确认 Claude Code 已安装并在 PATH 中。"),
    ).toBeInTheDocument();
  });
});
