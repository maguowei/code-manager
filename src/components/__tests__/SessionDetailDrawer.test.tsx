import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../hooks/useToast";
import { I18nProvider } from "../../i18n";
import type { SessionDetail } from "../../types";
import SessionDetailDrawer from "../SessionDetailDrawer";

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

function renderDrawer(detail: SessionDetail) {
  invokeMock.mockResolvedValue(detail);

  render(
    <I18nProvider>
      <ToastProvider>
        <SessionDetailDrawer
          project="/Users/maguowei/Work/AI/ai-manager"
          sessionId={detail.session_id}
          onClose={vi.fn()}
        />
      </ToastProvider>
    </I18nProvider>,
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
      project: "/Users/maguowei/Work/AI/ai-manager",
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
    };

    renderDrawer(detail);

    expect(await screen.findByRole("heading", { name: /对话详情/ })).toHaveTextContent("ee6bf047");
    expect(screen.getByText("/Users/maguowei/Work/AI/ai-manager")).toBeInTheDocument();
    expect(screen.getByText("2 条消息")).toBeInTheDocument();
    expect(
      screen.getByText(
        `${new Date("2026-05-08T14:21:27").toLocaleString()} - ${new Date(
          "2026-05-08T14:21:45",
        ).toLocaleString()}`,
      ),
    ).toBeInTheDocument();

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

  it("renders command and system-only messages as compact events", async () => {
    renderDrawer({
      session_id: SESSION_ID,
      project: "/Users/maguowei/Work/AI/ai-manager",
      messages: [
        {
          role: "user",
          timestamp: "2026-05-08T14:21:30",
          blocks: [
            { type: "command", name: "/model" },
            { type: "system", summary: "模型切换提示" },
          ],
        },
      ],
    });

    expect(await screen.findByText("命令")).toBeInTheDocument();
    expect(screen.getByText("/model")).toBeInTheDocument();
    expect(screen.getByText("系统信息")).toBeInTheDocument();
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
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "/model\n\n系统信息\n模型切换提示",
      );
    });
    expect(screen.queryByText("用户")).not.toBeInTheDocument();
  });

  it("strips ANSI control sequences before rendering text content", async () => {
    renderDrawer({
      session_id: SESSION_ID,
      project: "/Users/maguowei/Work/AI/ai-manager",
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
      project: "/Users/maguowei/Work/AI/ai-manager",
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
      project: "/Users/maguowei/Work/AI/ai-manager",
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
      project: "/Users/maguowei/Work/AI/ai-manager",
      messages: [{ role: "user", blocks: [{ type: "text", text: "hello" }] }],
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
        project: "/Users/maguowei/Work/AI/ai-manager",
        sessionId: SESSION_ID,
      });
    });
  });
});
