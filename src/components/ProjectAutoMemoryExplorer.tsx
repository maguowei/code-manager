import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsDark } from "../hooks/useIsDark";
import { useToast } from "../hooks/useToast";
import { ipc } from "../ipc";
import { showOperationError } from "../lib/user-facing-error";
import type { ClaudeDirectoryEntry, ClaudeDirectoryOverview, ClaudeFilePreview } from "../types";
import ConfirmAlertDialog from "./ConfirmAlertDialog";
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

// 与后端 auto_memory.rs / project.rs 的 editor_not_configured 错误码保持一致
const EDITOR_NOT_CONFIGURED_ERROR = "editor_not_configured";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: string;
  repoRoot: string | null;
  fileCount: number;
  onAfterMutate?: () => void;
  t: TranslateFn;
};

export function ProjectAutoMemoryExplorer({
  open,
  onOpenChange,
  project,
  repoRoot,
  fileCount,
  onAfterMutate,
  t,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[min(96vw,1180px)]"
        data-testid="project-auto-memory-explorer-sheet"
      >
        <SheetHeader className="flex h-12 shrink-0 flex-row items-center gap-3 border-b px-4 py-0">
          <SheetTitle className="text-base">{t("projects.autoMemory.sheetTitle")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("projects.autoMemory.sheetDescription")}
          </SheetDescription>
        </SheetHeader>
        <ProjectAutoMemoryExplorerBody
          project={project}
          repoRoot={repoRoot}
          fileCount={fileCount}
          onAfterMutate={onAfterMutate}
          t={t}
        />
      </SheetContent>
    </Sheet>
  );
}

type BodyProps = {
  project: string;
  repoRoot: string | null;
  fileCount: number;
  onAfterMutate?: () => void;
  t: TranslateFn;
};

// 待确认的删除目标：单文件或清空整个 memory 目录
type PendingDelete = { kind: "file"; path: string; name: string } | { kind: "all" } | null;

function ProjectAutoMemoryExplorerBody({
  project,
  repoRoot,
  fileCount,
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
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const latestPreviewRequestPathRef = useRef<string | null>(null);
  const activePreviewPathRef = useRef<string | null>(null);
  const openPreviewsRef = useRef<ClaudeFilePreview[]>([]);

  const loadOverview = useCallback(async () => {
    setIsLoadingOverview(true);
    try {
      const next = await ipc.getProjectAutoMemoryOverview(project, repoRoot);
      setOverview(next ?? null);
      return next ?? null;
    } catch (error) {
      showOperationError(showToast, t("projects.autoMemory.loadError"), error);
      setOverview(null);
      return null;
    } finally {
      setIsLoadingOverview(false);
    }
  }, [project, repoRoot, showToast, t]);

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
  const rootPath = overview?.rootPath ?? "";

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
        const nextPreview = await ipc.readProjectAutoMemoryFile(project, repoRoot, normalizedPath);
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
        showOperationError(showToast, t("projects.autoMemory.previewError"), error);
      } finally {
        setLoadingPreviewPath((currentPath) =>
          currentPath === normalizedPath ? null : currentPath,
        );
      }
    },
    [project, repoRoot, showToast, t],
  );

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
      await ipc.openProjectAutoMemoryFileInEditor(project, repoRoot, activePreview.path);
    } catch (error) {
      const message = typeof error === "string" ? error : String(error);
      if (message.includes(EDITOR_NOT_CONFIGURED_ERROR)) {
        showToast(t("projects.claudeExplorer.noDefaultEditor"), "error");
        return;
      }
      showOperationError(showToast, t("claudeOverview.openEditorError"), error);
    }
  }, [activePreview, project, repoRoot, showToast, t]);

  const handleConfirmDelete = useCallback(async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) {
      return;
    }
    const relativePath = target.kind === "file" ? target.path : "";
    try {
      await ipc.deleteProjectAutoMemoryEntry(project, repoRoot, relativePath);
      if (target.kind === "file") {
        handleClosePreview(target.path);
      } else {
        setOpenPreviews([]);
        setActivePreviewPath(null);
        setSelectedPath(null);
      }
      showToast(t("projects.autoMemory.deleteSuccess"), "success");
      await loadOverview();
      onAfterMutate?.();
    } catch (error) {
      showOperationError(showToast, t("projects.autoMemory.deleteError"), error);
    }
  }, [
    handleClosePreview,
    loadOverview,
    onAfterMutate,
    pendingDelete,
    project,
    repoRoot,
    showToast,
    t,
  ]);

  const showTreeLoading = isLoadingOverview && treePaths.length === 0;
  const hasFiles = treePaths.length > 0;
  const deleteConfirm =
    pendingDelete?.kind === "file"
      ? {
          title: t("projects.autoMemory.deleteFileTitle"),
          message: t("projects.autoMemory.deleteFileConfirm", { name: pendingDelete.name }),
        }
      : pendingDelete?.kind === "all"
        ? {
            title: t("projects.autoMemory.deleteAllTitle"),
            message: t("projects.autoMemory.deleteAllConfirm", { count: fileCount }),
          }
        : null;

  return (
    <div className="projects-auto-memory-explorer flex min-h-0 flex-1 flex-col gap-3 bg-secondary p-3">
      <ClaudeOverviewIconSprite />
      <div className="projects-auto-memory-explorer-grid grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_8px_minmax(260px,32%)] gap-0 max-[900px]:grid-cols-1 max-[900px]:grid-rows-[minmax(240px,44%)_minmax(0,1fr)] max-[900px]:gap-3">
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
          ) : hasFiles ? (
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
              {t("projects.autoMemory.emptyTree")}
            </div>
          )}
        </section>
      </div>

      {hasFiles ? (
        <div className="projects-auto-memory-explorer-actions flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={!activePreview}
            onClick={() =>
              activePreview &&
              setPendingDelete({
                kind: "file",
                path: activePreview.path,
                name: activePreview.name || activePreview.path,
              })
            }
          >
            <Trash2 className="size-4" />
            {t("projects.autoMemory.deleteFileTitle")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setPendingDelete({ kind: "all" })}
          >
            <Trash2 className="size-4" />
            {t("projects.autoMemory.deleteAll")}
          </Button>
        </div>
      ) : null}

      {deleteConfirm ? (
        <ConfirmAlertDialog
          title={deleteConfirm.title}
          message={deleteConfirm.message}
          confirmText={t("confirm.delete")}
          cancelText={t("confirm.cancel")}
          danger
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}

export default ProjectAutoMemoryExplorer;
