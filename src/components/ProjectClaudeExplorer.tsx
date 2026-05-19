import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsDark } from "../hooks/useIsDark";
import { useToast } from "../hooks/useToast";
import { showOperationError } from "../lib/user-facing-error";
import type {
  ClaudeDirectoryEntry,
  ClaudeDirectoryOverview,
  ClaudeFilePreview,
  ProjectClaudeSettingsScope,
} from "../types";
import {
  ClaudeDirectoryTree,
  ClaudeOverviewIconSprite,
  ClaudeOverviewTreeLoading,
} from "./claude-overview/ClaudeDirectoryTree";
import { ClaudeFilePreviewPane } from "./claude-overview/ClaudeFilePreviewPane";
import {
  absolutePreviewPath,
  defaultViewModeForPath,
  normalizeTreePath,
  type PreviewViewMode,
  treePathForEntry,
} from "./claude-overview/file-viewer-utils";
import type { TranslateFn } from "./project-detail-utils";
import { PANEL_SURFACE_CLASS } from "./surface-classes";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: string;
  hasSettingsJson: boolean;
  hasSettingsLocalJson: boolean;
  // 打开时自动定位到 .claude/ 内的相对路径：文件则选中预览，目录则选中目录
  initialPath?: string | null;
  onAfterMutate?: () => void;
  t: TranslateFn;
};

export function ProjectClaudeExplorer({
  open,
  onOpenChange,
  project,
  hasSettingsJson,
  hasSettingsLocalJson,
  initialPath,
  onAfterMutate,
  t,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[min(96vw,1180px)]"
        data-testid="project-claude-explorer-sheet"
      >
        <SheetHeader className="flex h-12 shrink-0 flex-row items-center gap-3 border-b px-4 py-0">
          <SheetTitle className="text-base">{t("projects.claudeExplorer.sheetTitle")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("projects.claudeExplorer.sheetDescription")}
          </SheetDescription>
        </SheetHeader>
        <ProjectClaudeExplorerBody
          project={project}
          hasSettingsJson={hasSettingsJson}
          hasSettingsLocalJson={hasSettingsLocalJson}
          initialPath={initialPath}
          onAfterMutate={onAfterMutate}
          t={t}
        />
      </SheetContent>
    </Sheet>
  );
}

type BodyProps = {
  project: string;
  hasSettingsJson: boolean;
  hasSettingsLocalJson: boolean;
  initialPath?: string | null;
  onAfterMutate?: () => void;
  t: TranslateFn;
};

function ProjectClaudeExplorerBody({
  project,
  hasSettingsJson,
  hasSettingsLocalJson,
  initialPath,
  onAfterMutate,
  t,
}: BodyProps) {
  const { showToast } = useToast();
  const isDark = useIsDark();
  const [overview, setOverview] = useState<ClaudeDirectoryOverview | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [openPreviews, setOpenPreviews] = useState<ClaudeFilePreview[]>([]);
  const [activePreviewPath, setActivePreviewPath] = useState<string | null>(null);
  const [loadingPreviewPath, setLoadingPreviewPath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PreviewViewMode>("source");
  const [creatingScope, setCreatingScope] = useState<ProjectClaudeSettingsScope | null>(null);
  const [initialPathApplied, setInitialPathApplied] = useState(false);
  const latestPreviewRequestPathRef = useRef<string | null>(null);
  const activePreviewPathRef = useRef<string | null>(null);
  const openPreviewsRef = useRef<ClaudeFilePreview[]>([]);

  const loadOverview = useCallback(async () => {
    setIsLoadingOverview(true);
    try {
      const next = await invoke<ClaudeDirectoryOverview | null | undefined>(
        "get_project_claude_directory_overview",
        { project },
      );
      setOverview(next ?? null);
      return next ?? null;
    } catch (error) {
      showOperationError(showToast, t("projects.claudeExplorer.loadError"), error);
      setOverview(null);
      return null;
    } finally {
      setIsLoadingOverview(false);
    }
  }, [project, showToast, t]);

  useEffect(() => {
    openPreviewsRef.current = openPreviews;
  }, [openPreviews]);

  useEffect(() => {
    activePreviewPathRef.current = activePreviewPath;
  }, [activePreviewPath]);

  useEffect(() => {
    setOverview(null);
    setSelectedPath(null);
    setOpenPreviews([]);
    setActivePreviewPath(null);
    setLoadingPreviewPath(null);
    setViewMode("source");
    setInitialPathApplied(false);
    latestPreviewRequestPathRef.current = null;
    void loadOverview();
  }, [loadOverview]);

  const entryByPath = useMemo(() => {
    const map = new Map<string, ClaudeDirectoryEntry>();
    for (const entry of overview?.entries ?? []) {
      map.set(entry.path, entry);
    }
    return map;
  }, [overview?.entries]);

  const treePaths = useMemo(
    () => (overview?.entries ?? []).map(treePathForEntry),
    [overview?.entries],
  );
  const activePreview = useMemo(
    () => openPreviews.find((preview) => preview.path === activePreviewPath) ?? null,
    [activePreviewPath, openPreviews],
  );
  const selectedEntry = selectedPath ? entryByPath.get(selectedPath) : undefined;
  const activeEntry = activePreview
    ? (entryByPath.get(activePreview.path) ?? selectedEntry)
    : selectedEntry;
  const previewThemeType = isDark ? "dark" : "light";
  const rootPath = overview?.rootPath ?? `${project.replace(/\/$/, "")}/.claude`;

  const loadPreview = useCallback(
    async (path: string) => {
      const normalizedPath = normalizeTreePath(path);
      latestPreviewRequestPathRef.current = normalizedPath;
      const openedPreview = openPreviewsRef.current.find(
        (preview) => preview.path === normalizedPath,
      );
      if (openedPreview) {
        setSelectedPath(normalizedPath);
        setActivePreviewPath(normalizedPath);
        setViewMode(defaultViewModeForPath(normalizedPath));
        return;
      }

      setSelectedPath(normalizedPath);
      setActivePreviewPath(null);
      setLoadingPreviewPath(normalizedPath);
      try {
        const nextPreview = await invoke<ClaudeFilePreview>("get_project_claude_file_preview", {
          project,
          relativePath: normalizedPath,
        });
        setOpenPreviews((currentPreviews) => {
          if (currentPreviews.some((preview) => preview.path === nextPreview.path)) {
            return currentPreviews.map((preview) =>
              preview.path === nextPreview.path ? nextPreview : preview,
            );
          }
          return [...currentPreviews, nextPreview];
        });
        if (latestPreviewRequestPathRef.current === normalizedPath) {
          setSelectedPath(nextPreview.path);
          setActivePreviewPath(nextPreview.path);
          setViewMode(defaultViewModeForPath(nextPreview.path));
        }
      } catch (error) {
        showOperationError(showToast, t("projects.claudeExplorer.previewError"), error);
      } finally {
        setLoadingPreviewPath((currentPath) =>
          currentPath === normalizedPath ? null : currentPath,
        );
      }
    },
    [project, showToast, t],
  );

  useEffect(() => {
    if (initialPathApplied || !overview) {
      return;
    }
    setInitialPathApplied(true);
    const trimmed = initialPath?.replace(/^\/+|\/+$/g, "") ?? "";
    if (!trimmed) {
      return;
    }
    const entry = entryByPath.get(trimmed);
    if (entry?.kind === "file") {
      void loadPreview(trimmed);
      return;
    }
    setSelectedPath(trimmed);
    setActivePreviewPath(null);
  }, [entryByPath, initialPath, initialPathApplied, loadPreview, overview]);

  const handleSelectPath = useCallback(
    (path: string) => {
      const normalizedPath = normalizeTreePath(path);
      const entry = entryByPath.get(normalizedPath);
      setSelectedPath(normalizedPath);
      if (!entry || entry.kind === "directory") {
        latestPreviewRequestPathRef.current = null;
        setActivePreviewPath(null);
        return;
      }
      void loadPreview(normalizedPath);
    },
    [entryByPath, loadPreview],
  );

  const handleSelectPreviewTab = useCallback((path: string) => {
    latestPreviewRequestPathRef.current = path;
    setSelectedPath(path);
    setActivePreviewPath(path);
    setViewMode(defaultViewModeForPath(path));
  }, []);

  const handleClosePreview = useCallback((path: string) => {
    setOpenPreviews((currentPreviews) => {
      const closingIndex = currentPreviews.findIndex((preview) => preview.path === path);
      const nextPreviews = currentPreviews.filter((preview) => preview.path !== path);
      if (activePreviewPathRef.current === path) {
        const fallbackPreview =
          nextPreviews[closingIndex] ?? nextPreviews[closingIndex - 1] ?? null;
        const fallbackPath = fallbackPreview?.path ?? null;
        latestPreviewRequestPathRef.current = fallbackPath;
        activePreviewPathRef.current = fallbackPath;
        setActivePreviewPath(fallbackPath);
        setSelectedPath(fallbackPath);
      }
      return nextPreviews;
    });
  }, []);

  const handleCopyPath = useCallback(async () => {
    if (!activePreview) {
      return;
    }
    try {
      await navigator.clipboard.writeText(absolutePreviewPath(rootPath, activePreview.path));
      showToast(t("claudeOverview.pathCopied"));
    } catch (error) {
      showOperationError(showToast, t("claudeOverview.pathCopyError"), error);
    }
  }, [activePreview, rootPath, showToast, t]);

  const handleOpenInFileBrowser = useCallback(async () => {
    if (!activePreview) {
      return;
    }
    try {
      await revealItemInDir(absolutePreviewPath(rootPath, activePreview.path));
    } catch (error) {
      showOperationError(showToast, t("claudeOverview.openFileBrowserError"), error);
    }
  }, [activePreview, rootPath, showToast, t]);

  const handleOpenInEditor = useCallback(async () => {
    if (!activePreview) {
      return;
    }
    try {
      await invoke("open_project_claude_file_in_editor", {
        project,
        relativePath: activePreview.path,
      });
    } catch (error) {
      const message = typeof error === "string" ? error : String(error);
      const key = message.includes("默认编辑器")
        ? "projects.claudeExplorer.noDefaultEditor"
        : "claudeOverview.openEditorError";
      showOperationError(showToast, t(key), error);
    }
  }, [activePreview, project, showToast, t]);

  const handleCreateSettings = useCallback(
    async (scope: ProjectClaudeSettingsScope) => {
      setCreatingScope(scope);
      try {
        await invoke("create_project_claude_settings_file", { project, scope });
        showToast(t("projects.claudeExplorer.settingsCreated"), "success");
        await loadOverview();
        onAfterMutate?.();
        void loadPreview(scope === "shared" ? "settings.json" : "settings.local.json");
      } catch (error) {
        showOperationError(showToast, t("projects.claudeExplorer.createError"), error);
      } finally {
        setCreatingScope(null);
      }
    },
    [loadOverview, loadPreview, onAfterMutate, project, showToast, t],
  );

  const showTreeLoading = isLoadingOverview && treePaths.length === 0;
  const showCreateButtons = !hasSettingsJson || !hasSettingsLocalJson;

  return (
    <div className="projects-claude-explorer flex min-h-0 flex-1 flex-col gap-3 bg-secondary p-3">
      <ClaudeOverviewIconSprite />
      <div className="projects-claude-explorer-grid grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_8px_minmax(260px,32%)] gap-0 max-[900px]:grid-cols-1 max-[900px]:grid-rows-[minmax(240px,44%)_minmax(0,1fr)] max-[900px]:gap-3">
        <section
          className={cn(
            "claude-overview-preview-pane flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border",
            PANEL_SURFACE_CLASS,
          )}
          aria-label={t("claudeOverview.preview")}
        >
          <ClaudeFilePreviewPane
            openPreviews={openPreviews}
            activePreview={activePreview}
            activePreviewPath={activePreviewPath}
            activeEntry={activeEntry}
            selectedEntry={selectedEntry}
            loadingPreviewPath={loadingPreviewPath}
            viewMode={viewMode}
            previewThemeType={previewThemeType}
            t={t}
            onSelectPreviewTab={handleSelectPreviewTab}
            onClosePreview={handleClosePreview}
            onToggleViewMode={() =>
              setViewMode((current) => (current === "preview" ? "source" : "preview"))
            }
            onCopyPath={handleCopyPath}
            onOpenFileBrowser={handleOpenInFileBrowser}
            onOpenEditor={handleOpenInEditor}
          />
        </section>

        <div
          className="claude-overview-resizer relative min-w-2 border-0 bg-transparent after:absolute after:top-0 after:bottom-0 after:left-[3px] after:w-px after:bg-border max-[900px]:hidden"
          aria-hidden="true"
        />

        <section
          className="claude-overview-tree-pane flex min-h-0 min-w-0 w-full overflow-hidden"
          aria-label={t("claudeOverview.tree")}
        >
          {showTreeLoading ? (
            <div
              className={cn(
                "claude-overview-tree-loading-panel h-full min-h-0 w-full flex-1 overflow-hidden rounded-lg border",
                PANEL_SURFACE_CLASS,
              )}
            >
              <ClaudeOverviewTreeLoading label={t("claudeOverview.preparingTree")} />
            </div>
          ) : treePaths.length > 0 ? (
            <div
              className={cn(
                "claude-overview-tree-ready h-full min-h-0 w-full flex-1 overflow-hidden rounded-lg border",
                PANEL_SURFACE_CLASS,
              )}
            >
              <ClaudeDirectoryTree paths={treePaths} onSelectPath={handleSelectPath} />
            </div>
          ) : (
            <div
              className={cn(
                "claude-overview-empty flex min-h-[180px] w-full flex-1 items-center justify-center rounded-lg border p-5 text-center leading-relaxed text-muted-foreground",
                PANEL_SURFACE_CLASS,
              )}
            >
              {t("projects.claudeExplorer.emptyTree")}
            </div>
          )}
        </section>
      </div>

      {showCreateButtons ? (
        <div className="projects-claude-explorer-actions flex shrink-0 flex-wrap gap-2">
          {!hasSettingsJson ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleCreateSettings("shared")}
              disabled={creatingScope === "shared"}
            >
              <Plus className="size-4" />
              {t("projects.claudeExplorer.createSettingsShared")}
            </Button>
          ) : null}
          {!hasSettingsLocalJson ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleCreateSettings("local")}
              disabled={creatingScope === "local"}
            >
              <Plus className="size-4" />
              {t("projects.claudeExplorer.createSettingsLocal")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default ProjectClaudeExplorer;
