import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FolderOpen, RefreshCw } from "lucide-react";
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { shortProjectName } from "../history-utils";
import useTauriEvent from "../hooks/useTauriEvent";
import { useToast } from "../hooks/useToast";
import { type TranslationKey, useI18n } from "../i18n";
import {
  type ClaudeStats,
  type ConfigWorkspace,
  type DefaultEditorApp,
  isTauri,
  type ProjectDetail,
  type ProjectPurgeOutput,
  type ProjectSummary,
} from "../types";
import PageHeader from "./PageHeader";
import ProjectDetailPanel from "./ProjectDetailPanel";
import { formatDuration, formatUSD } from "./project-detail-utils";
import { CONTROL_SURFACE_CLASS, SUBTLE_SURFACE_CLASS } from "./surface-classes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

const PROJECT_CONTEXT_MENU_WIDTH = 176;
const PROJECT_CONTEXT_MENU_HEIGHT = 40;
const PROJECT_CONTEXT_MENU_EDGE_GAP = 8;

type ProjectContextMenuState = {
  project: string;
  shortName: string;
  x: number;
  y: number;
};

type ProjectPurgeDialogState = {
  project: string;
  shortName: string;
  output: string | null;
  error: string | null;
  isPreviewing: boolean;
  isPurging: boolean;
};

function buildProjectSummaries(stats: ClaudeStats): ProjectSummary[] {
  return Object.entries(stats.projects)
    .map(([project, projectStats]) => ({
      project,
      shortName: shortProjectName(project),
      lastCost: projectStats.lastCost,
      lastDuration: projectStats.lastDuration,
      lastSessionId: projectStats.lastSessionId,
      lastSessionModified: projectStats.lastSessionModified,
    }))
    .sort(
      (a, b) =>
        b.lastSessionModified - a.lastSessionModified ||
        b.lastDuration - a.lastDuration ||
        a.project.localeCompare(b.project),
    );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function projectContextMenuStyleForPoint(x: number, y: number): CSSProperties {
  const viewportWidth =
    typeof window === "undefined" ? PROJECT_CONTEXT_MENU_WIDTH : Math.max(window.innerWidth, 0);
  const viewportHeight =
    typeof window === "undefined" ? PROJECT_CONTEXT_MENU_HEIGHT : Math.max(window.innerHeight, 0);
  const maxLeft = Math.max(
    PROJECT_CONTEXT_MENU_EDGE_GAP,
    viewportWidth - PROJECT_CONTEXT_MENU_WIDTH - PROJECT_CONTEXT_MENU_EDGE_GAP,
  );
  const maxTop = Math.max(
    PROJECT_CONTEXT_MENU_EDGE_GAP,
    viewportHeight - PROJECT_CONTEXT_MENU_HEIGHT - PROJECT_CONTEXT_MENU_EDGE_GAP,
  );

  return {
    left: clampNumber(x, PROJECT_CONTEXT_MENU_EDGE_GAP, maxLeft),
    position: "fixed",
    top: clampNumber(y, PROJECT_CONTEXT_MENU_EDGE_GAP, maxTop),
    width: PROJECT_CONTEXT_MENU_WIDTH,
  };
}

function errorToMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

type ProjectContextMenuProps = {
  context: ProjectContextMenuState;
  menuRef: RefObject<HTMLDivElement | null>;
  onClearLocalData: (context: ProjectContextMenuState) => void;
  t: (key: TranslationKey) => string;
};

function ProjectContextMenu({ context, menuRef, onClearLocalData, t }: ProjectContextMenuProps) {
  return (
    <div
      ref={menuRef}
      className="projects-context-menu z-50 box-border flex min-w-[156px] flex-col gap-0.5 whitespace-nowrap rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
      role="menu"
      aria-label={t("projects.contextMenuLabel")}
      style={projectContextMenuStyleForPoint(context.x, context.y)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Button
        type="button"
        role="menuitem"
        variant="ghost"
        size="sm"
        className="danger h-8 w-full justify-start text-destructive hover:text-destructive focus-visible:text-destructive"
        onClick={() => onClearLocalData(context)}
      >
        {t("projects.clearLocalData")}
      </Button>
    </div>
  );
}

type ProjectPurgeDialogProps = {
  dialog: ProjectPurgeDialogState;
  onCancel: () => void;
  onConfirm: () => void;
  t: (key: TranslationKey) => string;
};

function ProjectPurgeDialog({ dialog, onCancel, onConfirm, t }: ProjectPurgeDialogProps) {
  const canConfirm =
    !dialog.isPreviewing && !dialog.isPurging && dialog.error === null && dialog.output !== null;
  const output = dialog.error ?? dialog.output ?? t("projects.purgeEmptyOutput");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <DialogContent
        className="projects-purge-dialog max-h-[min(720px,88vh)] w-[min(760px,92vw)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg p-0"
        onEscapeKeyDown={(event) => {
          if (dialog.isPurging) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (dialog.isPurging) {
            event.preventDefault();
          }
        }}
      >
        <div className="flex max-h-[min(720px,88vh)] flex-col gap-4 p-6">
          <DialogHeader>
            <DialogTitle>{t("projects.purgeDialogTitle")}</DialogTitle>
            <DialogDescription>{t("projects.purgeDialogDescription")}</DialogDescription>
          </DialogHeader>

          <div
            className={cn(
              "grid grid-cols-[72px_minmax(120px,0.35fr)_minmax(0,1fr)] items-center gap-3 rounded-md border p-3 max-sm:grid-cols-1 max-sm:items-start",
              SUBTLE_SURFACE_CLASS,
            )}
          >
            <span className="text-sm text-muted-foreground">{t("projects.purgeTarget")}</span>
            <strong className="min-w-0 truncate text-sm text-foreground" title={dialog.project}>
              {dialog.shortName}
            </strong>
            <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              {dialog.project}
            </code>
          </div>

          <div className="text-sm font-semibold text-muted-foreground">
            {t("projects.purgePlan")}
          </div>
          {dialog.isPreviewing ? (
            <div
              className={cn(
                "flex min-h-[180px] items-center justify-center rounded-md border text-sm text-muted-foreground",
                SUBTLE_SURFACE_CLASS,
              )}
            >
              {t("projects.purgePreviewing")}
            </div>
          ) : (
            <pre
              className={cn(
                "min-h-[220px] flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border p-4 font-mono text-sm leading-6 text-foreground",
                CONTROL_SURFACE_CLASS,
                dialog.error && "border-destructive text-destructive",
              )}
            >
              {output}
            </pre>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={dialog.isPurging}>
              {t("confirm.cancel")}
            </Button>
            {!dialog.error && (
              <Button
                type="button"
                variant="destructive"
                onClick={onConfirm}
                disabled={!canConfirm}
              >
                {dialog.isPurging ? t("projects.purgeExecuting") : t("projects.clearLocalData")}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProjectEmptyState({ children }: { children: string }) {
  return (
    <div className="projects-empty-panel flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
      <FolderOpen className="size-12" strokeWidth={1.5} aria-hidden="true" />
      <div className="empty-state text-sm">{children}</div>
    </div>
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
  const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenuState | null>(
    null,
  );
  const [purgeDialog, setPurgeDialog] = useState<ProjectPurgeDialogState | null>(null);
  const projectContextMenuRef = useRef<HTMLDivElement>(null);
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

    const workspace = await invoke<ConfigWorkspace>("get_config_workspace");
    setDefaultEditorApp(workspace.app.defaultEditorApp ?? null);
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

  useEffect(() => {
    if (!projectContextMenu) return;

    const closeMenu = () => setProjectContextMenu(null);
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && projectContextMenuRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [projectContextMenu]);

  const handleClosePurgeDialog = useCallback(() => {
    setPurgeDialog((current) => (current?.isPurging ? current : null));
  }, []);

  useEffect(() => {
    if (!purgeDialog) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClosePurgeDialog();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClosePurgeDialog, purgeDialog]);

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

    setSelectedProject((current) => {
      if (current && projectSummaries.some((summary) => summary.project === current)) {
        return current;
      }
      return projectSummaries[0].project;
    });
  }, [projectSummaries]);

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

  const handleProjectContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>, summary: ProjectSummary) => {
      event.preventDefault();
      setSelectedProject(summary.project);
      setProjectContextMenu({
        project: summary.project,
        shortName: summary.shortName,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [],
  );

  const handleRequestPurgePreview = useCallback(
    async (context: ProjectContextMenuState) => {
      if (!isTauri()) return;

      setProjectContextMenu(null);
      setSelectedProject(context.project);
      setPurgeDialog({
        project: context.project,
        shortName: context.shortName,
        output: null,
        error: null,
        isPreviewing: true,
        isPurging: false,
      });

      try {
        const result = await invoke<ProjectPurgeOutput>("preview_project_local_data_purge", {
          project: context.project,
        });
        setPurgeDialog((current) =>
          current?.project === context.project
            ? {
                ...current,
                output: result.output || t("projects.purgeEmptyOutput"),
                error: null,
                isPreviewing: false,
              }
            : current,
        );
      } catch (error) {
        setPurgeDialog((current) =>
          current?.project === context.project
            ? {
                ...current,
                output: null,
                error: errorToMessage(error),
                isPreviewing: false,
              }
            : current,
        );
        showToast(t("toast.projectPurgePreviewError"), "error");
      }
    },
    [showToast, t],
  );

  const refreshProjectsAfterPurge = useCallback(async () => {
    const summaries = await loadProjects();

    if (summaries.length === 0) {
      detailRequestIdRef.current += 1;
      setSelectedProject(null);
      setDetail(null);
      setDetailLoading(false);
      return;
    }

    const nextSelectedProject =
      selectedProject && summaries.some((summary) => summary.project === selectedProject)
        ? selectedProject
        : summaries[0].project;

    if (nextSelectedProject === selectedProject) {
      await loadProjectDetail(nextSelectedProject, { clearBeforeLoad: false });
      return;
    }

    detailRequestIdRef.current += 1;
    setDetail(null);
    setDetailLoading(false);
    setSelectedProject(nextSelectedProject);
  }, [loadProjectDetail, loadProjects, selectedProject]);

  const handleConfirmPurge = useCallback(async () => {
    const currentDialog = purgeDialog;
    if (
      !currentDialog ||
      currentDialog.isPreviewing ||
      currentDialog.isPurging ||
      currentDialog.error ||
      currentDialog.output === null ||
      !isTauri()
    ) {
      return;
    }

    setPurgeDialog((current) =>
      current?.project === currentDialog.project ? { ...current, isPurging: true } : current,
    );

    try {
      await invoke<ProjectPurgeOutput>("purge_project_local_data", {
        project: currentDialog.project,
      });
      await refreshProjectsAfterPurge();
      setPurgeDialog(null);
      showToast(t("toast.projectPurged"));
    } catch (error) {
      setPurgeDialog((current) =>
        current?.project === currentDialog.project
          ? {
              ...current,
              error: errorToMessage(error),
              isPurging: false,
            }
          : current,
      );
      showToast(t("toast.projectPurgeError"), "error");
    }
  }, [purgeDialog, refreshProjectsAfterPurge, showToast, t]);

  const canCreateAgentsLink =
    Boolean(detail?.hasClaudeMd) && detail?.agentsStatus !== "plainFileConflict";
  const canOpenRepository = Boolean(detail?.repositoryUrl);
  const canOpenProjectDirectory = Boolean(detail?.exists);
  const canOpenInEditor = canOpenProjectDirectory && Boolean(defaultEditorApp);
  const projectHeaderActions = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="projects-refresh-btn shrink-0 rounded-full"
      onClick={handleRefresh}
      disabled={isRefreshing}
    >
      <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
      {isRefreshing ? t("projects.refreshing") : t("projects.refresh")}
    </Button>
  );

  if (loading) {
    return (
      <div className="projects-page flex h-full w-full flex-col overflow-hidden">
        <PageHeader title={t("projects.title")} />
        <div className="loading">{t("loading")}</div>
      </div>
    );
  }

  if (projectSummaries.length === 0) {
    return (
      <div className="projects-page flex h-full w-full flex-col overflow-hidden">
        <PageHeader title={t("projects.title")} actions={projectHeaderActions} />
        <ProjectEmptyState>{t("projects.emptyHint")}</ProjectEmptyState>
      </div>
    );
  }

  return (
    <div className="projects-page flex h-full w-full flex-col overflow-hidden">
      <PageHeader title={t("projects.title")} actions={projectHeaderActions} />

      <div className="projects-body flex min-h-0 flex-1 overflow-hidden">
        <aside
          className="projects-list flex w-[280px] shrink-0 flex-col gap-2 overflow-y-auto border-r bg-muted/30 p-3 lg:w-80"
          aria-label={t("projects.title")}
        >
          {projectSummaries.map((summary) => (
            <Card
              key={summary.project}
              className={cn(
                "projects-list-card gap-0 rounded-lg border-transparent bg-transparent p-0 py-0 shadow-none transition-all hover:-translate-y-0.5 hover:border-border hover:bg-accent/50 hover:shadow-xs",
                selectedProject === summary.project && "border-primary bg-primary/10 shadow-xs",
              )}
            >
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "projects-list-item h-auto w-full flex-col items-stretch justify-start gap-2 rounded-lg p-3 text-left whitespace-normal text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  selectedProject === summary.project && "selected",
                )}
                onClick={() => setSelectedProject(summary.project)}
                onContextMenu={(event) => handleProjectContextMenu(event, summary)}
                aria-pressed={selectedProject === summary.project}
                title={summary.project}
              >
                <div className="projects-list-main flex min-w-0 flex-col gap-1">
                  <span className="projects-list-name text-sm font-semibold">
                    {summary.shortName}
                  </span>
                  <span className="projects-list-path truncate text-sm text-muted-foreground">
                    {summary.project}
                  </span>
                </div>
                <div className="projects-list-meta flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="font-normal">
                    {t("projects.lastCost")} {formatUSD(summary.lastCost)}
                  </Badge>
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    {t("projects.lastDuration")} {formatDuration(summary.lastDuration)}
                  </Badge>
                </div>
              </Button>
            </Card>
          ))}
        </aside>

        <section className="projects-detail min-w-0 flex-1 overflow-hidden bg-background">
          {!selectedSummary ? (
            <ProjectEmptyState>{t("projects.empty")}</ProjectEmptyState>
          ) : detailLoading && !detail ? (
            <div className="projects-empty-panel flex h-full items-center justify-center">
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

      {projectContextMenu && (
        <ProjectContextMenu
          context={projectContextMenu}
          menuRef={projectContextMenuRef}
          onClearLocalData={handleRequestPurgePreview}
          t={t}
        />
      )}

      {purgeDialog && (
        <ProjectPurgeDialog
          dialog={purgeDialog}
          onCancel={handleClosePurgeDialog}
          onConfirm={handleConfirmPurge}
          t={t}
        />
      )}
    </div>
  );
}

export default ProjectsPage;
