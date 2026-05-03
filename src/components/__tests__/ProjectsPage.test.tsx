import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ClaudeStats, ConfigWorkspace, ProjectDetail } from "../../types";
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

const PROJECT_ALPHA = "/Users/maguowei/work/alpha";
const PROJECT_BRAVO = "/Users/maguowei/work/bravo";

const WORKSPACE_FIXTURE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    showTraySessions: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: "vscode",
  },
  builtinPresets: [],
  customPresets: [],
  profiles: [],
  bindings: {},
};

function makeStats(): ClaudeStats {
  return {
    numStartups: 1,
    firstStartTime: "2026-05-01T10:00:00Z",
    projects: {
      [PROJECT_ALPHA]: {
        lastCost: 1.2,
        lastDuration: 120,
        lastSessionId: "session-alpha",
        lastTotalInputTokens: 10,
        lastTotalOutputTokens: 20,
        lastTotalCacheCreationInputTokens: 0,
        lastTotalCacheReadInputTokens: 0,
        lastSessionModified: 200,
      },
      [PROJECT_BRAVO]: {
        lastCost: 0.4,
        lastDuration: 60,
        lastSessionId: "session-bravo",
        lastTotalInputTokens: 4,
        lastTotalOutputTokens: 8,
        lastTotalCacheCreationInputTokens: 0,
        lastTotalCacheReadInputTokens: 0,
        lastSessionModified: 100,
      },
    },
    toolUsage: {},
    skillUsage: {},
  };
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
    branches: [],
    worktrees: [],
  };
}

function mockProjectInvokes() {
  invokeMock.mockImplementation(async (command, args) => {
    const project = (args as { project?: string } | undefined)?.project ?? PROJECT_ALPHA;

    switch (command) {
      case "get_config_workspace":
        return WORKSPACE_FIXTURE;
      case "get_stats":
        return makeStats();
      case "get_project_detail":
        return makeProjectDetail(project);
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
      default:
        return null;
    }
  });
}

function renderPage() {
  render(
    <I18nProvider>
      <ProjectsPage />
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

    const bravoButton = await findProjectButton(PROJECT_BRAVO);
    fireEvent.contextMenu(bravoButton, { clientX: 120, clientY: 160 });

    expect(bravoButton).toHaveClass("selected");
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
    expect(invokeMock.mock.calls.filter(([command]) => command === "get_stats").length).toBe(2);
  });
});
