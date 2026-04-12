import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import {
  type AgentsStatus,
  type ClaudeStats,
  isTauri,
  type ProjectDetail,
  type ProjectSummary,
} from "../types";
import "./ProjectsPage.css";

type TranslateFn = ReturnType<typeof useI18n>["t"];

function shortProjectName(fullPath: string) {
  const parts = fullPath.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : fullPath;
}

function formatUSD(val: number) {
  return val < 0.01 && val > 0 ? "< $0.01" : `$${val.toFixed(2)}`;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = sec / 60;
  if (min < 60) return `${min.toFixed(1)}m`;
  return `${(min / 60).toFixed(1)}h`;
}

function formatCommitTime(timestamp?: number) {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toLocaleString();
}

function buildProjectSummaries(stats: ClaudeStats): ProjectSummary[] {
  return Object.entries(stats.projects)
    .map(([project, projectStats]) => ({
      project,
      shortName: shortProjectName(project),
      lastCost: projectStats.lastCost,
      lastDuration: projectStats.lastDuration,
      lastSessionId: projectStats.lastSessionId,
    }))
    .sort(
      (a, b) =>
        b.lastDuration - a.lastDuration ||
        b.lastCost - a.lastCost ||
        a.project.localeCompare(b.project),
    );
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
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isLinkingAgents, setIsLinkingAgents] = useState(false);
  const projectsRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);

  const loadProjects = useCallback(async () => {
    if (!isTauri()) {
      setProjectSummaries([]);
      return [] as ProjectSummary[];
    }

    const requestId = ++projectsRequestIdRef.current;
    const stats = await invoke<ClaudeStats>("get_stats");
    const summaries = buildProjectSummaries(stats);

    if (projectsRequestIdRef.current === requestId) {
      setProjectSummaries(summaries);
    }

    return summaries;
  }, []);

  const loadProjectDetail = useCallback(
    async (project: string, options?: { clearBeforeLoad?: boolean }) => {
      if (!isTauri()) {
        setDetail(null);
        setDetailLoading(false);
        return null;
      }

      const requestId = ++detailRequestIdRef.current;
      const shouldClearBeforeLoad = options?.clearBeforeLoad ?? true;

      if (shouldClearBeforeLoad) {
        setDetail(null);
      }
      setDetailLoading(true);

      try {
        const result = await invoke<ProjectDetail>("get_project_detail", { project });
        if (detailRequestIdRef.current === requestId) {
          setDetail(result);
        }
        return result;
      } finally {
        if (detailRequestIdRef.current === requestId) {
          setDetailLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!isTauri()) {
      setProjectSummaries([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadProjects()
      .catch(() => {
        if (cancelled) return;
        showToast(t("toast.projectListError"), "error");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadProjects, showToast, t]);

  const selectedSummary = useMemo(
    () => projectSummaries.find((summary) => summary.project === selectedProject) ?? null,
    [projectSummaries, selectedProject],
  );

  useEffect(() => {
    if (projectSummaries.length === 0) {
      setSelectedProject(null);
      setDetail(null);
      return;
    }

    if (
      !selectedProject ||
      !projectSummaries.some((summary) => summary.project === selectedProject)
    ) {
      setSelectedProject(projectSummaries[0].project);
    }
  }, [projectSummaries, selectedProject]);

  useEffect(() => {
    if (!selectedProject) {
      detailRequestIdRef.current += 1;
      setDetail(null);
      setDetailLoading(false);
      return;
    }

    if (!isTauri()) {
      detailRequestIdRef.current += 1;
      setDetail(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;

    loadProjectDetail(selectedProject).catch(() => {
      if (cancelled) return;
      setDetail(null);
      showToast(t("toast.projectDetailError"), "error");
    });

    return () => {
      cancelled = true;
    };
  }, [loadProjectDetail, selectedProject, showToast, t]);

  const handleRefresh = useCallback(async () => {
    if (!isTauri()) return;

    setIsRefreshing(true);
    try {
      const summaries = await loadProjects();

      if (summaries.length === 0) {
        detailRequestIdRef.current += 1;
        setSelectedProject(null);
        setDetail(null);
        setDetailLoading(false);
      } else if (
        selectedProject &&
        summaries.some((summary) => summary.project === selectedProject)
      ) {
        await loadProjectDetail(selectedProject, { clearBeforeLoad: false });
      } else {
        detailRequestIdRef.current += 1;
        setDetail(null);
        setDetailLoading(false);
        setSelectedProject(summaries[0].project);
      }

      showToast(t("toast.projectRefreshed"));
    } catch {
      showToast(t("toast.projectRefreshError"), "error");
    } finally {
      setIsRefreshing(false);
    }
  }, [loadProjectDetail, loadProjects, selectedProject, showToast, t]);

  const handleCreateAgentsLink = useCallback(async () => {
    if (!selectedProject || !isTauri()) return;

    setIsLinkingAgents(true);
    try {
      await invoke("create_project_agents_symlink", { project: selectedProject });
      await loadProjectDetail(selectedProject, { clearBeforeLoad: false });
      showToast(t("toast.projectAgentsLinked"));
    } catch {
      showToast(t("toast.projectAgentsLinkError"), "error");
    } finally {
      setIsLinkingAgents(false);
    }
  }, [loadProjectDetail, selectedProject, showToast, t]);

  const canCreateAgentsLink =
    Boolean(detail?.hasClaudeMd) && detail?.agentsStatus !== "plainFileConflict";

  if (loading) {
    return (
      <div className="projects-page">
        <div className="loading">{t("loading")}</div>
      </div>
    );
  }

  if (projectSummaries.length === 0) {
    return (
      <div className="projects-page">
        <div className="page-header">
          <h1 className="page-title">{t("projects.title")}</h1>
          <button
            type="button"
            className="projects-refresh-btn"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {isRefreshing ? t("projects.refreshing") : t("projects.refresh")}
          </button>
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
        <button
          type="button"
          className="projects-refresh-btn"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {isRefreshing ? t("projects.refreshing") : t("projects.refresh")}
        </button>
      </div>

      <div className="projects-body">
        <aside className="projects-list" aria-label={t("projects.title")}>
          {projectSummaries.map((summary) => (
            <button
              key={summary.project}
              type="button"
              className={`projects-list-item${selectedProject === summary.project ? " selected" : ""}`}
              onClick={() => setSelectedProject(summary.project)}
              title={summary.project}
            >
              <div className="projects-list-main">
                <span className="projects-list-name">{summary.shortName}</span>
                <span className="projects-list-path">{summary.project}</span>
              </div>
              <div className="projects-list-meta">
                <span>
                  {t("projects.lastCost")} {formatUSD(summary.lastCost)}
                </span>
                <span>
                  {t("projects.lastDuration")} {formatDuration(summary.lastDuration)}
                </span>
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
                  <span className="projects-info-label">{t("projects.lastCost")}</span>
                  <span className="projects-info-value">{formatUSD(selectedSummary.lastCost)}</span>
                </div>
                <div className="projects-info-card">
                  <span className="projects-info-label">{t("projects.lastDuration")}</span>
                  <span className="projects-info-value">
                    {formatDuration(selectedSummary.lastDuration)}
                  </span>
                </div>
                <div className="projects-info-card">
                  <span className="projects-info-label">{t("projects.lastSessionId")}</span>
                  <span className="projects-info-value break-all">
                    {selectedSummary.lastSessionId ?? t("projects.lastSessionIdMissing")}
                  </span>
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
                <div className="projects-info-card projects-info-card-wide">
                  <span className="projects-info-label">{t("projects.repoRoot")}</span>
                  <span className="projects-info-value break-all">
                    {detail?.repoRoot ?? t("projects.repoRootUnavailable")}
                  </span>
                </div>
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
