import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shortProjectName } from "../history-utils";
import useTauriEvent from "../hooks/useTauriEvent";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import {
  type AppState,
  type ClaudeStats,
  type DefaultEditorApp,
  isTauri,
  type ProjectDetail,
  type ProjectSummary,
} from "../types";
import ProjectDetailPanel from "./ProjectDetailPanel";
import { formatDuration, formatUSD } from "./project-detail-utils";
import "./ProjectsPage.css";

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
  const [defaultEditorApp, setDefaultEditorApp] = useState<DefaultEditorApp | null>(null);
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

  const loadLauncherSettings = useCallback(async () => {
    if (!isTauri()) {
      setDefaultEditorApp(null);
      return;
    }

    const state = await invoke<AppState>("get_configs");
    setDefaultEditorApp(state.defaultEditorApp ?? null);
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      setProjectSummaries([]);
      setDefaultEditorApp(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadLauncherSettings().catch(() => {
      if (cancelled) return;
      setDefaultEditorApp(null);
    });

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
  }, [loadLauncherSettings, loadProjects, showToast, t]);

  useTauriEvent<void>("project-launcher-settings-changed", () => {
    void loadLauncherSettings();
  });

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

    if (!selectedSummary) {
      setSelectedProject(projectSummaries[0].project);
    }
  }, [projectSummaries, selectedSummary]);

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

  const handleOpenRepository = useCallback(async () => {
    if (!detail?.repositoryUrl || !isTauri()) return;

    try {
      await openUrl(detail.repositoryUrl);
    } catch {
      showToast(t("toast.projectOpenRepositoryError"), "error");
    }
  }, [detail?.repositoryUrl, showToast, t]);

  const handleOpenInTerminal = useCallback(async () => {
    const projectPath = detail?.path ?? selectedSummary?.project;
    if (!projectPath || !isTauri()) return;

    try {
      await invoke("open_project_in_terminal", { project: projectPath });
    } catch {
      showToast(t("toast.projectOpenTerminalError"), "error");
    }
  }, [detail?.path, selectedSummary?.project, showToast, t]);

  const handleOpenInEditor = useCallback(async () => {
    const projectPath = detail?.path ?? selectedSummary?.project;
    if (!projectPath || !defaultEditorApp || !isTauri()) return;

    try {
      await invoke("open_project_in_editor", { project: projectPath });
    } catch {
      showToast(t("toast.projectOpenEditorError"), "error");
    }
  }, [defaultEditorApp, detail?.path, selectedSummary?.project, showToast, t]);

  const canCreateAgentsLink =
    Boolean(detail?.hasClaudeMd) && detail?.agentsStatus !== "plainFileConflict";
  const canOpenRepository = Boolean(detail?.repositoryUrl);
  const canOpenProjectDirectory = Boolean(detail?.exists);
  const canOpenInEditor = canOpenProjectDirectory && Boolean(defaultEditorApp);

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
            <ProjectDetailPanel
              t={t}
              summary={selectedSummary}
              detail={detail}
              defaultEditorApp={defaultEditorApp}
              canCreateAgentsLink={canCreateAgentsLink}
              canOpenRepository={canOpenRepository}
              canOpenProjectDirectory={canOpenProjectDirectory}
              canOpenInEditor={canOpenInEditor}
              isLinkingAgents={isLinkingAgents}
              onOpenInTerminal={handleOpenInTerminal}
              onOpenInEditor={handleOpenInEditor}
              onOpenRepository={handleOpenRepository}
              onCreateAgentsLink={handleCreateAgentsLink}
            />
          )}
        </section>
      </div>
    </div>
  );
}

export default ProjectsPage;
