import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import { I18nProvider } from "./i18n";
import type { ConfigWorkspace } from "./types";

const {
  emitTauriEvent,
  eventListeners,
  filePreviewMock,
  fileTreeOptionsMock,
  invokeMock,
  listenMock,
  multiFileDiffMock,
  openUrlMock,
  projectsPageProject,
  revealItemInDirMock,
  usagePageRenderMock,
} = vi.hoisted(() => {
  const eventListeners = new Map<string, Set<(payload: unknown) => unknown>>();
  const emitTauriEvent = async (event: string, payload: unknown) => {
    await Promise.all(
      Array.from(eventListeners.get(event) ?? []).map((listener) => listener(payload)),
    );
  };

  return {
    emitTauriEvent,
    eventListeners,
    filePreviewMock: vi.fn(),
    fileTreeOptionsMock: vi.fn(),
    invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
    listenMock: vi.fn(async (event: string, handler: (event: { payload: unknown }) => unknown) => {
      const listener = (payload: unknown) => handler({ payload });
      const listeners = eventListeners.get(event) ?? new Set<(payload: unknown) => unknown>();
      listeners.add(listener);
      eventListeners.set(event, listeners);
      return () => {
        listeners.delete(listener);
      };
    }),
    multiFileDiffMock: vi.fn(),
    openUrlMock: vi.fn(async () => undefined),
    projectsPageProject: "/Users/test-user/work/alpha",
    revealItemInDirMock: vi.fn(async () => undefined),
    usagePageRenderMock: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: revealItemInDirMock,
  openUrl: openUrlMock,
}));

vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    readOnly,
    value,
    onChange,
    placeholder,
  }: {
    readOnly?: boolean;
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      aria-label="mock-code-editor"
      placeholder={placeholder}
      readOnly={readOnly}
      value={value ?? ""}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => null,
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null,
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
  MultiFileDiff: (props: {
    oldFile: { name: string; contents: string };
    newFile: { name: string; contents: string };
    options?: { diffStyle?: string; overflow?: string };
  }) => {
    multiFileDiffMock(props);
    return (
      <div
        data-testid="pierre-multi-file-diff"
        data-old-file-name={props.oldFile.name}
        data-new-file-name={props.newFile.name}
        data-diff-style={props.options?.diffStyle ?? ""}
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
      paths?: string[];
      preparedInput?: { paths?: string[] };
      search?: boolean;
    }) => {
      fileTreeOptionsMock(options);
      const paths = options.paths ?? options.preparedInput?.paths ?? [];
      const [modelOptions, setModelOptions] = React.useState({
        ...options,
        paths,
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

vi.mock("./components/ProjectsPage", () => ({
  default: (props: { onOpenProjectUsage?: (project: string) => void }) => (
    <main>
      <h1>项目</h1>
      <button type="button" onClick={() => props.onOpenProjectUsage?.(projectsPageProject)}>
        查看Token用量
      </button>
    </main>
  ),
}));

vi.mock("./components/UsagePage", () => ({
  default: (props: { projectRequest?: { project: string; requestId: number } | null }) => {
    const project = props.projectRequest?.project ?? "";
    usagePageRenderMock(props);
    return (
      <main>
        <h1>Token 用量统计</h1>
        <select aria-label="项目" value={project} onChange={() => undefined}>
          <option value="">全部项目</option>
          {project ? <option value={project}>{project}</option> : null}
        </select>
      </main>
    );
  },
}));

const WORKSPACE_FIXTURE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    showTraySessions: true,
    systemNotificationsEnabled: false,
    collapseSidebarByDefault: false,
    thirdPartyProviderPricingEnabled: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
    trayTitleMaxChars: null,
    sessionTrayCountStyle: "superscriptCompact",
    focusSessionShortcut: "Command+Control+J",
  },
  builtinPresets: [],
  customPresets: [],
  profiles: [],
  bindings: {},
};

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const CONFIG_WORKSPACE_WITH_EDITORS: ConfigWorkspace = {
  ...WORKSPACE_FIXTURE,
  builtinPresets: [
    {
      id: "builtin:openrouter",
      name: "OpenRouter",
      localizedName: {
        zh: "开放路由",
        en: "OpenRouter",
      },
      description: "OpenRouter 预设",
      modelSuggestions: [],
      settingsPatch: {},
      source: "builtin",
    },
  ],
  customPresets: [
    {
      id: "custom:team-plan",
      name: "Team Plan",
      localizedName: {
        zh: "团队计划",
        en: "Team Plan",
      },
      description: "团队预设",
      modelSuggestions: [],
      settingsPatch: {},
      source: "custom",
    },
  ],
  profiles: [
    {
      id: "user-openrouter",
      name: "OpenRouter User",
      description: "默认用户配置",
      presetId: "builtin:openrouter",
      settings: {},
      createdAt: "2026-05-13T00:00:00Z",
      updatedAt: "2026-05-13T00:00:00Z",
    },
  ],
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
      <ThemeProvider>
        <App />
      </ThemeProvider>
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
    vi.useRealTimers();
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
    eventListeners.clear();
    filePreviewMock.mockClear();
    fileTreeOptionsMock.mockClear();
    openUrlMock.mockClear();
    revealItemInDirMock.mockClear();
    usagePageRenderMock.mockClear();
    invokeMock.mockResolvedValue(WORKSPACE_FIXTURE);
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: undefined,
    });
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    document.documentElement.classList.remove("dark");
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

  function enableTauriEvents() {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  }

  function mockConfigEditorWorkspace() {
    enableTauriEvents();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_config_workspace") {
        return CONFIG_WORKSPACE_WITH_EDITORS;
      }
      return null;
    });
  }

  function mockMemoryAndSkillWorkspace() {
    enableTauriEvents();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_config_workspace") {
        return WORKSPACE_FIXTURE;
      }
      if (command === "get_memories") {
        return {
          memories: [
            {
              id: "memory-a",
              name: "团队记忆",
              content: "记忆内容",
              targetType: "claude",
              isActive: false,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          unmanagedMemories: [],
        };
      }
      if (command === "get_skills") {
        return [
          {
            id: "local-skill",
            name: "Local Skill",
            description: "普通 Skill",
            content: "内容",
            disableModelInvocation: false,
            userInvocable: true,
            isActive: true,
            createdAt: 1,
            updatedAt: 1,
            isSymlink: false,
            hasSymlinkContent: false,
            linkTarget: null,
          },
        ];
      }
      if (command === "get_skill_file_tree") {
        return [];
      }
      return null;
    });
  }

  it("passes the selected project to token usage navigation", async () => {
    enableTauriEvents();
    const workspaceWithEditor: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      app: {
        ...WORKSPACE_FIXTURE.app,
        defaultEditorApp: "vscode",
      },
    };

    invokeMock.mockImplementation(async (command, _args) => {
      if (command === "get_config_workspace") {
        return workspaceWithEditor;
      }
      return null;
    });

    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "项目" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "查看Token用量" }, { timeout: 5000 }),
    );

    expect(
      await screen.findByRole("heading", { name: "Token 用量统计" }, { timeout: 5000 }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(usagePageRenderMock).toHaveBeenLastCalledWith({
        projectRequest: { project: projectsPageProject, requestId: expect.any(Number) },
      });
    });
    expect(screen.getByRole("combobox", { name: "项目" })).toHaveValue(projectsPageProject);
  }, 10_000);

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

  it("blocks preset tab navigation while the profile editor has unsaved changes", async () => {
    mockConfigEditorWorkspace();
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "OpenRouter User" }));
    fireEvent.change(await screen.findByDisplayValue("OpenRouter User"), {
      target: { value: "OpenRouter Draft" },
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "配置分区", hidden: true })).getByRole("button", {
        name: "预设",
        hidden: true,
      }),
    );

    expect(screen.getByRole("heading", { name: "存在未保存的更改" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("OpenRouter Draft")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "不保存退出" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "预设" })).toBeInTheDocument();
    });
  });

  it("saves profile changes before running guarded preset tab navigation", async () => {
    mockConfigEditorWorkspace();
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "OpenRouter User" }));
    fireEvent.change(await screen.findByDisplayValue("OpenRouter User"), {
      target: { value: "OpenRouter Saved Draft" },
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "配置分区", hidden: true })).getByRole("button", {
        name: "预设",
        hidden: true,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "保存并退出" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "upsert_profile",
        expect.objectContaining({
          data: expect.objectContaining({
            id: "user-openrouter",
            name: "OpenRouter Saved Draft",
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "预设" })).toBeInTheDocument();
    });
  });

  it("blocks the settings drawer while the preset editor has unsaved changes", async () => {
    mockConfigEditorWorkspace();
    renderApp();

    fireEvent.click(
      within(await screen.findByRole("group", { name: "配置分区" })).getByRole("button", {
        name: "预设",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    fireEvent.change(await screen.findByDisplayValue("Team Plan"), {
      target: { value: "Team Plan Draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "设置", hidden: true }));

    expect(screen.getByRole("heading", { name: "存在未保存的更改" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Team Plan Draft")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "不保存退出" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "设置" })).toBeInTheDocument();
    });
  });

  it("returns from presets to profiles through the config section tabs", async () => {
    mockConfigEditorWorkspace();
    renderApp();

    fireEvent.click(
      within(await screen.findByRole("group", { name: "配置分区" })).getByRole("button", {
        name: "预设",
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "预设" })).toBeInTheDocument();
    });

    const presetTabs = screen.getByRole("group", { name: "配置分区" });
    expect(within(presetTabs).getByRole("button", { name: "预设" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(within(presetTabs).getByRole("button", { name: "配置" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "配置" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "OpenRouter User" })).toBeInTheDocument();
  });

  it("blocks sidebar navigation while the memory editor has unsaved changes", async () => {
    mockMemoryAndSkillWorkspace();
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "记忆" }));
    // 等 MemoryPage 通过 React.lazy 加载并渲染页头，避免模块未缓存时 findByRole 超时
    await screen.findByRole("heading", { name: "记忆" }, { timeout: 5000 });
    fireEvent.click(await screen.findByRole("button", { name: "团队记忆" }));
    fireEvent.change(await screen.findByDisplayValue("团队记忆"), {
      target: { value: "团队记忆草稿" },
    });
    fireEvent.click(screen.getByRole("button", { name: "配置", hidden: true }));

    expect(screen.getByRole("heading", { name: "存在未保存的更改" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("团队记忆草稿")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "不保存退出" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "配置" })).toBeInTheDocument();
    });
  });

  it("blocks the settings drawer while the skill editor has unsaved changes", async () => {
    mockMemoryAndSkillWorkspace();
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Skills" }));
    // 等 SkillsPage 通过 React.lazy 加载并渲染页头，避免模块未缓存时 findByRole 超时
    await screen.findByRole("heading", { name: "Skills 管理" }, { timeout: 5000 });
    fireEvent.click(await screen.findByRole("button", { name: "Local Skill" }));
    fireEvent.change(await screen.findByDisplayValue("Local Skill"), {
      target: { value: "Local Skill Draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "设置", hidden: true }));

    expect(screen.getByRole("heading", { name: "存在未保存的更改" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Local Skill Draft")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "不保存退出" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "设置" })).toBeInTheDocument();
    });
  });

  it("reloads the config workspace when user settings changes", async () => {
    enableTauriEvents();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_config_workspace") {
        return WORKSPACE_FIXTURE;
      }
      return null;
    });

    renderApp();

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "get_config_workspace"),
      ).toHaveLength(2);
    });
    const workspaceLoadCount = invokeMock.mock.calls.filter(
      ([command]) => command === "get_config_workspace",
    ).length;

    await act(async () => {
      await emitTauriEvent("claude-directory-changed", { paths: ["settings.json"] });
    });

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "get_config_workspace"),
      ).toHaveLength(workspaceLoadCount + 1);
    });
  });

  it("keeps the in-use profile badge and shows a mismatch warning after user settings is edited externally", async () => {
    enableTauriEvents();
    const activeWorkspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      builtinPresets: [
        {
          id: "builtin:openrouter",
          name: "OpenRouter",
          description: "OpenRouter 预设",
          modelSuggestions: [],
          settingsPatch: {},
          source: "builtin",
        },
      ],
      profiles: [
        {
          id: "user-openrouter",
          name: "OpenRouter User",
          description: "默认用户配置",
          presetId: "builtin:openrouter",
          settings: {
            model: "claude-sonnet-4-6",
          },
          createdAt: "2026-05-13T00:00:00Z",
          updatedAt: "2026-05-13T00:00:00Z",
        },
      ],
      bindings: {
        userProfileId: "user-openrouter",
        userLastAppliedAt: "2026-05-13T00:00:00Z",
      },
    };
    const staleWorkspace: ConfigWorkspace = {
      ...activeWorkspace,
      activeUserSettingsMismatch: {
        profileId: "user-openrouter",
        sourcePath: "settings.json",
        expectedSettings: {
          model: "claude-sonnet-4-6",
        },
        actualSettings: {
          model: "claude-opus-4-7",
        },
      },
    };
    let returnStaleWorkspace = false;
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_config_workspace") {
        return returnStaleWorkspace ? staleWorkspace : activeWorkspace;
      }
      return null;
    });

    renderApp();

    const activeCard = await screen.findByRole("button", { name: "OpenRouter User" });
    expect(within(activeCard).getByText("使用中")).toBeInTheDocument();

    returnStaleWorkspace = true;
    await act(async () => {
      await emitTauriEvent("claude-directory-changed", { paths: ["settings.json"] });
    });

    await waitFor(() => {
      const refreshedCard = screen.getByRole("button", { name: "OpenRouter User" });
      expect(within(refreshedCard).getByText("使用中")).toBeInTheDocument();
      expect(
        within(refreshedCard).getByRole("button", { name: "配置被手动修改" }),
      ).toBeInTheDocument();
      expect(within(refreshedCard).queryByRole("button", { name: "启用" })).not.toBeInTheDocument();
    });
    expect(screen.queryByText("发现未导入的用户设置")).not.toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "~/.claude 目录总览" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "~/.claude 目录总览" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "查看 .claude 目录官方文档" }));
    expect(openUrlMock).toHaveBeenCalledWith("https://code.claude.com/docs/zh-CN/claude-directory");
    expect(screen.getByText("正在扫描 ~/.claude...")).toBeInTheDocument();
    expect(fileTreeOptionsMock).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_claude_directory_overview");
    });
    resolveOverview?.(overviewFixture);

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
      "--claude-overview-tree-width": "calc((100% - 8px) * 0.28)",
    });
    fireEvent.keyDown(resizer, { key: "ArrowLeft" });
    expect(resizer.parentElement).toHaveStyle({
      "--claude-overview-tree-width": "calc((100% - 8px) * 0.30000000000000004)",
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
    expect(previewElement).toHaveAttribute("data-overflow", "scroll");
    const javascriptTab = screen.getByRole("tab", { name: "check-license-rule.js" });
    expect(javascriptTab).toHaveAttribute("aria-selected", "true");
    expect(within(javascriptTab).getByTestId("claude-overview-tab-file-icon")).toHaveAttribute(
      "data-icon-token",
      "javascript",
    );
    fireEvent.click(screen.getByRole("button", { name: "settings.json" }));
    const jsonTab = await screen.findByRole("tab", { name: "settings.json" });
    expect(jsonTab).toHaveAttribute("aria-selected", "true");
    expect(within(jsonTab).getByTestId("claude-overview-tab-file-icon")).toHaveAttribute(
      "data-icon-token",
      "json",
    );
    expect(screen.getByTestId("claude-overview-preview-toolbar")).not.toHaveTextContent(
      "settings.json",
    );
    const previewFooter = screen.getByTestId("claude-overview-preview-footer");
    expect(previewFooter).toHaveTextContent("19 B");
    expect(previewFooter).toHaveTextContent("UTF-8");
    expect(previewFooter).toHaveTextContent(new Date(2 * 1000).toLocaleString());
    expect(screen.getByTestId("claude-overview-preview-toolbar")).not.toHaveTextContent("19 B");
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
          overflow: "scroll",
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

  it("keeps Claude overview open previews when switching away and back", async () => {
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
          content: '{"model":"sonnet"}',
          isBinary: false,
          truncated: false,
          size: 18,
          modifiedAt: 2,
          encoding: "utf-8",
        };
      }
      return null;
    });

    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "~/.claude 目录总览" }));
    fireEvent.click(await screen.findByRole("button", { name: "settings.json" }));

    const openedTab = await screen.findByRole("tab", { name: "settings.json" });
    expect(openedTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("pierre-file-preview")).toHaveAttribute(
      "data-file-contents",
      '{"model":"sonnet"}',
    );

    fireEvent.click(screen.getByRole("button", { name: "配置" }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "~/.claude 目录总览" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "~/.claude 目录总览" }));

    const restoredTab = await screen.findByRole("tab", { name: "settings.json" });
    expect(restoredTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("pierre-file-preview")).toHaveAttribute(
      "data-file-contents",
      '{"model":"sonnet"}',
    );
    expect(
      invokeMock.mock.calls.filter(([command]) => command === "read_claude_file_preview"),
    ).toHaveLength(1);
  });

  it("opens the English Claude directory docs from the overview when language is English", async () => {
    localStorage.setItem("ai-manager-settings", JSON.stringify({ language: "en", theme: "light" }));
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_config_workspace") {
        return {
          ...WORKSPACE_FIXTURE,
          app: {
            ...WORKSPACE_FIXTURE.app,
            uiLanguage: "en",
          },
        };
      }
      if (command === "get_claude_directory_overview") {
        return CLAUDE_OVERVIEW_FIXTURE;
      }
      return null;
    });

    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "~/.claude Overview" }));
    fireEvent.click(await screen.findByRole("link", { name: "Open .claude directory docs" }));

    expect(openUrlMock).toHaveBeenCalledWith("https://code.claude.com/docs/en/claude-directory");
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

  it("refreshes the Claude overview and touched open preview after a directory change event", async () => {
    enableTauriEvents();
    localStorage.setItem("ai-manager-settings", JSON.stringify({ language: "zh", theme: "light" }));
    let overviewCallCount = 0;
    let previewCallCount = 0;
    const refreshedOverview = {
      ...CLAUDE_OVERVIEW_FIXTURE,
      entries: CLAUDE_OVERVIEW_FIXTURE.entries.map((entry) =>
        entry.path === "settings.json" ? { ...entry, size: 20, modifiedAt: 8 } : entry,
      ),
    };
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "get_config_workspace") {
        return WORKSPACE_FIXTURE;
      }
      if (command === "get_claude_directory_overview") {
        overviewCallCount += 1;
        return overviewCallCount === 1 ? CLAUDE_OVERVIEW_FIXTURE : refreshedOverview;
      }
      if (command === "read_claude_file_preview") {
        previewCallCount += 1;
        const path = (args as { path: string }).path;
        return {
          path,
          name: path.split("/").pop() ?? path,
          content: previewCallCount === 1 ? '{"model":"sonnet"}' : '{"model":"opus"}',
          isBinary: false,
          truncated: false,
          size: previewCallCount === 1 ? 18 : 16,
          modifiedAt: previewCallCount === 1 ? 2 : 8,
          encoding: "utf-8",
        };
      }
      return null;
    });

    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "~/.claude 目录总览" }));
    fireEvent.click(await screen.findByRole("button", { name: "settings.json" }));

    await waitFor(() => {
      expect(screen.getByTestId("pierre-file-preview")).toHaveAttribute(
        "data-file-contents",
        '{"model":"sonnet"}',
      );
    });

    await act(async () => {
      await emitTauriEvent("claude-directory-changed", { paths: ["settings.json"] });
    });

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "get_claude_directory_overview"),
      ).toHaveLength(2);
    });
    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "read_claude_file_preview"),
      ).toHaveLength(2);
    });
    expect(screen.getByTestId("pierre-file-preview")).toHaveAttribute(
      "data-file-contents",
      '{"model":"opus"}',
    );
  });

  it("closes an open Claude preview when a touched file disappears after refresh", async () => {
    enableTauriEvents();
    localStorage.setItem("ai-manager-settings", JSON.stringify({ language: "zh", theme: "light" }));
    let overviewCallCount = 0;
    const overviewWithoutSettings = {
      ...CLAUDE_OVERVIEW_FIXTURE,
      entries: CLAUDE_OVERVIEW_FIXTURE.entries.filter((entry) => entry.path !== "settings.json"),
    };
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "get_config_workspace") {
        return WORKSPACE_FIXTURE;
      }
      if (command === "get_claude_directory_overview") {
        overviewCallCount += 1;
        return overviewCallCount === 1 ? CLAUDE_OVERVIEW_FIXTURE : overviewWithoutSettings;
      }
      if (command === "read_claude_file_preview") {
        const path = (args as { path: string }).path;
        return {
          path,
          name: path.split("/").pop() ?? path,
          content: '{"model":"sonnet"}',
          isBinary: false,
          truncated: false,
          size: 18,
          modifiedAt: 2,
          encoding: "utf-8",
        };
      }
      return null;
    });

    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "~/.claude 目录总览" }));
    fireEvent.click(await screen.findByRole("button", { name: "settings.json" }));

    expect(await screen.findByRole("tab", { name: "settings.json" })).toBeInTheDocument();

    await act(async () => {
      await emitTauriEvent("claude-directory-changed", { paths: ["settings.json"] });
    });

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "get_claude_directory_overview"),
      ).toHaveLength(2);
    });
    await waitFor(() => {
      expect(screen.queryByRole("tab", { name: "settings.json" })).not.toBeInTheDocument();
    });
  });
});
