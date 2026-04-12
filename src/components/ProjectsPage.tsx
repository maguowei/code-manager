import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  groupByProject,
  type HistoryProjectGroup,
  sortProjectGroupsByRecency,
} from "../history-utils";
import { useHistoryEntries } from "../hooks/useHistoryEntries";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import { type AgentsStatus, isTauri, type ProjectDetail } from "../types";
import "./ProjectsPage.css";

type TranslateFn = ReturnType<typeof useI18n>["t"];

function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function formatCommitTime(timestamp?: number) {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toLocaleString();
}

function agentsStatusLabel(status: AgentsStatus, t: TranslateFn) {
  switch (status) {
    case "correctSymlink":
      return t("projects.agentsCorrect");
    case "wrongSymlink":
      return t("projects.agentsWrong");
    case "plainFileConflict":
      return t("projects.agentsConflict");
    default:
      return t("projects.agentsMissing");
  }
}

function agentsStatusTone(status: AgentsStatus) {
  switch (status) {
    case "correctSymlink":
      return "success";
    case "wrongSymlink":
      return "warning";
    case "plainFileConflict":
      return "danger";
    default:
      return "muted";
  }
}

function ProjectsPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { entries: allEntries, loading } = useHistoryEntries(t("history.noData"));
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isLinkingAgents, setIsLinkingAgents] = useState(false);

  const projectGroups = useMemo<HistoryProjectGroup[]>(
    () => sortProjectGroupsByRecency(groupByProject(allEntries)),
    [allEntries],
  );

  const selectedSummary = useMemo(
    () => projectGroups.find((group) => group.project === selectedProject) ?? null,
    [projectGroups, selectedProject],
  );

  useEffect(() => {
    if (projectGroups.length === 0) {
      setSelectedProject(null);
      setDetail(null);
      return;
    }

    if (!selectedProject || !projectGroups.some((group) => group.project === selectedProject)) {
      setSelectedProject(projectGroups[0].project);
    }
  }, [projectGroups, selectedProject]);

  useEffect(() => {
    if (!selectedProject) {
      setDetail(null);
      return;
    }

    if (!isTauri()) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);

    invoke<ProjectDetail>("get_project_detail", { project: selectedProject })
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
      })
      .catch(() => {
        if (cancelled) return;
        setDetail(null);
        showToast(t("toast.projectDetailError"), "error");
      })
      .finally(() => {
        if (cancelled) return;
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProject, showToast, t]);

  const handleCreateAgentsLink = useCallback(async () => {
    if (!selectedProject || !isTauri()) return;

    setIsLinkingAgents(true);
    try {
      await invoke("create_project_agents_symlink", { project: selectedProject });
      const refreshed = await invoke<ProjectDetail>("get_project_detail", {
        project: selectedProject,
      });
      setDetail(refreshed);
      showToast(t("toast.projectAgentsLinked"));
    } catch {
      showToast(t("toast.projectAgentsLinkError"), "error");
    } finally {
      setIsLinkingAgents(false);
    }
  }, [selectedProject, showToast, t]);

  const canCreateAgentsLink =
    Boolean(detail?.hasClaudeMd) && detail?.agentsStatus !== "plainFileConflict";

  if (loading) {
    return (
      <div className="projects-page">
        <div className="loading">{t("loading")}</div>
      </div>
    );
  }

  if (projectGroups.length === 0) {
    return (
      <div className="projects-page">
        <div className="page-header">
          <h1 className="page-title">{t("projects.title")}</h1>
        </div>
        <div className="projects-empty-panel">
          <div className="empty-state">{t("projects.emptyHint")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="projects-page">
      <div className="page-header">
        <h1 className="page-title">{t("projects.title")}</h1>
      </div>

      <div className="projects-body">
        <aside className="projects-list" aria-label={t("projects.title")}>
          {projectGroups.map((group) => (
            <button
              key={group.project}
              type="button"
              className={`projects-list-item${selectedProject === group.project ? " selected" : ""}`}
              onClick={() => setSelectedProject(group.project)}
              title={group.project}
            >
              <div className="projects-list-main">
                <span className="projects-list-name">{group.shortName}</span>
                <span className="projects-list-path">{group.project}</span>
              </div>
              <div className="projects-list-meta">
                <span>
                  {group.messageCount} {t("projects.messages")}
                </span>
                <span>
                  {group.sessionCount} {t("projects.sessions")}
                </span>
              </div>
              <div className="projects-list-time">
                {t("projects.lastActive")} {formatDateTime(group.lastTimestamp)}
              </div>
            </button>
          ))}
        </aside>

        <section className="projects-detail">
          {!selectedSummary ? (
            <div className="projects-empty-panel">
              <div className="empty-state">{t("projects.empty")}</div>
            </div>
          ) : detailLoading && !detail ? (
            <div className="projects-empty-panel">
              <div className="loading">{t("loading")}</div>
            </div>
          ) : (
            <div className="projects-detail-scroll">
              <div className="projects-detail-header">
                <div className="projects-detail-title">
                  <h2>{selectedSummary.shortName}</h2>
                  <p>{selectedSummary.project}</p>
                </div>
                {detail && (
                  <span
                    className={`projects-status-chip tone-${agentsStatusTone(detail.agentsStatus)}`}
                  >
                    {agentsStatusLabel(detail.agentsStatus, t)}
                  </span>
                )}
              </div>

              <div className="projects-overview-grid">
                <div className="projects-info-card">
                  <span className="projects-info-label">{t("projects.path")}</span>
                  <span className="projects-info-value break-all">{selectedSummary.project}</span>
                </div>
                <div className="projects-info-card">
                  <span className="projects-info-label">{t("projects.lastActive")}</span>
                  <span className="projects-info-value">
                    {formatDateTime(selectedSummary.lastTimestamp)}
                  </span>
                </div>
                <div className="projects-info-card">
                  <span className="projects-info-label">{t("projects.messages")}</span>
                  <span className="projects-info-value">{selectedSummary.messageCount}</span>
                </div>
                <div className="projects-info-card">
                  <span className="projects-info-label">{t("projects.sessions")}</span>
                  <span className="projects-info-value">{selectedSummary.sessionCount}</span>
                </div>
                <div className="projects-info-card">
                  <span className="projects-info-label">{t("projects.directoryStatus")}</span>
                  <span className="projects-info-value">
                    {detail?.exists
                      ? t("projects.directoryExists")
                      : t("projects.directoryMissing")}
                  </span>
                </div>
                <div className="projects-info-card">
                  <span className="projects-info-label">{t("projects.gitStatus")}</span>
                  <span className="projects-info-value">
                    {detail?.isGitRepo ? t("projects.gitRepo") : t("projects.notGitRepo")}
                  </span>
                </div>
                {detail?.repoRoot && (
                  <div className="projects-info-card projects-info-card-wide">
                    <span className="projects-info-label">{t("projects.repoRoot")}</span>
                    <span className="projects-info-value break-all">{detail.repoRoot}</span>
                  </div>
                )}
              </div>

              <div className="projects-section">
                <div className="projects-section-header">
                  <h3>{t("projects.agentsTitle")}</h3>
                </div>
                <div className="projects-status-card">
                  <div className="projects-status-row">
                    <span className="projects-status-label">{t("projects.claudeMd")}</span>
                    <span
                      className={`projects-status-chip ${detail?.hasClaudeMd ? "tone-success" : "tone-muted"}`}
                    >
                      {detail?.hasClaudeMd
                        ? t("projects.claudeMdPresent")
                        : t("projects.claudeMdMissing")}
                    </span>
                  </div>
                  {detail && (
                    <div className="projects-status-row">
                      <span className="projects-status-label">{t("projects.agentsMd")}</span>
                      <span
                        className={`projects-status-chip tone-${agentsStatusTone(detail.agentsStatus)}`}
                      >
                        {agentsStatusLabel(detail.agentsStatus, t)}
                      </span>
                    </div>
                  )}
                  <p className="projects-note">{t("projects.agentsHelp")}</p>
                  {!detail?.hasClaudeMd && (
                    <p className="projects-note projects-note-warning">
                      {t("projects.agentsDisabledNoClaude")}
                    </p>
                  )}
                  {detail?.agentsStatus === "plainFileConflict" && (
                    <p className="projects-note projects-note-warning">
                      {t("projects.agentsDisabledConflict")}
                    </p>
                  )}
                  <button
                    type="button"
                    className="projects-action-btn"
                    onClick={handleCreateAgentsLink}
                    disabled={!canCreateAgentsLink || isLinkingAgents}
                  >
                    {isLinkingAgents ? t("projects.linkingAgents") : t("projects.linkAgents")}
                  </button>
                </div>
              </div>

              <div className="projects-section">
                <div className="projects-section-header">
                  <h3>{t("projects.branches")}</h3>
                </div>
                {!detail?.isGitRepo ? (
                  <div className="projects-empty-block">{t("projects.notGitRepoHint")}</div>
                ) : detail.branches.length === 0 ? (
                  <div className="projects-empty-block">{t("projects.noBranches")}</div>
                ) : (
                  <div className="projects-collection">
                    {detail.branches.map((branch) => (
                      <div key={branch.name} className="projects-collection-item">
                        <div className="projects-item-main">
                          <div className="projects-item-title-row">
                            <span className="projects-item-title">{branch.name}</span>
                            {branch.isCurrent && (
                              <span className="projects-inline-badge tone-success">
                                {t("projects.current")}
                              </span>
                            )}
                          </div>
                          {branch.lastCommitSubject && (
                            <p className="projects-item-subtitle">{branch.lastCommitSubject}</p>
                          )}
                        </div>
                        {formatCommitTime(branch.lastCommitAt) && (
                          <span className="projects-item-meta">
                            {formatCommitTime(branch.lastCommitAt)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="projects-section">
                <div className="projects-section-header">
                  <h3>{t("projects.worktrees")}</h3>
                </div>
                {!detail?.isGitRepo ? (
                  <div className="projects-empty-block">{t("projects.notGitRepoHint")}</div>
                ) : detail.worktrees.length === 0 ? (
                  <div className="projects-empty-block">{t("projects.noWorktrees")}</div>
                ) : (
                  <div className="projects-collection">
                    {detail.worktrees.map((worktree) => (
                      <div key={worktree.path} className="projects-collection-item">
                        <div className="projects-item-main">
                          <div className="projects-item-title-row">
                            <span className="projects-item-title break-all">{worktree.path}</span>
                          </div>
                          <div className="projects-item-subtitle projects-item-tags">
                            {worktree.branch && <span>{worktree.branch}</span>}
                            {worktree.head && <span>{worktree.head.slice(0, 8)}</span>}
                          </div>
                        </div>
                        <div className="projects-item-badges">
                          {worktree.isCurrent && (
                            <span className="projects-inline-badge tone-success">
                              {t("projects.current")}
                            </span>
                          )}
                          {worktree.isDetached && (
                            <span className="projects-inline-badge tone-warning">
                              {t("projects.detached")}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default ProjectsPage;
