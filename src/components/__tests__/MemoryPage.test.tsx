import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { MemoryState } from "../../types";
import MemoryPage from "../MemoryPage";

type ClaudeDirectoryTestPayload = { paths: string[] };

const { eventListeners, invokeMock, listenMock, openUrlMock, showToastMock } = vi.hoisted(() => {
  type Payload = { paths: string[] };
  const eventListeners = new Map<string, Set<(payload: Payload) => void>>();

  return {
    eventListeners,
    invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
    listenMock: vi.fn(async (event: string, handler: (event: { payload: Payload }) => void) => {
      const listener = (payload: Payload) => handler({ payload });
      const listeners = eventListeners.get(event) ?? new Set<(payload: Payload) => void>();
      listeners.add(listener);
      eventListeners.set(event, listeners);

      return () => {
        listeners.delete(listener);
      };
    }),
    openUrlMock: vi.fn(async (_url: string) => undefined),
    showToastMock: vi.fn(),
  };
});

const emitTauriEvent = (event: string, payload: ClaudeDirectoryTestPayload) => {
  for (const listener of eventListeners.get(event) ?? []) {
    listener(payload);
  }
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
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

function renderMemoryPage() {
  render(
    <I18nProvider>
      <MemoryPage />
    </I18nProvider>,
  );
}

const initialState: MemoryState = {
  memories: [
    {
      id: "global-a",
      name: "全局 A",
      content: "A",
      targetType: "claude",
      rulePath: undefined,
      isActive: false,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "global-b",
      name: "全局 B",
      content: "B",
      targetType: "claude",
      rulePath: undefined,
      isActive: true,
      createdAt: 2,
      updatedAt: 2,
    },
  ],
};

const toggledState: MemoryState = {
  memories: [
    {
      ...initialState.memories[0],
      isActive: true,
      updatedAt: 3,
    },
    {
      ...initialState.memories[1],
      isActive: false,
      updatedAt: 3,
    },
  ],
};

describe("MemoryPage", () => {
  beforeEach(() => {
    localStorage.clear();
    setSystemLanguages(["zh-CN"]);
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    eventListeners.clear();
    invokeMock.mockReset();
    listenMock.mockClear();
    openUrlMock.mockReset();
    showToastMock.mockReset();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") return initialState;
      if (command === "toggle_memory") return toggledState;
      return null;
    });
  });

  it("opens the localized Claude memory docs from the page header", async () => {
    renderMemoryPage();

    const docsButton = await screen.findByRole("button", {
      name: "查看 Claude Code 记忆官方文档",
    });
    expect(docsButton).toHaveTextContent("官方文档");

    fireEvent.click(docsButton);

    expect(openUrlMock).toHaveBeenCalledWith("https://code.claude.com/docs/zh-CN/memory");
  });

  it("uses the English Claude memory docs when the UI language is English", async () => {
    localStorage.setItem("ai-manager-settings", JSON.stringify({ language: "en", theme: "dark" }));
    setSystemLanguages(["en-US"]);

    renderMemoryPage();

    const docsButton = await screen.findByRole("button", {
      name: "Open Claude Code memory docs",
    });
    expect(docsButton).toHaveTextContent("Docs");

    fireEvent.click(docsButton);

    expect(openUrlMock).toHaveBeenCalledWith("https://code.claude.com/docs/en/memory");
  });

  it("refreshes memories from the page header button", async () => {
    const refreshedState: MemoryState = {
      memories: [
        ...initialState.memories,
        {
          id: "rule-new",
          name: "新增规则",
          content: "规则内容",
          targetType: "rule",
          rulePath: "new.md",
          isActive: false,
          createdAt: 3,
          updatedAt: 3,
        },
      ],
    };
    let loadCount = 0;
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") {
        loadCount += 1;
        return loadCount === 1 ? initialState : refreshedState;
      }
      return null;
    });

    renderMemoryPage();
    expect(await screen.findByText("全局 A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    expect(await screen.findByText("新增规则")).toBeInTheDocument();
    expect(invokeMock.mock.calls.filter(([command]) => command === "get_memories")).toHaveLength(2);
    expect(showToastMock).toHaveBeenCalledWith("记忆已刷新");
  });

  it("refreshes automatically when a rules memory file changes", async () => {
    const stateWithExternalRule: MemoryState = {
      memories: [],
      unmanagedMemories: [
        {
          id: "unmanaged:rule:new",
          name: "新规则",
          content: "外部新增规则",
          targetType: "rule",
          rulePath: "new.md",
          pathPatterns: [],
          sourcePath: "rules/new.md",
          size: 18,
          modifiedAt: 4,
          importStatus: "ready",
        },
      ],
    };
    let loadCount = 0;
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") {
        loadCount += 1;
        return loadCount === 1 ? initialState : stateWithExternalRule;
      }
      return null;
    });

    renderMemoryPage();
    expect(await screen.findByText("全局 A")).toBeInTheDocument();

    emitTauriEvent("claude-directory-changed", { paths: ["rules/new.md"] });

    expect(await screen.findByText("新规则")).toBeInTheDocument();
    expect(invokeMock.mock.calls.filter(([command]) => command === "get_memories")).toHaveLength(2);
    expect(showToastMock).not.toHaveBeenCalledWith("记忆已刷新");
  });

  it("refreshes automatically when CLAUDE.md changes", async () => {
    const stateWithExternalClaude: MemoryState = {
      memories: [],
      unmanagedMemories: [
        {
          id: "unmanaged:claude",
          name: "CLAUDE.md",
          content: "外部全局记忆",
          targetType: "claude",
          rulePath: undefined,
          pathPatterns: [],
          sourcePath: "CLAUDE.md",
          size: 18,
          modifiedAt: 5,
          importStatus: "ready",
        },
      ],
    };
    let loadCount = 0;
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") {
        loadCount += 1;
        return loadCount === 1 ? initialState : stateWithExternalClaude;
      }
      return null;
    });

    renderMemoryPage();
    expect(await screen.findByText("全局 A")).toBeInTheDocument();

    emitTauriEvent("claude-directory-changed", { paths: ["CLAUDE.md"] });

    expect(await screen.findByText("外部全局记忆")).toBeInTheDocument();
    expect(invokeMock.mock.calls.filter(([command]) => command === "get_memories")).toHaveLength(2);
  });

  it("ignores unrelated Claude directory change events", async () => {
    renderMemoryPage();
    expect(await screen.findByText("全局 A")).toBeInTheDocument();

    emitTauriEvent("claude-directory-changed", { paths: ["sessions/session.json"] });

    expect(invokeMock.mock.calls.filter(([command]) => command === "get_memories")).toHaveLength(1);
  });

  it("shows a refresh error toast when manual refresh fails", async () => {
    let loadCount = 0;
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") {
        loadCount += 1;
        if (loadCount > 1) {
          throw new Error("refresh failed");
        }
        return initialState;
      }
      return null;
    });

    renderMemoryPage();
    expect(await screen.findByText("全局 A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith("刷新记忆失败", "error");
    });
  });

  it("refreshes the list from returned state after toggling a CLAUDE.md memory", async () => {
    renderMemoryPage();

    const firstCard = (await screen.findByText("全局 A")).closest(".memory-item");
    const secondCard = screen.getByText("全局 B").closest(".memory-item");
    expect(firstCard).not.toBeNull();
    expect(secondCard).not.toBeNull();
    if (!firstCard || !secondCard) return;

    expect(within(firstCard as HTMLElement).getByText("启用")).toBeInTheDocument();
    expect(within(secondCard as HTMLElement).getByText("已启用")).toBeInTheDocument();

    fireEvent.click(within(firstCard as HTMLElement).getByRole("button", { name: /启用/ }));

    await waitFor(() => {
      expect(within(firstCard as HTMLElement).getByText("已启用")).toBeInTheDocument();
      expect(within(secondCard as HTMLElement).getByText("启用")).toBeInTheDocument();
    });
  });

  it("aligns memory group headers with the card list inset", () => {
    const css = readFileSync(`${process.cwd()}/src/components/MemoryPage.css`, "utf8");
    const groupHeaderRule = css.match(/\.memory-group-header\s*\{[^}]*\}/)?.[0] ?? "";

    expect(groupHeaderRule).toContain("padding: 0 var(--space-2);");
  });

  it("shows unmanaged .claude memories with an import action", async () => {
    const stateWithUnmanaged: MemoryState = {
      memories: [],
      unmanagedMemories: [
        {
          id: "unmanaged:claude",
          name: "CLAUDE.md",
          content: "手写全局记忆",
          targetType: "claude",
          rulePath: undefined,
          pathPatterns: [],
          sourcePath: "CLAUDE.md",
          size: 18,
          modifiedAt: 4,
          importStatus: "ready",
        },
      ],
    };
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") return stateWithUnmanaged;
      if (command === "import_unmanaged_memory") return initialState;
      return null;
    });

    renderMemoryPage();

    const card = (await screen.findByText("手写全局记忆")).closest(".memory-item");
    expect(card).not.toBeNull();
    if (!card) return;

    expect(within(card as HTMLElement).getByText("未导入")).toBeInTheDocument();
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "导入管理" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("import_unmanaged_memory", {
        source: { targetType: "claude", rulePath: undefined },
      });
    });
  });

  it("shows confirmed absolute cleanup directories as a red delete warning", async () => {
    const stateWithNestedRule: MemoryState = {
      memories: [
        {
          id: "frontend-react-rule",
          name: "React 规则",
          content: "React 内容",
          targetType: "rule",
          rulePath: "frontend/react/style.md",
          isActive: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") return stateWithNestedRule;
      if (command === "preview_delete_memory") {
        return {
          cleanupDirs: ["/Users/test/.claude/rules/frontend"],
        };
      }
      if (command === "delete_memory") return { memories: [] };
      return null;
    });

    renderMemoryPage();

    const card = (await screen.findByText("React 规则")).closest(".memory-item");
    expect(card).not.toBeNull();
    if (!card) return;

    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("preview_delete_memory", {
        id: "frontend-react-rule",
      });
    });
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveClass("memory-delete-confirm__warning");
    expect(warning).toHaveTextContent("以下目录将被删除");
    expect(warning).toHaveTextContent("/Users/test/.claude/rules/frontend");
    expect(warning).not.toHaveTextContent("/Users/test/.claude/rules/frontend/react");

    const css = readFileSync(`${process.cwd()}/src/components/MemoryPage.css`, "utf8");
    const warningRule = css.match(/\.memory-delete-confirm__warning\s*\{[^}]*\}/)?.[0] ?? "";
    expect(warningRule).toContain("var(--accent-red");
  });
});
