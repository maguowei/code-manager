import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { MemoryDirectoryImportResult, MemoryState } from "../../types";
import MemoryPage from "../MemoryPage";

type ClaudeDirectoryTestPayload = { paths: string[] };

const { eventListeners, invokeMock, listenMock, openDialogMock, openUrlMock, showToastMock } =
  vi.hoisted(() => {
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
      openDialogMock: vi.fn(async (_options: unknown) => null as string | string[] | null),
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

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openDialogMock,
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

async function findMemoryCard(name: string): Promise<HTMLElement> {
  return waitFor(() => {
    const card = screen
      .getAllByText(name)
      .map((text) => text.closest('[data-slot="memory-item"]'))
      .find(Boolean);
    expect(card).not.toBeNull();
    return card as HTMLElement;
  });
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
    openDialogMock.mockReset();
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

  it("shows the backend reason when toggling memory fails", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") return initialState;
      if (command === "toggle_memory") {
        throw "CLAUDE.md 已存在，无法覆盖，请先导入为可管理记忆";
      }
      return null;
    });

    renderMemoryPage();
    const card = await findMemoryCard("全局 A");

    fireEvent.click(within(card).getByRole("switch", { name: "启用" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        "切换记忆状态失败：CLAUDE.md 已存在，无法覆盖，请先导入为可管理记忆",
        "error",
      );
    });
  });

  it("imports memories from a selected directory and requires confirming the result", async () => {
    const importedState: MemoryState = {
      memories: [
        ...initialState.memories,
        {
          id: "imported-claude",
          name: "导入全局",
          content: "导入内容",
          targetType: "claude",
          rulePath: undefined,
          pathPatterns: [],
          isActive: false,
          createdAt: 4,
          updatedAt: 4,
        },
        {
          id: "imported-rule",
          name: "前端规则",
          content: "规则内容",
          targetType: "rule",
          rulePath: "frontend/style.md",
          pathPatterns: ["src/**/*.tsx"],
          isActive: false,
          createdAt: 4,
          updatedAt: 4,
        },
      ],
    };
    const importResult: MemoryDirectoryImportResult = {
      state: importedState,
      imported: [
        {
          sourcePath: "CLAUDE.md",
          name: "导入全局",
          targetType: "claude",
        },
        {
          sourcePath: "rules/frontend/style.md",
          name: "前端规则",
          targetType: "rule",
          rulePath: "frontend/style.md",
        },
      ],
      skipped: [
        {
          sourcePath: "rules/duplicate.md",
          reason: "duplicateRulePath",
        },
      ],
    };
    openDialogMock.mockResolvedValue("/tmp/memory-source");
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") return initialState;
      if (command === "import_memories_from_directory") return importResult;
      return null;
    });

    renderMemoryPage();
    expect(await screen.findByText("全局 A")).toBeInTheDocument();

    const importDirectoryButton = screen.getByRole("button", { name: "导入记忆" });
    expect(importDirectoryButton).toHaveAttribute(
      "title",
      "选择包含 CLAUDE.md 和 rules 目录的文件夹，导入后默认未启用",
    );
    fireEvent.click(importDirectoryButton);

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: "选择记忆目录",
      });
      expect(invokeMock).toHaveBeenCalledWith("import_memories_from_directory", {
        sourceDir: "/tmp/memory-source",
      });
    });
    expect(await findMemoryCard("导入全局")).toBeInTheDocument();
    expect(await findMemoryCard("前端规则")).toBeInTheDocument();

    const dialog = await screen.findByRole("dialog", { name: "导入结果" });
    expect(within(dialog).getByText("成功 2 条，失败 1 条")).toBeInTheDocument();
    expect(within(dialog).getByText("成功 2")).toBeInTheDocument();
    expect(within(dialog).getByText("失败 1")).toBeInTheDocument();
    expect(within(dialog).getByText("2 项")).toBeInTheDocument();
    expect(within(dialog).getByText("1 项")).toBeInTheDocument();
    expect(within(dialog).getByText("导入全局")).toBeInTheDocument();
    expect(within(dialog).getAllByText("CLAUDE.md")).toHaveLength(2);
    expect(within(dialog).getByText("前端规则")).toBeInTheDocument();
    expect(within(dialog).getByText("frontend/style.md")).toBeInTheDocument();
    expect(within(dialog).getByText("rules/duplicate.md")).toBeInTheDocument();
    expect(within(dialog).getByText("同路径 Rule 已存在")).toBeInTheDocument();
    expect(showToastMock).not.toHaveBeenCalledWith("已导入 2 条，跳过 1 条");

    fireEvent.click(within(dialog).getByRole("button", { name: "确认" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "导入结果" })).not.toBeInTheDocument();
    });
  });

  it("does not import memories when directory selection is cancelled", async () => {
    openDialogMock.mockResolvedValue(null);

    renderMemoryPage();
    expect(await screen.findByText("全局 A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "导入记忆" }));

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalled();
    });
    expect(
      invokeMock.mock.calls.some(([command]) => command === "import_memories_from_directory"),
    ).toBe(false);
  });

  it("shows an empty import result when the selected directory has no importable memories", async () => {
    const emptyResult: MemoryDirectoryImportResult = {
      state: initialState,
      imported: [],
      skipped: [],
    };
    openDialogMock.mockResolvedValue("/tmp/empty-memory-source");
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") return initialState;
      if (command === "import_memories_from_directory") return emptyResult;
      return null;
    });

    renderMemoryPage();
    expect(await screen.findByText("全局 A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "导入记忆" }));

    const dialog = await screen.findByRole("dialog", { name: "导入结果" });
    expect(within(dialog).getByText("没有可导入的记忆")).toBeInTheDocument();
    expect(within(dialog).getByText("没有发现可导入的记忆文件。")).toBeInTheDocument();
    expect(within(dialog).queryByText("导入成功")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("导入失败")).not.toBeInTheDocument();
    expect(showToastMock).not.toHaveBeenCalledWith("未找到可导入的记忆");
  });

  it("shows an error toast when directory import fails", async () => {
    openDialogMock.mockResolvedValue("/tmp/broken-memory-source");
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") return initialState;
      if (command === "import_memories_from_directory") throw new Error("import failed");
      return null;
    });

    renderMemoryPage();
    expect(await screen.findByText("全局 A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "导入记忆" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith("导入目录记忆失败", "error");
    });
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

    const firstCard = await findMemoryCard("全局 A");
    const secondCard = await findMemoryCard("全局 B");

    expect(within(firstCard).getByText("启用")).toBeInTheDocument();
    expect(within(secondCard).getByText("已启用")).toBeInTheDocument();

    fireEvent.click(within(firstCard).getByRole("switch", { name: /启用/ }));

    await waitFor(() => {
      expect(within(firstCard).getByText("已启用")).toBeInTheDocument();
      expect(within(secondCard).getByText("启用")).toBeInTheDocument();
    });
  });

  it("duplicates a memory directly from the card without opening the editor", async () => {
    const duplicatedState: MemoryState = {
      memories: [
        initialState.memories[0],
        {
          ...initialState.memories[0],
          id: "global-a-copy",
          name: "全局 A 副本",
          isActive: false,
          createdAt: 3,
          updatedAt: 3,
        },
        initialState.memories[1],
      ],
    };
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") return initialState;
      if (command === "duplicate_memory") return duplicatedState;
      return null;
    });

    renderMemoryPage();

    const card = await findMemoryCard("全局 A");

    fireEvent.click(within(card).getByRole("button", { name: "复制" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("duplicate_memory", {
        id: "global-a",
        nameSuffix: " 副本",
      });
    });
    expect(await screen.findByText("全局 A 副本")).toBeInTheDocument();
    expect(showToastMock).toHaveBeenCalledWith("记忆已复制");
    expect(screen.queryByRole("heading", { name: "编辑记忆" })).not.toBeInTheDocument();
  });

  it("aligns memory group headers with the card list inset", async () => {
    renderMemoryPage();

    expect(await screen.findByRole("heading", { name: /CLAUDE\.md/ })).toBeInTheDocument();
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

    const card = await findMemoryCard("手写全局记忆");

    expect(within(card).getByText("未导入")).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "导入管理" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("import_unmanaged_memory", {
        source: { targetType: "claude", rulePath: undefined },
      });
    });
  });

  it("shows symlink unmanaged memories as unsupported import cards", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") {
        return {
          memories: [],
          unmanagedMemories: [
            {
              id: "unmanaged:rule:frontend/style.md",
              name: "frontend-style",
              content: "",
              targetType: "rule",
              rulePath: "frontend/style.md",
              pathPatterns: [],
              sourcePath: "rules/frontend/style.md",
              size: 0,
              modifiedAt: 4,
              importStatus: "unsupportedSymlink",
            },
          ],
        };
      }
      return null;
    });

    renderMemoryPage();

    const card = await findMemoryCard("frontend-style");

    const importButton = within(card).getByRole("button", { name: "导入管理" });
    expect(importButton).toBeDisabled();
    expect(importButton).toHaveAttribute("title", "软链接记忆文件不支持导入");
    expect(card).toHaveTextContent("未导入");
    expect(card).toHaveTextContent("软链接记忆文件不支持导入");
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

    const card = await findMemoryCard("React 规则");

    fireEvent.click(within(card).getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("preview_delete_memory", {
        id: "frontend-react-rule",
      });
    });
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent("以下目录将被删除");
    expect(warning).toHaveTextContent("/Users/test/.claude/rules/frontend");
    expect(warning).not.toHaveTextContent("/Users/test/.claude/rules/frontend/react");
  });
});
