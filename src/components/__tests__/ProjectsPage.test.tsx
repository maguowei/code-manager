import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ConfigWorkspace, HistoryEntry, ProjectDetail } from "../../types";
import ProjectsPage from "../ProjectsPage";

const { invokeMock, listenMock, showToastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
  listenMock: vi.fn(async () => () => {}),
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
}));

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
    agentsStatus: "missing",
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

    const agentsButton = await screen.findByRole("button", { name: "生成 / 修复 AGENTS.md" });
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
