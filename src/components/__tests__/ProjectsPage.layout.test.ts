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

    const statusStrip = screen
      .getByText("projects.directoryStatus")
      .closest(".projects-status-strip");

    expect(statusStrip).toHaveClass("shrink-0");
  });
});
