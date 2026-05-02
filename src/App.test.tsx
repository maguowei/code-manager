import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ToastProvider } from "./hooks/useToast";
import { I18nProvider } from "./i18n";
import type { ConfigWorkspace } from "./types";

const { filePreviewMock, fileTreeOptionsMock, invokeMock, listenMock, revealItemInDirMock } =
  vi.hoisted(() => ({
    filePreviewMock: vi.fn(),
    fileTreeOptionsMock: vi.fn(),
    invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
    listenMock: vi.fn(async () => () => {}),
    revealItemInDirMock: vi.fn(async () => undefined),
  }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: revealItemInDirMock,
  openUrl: vi.fn(async () => undefined),
}));

vi.mock("@pierre/diffs/react", () => ({
  File: (props: {
    className?: string;
    file: { name: string; contents: string };
    options?: { disableFileHeader?: boolean; overflow?: string; themeType?: string };
    style?: { colorScheme?: string };
  }) => {
    filePreviewMock(props);
    return (
      <div
        data-testid="pierre-file-preview"
        className={props.className}
        data-file-name={props.file.name}
        data-file-contents={props.file.contents}
        data-overflow={props.options?.overflow ?? ""}
      />
    );
  },
}));

vi.mock("@pierre/trees/react", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    useFileTree: (options: {
      composition?: {
        contextMenu?: {
          buttonVisibility?: string;
          enabled?: boolean;
          triggerMode?: string;
        };
      };
      initialExpandedPaths?: string[];
      initialExpansion?: string | number;
      onSelectionChange: (selectedPaths: string[]) => void;
      paths: string[];
      search?: boolean;
    }) => {
      fileTreeOptionsMock(options);
      const [modelOptions, setModelOptions] = React.useState({
        ...options,
        paths: options.paths ?? [],
      });
      const modelRef = React.useRef<{
        options: typeof modelOptions;
        resetPaths: ReturnType<typeof vi.fn>;
        onMutation: ReturnType<typeof vi.fn>;
      } | null>(null);
      if (modelRef.current === null) {
        modelRef.current = {
          options: modelOptions,
          resetPaths: vi.fn(
            (paths: string[], resetOptions?: { initialExpandedPaths?: string[] }) => {
              setModelOptions((currentOptions) => ({
                ...currentOptions,
                paths,
                initialExpandedPaths: resetOptions?.initialExpandedPaths ?? [],
              }));
            },
          ),
          onMutation: vi.fn(() => () => {}),
        };
      }
      modelRef.current.options = modelOptions;
      return { model: modelRef.current };
    },
    FileTree: (props: {
      className?: string;
      model: {
        options: {
          composition?: {
            contextMenu?: {
              buttonVisibility?: string;
              enabled?: boolean;
              triggerMode?: string;
            };
          };
          onSelectionChange: (selectedPaths: string[]) => void;
          paths: string[];
        };
      };
      renderContextMenu?: (
        item: { kind: "directory" | "file"; name: string; path: string },
        context: {
          anchorElement: HTMLElement;
          anchorRect: {
            bottom: number;
            height: number;
            left: number;
            right: number;
            top: number;
            width: number;
            x: number;
            y: number;
          };
          close: (options?: { restoreFocus?: boolean }) => void;
          restoreFocus: () => void;
        },
      ) => React.ReactNode;
    }) => {
      const [query, setQuery] = React.useState("");
      const [hoveredPath, setHoveredPath] = React.useState<string | null>(null);
      const [activeMenu, setActiveMenu] = React.useState<{
        anchorRect: {
          bottom: number;
          height: number;
          left: number;
          right: number;
          top: number;
          width: number;
          x: number;
          y: number;
        };
        item: {
          kind: "directory" | "file";
          name: string;
          path: string;
        };
      } | null>(null);
      const normalizedQuery = query.trim().toLowerCase();
      const treePaths = props.model.options.paths ?? [];
      const visiblePaths = normalizedQuery
        ? treePaths.filter((path) => path.toLowerCase().includes(normalizedQuery))
        : treePaths;
      const contextMenuConfig = props.model.options.composition?.contextMenu;
      const canUseTriggerButton =
        contextMenuConfig?.enabled === true &&
        (contextMenuConfig.triggerMode === "both" || contextMenuConfig.triggerMode === "button");
      const buttonVisibility = contextMenuConfig?.buttonVisibility ?? "when-needed";
      const openMenu = (
        item: { kind: "directory" | "file"; name: string; path: string },
        anchorRect: {
          bottom: number;
          height: number;
          left: number;
          right: number;
          top: number;
          width: number;
          x: number;
          y: number;
        },
      ) => setActiveMenu({ anchorRect, item });

      return (
        <div data-testid="pierre-file-tree" className={props.className}>
          <input
            aria-label="Search files"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          {visiblePaths.map((path) => {
            const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
            const name = normalizedPath.split("/").pop() ?? normalizedPath;
            const itemType = path.endsWith("/") ? "folder" : "file";
            const item = {
              kind: itemType === "folder" ? ("directory" as const) : ("file" as const),
              name,
              path: normalizedPath,
            };
            const triggerButtonVisible =
              canUseTriggerButton &&
              (buttonVisibility === "always" || hoveredPath === normalizedPath);
            return (
              <div
                key={path}
                onMouseEnter={() => setHoveredPath(normalizedPath)}
                onMouseLeave={() =>
                  setHoveredPath((currentPath) =>
                    currentPath === normalizedPath ? null : currentPath,
                  )
                }
              >
                <button
                  type="button"
                  data-type="item"
                  data-item-path={path}
                  data-item-type={itemType}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openMenu(item, {
                      bottom: 130,
                      height: 30,
                      left: 140,
                      right: 160,
                      top: 100,
                      width: 20,
                      x: 140,
                      y: 100,
                    });
                  }}
                >
                  {name}
                </button>
                {triggerButtonVisible ? (
                  <button
                    type="button"
                    aria-label={`Options ${name}`}
                    onClick={() =>
                      openMenu(item, {
                        bottom: 150,
                        height: 30,
                        left: 960,
                        right: 980,
                        top: 120,
                        width: 20,
                        x: 960,
                        y: 120,
                      })
                    }
                  >
                    Options
                  </button>
                ) : null}
              </div>
            );
          })}
          {activeMenu && props.renderContextMenu
            ? props.renderContextMenu(activeMenu.item, {
                anchorElement: document.body,
                anchorRect: activeMenu.anchorRect,
                close: () => setActiveMenu(null),
                restoreFocus: () => {},
              })
            : null}
        </div>
      );
    },
  };
});

const WORKSPACE_FIXTURE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
  },
  builtinPresets: [],
  customPresets: [],
  profiles: [],
  bindings: {},
};

const CLAUDE_OVERVIEW_FIXTURE = {
  rootPath: "/Users/test/.claude",
  maxEntries: 100000,
  maxDepth: 128,
  entries: [
    {
      path: "scripts",
      name: "scripts",
      kind: "directory",
      size: 0,
      modifiedAt: 1,
    },
    {
      path: "scripts/check-license-rule.js",
      name: "check-license-rule.js",
      kind: "file",
      size: 48,
      modifiedAt: 1,
    },
    {
      path: "settings.json",
      name: "settings.json",
      kind: "file",
      size: 19,
      modifiedAt: 2,
    },
  ],
  truncated: false,
  reachedEntryLimit: false,
  reachedDepthLimit: false,
  skippedSymlinkCount: 0,
  skippedNodeModulesCount: 0,
};

function renderApp() {
  render(
    <I18nProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nProvider>,
  );
}

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

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    setSystemLanguages(["zh-CN"]);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => undefined),
      },
    });
    invokeMock.mockReset();
    listenMock.mockClear();
    filePreviewMock.mockClear();
    fileTreeOptionsMock.mockClear();
    revealItemInDirMock.mockClear();
    invokeMock.mockResolvedValue(WORKSPACE_FIXTURE);
    document.documentElement.removeAttribute("data-theme");
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      configurable: true,
    });
  });

  async function renderClaudeOverviewWithContextMenu() {
    localStorage.setItem("ai-manager-settings", JSON.stringify({ language: "zh", theme: "light" }));
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "get_config_workspace") {
        return WORKSPACE_FIXTURE;
      }
      if (command === "get_claude_directory_overview") {
        return CLAUDE_OVERVIEW_FIXTURE;
      }
      if (command === "read_claude_file_preview") {
        const path = (args as { path: string }).path;
        return {
          path,
          name: path.split("/").pop() ?? path,
          content: "preview",
          isBinary: false,
          truncated: false,
          size: 7,
          modifiedAt: 2,
          encoding: "utf-8",
        };
      }
      return null;
    });

    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "~/.claude 目录总览" }));
    await screen.findByRole("button", { name: "scripts" });
  }

  it("toggles the settings drawer from the sidebar settings button", async () => {
    renderApp();

    const settingsButton = await screen.findByRole("button", { name: "设置" });
    fireEvent.click(settingsButton);

    expect(await screen.findByRole("dialog", { name: "设置" })).toBeInTheDocument();

    fireEvent.click(settingsButton);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "设置" })).not.toBeInTheDocument();
    });
  });

  it("shows the Claude directory overview as a main page from the AI menu button", async () => {
    localStorage.setItem("ai-manager-settings", JSON.stringify({ language: "zh", theme: "light" }));
    let resolveOverview: ((overview: unknown) => void) | undefined;
    const overviewPromise = new Promise((resolve) => {
      resolveOverview = resolve;
    });
    const overviewFixture = {
      rootPath: "/Users/test/.claude",
      maxEntries: 100000,
      maxDepth: 128,
      entries: [
        {
          path: "scripts",
          name: "scripts",
          kind: "directory",
          size: 0,
          modifiedAt: 1,
        },
        {
          path: "settings.json",
          name: "settings.json",
          kind: "file",
          size: 19,
          modifiedAt: 2,
        },
        {
          path: "plugins",
          name: "plugins",
          kind: "directory",
          size: 0,
          modifiedAt: 3,
        },
        {
          path: "plugins/cache",
          name: "cache",
          kind: "directory",
          size: 0,
          modifiedAt: 3,
        },
        {
          path: "plugins/cache/global-search-target.md",
          name: "global-search-target.md",
          kind: "file",
          size: 32,
          modifiedAt: 3,
        },
        {
          path: "scripts/check-license-rule.js",
          name: "check-license-rule.js",
          kind: "file",
          size: 48,
          modifiedAt: 1,
        },
      ],
      truncated: false,
      reachedEntryLimit: false,
      reachedDepthLimit: false,
      skippedSymlinkCount: 0,
      skippedNodeModulesCount: 2,
    };
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "get_config_workspace") {
        return WORKSPACE_FIXTURE;
      }
      if (command === "get_claude_directory_overview") {
        return overviewPromise;
      }
      if (command === "read_claude_file_preview") {
        const path = (args as { path: string }).path;
        if (path === "settings.json") {
          return {
            path: "settings.json",
            name: "settings.json",
            content: '{"model":"sonnet"}',
            isBinary: false,
            truncated: false,
            size: 19,
            modifiedAt: 2,
            encoding: "utf-8",
          };
        }
        return {
          path,
          name: "check-license-rule.js",
          content: "const currentYear = new Date().getFullYear();",
          isBinary: false,
          truncated: false,
          size: 48,
          modifiedAt: 1,
          encoding: "utf-8",
        };
      }
      return null;
    });

    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "~/.claude 目录总览" }));

    expect(screen.getByRole("heading", { name: "~/.claude 目录总览" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "~/.claude 目录总览" })).not.toBeInTheDocument();
    expect(screen.getByText("正在扫描 ~/.claude...")).toBeInTheDocument();
    expect(fileTreeOptionsMock).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_claude_directory_overview");
    });
    resolveOverview?.(overviewFixture);

    expect(await screen.findByText("正在准备目录树...")).toBeInTheDocument();
    await waitFor(() => {
      expect(fileTreeOptionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          initialExpansion: "closed",
          search: true,
        }),
      );
    });
    expect(fileTreeOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialExpansion: "closed",
        search: true,
      }),
    );
    const treeOptions =
      fileTreeOptionsMock.mock.calls[fileTreeOptionsMock.mock.calls.length - 1]?.[0];
    expect(treeOptions).not.toHaveProperty("onSearchChange");
    const treePane = screen.getByLabelText("目录树");
    const previewPane = screen.getByLabelText("文件预览");
    expect(previewPane.parentElement?.children[0]).toBe(previewPane);
    expect(previewPane.parentElement?.children[2]).toBe(treePane);
    expect(invokeMock).toHaveBeenCalledWith("get_claude_directory_overview");
    expect(invokeMock).not.toHaveBeenCalledWith("get_claude_directory_children", {
      path: null,
    });
    expect(screen.getByText("已加载 6 个条目")).toBeInTheDocument();
    expect(screen.getByText("已跳过 2 个 node_modules 目录")).toBeInTheDocument();
    expect(screen.queryByText("已达到 100000 个条目上限")).not.toBeInTheDocument();
    const resizer = screen.getByRole("separator", { name: "调整目录树宽度" });
    expect(resizer.parentElement).toHaveStyle({
      "--claude-overview-tree-width": "340px",
    });
    fireEvent.keyDown(resizer, { key: "ArrowLeft" });
    expect(resizer.parentElement).toHaveStyle({
      "--claude-overview-tree-width": "360px",
    });
    fireEvent.click(screen.getByRole("button", { name: "scripts" }));
    expect(screen.getByText("选择目录中的文件查看内容")).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith("get_claude_directory_children", {
      path: "scripts",
    });
    const searchInput = screen.getByRole("textbox", { name: "Search files" });
    fireEvent.change(searchInput, {
      target: { value: "global-search-target" },
    });
    expect(treePane).not.toHaveTextContent("check-license-rule.js");
    expect(treePane).toHaveTextContent("global-search-target.md");
    expect(invokeMock).not.toHaveBeenCalledWith("search_claude_directory", expect.anything());
    fireEvent.change(searchInput, {
      target: { value: "" },
    });
    expect(treePane).toHaveTextContent("check-license-rule.js");
    fireEvent.click(screen.getByRole("button", { name: "check-license-rule.js" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("read_claude_file_preview", {
        path: "scripts/check-license-rule.js",
      });
    });
    const previewElement = await screen.findByTestId("pierre-file-preview");
    expect(previewElement).toBeInTheDocument();
    expect(previewElement).toHaveClass("claude-overview-preview-content");
    const javascriptTab = screen.getByRole("tab", { name: "check-license-rule.js" });
    expect(javascriptTab).toHaveAttribute("aria-selected", "true");
    expect(javascriptTab.querySelector(".claude-overview-tab-file-icon")).toHaveAttribute(
      "data-icon-token",
      "javascript",
    );
    fireEvent.click(screen.getByRole("button", { name: "settings.json" }));
    const jsonTab = await screen.findByRole("tab", { name: "settings.json" });
    expect(jsonTab).toHaveAttribute("aria-selected", "true");
    expect(jsonTab.querySelector(".claude-overview-tab-file-icon")).toHaveAttribute(
      "data-icon-token",
      "json",
    );
    expect(document.querySelector(".claude-overview-preview-toolbar")).not.toHaveTextContent(
      "settings.json",
    );
    const previewFooter = document.querySelector(".claude-overview-preview-footer");
    expect(previewFooter).toHaveTextContent("19 B");
    expect(previewFooter).toHaveTextContent("UTF-8");
    expect(previewFooter).toHaveTextContent(new Date(2 * 1000).toLocaleString());
    expect(document.querySelector(".claude-overview-preview-toolbar")).not.toHaveTextContent(
      "19 B",
    );
    expect(screen.getByRole("tab", { name: "check-license-rule.js" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    fireEvent.click(screen.getByRole("tab", { name: "check-license-rule.js" }));
    expect(screen.getByRole("tab", { name: "check-license-rule.js" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭 check-license-rule.js" }));
    expect(screen.queryByRole("tab", { name: "check-license-rule.js" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "settings.json" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(filePreviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        file: {
          name: "check-license-rule.js",
          contents: "const currentYear = new Date().getFullYear();",
          cacheKey: "scripts/check-license-rule.js:48:1",
        },
        options: expect.objectContaining({
          disableFileHeader: true,
          overflow: "wrap",
          themeType: "light",
        }),
        style: expect.objectContaining({
          colorScheme: "light",
        }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "复制路径" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "/Users/test/.claude/settings.json",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "在文件浏览器打开" }));
    await waitFor(() => {
      expect(revealItemInDirMock).toHaveBeenCalledWith("/Users/test/.claude/settings.json");
    });
    fireEvent.click(screen.getByRole("button", { name: "用默认编辑器打开" }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_claude_file_in_editor", {
        path: "settings.json",
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "~/.claude 目录总览" }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "~/.claude 目录总览" })).not.toBeInTheDocument();
    });
  });

  it("opens the Claude directory context menu from right-click and creates entries", async () => {
    await renderClaudeOverviewWithContextMenu();

    const treeOptions =
      fileTreeOptionsMock.mock.calls[fileTreeOptionsMock.mock.calls.length - 1]?.[0];
    expect(treeOptions).toEqual(
      expect.objectContaining({
        composition: {
          contextMenu: {
            buttonVisibility: "when-needed",
            enabled: true,
            triggerMode: "both",
          },
        },
      }),
    );
    expect(treeOptions?.renderRowDecoration?.({ item: { name: "long-filename-value" } })).toEqual({
      text: "long-filename-value",
      title: "long-filename-value",
    });
    expect(treeOptions?.unsafeCSS).toContain("text-overflow: ellipsis");
    expect(treeOptions?.unsafeCSS).toContain("[data-item-section='decoration']");

    fireEvent.contextMenu(screen.getByRole("button", { name: "scripts" }));
    expect(await screen.findByRole("menuitem", { name: "新建文件" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "新建文件夹" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "重命名" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "删除" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "新建文件" }));
    fireEvent.change(await screen.findByLabelText("名称"), {
      target: { value: "notes.md" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("create_claude_directory_entry", {
        parentPath: "scripts",
        name: "notes.md",
        kind: "file",
      });
    });
    expect(invokeMock).toHaveBeenCalledWith("get_claude_directory_overview");
  });

  it("shows the Claude directory trigger button only on hover and avoids right-edge clipping", async () => {
    await renderClaudeOverviewWithContextMenu();

    expect(
      screen.queryByRole("button", { name: "Options check-license-rule.js" }),
    ).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByRole("button", { name: "check-license-rule.js" }));
    fireEvent.click(screen.getByRole("button", { name: "Options check-license-rule.js" }));
    const triggerMenu = await screen.findByRole("menu");
    expect(triggerMenu).toHaveStyle({
      left: "776px",
      position: "fixed",
      top: "120px",
      width: "176px",
    });

    fireEvent.click(await screen.findByRole("menuitem", { name: "重命名" }));
    const renameInput = await screen.findByLabelText("名称");
    expect(renameInput).toHaveValue("check-license-rule.js");
    fireEvent.change(renameInput, {
      target: { value: "license-rule.js" },
    });
    fireEvent.click(screen.getByRole("button", { name: "重命名" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("rename_claude_directory_entry", {
        path: "scripts/check-license-rule.js",
        newName: "license-rule.js",
      });
    });

    fireEvent.mouseEnter(screen.getByRole("button", { name: "settings.json" }));
    fireEvent.click(screen.getByRole("button", { name: "Options settings.json" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }));
    expect(await screen.findByText("删除后无法撤销。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(invokeMock).not.toHaveBeenCalledWith("delete_claude_directory_entry", {
      path: "settings.json",
    });

    fireEvent.mouseEnter(screen.getByRole("button", { name: "settings.json" }));
    fireEvent.click(screen.getByRole("button", { name: "Options settings.json" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("delete_claude_directory_entry", {
        path: "settings.json",
      });
    });
  });
});
