import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { ProjectDetail, ProjectSummary } from "../../types";
import ProjectDetailPanel from "../ProjectDetailPanel";

const SUMMARY: ProjectSummary = {
  project: "/Users/test-user/work/alpha",
  shortName: "alpha",
  lastCost: 1.2,
  lastDuration: 120,
  lastSessionId: "session-alpha",
  lastSessionModified: 200,
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
    }),
  );
}

describe("ProjectsPage layout", () => {
  it("keeps the status strip from shrinking inside the scroll column", () => {
    renderDetailPanel();

    expect(screen.getByText("projects.directoryStatus")).toBeInTheDocument();
    expect(screen.getByText("projects.gitStatus")).toBeInTheDocument();
    expect(screen.getAllByText("projects.agentsMd").length).toBeGreaterThan(0);
    expect(screen.getByText("projects.directoryExists")).toHaveClass("text-success");
  });

  it("keeps project status labels and badges on the same compact rhythm", () => {
    renderDetailPanel();

    const directoryStatusItem = screen.getByText("projects.directoryStatus").closest("div");
    expect(directoryStatusItem).toHaveClass("flex", "flex-wrap", "items-center");
    expect(directoryStatusItem).toHaveClass("gap-x-2", "gap-y-1");

    const agentsStatusRow = screen.getByText("projects.claudeMd").closest("div");
    expect(agentsStatusRow).toHaveClass("flex", "flex-wrap", "items-center");
    expect(agentsStatusRow).toHaveClass("gap-x-2", "gap-y-1");
    expect(agentsStatusRow).not.toHaveClass("grid");

    expect(screen.getByText("projects.directoryExists")).toHaveClass("min-h-5", "px-2.5");
    expect(screen.getByText("projects.claudeMdPresent")).toHaveClass("min-h-5", "px-2.5");
  });

  it("lets section heading actions wrap below the title on narrow widths", () => {
    renderDetailPanel();

    const agentsAction = screen
      .getByRole("button", { name: "projects.linkAgents" })
      .closest(".projects-section-heading-action");

    expect(agentsAction).toHaveClass("max-sm:w-full");
    expect(agentsAction).toHaveClass("max-sm:[&>button]:w-full");
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
      }),
    );

    const pathCell = screen.getByText(worktreePath);
    expect(pathCell).toHaveAttribute("title", worktreePath);
    expect(pathCell).not.toHaveClass("truncate");
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
      }),
    );

    expect(screen.getByText("projects.notGitRepo")).toHaveClass("text-warning");
    expect(screen.getAllByText("projects.notGitRepoHint")[0]).toHaveClass("text-warning");
  });
});
