import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { SessionDetail } from "../../types";
import SessionDetailDrawer, { getMessagePresentation } from "../SessionDetailDrawer";
import { ThemeProvider } from "../theme-provider";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

function setSystemLanguages(languages: string[]) {
  Object.defineProperty(navigator, "languages", {
    value: languages,
    configurable: true,
  });
  Object.defineProperty(navigator, "language", {
    value: languages[0] ?? "",
    configurable: true,
  });
}

function renderDrawer(
  detail: Omit<SessionDetail, "plan_file_path" | "subagents"> &
    Partial<Pick<SessionDetail, "plan_file_path" | "subagents">>,
) {
  const defaults = { plan_file_path: null as null, subagents: [] as SessionDetail["subagents"] };
  const fullDetail: SessionDetail = { ...defaults, ...detail };
  invokeMock.mockResolvedValue(fullDetail);

  render(
    <ThemeProvider>
      <I18nProvider>
        <SessionDetailDrawer
          project="/Users/dev/Work/AI/code-manager"
          sessionId={detail.session_id}
          onClose={vi.fn()}
        />
      </I18nProvider>
    </ThemeProvider>,
  );
}

const SESSION_ID = "ee6bf047-1111-2222-3333-444444444444";

describe("SessionDetailDrawer", () => {
  beforeEach(() => {
    localStorage.clear();
    setSystemLanguages(["zh-CN"]);
    invokeMock.mockReset();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => undefined),
      },
    });
  });

  it("shows session context in the drawer header", async () => {
    const detail: SessionDetail = {
      session_id: SESSION_ID,
      project: "/Users/dev/Work/AI/code-manager",
      messages: [
        {
          role: "user",
          timestamp: "2026-05-08T14:21:27",
          blocks: [{ type: "text", text: "第一条消息" }],
        },
        {
          role: "assistant",
          timestamp: "2026-05-08T14:21:45",
          blocks: [{ type: "text", text: "最后一条消息" }],
        },
      ],
      plan_file_path: null,
      subagents: [],
    };

    renderDrawer(detail);

    const heading = await screen.findByRole("heading", { name: "对话详情" });
    expect(heading).toBeInTheDocument();
    const projectName = screen.getByText("code-manager");
    expect(projectName).toHaveAttribute("title", "/Users/dev/Work/AI/code-manager");
    expect(screen.queryByText("/Users/dev/Work/AI/code-manager")).not.toBeInTheDocument();
    const sessionBadge = screen.getByText("ee6bf047");
    expect(sessionBadge.closest('[data-slot="session-id-badge"]')).toHaveAttribute(
      "title",
      SESSION_ID,
    );
    const messageCount = screen.getByText("2 条消息");
    expect(messageCount).toBeInTheDocument();
    expect(
      screen.getByText(
        `${new Date("2026-05-08T14:21:27").toLocaleString()} - ${new Date(
          "2026-05-08T14:21:45",
        ).toLocaleString()}`,
      ),
    ).toBeInTheDocument();
    expect(messageCount.closest('[data-slot="session-detail-meta"]')).toHaveClass(
      "ml-auto",
      "justify-end",
    );
    const contextRow = messageCount.closest('[data-slot="session-detail-context-row"]');
    expect(contextRow).toContainElement(projectName);
    expect(contextRow).toContainElement(sessionBadge);
    expect(contextRow).toContainElement(messageCount);

    const userArticle = screen.getByText("第一条消息").closest('[data-slot="session-message"]');
    const assistantArticle = screen
      .getByText("最后一条消息")
      .closest('[data-slot="session-message"]');
    expect(userArticle).toHaveAttribute("data-role", "user");
    expect(userArticle).toHaveClass("grid-cols-[2rem_minmax(0,1fr)_2rem]");
    expect(userArticle?.querySelector(".col-start-2")).toHaveClass(
      "bg-card",
      "relative",
      "row-start-1",
      "group-hover:border-muted-foreground/40",
    );
    expect(userArticle?.querySelector(".col-start-2")).not.toHaveClass("group-hover:ring-ring");
    expect(userArticle?.querySelector(".col-start-3")).toHaveClass("row-start-1");
    expect(userArticle?.querySelector(".max-w-3xl")).not.toHaveClass("text-right");
    expect(userArticle?.querySelector(".max-w-3xl")).not.toHaveClass("ml-auto");
    expect(within(userArticle as HTMLElement).getByText("用户").parentElement).toHaveClass(
      "col-start-3",
      "text-xs",
    );
    expect(
      within(userArticle as HTMLElement)
        .getByText(new Date("2026-05-08T14:21:27").toLocaleString())
        .closest('[data-slot="session-message-actions"]'),
    ).toHaveClass("absolute", "bottom-2", "opacity-0", "group-hover:opacity-100");
    expect(
      within(userArticle as HTMLElement).getByRole("button", { name: "复制消息" }),
    ).toBeInTheDocument();
    expect(assistantArticle).toHaveAttribute("data-role", "assistant");
    expect(assistantArticle).toHaveClass("grid-cols-[2rem_minmax(0,1fr)_2rem]");
    expect(assistantArticle?.querySelector(".col-start-1")).toHaveClass("row-start-1");
    expect(assistantArticle?.querySelector(".col-start-2")).toHaveClass(
      "bg-card",
      "relative",
      "row-start-1",
      "group-hover:border-muted-foreground/40",
    );
    expect(assistantArticle?.querySelector(".col-start-2")).not.toHaveClass(
      "group-hover:ring-ring",
    );
    expect(within(assistantArticle as HTMLElement).getByText("助手").parentElement).toHaveClass(
      "col-start-1",
      "text-xs",
    );
    expect(
      within(assistantArticle as HTMLElement)
        .getByText(new Date("2026-05-08T14:21:45").toLocaleString())
        .closest('[data-slot="session-message-actions"]'),
    ).toHaveClass("absolute", "bottom-2", "opacity-0", "group-hover:opacity-100");
    expect(
      within(assistantArticle as HTMLElement).getByRole("button", { name: "复制消息" }),
    ).toBeInTheDocument();
  });

  it("copies full header identifiers and opens the raw session file", async () => {
    const detail: SessionDetail = {
      session_id: SESSION_ID,
      project: "/Users/dev/Work/AI/code-manager",
      messages: [
        {
          role: "user",
          timestamp: "2026-05-08T14:21:27",
          blocks: [{ type: "text", text: "第一条消息" }],
        },
      ],
      plan_file_path: null,
      subagents: [],
    };

    renderDrawer(detail);

    await screen.findByRole("heading", { name: "对话详情" });
    const projectButton = screen.getByRole("button", { name: "复制项目路径" });
    const sessionButton = screen.getByRole("button", { name: "复制会话 ID" });
    const rawFileButton = screen.getByRole("button", { name: "在编辑器中打开原始记录" });
    expect(projectButton).toHaveTextContent("code-manager");
    expect(projectButton).toHaveAttribute("title", "/Users/dev/Work/AI/code-manager");
    expect(sessionButton).toHaveTextContent("ee6bf047");
    expect(sessionButton).toHaveAttribute("title", SESSION_ID);
    const context = projectButton.closest('[data-slot="session-detail-context"]');
    const headerActions = screen
      .getByRole("button", { name: "关闭" })
      .closest('[data-slot="session-detail-actions"]');
    expect(context).toContainElement(rawFileButton);
    expect(headerActions).not.toContainElement(rawFileButton);

    fireEvent.click(projectButton);
    fireEvent.click(sessionButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/Users/dev/Work/AI/code-manager");
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SESSION_ID);
    });

    invokeMock.mockClear();
    fireEvent.click(rawFileButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_session_file_in_editor", {
        project: "/Users/dev/Work/AI/code-manager",
        sessionId: SESSION_ID,
      });
    });
  });

  it("renders user command-only messages as user input messages", async () => {
    renderDrawer({
      session_id: SESSION_ID,
      project: "/Users/dev/Work/AI/code-manager",
      messages: [
        {
          role: "user",
          timestamp: "2026-05-08T14:21:30",
          blocks: [{ type: "command", name: "/model" }],
        },
      ],
    });

    expect(await screen.findByText("命令")).toBeInTheDocument();
    expect(screen.getByText("/model")).toBeInTheDocument();
    const messageLabel = screen.getByText("用户");
    const messageArticle = messageLabel.closest('[data-slot="session-message"]');
    expect(messageArticle).toHaveAttribute("data-role", "user");
    expect(messageArticle).toHaveClass("grid-cols-[2rem_minmax(0,1fr)_2rem]");
    expect(messageLabel.closest(".col-start-3")).toHaveClass("text-xs");
    expect(screen.getByText("/model").closest("div")).toHaveClass("bg-card");
    expect(screen.getByText("/model").closest("div")).not.toHaveClass("bg-background");
    expect(
      within(messageArticle as HTMLElement)
        .getByText(new Date("2026-05-08T14:21:30").toLocaleString())
        .closest('[data-slot="session-message-actions"]'),
    ).toHaveClass("absolute", "bottom-2", "opacity-0", "group-hover:opacity-100");
    fireEvent.click(
      within(messageArticle as HTMLElement).getByRole("button", { name: "复制消息" }),
    );
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/model");
    });
    expect(screen.queryByText("事件")).not.toBeInTheDocument();
  });

  it("renders system-only messages as compact events", async () => {
    renderDrawer({
      session_id: SESSION_ID,
      project: "/Users/dev/Work/AI/code-manager",
      messages: [
        {
          role: "user",
          timestamp: "2026-05-08T14:21:30",
          blocks: [{ type: "system", summary: "模型切换提示" }],
        },
      ],
    });

    expect(await screen.findByText("系统信息")).toBeInTheDocument();
    const eventLabel = screen.getByText("事件");
    const eventArticle = eventLabel.closest('[data-slot="session-event"]');
    expect(eventArticle).toHaveClass("grid-cols-[2rem_minmax(0,1fr)_2rem]");
    expect(eventArticle?.querySelector(".col-start-1")).toHaveClass("row-start-1");
    expect(eventLabel.closest(".col-start-1")).toHaveClass("text-xs");
    expect(eventArticle?.querySelector(".col-start-2")).toHaveClass(
      "bg-card",
      "relative",
      "row-start-1",
      "group-hover:border-muted-foreground/40",
    );
    expect(eventArticle?.querySelector(".col-start-2")).not.toHaveClass("group-hover:ring-ring");
    expect(
      within(eventArticle as HTMLElement)
        .getByText(new Date("2026-05-08T14:21:30").toLocaleString())
        .closest('[data-slot="session-message-actions"]'),
    ).toHaveClass("absolute", "bottom-2", "opacity-0", "group-hover:opacity-100");
    fireEvent.click(within(eventArticle as HTMLElement).getByRole("button", { name: "复制消息" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("系统信息\n模型切换提示");
    });
    expect(screen.queryByText("用户")).not.toBeInTheDocument();
  });

  it("strips ANSI control sequences before rendering text content", async () => {
    renderDrawer({
      session_id: SESSION_ID,
      project: "/Users/dev/Work/AI/code-manager",
      messages: [
        {
          role: "user",
          timestamp: "2026-05-08T14:21:40",
          blocks: [{ type: "text", text: "Set model to \u001b[1mmimo-v2.5-pro\u001b[22m" }],
        },
      ],
    });

    expect(await screen.findByText("Set model to mimo-v2.5-pro")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(String.fromCharCode(27));
    expect(screen.queryByText(/□/)).not.toBeInTheDocument();
    const messageArticle = screen
      .getByText("Set model to mimo-v2.5-pro")
      .closest('[data-slot="session-message"]');
    fireEvent.click(
      within(messageArticle as HTMLElement).getByRole("button", { name: "复制消息" }),
    );
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Set model to mimo-v2.5-pro");
    });
  });

  it("marks assistant API errors with destructive semantics", async () => {
    renderDrawer({
      session_id: SESSION_ID,
      project: "/Users/dev/Work/AI/code-manager",
      messages: [
        {
          role: "assistant",
          timestamp: "2026-05-08T14:21:31",
          blocks: [{ type: "text", text: "API Error: 400 Not supported model claude-opus-4-7" }],
        },
      ],
    });

    const error = await screen.findByText("API Error: 400 Not supported model claude-opus-4-7");
    expect(error.closest('[data-variant="error"]')).toBeInTheDocument();
    expect(error.closest(".col-start-2")).toHaveClass("group-hover:border-destructive/60");
    expect(error.closest(".col-start-2")).not.toHaveClass("group-hover:ring-destructive/40");
  });

  it("keeps tool call details collapsed until expanded", async () => {
    renderDrawer({
      session_id: SESSION_ID,
      project: "/Users/dev/Work/AI/code-manager",
      messages: [
        {
          role: "assistant",
          timestamp: "2026-05-08T14:21:31",
          blocks: [
            {
              type: "tool_use",
              name: "Bash",
              input_preview: JSON.stringify({ command: "pnpm build" }, null, 2),
            },
            { type: "tool_result", content: "build ok" },
          ],
        },
      ],
    });

    const trigger = await screen.findByRole("button", { name: /Bash/ });
    expect(screen.queryByText("输入参数")).not.toBeInTheDocument();
    expect(screen.queryByText("build ok")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    const toolCard = trigger.closest('[data-slot="session-tool-card"]');
    expect(toolCard).not.toBeNull();
    expect(within(toolCard as HTMLElement).getByText("输入参数")).toBeInTheDocument();
    expect(within(toolCard as HTMLElement).getByText("build ok")).toBeInTheDocument();
  });

  it("loads the requested session detail command", async () => {
    renderDrawer({
      session_id: SESSION_ID,
      project: "/Users/dev/Work/AI/code-manager",
      messages: [{ role: "user", blocks: [{ type: "text", text: "hello" }] }],
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
        project: "/Users/dev/Work/AI/code-manager",
        sessionId: SESSION_ID,
      });
    });
  });

  it("disables the plan button when the session has no linked plan", async () => {
    renderDrawer({
      session_id: SESSION_ID,
      project: "/Users/dev/Work/AI/code-manager",
      messages: [{ role: "user", blocks: [{ type: "text", text: "hello" }] }],
      plan_file_path: null,
    });

    await screen.findByRole("heading", { name: "对话详情" });
    expect(screen.getByRole("button", { name: "查看本会话关联的 plan" })).toBeDisabled();
  });

  it("previews the linked plan and opens it in the external editor", async () => {
    const planPath = "/Users/dev/.claude/plans/demo-plan.md";
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "read_session_plan") {
        return { path: planPath, content: "# 计划标题\n\n第一步" };
      }
      return {
        session_id: SESSION_ID,
        project: "/Users/dev/Work/AI/code-manager",
        messages: [{ role: "user", blocks: [{ type: "text", text: "hello" }] }],
        plan_file_path: planPath,
      };
    });

    render(
      <ThemeProvider>
        <I18nProvider>
          <SessionDetailDrawer
            project="/Users/dev/Work/AI/code-manager"
            sessionId={SESSION_ID}
            onClose={vi.fn()}
          />
        </I18nProvider>
      </ThemeProvider>,
    );

    await screen.findByRole("heading", { name: "对话详情" });
    const planButton = screen.getByRole("button", { name: "查看本会话关联的 plan" });
    expect(planButton).toBeEnabled();

    fireEvent.click(planButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("read_session_plan", {
        project: "/Users/dev/Work/AI/code-manager",
        sessionId: SESSION_ID,
      });
    });

    expect(await screen.findByText("计划标题")).toBeInTheDocument();

    invokeMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "用外部编辑器打开" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_session_plan_in_editor", {
        project: "/Users/dev/Work/AI/code-manager",
        sessionId: SESSION_ID,
      });
    });
  });

  it("仅侧链无主线消息时渲染 subagent 侧链且不显示空状态", async () => {
    // 回归测试：会话仅含侧链记录（messages 为空），subagents 有数据时，
    // 不应落入「暂无历史记录」空状态，而应渲染 SessionSubagents 侧链入口。
    renderDrawer({
      session_id: SESSION_ID,
      project: "/Users/dev/Work/AI/code-manager",
      messages: [],
      subagents: [
        {
          agent_id: "agent-001",
          slug: "explore-subagent",
          messages: [
            {
              role: "assistant",
              blocks: [{ type: "text", text: "侧链消息内容" }],
            },
          ],
        },
      ],
    });

    // 等待异步加载完成（heading 出现即表示 detail 已返回）
    await screen.findByRole("heading", { name: "对话详情" });

    // 空状态文字不应出现
    expect(screen.queryByText("暂无历史记录")).not.toBeInTheDocument();

    // 侧链 slug 触发器应可见（SessionSubagents 默认折叠，但触发按钮可见）
    expect(screen.getByText(/explore-subagent/)).toBeInTheDocument();
  });
});

describe("getMessagePresentation", () => {
  // 回归：role:"system" + 事件块必须路由到 event（走 EventMessage 左对齐头像），
  // 否则会落入 ConversationMessage 的「非 assistant 当作用户」分支，导致头像左右不一致。
  it("role:system 的 plan_mode_entered 路由为 event", () => {
    const presentation = getMessagePresentation({
      role: "system",
      blocks: [{ type: "plan_mode_entered", plan_file_path: "/Users/demo/.claude/plans/foo.md" }],
    });
    expect(presentation.kind).toBe("event");
  });

  it("role:system 的 hook 与 mode_change 路由为 event", () => {
    expect(
      getMessagePresentation({
        role: "system",
        blocks: [{ type: "mode_change", mode: "plan" }],
      }).kind,
    ).toBe("event");
    expect(
      getMessagePresentation({
        role: "system",
        blocks: [
          {
            type: "hook",
            hooks: [{ command: "fmt", duration_ms: 5 }],
            errors: [],
            prevented_continuation: false,
            stop_reason: null,
          },
        ],
      }).kind,
    ).toBe("event");
  });

  it("纯 ExitPlanMode 的 assistant 消息路由为 event", () => {
    expect(
      getMessagePresentation({
        role: "assistant",
        blocks: [{ type: "plan_mode_exited", plan_file_path: null }],
      }).kind,
    ).toBe("event");
  });

  it("普通用户文本消息仍路由为 message", () => {
    expect(
      getMessagePresentation({
        role: "user",
        blocks: [{ type: "text", text: "hello" }],
      }).kind,
    ).toBe("message");
  });
});
