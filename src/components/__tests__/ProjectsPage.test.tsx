import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ConfigWorkspace, HistoryEntry, ProjectDetail } from "../../types";
import { ProjectClaudeExplorer } from "../ProjectClaudeExplorer";
import ProjectsPage from "../ProjectsPage";

const {
  filePreviewMock,
  fileTreeOptionsMock,
  invokeMock,
  listenMock,
  revealItemInDirMock,
  showToastMock,
} = vi.hoisted(() => ({
  filePreviewMock: vi.fn(),
  fileTreeOptionsMock: vi.fn(),
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
  listenMock: vi.fn(async () => () => {}),
  revealItemInDirMock: vi.fn(async () => undefined),
  showToastMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => undefined),
  revealItemInDir: revealItemInDirMock,
}));

vi.mock("@pierre/diffs/react", () => ({
  File: (props: {
    className?: string;
    file: { cacheKey?: string; contents: string; name: string };
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
        data-theme-type={props.options?.themeType ?? ""}
      />
    );
  },
}));

vi.mock("@pierre/trees", () => ({
  createFileTreeIconResolver: () => ({
    resolveIcon: (_name: string, path: string) => ({
      height: 16,
      name: "file-tree-icon-file",
      token: path.endsWith(".json") ? "json" : path.endsWith(".md") ? "markdown" : "default",
      viewBox: "0 0 16 16",
      width: 16,
    }),
  }),
  getBuiltInFileIconColor: () => "currentColor",
  getBuiltInSpriteSheet: () => '<svg><symbol id="file-tree-icon-file" /></svg>',
  prepareFileTreeInput: (paths: string[]) => ({ paths }),
}));

vi.mock("@pierre/trees/react", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    useFileTree: (options: {
      density?: string;
      initialExpansion?: string | number;
      onSelectionChange: (selectedPaths: string[]) => void;
      preparedInput?: { paths?: string[] };
      search?: boolean;
    }) => {
      fileTreeOptionsMock(options);
      const paths = options.preparedInput?.paths ?? [];
      const modelRef = React.useRef({
        options: { ...options, paths },
        resetPaths: vi.fn((nextPaths: string[]) => {
          modelRef.current.options = { ...modelRef.current.options, paths: nextPaths };
        }),
      });
      modelRef.current.options = { ...options, paths };
      return { model: modelRef.current };
    },
    FileTree: (props: {
      className?: string;
      model: {
        options: {
          onSelectionChange: (selectedPaths: string[]) => void;
          paths: string[];
        };
      };
    }) => (
      <div data-testid="pierre-file-tree" className={props.className}>
        <input aria-label="Search files" />
        {props.model.options.paths.map((path) => {
          const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
          const name = normalizedPath.split("/").pop() ?? normalizedPath;
          return (
            <button
              key={path}
              type="button"
              data-type="item"
              data-item-path={path}
              onClick={() => props.model.options.onSelectionChange([path])}
            >
              {name}
            </button>
          );
        })}
      </div>
    ),
  };
});

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

const PROJECT_ALPHA = "/Users/test-user/work/alpha";
const PROJECT_BRAVO = "/Users/test-user/work/bravo";

const WORKSPACE_FIXTURE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    showTraySessions: true,
    systemNotificationsEnabled: false,
    collapseSidebarByDefault: false,
    thirdPartyProviderPricingEnabled: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: "vscode",
    trayTitleMaxChars: null,
    sessionTrayCountStyle: "superscriptCompact",
    trayPulseWaiting: true,
    focusSessionShortcut: "Command+Control+J",
  },
  builtinPresets: [],
  customPresets: [],
  profiles: [],
  bindings: {},
};

function makeHistoryEntry(
  partial: Partial<HistoryEntry> & Pick<HistoryEntry, "project" | "sessionId" | "timestamp">,
): HistoryEntry {
  return {
    display: partial.display ?? "test prompt",
    pastedContents: partial.pastedContents ?? {},
    project: partial.project,
    sessionId: partial.sessionId,
    timestamp: partial.timestamp,
  };
}

function makeHistoryEntries(): HistoryEntry[] {
  return [
    makeHistoryEntry({
      display: "alpha first prompt",
      project: PROJECT_ALPHA,
      sessionId: "session-alpha",
      timestamp: 200,
    }),
    makeHistoryEntry({
      display: "alpha follow-up prompt",
      project: PROJECT_ALPHA,
      sessionId: "session-alpha",
      timestamp: 220,
    }),
    makeHistoryEntry({
      display: "bravo first prompt",
      project: PROJECT_BRAVO,
      sessionId: "session-bravo",
      timestamp: 100,
    }),
  ];
}

function makeHistoryContent(entries: HistoryEntry[] = makeHistoryEntries()) {
  return entries.map((entry) => JSON.stringify(entry)).join("\n");
}

function makeProjectDetail(project: string): ProjectDetail {
  return {
    path: project,
    shortName: project.split("/").pop() ?? project,
    exists: true,
    isGitRepo: true,
    repoRoot: project,
    repositoryUrl: "https://github.example.com/team/repo",
    hasClaudeMd: true,
    hasProjectClaudeDir: true,
    hasProjectClaudeSkills: true,
    hasProjectClaudeSettings: false,
    hasProjectClaudeSettingsLocal: false,
    projectClaudeRulesCount: 0,
    agentsStatus: "missing",
    agentsSkillsStatus: "missing",
    memoryPairStatus: "onlyClaude",
    skillsPairStatus: "onlyClaude",
    projectSkills: [{ id: "review-skill", isSymlink: false }],
    branches: [
      {
        name: "main",
        isCurrent: true,
        lastCommitAt: 1710000000,
        lastCommitSubject: "initial",
      },
      {
        name: "feature/old",
        isCurrent: false,
        lastCommitAt: 1700000000,
        lastCommitSubject: "feat: old branch",
      },
    ],
    worktrees: [
      {
        path: `${project}/.worktrees/feature-old`,
        branch: "feature/old",
        head: "1234567890abcdef",
        isCurrent: false,
        isDetached: false,
      },
    ],
  };
}

function mockProjectInvokes() {
  invokeMock.mockImplementation(async (command, args) => {
    const project = (args as { project?: string } | undefined)?.project ?? PROJECT_ALPHA;

    switch (command) {
      case "get_config_workspace":
        return WORKSPACE_FIXTURE;
      case "get_history":
        return { content: makeHistoryContent(), mtime: 1 };
      case "get_history_if_changed":
        return null;
      case "get_project_detail":
        return makeProjectDetail(project);
      case "get_session_detail":
        return {
          session_id: (args as { sessionId?: string } | undefined)?.sessionId ?? "session-alpha",
          project,
          messages: [],
        };
      case "preview_project_local_data_purge":
        return {
          project,
          output: `Dry run plan for ${project}\n- delete ~/.claude/projects/bravo`,
        };
      case "purge_project_local_data":
        return {
          project,
          output: `Deleted Claude project state for ${project}`,
        };
      case "preview_project_branch_cleanup":
        return {
          project,
          repoRoot: project,
          baseBranch: "main",
          branchCandidates: [
            {
              name: "feature/old",
              reason: "merged",
              forceDelete: false,
              lastCommitAt: 1700000000,
              lastCommitSubject: "feat: old branch",
            },
          ],
          worktreeCandidates: [],
        };
      case "cleanup_project_branches":
        return {
          project,
          deletedBranches: ["feature/old"],
          deletedWorktrees: [],
          errors: [],
        };
      case "preview_project_worktree_cleanup":
        return {
          project,
          repoRoot: project,
          baseBranch: "main",
          branchCandidates: [],
          worktreeCandidates: [
            {
              path: `${project}/.worktrees/feature-old`,
              branch: "feature/old",
              head: "1234567890abcdef",
              reason: "merged",
              isDetached: false,
            },
          ],
        };
      case "cleanup_project_worktrees":
        return {
          project,
          deletedBranches: [],
          deletedWorktrees: [`${project}/.worktrees/feature-old`],
          errors: [],
        };
      case "open_project_in_terminal":
        return null;
      default:
        return null;
    }
  });
}

function renderPage(props?: ComponentProps<typeof ProjectsPage>) {
  render(
    <I18nProvider>
      <ProjectsPage {...props} />
    </I18nProvider>,
  );
}

async function findProjectButton(project: string) {
  const path = await screen.findByText(project);
  const button = path.closest("button");
  expect(button).not.toBeNull();
  return button as HTMLButtonElement;
}

const PROJECT_CLAUDE_OVERVIEW_FIXTURE = {
  rootPath: `${PROJECT_ALPHA}/.claude`,
  maxEntries: 100000,
  maxDepth: 128,
  entries: [
    {
      path: "rules",
      name: "rules",
      kind: "directory" as const,
      size: 0,
      modifiedAt: 1,
    },
    {
      path: "rules/frontend-ui.md",
      name: "frontend-ui.md",
      kind: "file" as const,
      size: 64,
      modifiedAt: 2,
    },
    {
      path: "settings.json",
      name: "settings.json",
      kind: "file" as const,
      size: 18,
      modifiedAt: 3,
    },
  ],
  truncated: false,
  reachedEntryLimit: false,
  reachedDepthLimit: false,
  skippedSymlinkCount: 0,
  skippedNodeModulesCount: 0,
};

function mockProjectClaudeExplorerInvokes() {
  invokeMock.mockImplementation(async (command, args) => {
    if (command === "get_project_claude_directory_overview") {
      return PROJECT_CLAUDE_OVERVIEW_FIXTURE;
    }
    if (command === "get_project_claude_file_preview") {
      const relativePath = (args as { relativePath: string }).relativePath;
      if (relativePath === "rules/frontend-ui.md") {
        return {
          path: relativePath,
          name: "frontend-ui.md",
          content: "# Frontend UI\n\nUse compact surfaces.",
          isBinary: false,
          truncated: true,
          size: 64,
          modifiedAt: 2,
          encoding: "utf-8",
        };
      }
      return {
        path: relativePath,
        name: "settings.json",
        content: '{"model":"sonnet"}',
        isBinary: false,
        truncated: false,
        size: 18,
        modifiedAt: 3,
        encoding: "utf-8",
      };
    }
    if (command === "open_project_claude_file_in_editor") {
      return null;
    }
    return null;
  });
}

function renderProjectClaudeExplorer() {
  render(
    <I18nProvider>
      <ProjectClaudeExplorer
        open
        onOpenChange={() => undefined}
        project={PROJECT_ALPHA}
        hasSettingsJson
        hasSettingsLocalJson
        t={(key) => key}
      />
    </I18nProvider>,
  );
}

describe("ProjectClaudeExplorer overview parity", () => {
  beforeEach(() => {
    localStorage.clear();
    filePreviewMock.mockClear();
    fileTreeOptionsMock.mockClear();
    invokeMock.mockReset();
    revealItemInDirMock.mockClear();
    showToastMock.mockReset();
    mockProjectClaudeExplorerInvokes();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("uses the shared Pierre file tree with search and compact closed expansion", async () => {
    renderProjectClaudeExplorer();

    await waitFor(() => {
      expect(fileTreeOptionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          density: "compact",
          initialExpansion: "closed",
          search: true,
        }),
      );
    });
    expect(screen.getByTestId("pierre-file-tree")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "rules" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "frontend-ui.md" })).toBeInTheDocument();
  });

  it("opens project files in overview-style tabs with Pierre source preview and footer metadata", async () => {
    renderProjectClaudeExplorer();

    fireEvent.click(await screen.findByRole("button", { name: "settings.json" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_project_claude_file_preview", {
        project: PROJECT_ALPHA,
        relativePath: "settings.json",
      });
    });
    const tab = await screen.findByRole("tab", { name: "settings.json" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(within(tab).getByTestId("claude-overview-tab-file-icon")).toHaveAttribute(
      "data-icon-token",
      "json",
    );
    expect(screen.getByTestId("pierre-file-preview")).toHaveAttribute(
      "data-file-contents",
      '{"model":"sonnet"}',
    );
    const footer = screen.getByTestId("claude-overview-preview-footer");
    expect(footer).toHaveTextContent("18 B");
    expect(footer).toHaveTextContent(new Date(3 * 1000).toLocaleString());
    expect(footer).toHaveTextContent("claudeOverview.encodingUtf8");

    fireEvent.click(screen.getByRole("button", { name: "claudeOverview.copyPath" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${PROJECT_ALPHA}/.claude/settings.json`,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "claudeOverview.openFileBrowser" }));
    await waitFor(() => {
      expect(revealItemInDirMock).toHaveBeenCalledWith(`${PROJECT_ALPHA}/.claude/settings.json`);
    });

    fireEvent.click(screen.getByRole("button", { name: "claudeOverview.openEditor" }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_project_claude_file_in_editor", {
        project: PROJECT_ALPHA,
        relativePath: "settings.json",
      });
    });
  });

  it("defaults markdown files to rendered preview, can switch to source, and keeps directories metadata-only", async () => {
    renderProjectClaudeExplorer();

    fireEvent.click(await screen.findByRole("button", { name: "rules" }));
    expect(screen.getByText("claudeOverview.directorySelected")).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith(
      "get_project_claude_file_preview",
      expect.objectContaining({ relativePath: "rules" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "frontend-ui.md" }));
    await screen.findByRole("tab", { name: "frontend-ui.md" });
    expect(screen.getByRole("button", { name: "claudeOverview.toggleToSource" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByTestId("pierre-file-preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("claude-overview-preview-footer")).toHaveTextContent(
      "claudeOverview.fileTruncated",
    );

    fireEvent.click(screen.getByRole("button", { name: "claudeOverview.toggleToSource" }));
    expect(await screen.findByTestId("pierre-file-preview")).toHaveAttribute(
      "data-file-contents",
      "# Frontend UI\n\nUse compact surfaces.",
    );
  });
});

describe("ProjectsPage purge context menu", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    listenMock.mockClear();
    showToastMock.mockReset();
    mockProjectInvokes();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
  });

  it("opens the purge context menu from a right-click and selects that project", async () => {
    renderPage();

    const alphaButton = await findProjectButton(PROJECT_ALPHA);
    expect(within(alphaButton).getByText("1 个会话")).toBeInTheDocument();
    expect(within(alphaButton).getByText("2 条输入")).toBeInTheDocument();
    expect(within(alphaButton).getByText(/最近活跃/)).toBeInTheDocument();
    expect(within(alphaButton).queryByText("session-")).not.toBeInTheDocument();

    const bravoButton = await findProjectButton(PROJECT_BRAVO);
    expect(invokeMock).not.toHaveBeenCalledWith("get_stats");
    expect(screen.queryByText("最近费用")).not.toBeInTheDocument();
    expect(screen.queryByText("最近时长")).not.toBeInTheDocument();
    fireEvent.contextMenu(bravoButton, { clientX: 120, clientY: 160 });

    await waitFor(() => {
      expect(bravoButton).toHaveAttribute("aria-pressed", "true");
    });
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "清除本地数据" })).toBeInTheDocument();
  });

  it("runs dry-run and shows the deletion plan before confirmation", async () => {
    renderPage();

    const bravoButton = await findProjectButton(PROJECT_BRAVO);
    fireEvent.contextMenu(bravoButton, { clientX: 120, clientY: 160 });
    fireEvent.click(screen.getByRole("menuitem", { name: "清除本地数据" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("preview_project_local_data_purge", {
        project: PROJECT_BRAVO,
      });
    });
    const dialog = await screen.findByRole("dialog", { name: "清除本地数据" });
    expect(dialog).toHaveTextContent(`Dry run plan for ${PROJECT_BRAVO}`);
    expect(within(dialog).getByRole("button", { name: "清除本地数据" })).toBeEnabled();
  });

  it("opens recent session details from the project panel", async () => {
    renderPage();

    const sessionButton = await screen.findByRole("button", { name: /session-alpha/ });
    fireEvent.click(sessionButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_session_detail", {
        project: PROJECT_ALPHA,
        sessionId: "session-alpha",
      });
    });
  });

  it("opens the selected project in history from the recent sessions panel", async () => {
    const onOpenProjectHistory = vi.fn();
    renderPage({ onOpenProjectHistory });

    const viewAllButton = await screen.findByRole("button", { name: "查看全部会话" });
    fireEvent.click(viewAllButton);

    expect(onOpenProjectHistory).toHaveBeenCalledWith(PROJECT_ALPHA);
  });

  it("opens token usage for the selected project from the project panel", async () => {
    const onOpenProjectUsage = vi.fn();
    renderPage({ onOpenProjectUsage });

    const usageButton = await screen.findByRole("button", { name: "查看Token用量" });
    fireEvent.click(usageButton);

    expect(onOpenProjectUsage).toHaveBeenCalledWith(PROJECT_ALPHA);
  });

  it("shows a missing directory warning on the selected project list card only", async () => {
    invokeMock.mockImplementation(async (command, args) => {
      const project = (args as { project?: string } | undefined)?.project ?? PROJECT_ALPHA;
      if (command === "get_project_detail") {
        return {
          ...makeProjectDetail(project),
          exists: project !== PROJECT_ALPHA,
        };
      }
      return mockProjectInvokesForCommand(command, args);
    });

    renderPage();

    const alphaButton = await findProjectButton(PROJECT_ALPHA);

    await waitFor(() => {
      expect(within(alphaButton).getByText("项目目录不存在")).toBeInTheDocument();
    });
    expect(within(alphaButton).queryByText("目录存在")).not.toBeInTheDocument();
    expect(screen.queryByText("目录状态")).not.toBeInTheDocument();
  });

  it("cancels the preview dialog without executing purge", async () => {
    renderPage();

    const bravoButton = await findProjectButton(PROJECT_BRAVO);
    fireEvent.contextMenu(bravoButton, { clientX: 120, clientY: 160 });
    fireEvent.click(screen.getByRole("menuitem", { name: "清除本地数据" }));

    const dialog = await screen.findByRole("dialog", { name: "清除本地数据" });
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "清除本地数据" })).not.toBeInTheDocument();
    });
    expect(invokeMock).not.toHaveBeenCalledWith("purge_project_local_data", expect.anything());
  });

  it("executes purge after confirmation and refreshes the project list", async () => {
    renderPage();

    const bravoButton = await findProjectButton(PROJECT_BRAVO);
    fireEvent.contextMenu(bravoButton, { clientX: 120, clientY: 160 });
    fireEvent.click(screen.getByRole("menuitem", { name: "清除本地数据" }));

    const dialog = await screen.findByRole("dialog", { name: "清除本地数据" });
    fireEvent.click(within(dialog).getByRole("button", { name: "清除本地数据" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("purge_project_local_data", {
        project: PROJECT_BRAVO,
      });
    });
    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith("项目本地数据已清除");
    });
    expect(invokeMock.mock.calls.filter(([command]) => command === "get_history").length).toBe(2);
  });

  it("shows the backend reason when creating AGENTS.md symlink fails", async () => {
    invokeMock.mockImplementation(async (command, args) => {
      const project = (args as { project?: string } | undefined)?.project ?? PROJECT_ALPHA;

      if (command === "get_config_workspace") return WORKSPACE_FIXTURE;
      if (command === "get_history") return { content: makeHistoryContent(), mtime: 1 };
      if (command === "get_history_if_changed") return null;
      if (command === "get_project_detail") return makeProjectDetail(project);
      if (command === "create_project_agents_symlink") {
        throw "项目根目录缺少 CLAUDE.md，无法创建 AGENTS.md";
      }
      return null;
    });

    renderPage();
    expect(await screen.findByText(PROJECT_ALPHA)).toBeInTheDocument();

    const memorySection = await screen.findByTestId("pair-section-memory");
    const agentsButton = within(memorySection).getByRole("button", { name: "创建软链" });
    await waitFor(() => {
      expect(agentsButton).toBeEnabled();
    });
    fireEvent.click(agentsButton);

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith("生成 AGENTS.md 软链失败", "error", {
        description: "项目根目录缺少 CLAUDE.md，无法创建 AGENTS.md",
      });
    });
  });

  it("creates the project Skills symlink for Codex and refreshes the detail", async () => {
    mockProjectInvokes();

    renderPage();
    expect(await screen.findByText(PROJECT_ALPHA)).toBeInTheDocument();

    const skillsSection = await screen.findByTestId("pair-section-skills");
    const skillsButton = within(skillsSection).getByRole("button", { name: "创建软链" });
    await waitFor(() => {
      expect(skillsButton).toBeEnabled();
    });
    fireEvent.click(skillsButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("create_project_agents_skills_symlink", {
        project: PROJECT_ALPHA,
      });
    });
    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(".agents/skills 软链已生成");
    });
  });

  it("detects branch cleanup candidates and executes the previewed selection", async () => {
    renderPage();

    const cleanupButton = await screen.findByRole("button", { name: "检测可清理分支" });
    await waitFor(() => {
      expect(cleanupButton).toBeEnabled();
    });
    fireEvent.click(cleanupButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("preview_project_branch_cleanup", {
        project: PROJECT_ALPHA,
      });
    });
    const dialog = await screen.findByRole("dialog", { name: "清理本地分支" });
    expect(dialog).toHaveTextContent("基准分支");
    expect(dialog).toHaveTextContent("main");
    expect(dialog).toHaveTextContent("feature/old");
    expect(dialog).toHaveTextContent("已合并");

    fireEvent.click(within(dialog).getByRole("button", { name: "清理 1 个分支" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("cleanup_project_branches", {
        project: PROJECT_ALPHA,
        branches: ["feature/old"],
      });
    });
    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith("分支清理完成");
    });
  });

  it("disables branch cleanup confirmation when no candidates are detected", async () => {
    invokeMock.mockImplementation(async (command, args) => {
      const project = (args as { project?: string } | undefined)?.project ?? PROJECT_ALPHA;
      if (command === "preview_project_branch_cleanup") {
        return {
          project,
          repoRoot: project,
          baseBranch: "main",
          branchCandidates: [],
          worktreeCandidates: [],
        };
      }
      return mockProjectInvokesForCommand(command, args);
    });

    renderPage();

    const cleanupButton = await screen.findByRole("button", { name: "检测可清理分支" });
    await waitFor(() => {
      expect(cleanupButton).toBeEnabled();
    });
    fireEvent.click(cleanupButton);

    const dialog = await screen.findByRole("dialog", { name: "清理本地分支" });
    expect(dialog).toHaveTextContent("没有可清理的本地分支");
    expect(within(dialog).getByRole("button", { name: "清理 0 个分支" })).toBeDisabled();
  });

  it("detects worktree cleanup candidates and executes the previewed selection", async () => {
    renderPage();

    const cleanupButton = await screen.findByRole("button", { name: "检测可清理 Worktrees" });
    await waitFor(() => {
      expect(cleanupButton).toBeEnabled();
    });
    fireEvent.click(cleanupButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("preview_project_worktree_cleanup", {
        project: PROJECT_ALPHA,
      });
    });
    const dialog = await screen.findByRole("dialog", { name: "清理 Worktrees" });
    expect(dialog).toHaveTextContent(`${PROJECT_ALPHA}/.worktrees/feature-old`);
    expect(dialog).toHaveTextContent("feature/old");

    fireEvent.click(within(dialog).getByRole("button", { name: "清理 1 个 Worktree" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("cleanup_project_worktrees", {
        project: PROJECT_ALPHA,
        worktrees: [`${PROJECT_ALPHA}/.worktrees/feature-old`],
      });
    });
    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith("Worktree 清理完成");
    });
  });

  it("opens a worktree row in the configured terminal", async () => {
    renderPage();

    const worktreePath = `${PROJECT_ALPHA}/.worktrees/feature-old`;
    const button = await screen.findByRole("button", { name: `用终端打开 ${worktreePath}` });
    fireEvent.click(button);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_project_in_terminal", {
        project: worktreePath,
      });
    });
  });
});

function mockProjectInvokesForCommand(command: string, args?: unknown) {
  const project = (args as { project?: string } | undefined)?.project ?? PROJECT_ALPHA;

  switch (command) {
    case "get_config_workspace":
      return WORKSPACE_FIXTURE;
    case "get_history":
      return { content: makeHistoryContent(), mtime: 1 };
    case "get_history_if_changed":
      return null;
    case "get_project_detail":
      return makeProjectDetail(project);
    case "get_session_detail":
      return {
        session_id: (args as { sessionId?: string } | undefined)?.sessionId ?? "session-alpha",
        project,
        messages: [],
      };
    default:
      return null;
  }
}
