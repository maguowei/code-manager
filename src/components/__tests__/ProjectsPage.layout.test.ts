import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectDetail, ProjectSummary } from "../../types";
import ProjectDetailPanel from "../ProjectDetailPanel";

const SUMMARY: ProjectSummary = {
  project: "/Users/test-user/work/alpha",
  shortName: "alpha",
  lastActiveAt: 200,
  messageCount: 2,
  sessionCount: 1,
  lastSessionId: "session-alpha",
  recentSessions: [
    {
      sessionId: "session-alpha",
      firstPrompt: "alpha first prompt",
      lastPrompt: "alpha follow-up prompt",
      messageCount: 2,
      firstTimestamp: 100,
      lastTimestamp: 200,
    },
  ],
};

const DETAIL: ProjectDetail = {
  path: SUMMARY.project,
  shortName: SUMMARY.shortName,
  exists: true,
  isGitRepo: true,
  repoRoot: SUMMARY.project,
  repositoryUrl: "https://github.example.com/team/repo",
  hasClaudeMd: true,
  agentsStatus: "missing",
  branches: [],
  worktrees: [],
};

function renderDetailPanel() {
  render(
    createElement(ProjectDetailPanel, {
      t: (key) => key,
      summary: SUMMARY,
      detail: DETAIL,
      defaultEditorApp: "vscode",
      canCreateAgentsLink: true,
      canOpenRepository: true,
      canOpenProjectDirectory: true,
      canOpenInEditor: true,
      isLinkingAgents: false,
      onOpenInTerminal: () => undefined,
      onOpenInEditor: () => undefined,
      onOpenRepository: () => undefined,
      onCreateAgentsLink: () => undefined,
      onOpenSession: () => undefined,
      onOpenProjectHistory: () => undefined,
      onOpenProjectUsage: () => undefined,
    }),
  );
}

describe("ProjectsPage layout", () => {
  it("shows the project path only as the title hover text and copies it from the project name", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderDetailPanel();

    const projectNameButton = screen.getByRole("button", { name: "projects.copyProjectPath" });
    fireEvent.click(projectNameButton);

    expect(projectNameButton).toHaveTextContent(SUMMARY.shortName);
    expect(projectNameButton).toHaveAttribute("title", SUMMARY.project);
    expect(document.querySelector(".projects-hero-path")).not.toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(SUMMARY.project);
  });

  it("copies the source repository url from the repository address", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderDetailPanel();

    const repositoryButton = screen.getByRole("button", {
      name: `projects.copyRepositoryUrl ${DETAIL.repositoryUrl}`,
    });
    fireEvent.click(repositoryButton);

    expect(repositoryButton).toHaveTextContent(DETAIL.repositoryUrl as string);
    expect(repositoryButton).toHaveAttribute("title", DETAIL.repositoryUrl);
    expect(writeText).toHaveBeenCalledWith(DETAIL.repositoryUrl);
  });

  it("keeps the overview compact with a short copyable last session id and no git root row", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const fullSessionId = "a1184267-94ed-4c39-97d5-7476d94504cc";

    render(
      createElement(ProjectDetailPanel, {
        t: (key) => key,
        summary: {
          ...SUMMARY,
          lastSessionId: fullSessionId,
        },
        detail: DETAIL,
        defaultEditorApp: "vscode",
        canCreateAgentsLink: true,
        canOpenRepository: true,
        canOpenProjectDirectory: true,
        canOpenInEditor: true,
        isLinkingAgents: false,
        onOpenInTerminal: () => undefined,
        onOpenInEditor: () => undefined,
        onOpenRepository: () => undefined,
        onCreateAgentsLink: () => undefined,
        onOpenSession: () => undefined,
        onOpenProjectHistory: () => undefined,
        onOpenProjectUsage: () => undefined,
      }),
    );

    const overviewPanel = screen.getByText("projects.overview").closest(".projects-overview-panel");
    expect(overviewPanel).not.toBeNull();
    const overview = within(overviewPanel as HTMLElement);
    const sessionIdButton = overview.getByRole("button", { name: "projects.copySessionId" });
    fireEvent.click(sessionIdButton);

    expect(overview.queryByText("projects.repoRoot")).not.toBeInTheDocument();
    expect(sessionIdButton).toHaveTextContent("a1184267");
    expect(sessionIdButton).not.toHaveTextContent(fullSessionId);
    expect(sessionIdButton).toHaveAttribute("title", fullSessionId);
    expect(writeText).toHaveBeenCalledWith(fullSessionId);
  });

  it("places last active as the final overview item", () => {
    renderDetailPanel();

    const overviewPanel = screen.getByText("projects.overview").closest(".projects-overview-panel");
    expect(overviewPanel).not.toBeNull();
    const overviewLabels = Array.from(
      (overviewPanel as HTMLElement).querySelectorAll(".projects-definition-row dt"),
    ).map((label) => label.textContent);

    expect(overviewLabels).toEqual([
      "projects.sessionCount",
      "projects.messageCount",
      "projects.lastSessionId",
      "projects.lastActive",
    ]);
  });

  it("right aligns timestamps in recent session cards", () => {
    renderDetailPanel();

    const sessionTime = document.querySelector(".projects-recent-session-time");

    expect(sessionTime).toHaveClass("w-full", "text-right");
  });

  it("removes the compact status strip and keeps AGENTS status in its own panel", () => {
    renderDetailPanel();

    expect(screen.queryByText("projects.directoryStatus")).not.toBeInTheDocument();
    expect(screen.queryByText("projects.directoryExists")).not.toBeInTheDocument();
    expect(document.querySelector(".projects-status-strip")).not.toBeInTheDocument();
    expect(screen.queryByText("projects.gitStatus")).not.toBeInTheDocument();
    expect(screen.queryByText("projects.gitRepo")).not.toBeInTheDocument();
    expect(screen.getAllByText("projects.agentsMd")).toHaveLength(1);
  });

  it("keeps AGENTS panel status labels and badges on the same compact rhythm", () => {
    renderDetailPanel();

    const agentsStatusRow = screen.getByText("projects.claudeMd").closest("div");
    expect(agentsStatusRow).toHaveClass("flex", "flex-wrap", "items-center");
    expect(agentsStatusRow).toHaveClass("gap-x-2", "gap-y-1");
    expect(agentsStatusRow).not.toHaveClass("grid");

    expect(screen.getByText("projects.claudeMdPresent")).toHaveClass("min-h-5", "px-2.5");
  });

  it("keeps quick actions in the side panel while allowing narrow buttons to wrap", () => {
    renderDetailPanel();

    const hero = document.querySelector(".projects-hero");
    const actions = document.querySelector(".projects-hero-actions");
    const terminalButton = screen.getByRole("button", { name: "projects.openInTerminal" });
    const usageButton = screen.getByRole("button", { name: "projects.viewTokenUsageCost" });

    expect(hero).toHaveClass("lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.95fr)]");
    expect(hero).not.toHaveClass("2xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.95fr)]");
    expect(actions).toHaveClass("sm:grid-cols-2");
    expect(actions).not.toHaveClass("2xl:grid-cols-2");
    expect(terminalButton).toHaveClass("sm:col-span-2");
    expect(usageButton).toHaveClass("min-w-0", "overflow-hidden");
    expect(usageButton).not.toHaveClass("whitespace-normal");
    expect(within(usageButton).getByText("projects.viewTokenUsageCost")).toHaveClass(
      "min-w-0",
      "truncate",
    );
  });

  it("lets section heading actions wrap below the title on narrow widths", () => {
    renderDetailPanel();

    const agentsAction = screen
      .getByRole("button", { name: "projects.linkAgents" })
      .closest(".projects-section-heading-action");

    expect(agentsAction).toHaveClass("max-sm:w-full");
    expect(agentsAction).toHaveClass("max-sm:[&>button]:w-full");
  });

  it("renders recent sessions instead of cost and duration in the detail panel", () => {
    renderDetailPanel();

    expect(screen.getByText("projects.recentSessions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /session-alpha/ })).toBeInTheDocument();
    expect(screen.queryByText("projects.lastCost")).not.toBeInTheDocument();
    expect(screen.queryByText("projects.lastDuration")).not.toBeInTheDocument();
  });

  it("offers a button to open all sessions for the project", () => {
    const onOpenProjectHistory = vi.fn();

    render(
      createElement(ProjectDetailPanel, {
        t: (key) => key,
        summary: SUMMARY,
        detail: DETAIL,
        defaultEditorApp: "vscode",
        canCreateAgentsLink: true,
        canOpenRepository: true,
        canOpenProjectDirectory: true,
        canOpenInEditor: true,
        isLinkingAgents: false,
        onOpenInTerminal: () => undefined,
        onOpenInEditor: () => undefined,
        onOpenRepository: () => undefined,
        onCreateAgentsLink: () => undefined,
        onOpenSession: () => undefined,
        onOpenProjectHistory,
        onOpenProjectUsage: () => undefined,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "projects.viewAllSessions" }));

    expect(onOpenProjectHistory).toHaveBeenCalledTimes(1);
  });

  it("offers a button to open token usage and cost for the project", () => {
    const onOpenProjectUsage = vi.fn();

    render(
      createElement(ProjectDetailPanel, {
        t: (key) => key,
        summary: SUMMARY,
        detail: DETAIL,
        defaultEditorApp: "vscode",
        canCreateAgentsLink: true,
        canOpenRepository: true,
        canOpenProjectDirectory: true,
        canOpenInEditor: true,
        isLinkingAgents: false,
        onOpenInTerminal: () => undefined,
        onOpenInEditor: () => undefined,
        onOpenRepository: () => undefined,
        onCreateAgentsLink: () => undefined,
        onOpenSession: () => undefined,
        onOpenProjectHistory: () => undefined,
        onOpenProjectUsage,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "projects.viewTokenUsageCost" }));

    expect(onOpenProjectUsage).toHaveBeenCalledTimes(1);
  });

  it("keeps overview in normal flow so it does not cover recent sessions while scrolling", () => {
    renderDetailPanel();

    const overviewPanel = screen.getByText("projects.overview").closest(".projects-overview-panel");

    expect(overviewPanel).not.toHaveClass("sticky");
    expect(overviewPanel).not.toHaveClass("lg:sticky");
    expect(overviewPanel).not.toHaveClass("top-0");
    expect(overviewPanel).not.toHaveClass("lg:top-0");
  });

  it("keeps branch and worktree tables inside the panel without horizontal scrolling", () => {
    render(
      createElement(ProjectDetailPanel, {
        t: (key) => key,
        summary: SUMMARY,
        detail: {
          ...DETAIL,
          branches: [
            {
              name: "feature/very-long-local-branch-name-that-should-wrap-inside-the-card",
              isCurrent: true,
              lastCommitSubject:
                "feat(projects): keep project management tables inside their panel width",
              lastCommitAt: 1778932800,
            },
          ],
          worktrees: [
            {
              path: "/Users/test-user/work/alpha/.worktrees/very-long-feature-branch-name-that-needs-inspection",
              branch: "feature/long-path",
              head: "1234567890abcdef",
              isCurrent: false,
              isDetached: false,
            },
          ],
        },
        defaultEditorApp: "vscode",
        canCreateAgentsLink: true,
        canOpenRepository: true,
        canOpenProjectDirectory: true,
        canOpenInEditor: true,
        isLinkingAgents: false,
        onOpenInTerminal: () => undefined,
        onOpenInEditor: () => undefined,
        onOpenRepository: () => undefined,
        onCreateAgentsLink: () => undefined,
        onOpenSession: () => undefined,
        onOpenProjectHistory: () => undefined,
        onOpenProjectUsage: () => undefined,
      }),
    );

    for (const table of document.querySelectorAll(".projects-table")) {
      expect(table).not.toHaveClass("overflow-x-auto");
    }
    for (const tableInner of document.querySelectorAll(".projects-table-inner")) {
      expect(tableInner.className).not.toMatch(/min-w-\[/);
    }
  });

  it("keeps full worktree paths inspectable in the detail table", () => {
    const worktreePath =
      "/Users/test-user/work/alpha/.worktrees/very-long-feature-branch-name-that-needs-inspection";

    render(
      createElement(ProjectDetailPanel, {
        t: (key) => key,
        summary: SUMMARY,
        detail: {
          ...DETAIL,
          worktrees: [
            {
              path: worktreePath,
              branch: "feature/long-path",
              head: "1234567890abcdef",
              isCurrent: false,
              isDetached: false,
            },
          ],
        },
        defaultEditorApp: "vscode",
        canCreateAgentsLink: true,
        canOpenRepository: true,
        canOpenProjectDirectory: true,
        canOpenInEditor: true,
        isLinkingAgents: false,
        onOpenInTerminal: () => undefined,
        onOpenInEditor: () => undefined,
        onOpenRepository: () => undefined,
        onCreateAgentsLink: () => undefined,
        onOpenSession: () => undefined,
        onOpenProjectHistory: () => undefined,
        onOpenProjectUsage: () => undefined,
      }),
    );

    const pathCell = screen.getByText(worktreePath);
    expect(pathCell).toHaveAttribute("title", worktreePath);
    expect(pathCell).not.toHaveClass("truncate");
  });

  it("copies the full worktree path from the path cell", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const worktreePath =
      "/Users/test-user/work/alpha/.worktrees/very-long-feature-branch-name-that-needs-inspection";

    render(
      createElement(ProjectDetailPanel, {
        t: (key) => key,
        summary: SUMMARY,
        detail: {
          ...DETAIL,
          worktrees: [
            {
              path: worktreePath,
              branch: "feature/long-path",
              head: "1234567890abcdef",
              isCurrent: false,
              isDetached: false,
            },
          ],
        },
        defaultEditorApp: "vscode",
        canCreateAgentsLink: true,
        canOpenRepository: true,
        canOpenProjectDirectory: true,
        canOpenInEditor: true,
        isLinkingAgents: false,
        onOpenInTerminal: () => undefined,
        onOpenInEditor: () => undefined,
        onOpenRepository: () => undefined,
        onCreateAgentsLink: () => undefined,
        onOpenSession: () => undefined,
        onOpenProjectHistory: () => undefined,
        onOpenProjectUsage: () => undefined,
      }),
    );

    const pathButton = screen.getByRole("button", {
      name: `projects.copyWorktreePath ${worktreePath}`,
    });
    fireEvent.click(pathButton);

    expect(pathButton).toHaveTextContent(worktreePath);
    expect(pathButton).toHaveAttribute("title", worktreePath);
    expect(writeText).toHaveBeenCalledWith(worktreePath);
  });

  it("renders git warnings through the shared warning tone", () => {
    render(
      createElement(ProjectDetailPanel, {
        t: (key) => key,
        summary: SUMMARY,
        detail: {
          ...DETAIL,
          isGitRepo: false,
          repoRoot: undefined,
        },
        defaultEditorApp: "vscode",
        canCreateAgentsLink: true,
        canOpenRepository: true,
        canOpenProjectDirectory: true,
        canOpenInEditor: true,
        isLinkingAgents: false,
        onOpenInTerminal: () => undefined,
        onOpenInEditor: () => undefined,
        onOpenRepository: () => undefined,
        onCreateAgentsLink: () => undefined,
        onOpenSession: () => undefined,
        onOpenProjectHistory: () => undefined,
        onOpenProjectUsage: () => undefined,
      }),
    );

    expect(screen.getAllByText("projects.notGitRepoHint")[0]).toHaveClass("text-warning");
  });
});
