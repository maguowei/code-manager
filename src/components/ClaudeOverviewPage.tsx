import type { ContextMenuItem, ContextMenuOpenContext } from "@pierre/trees";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import {
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { showOperationError } from "@/lib/user-facing-error";
import { useIsNarrowViewport } from "../hooks/useIsNarrowViewport";
import useTauriEvent from "../hooks/useTauriEvent";
import { useToast } from "../hooks/useToast";
import { type Language, type TranslationKey, useI18n } from "../i18n";
import { ipc } from "../ipc";
import { cn } from "../lib/utils";
import type {
  ClaudeDirectoryChangedEvent,
  ClaudeDirectoryEntry,
  ClaudeDirectoryEntryOperationKind,
  ClaudeDirectoryOverview,
  ClaudeFilePreview,
} from "../types";
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
import { PANEL_SURFACE_CLASS } from "./surface-classes";
import { useTheme } from "./theme-provider";
import { TYPOGRAPHY } from "./typography-classes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from "./ui/resizable";

interface LoadOverviewOptions {
  preserveCurrent?: boolean;
}

const EMPTY_OVERVIEW_STATE: ClaudeDirectoryOverview = {
  rootPath: "~/.claude",
  maxEntries: 100000,
  maxDepth: 128,
  entries: [],
  truncated: false,
  reachedEntryLimit: false,
  reachedDepthLimit: false,
  skippedSymlinkCount: 0,
  skippedNodeModulesCount: 0,
};

// 刷新按钮"刷新中..."状态的最小展示时长,避免本地 IPC 极快返回时按钮抖动看不清反馈
const MIN_REFRESH_FEEDBACK_MS = 500;
// 目录树面板默认占 28%,可在 20%~52% 间拖拽调整;布局比例持久化到 localStorage。
// react-resizable-panels v4 把数字 size 当像素,必须用百分比字符串
const TREE_PANE_DEFAULT_SIZE = "28%";
const TREE_PANE_MIN_SIZE = "20%";
const TREE_PANE_MAX_SIZE = "52%";
const PREVIEW_PANE_DEFAULT_SIZE = "72%";
const PREVIEW_PANE_MIN_SIZE = "48%";
const OVERVIEW_PANES_LAYOUT_ID = "code-manager:claude-overview-panes";
const CONTEXT_MENU_WIDTH = 176;
const CONTEXT_MENU_ESTIMATED_HEIGHT = 152;
const CONTEXT_MENU_EDGE_GAP = 8;
const CONTEXT_MENU_ANCHOR_GAP = 8;
const CLAUDE_CODE_DOCS_BASE_URL = "https://code.claude.com/docs";
const CLAUDE_DIRECTORY_DOCS_PATH = "claude-directory";
type ClaudeOverviewNameDialogMode = "create" | "rename";

interface ClaudeOverviewNameDialogState {
  mode: ClaudeOverviewNameDialogMode;
  kind: ClaudeDirectoryEntryOperationKind;
  path: string | null;
  parentPath: string | null;
  initialName: string;
  titleKey: TranslationKey;
  confirmKey: TranslationKey;
}

interface ClaudeOverviewDeleteState {
  kind: ClaudeDirectoryEntryOperationKind;
  name: string;
  path: string;
}

let cachedClaudeOverviewState: ClaudeDirectoryOverview | null = null;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function contextMenuStyleForAnchor(
  anchorRect: ContextMenuOpenContext["anchorRect"],
): CSSProperties {
  const viewportWidth =
    typeof window === "undefined" ? CONTEXT_MENU_WIDTH : Math.max(window.innerWidth, 0);
  const viewportHeight =
    typeof window === "undefined" ? CONTEXT_MENU_ESTIMATED_HEIGHT : Math.max(window.innerHeight, 0);
  const maxLeft = Math.max(
    CONTEXT_MENU_EDGE_GAP,
    viewportWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_EDGE_GAP,
  );
  const maxTop = Math.max(
    CONTEXT_MENU_EDGE_GAP,
    viewportHeight - CONTEXT_MENU_ESTIMATED_HEIGHT - CONTEXT_MENU_EDGE_GAP,
  );
  const rightSideLeft = anchorRect.right + CONTEXT_MENU_ANCHOR_GAP;
  const wouldOverflowRight =
    rightSideLeft + CONTEXT_MENU_WIDTH > viewportWidth - CONTEXT_MENU_EDGE_GAP;
  const preferredLeft = wouldOverflowRight
    ? anchorRect.left - CONTEXT_MENU_WIDTH - CONTEXT_MENU_ANCHOR_GAP
    : rightSideLeft;

  return {
    left: clampNumber(preferredLeft, CONTEXT_MENU_EDGE_GAP, maxLeft),
    position: "fixed",
    top: clampNumber(anchorRect.top, CONTEXT_MENU_EDGE_GAP, maxTop),
    width: CONTEXT_MENU_WIDTH,
  };
}

function getParentPath(path: string) {
  const normalizedPath = normalizeTreePath(path);
  const separatorIndex = normalizedPath.lastIndexOf("/");
  return separatorIndex >= 0 ? normalizedPath.slice(0, separatorIndex) : null;
}

function joinClaudeRelativePath(parentPath: string | null, name: string) {
  return parentPath ? `${parentPath}/${name}` : name;
}

function contextMenuItemKind(item: ContextMenuItem): ClaudeDirectoryEntryOperationKind {
  return item.kind === "directory" ? "directory" : "file";
}

function contextMenuParentPath(item: ContextMenuItem) {
  const path = normalizeTreePath(item.path);
  return item.kind === "directory" ? path : getParentPath(path);
}

function isSameOrDescendantPath(path: string, targetPath: string) {
  return path === targetPath || path.startsWith(`${targetPath}/`);
}

function isPathAffectedByChangedPath(path: string, changedPath: string) {
  return isSameOrDescendantPath(path, changedPath) || isSameOrDescendantPath(changedPath, path);
}

function remapRenamedPath(path: string, sourcePath: string, destinationPath: string) {
  if (path === sourcePath) {
    return destinationPath;
  }
  if (path.startsWith(`${sourcePath}/`)) {
    return `${destinationPath}${path.slice(sourcePath.length)}`;
  }
  return path;
}

function isValidEntryNameInput(name: string) {
  const trimmedName = name.trim();
  return (
    trimmedName.length > 0 &&
    !trimmedName.includes("/") &&
    !trimmedName.includes("\\") &&
    !trimmedName.includes(":") &&
    trimmedName !== "." &&
    trimmedName !== ".."
  );
}

function getClaudeDirectoryDocsUrl(language: Language) {
  const docsLocale = language === "zh" ? "zh-CN" : "en";
  return `${CLAUDE_CODE_DOCS_BASE_URL}/${docsLocale}/${CLAUDE_DIRECTORY_DOCS_PATH}`;
}

interface ClaudeOverviewContextMenuProps {
  context: ContextMenuOpenContext;
  item: ContextMenuItem;
  onCreate: (item: ContextMenuItem, kind: ClaudeDirectoryEntryOperationKind) => void;
  onDelete: (item: ContextMenuItem) => void;
  onRename: (item: ContextMenuItem) => void;
  t: (key: TranslationKey) => string;
}

function ClaudeOverviewContextMenu({
  context,
  item,
  onCreate,
  onDelete,
  onRename,
  t,
}: ClaudeOverviewContextMenuProps) {
  const menuStyle = contextMenuStyleForAnchor(context.anchorRect);
  const handleAction = (action: () => void) => {
    context.close({ restoreFocus: false });
    action();
  };

  return (
    <div
      className="claude-overview-context-menu z-50 flex min-w-39 flex-col gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
      role="menu"
      style={menuStyle}
    >
      <Button
        type="button"
        role="menuitem"
        variant="ghost"
        className="h-auto min-h-8 w-full justify-start rounded-sm px-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
        onClick={() => handleAction(() => onCreate(item, "file"))}
      >
        {t("claudeOverview.contextMenu.newFile")}
      </Button>
      <Button
        type="button"
        role="menuitem"
        variant="ghost"
        className="h-auto min-h-8 w-full justify-start rounded-sm px-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
        onClick={() => handleAction(() => onCreate(item, "directory"))}
      >
        {t("claudeOverview.contextMenu.newFolder")}
      </Button>
      <Button
        type="button"
        role="menuitem"
        variant="ghost"
        className="h-auto min-h-8 w-full justify-start rounded-sm px-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
        onClick={() => handleAction(() => onRename(item))}
      >
        {t("claudeOverview.contextMenu.rename")}
      </Button>
      <div
        className="claude-overview-context-menu-separator -mx-1 my-1 h-px bg-border"
        aria-hidden="true"
      />
      <Button
        type="button"
        role="menuitem"
        variant="destructive-ghost"
        className="danger h-auto min-h-8 w-full justify-start rounded-sm px-2.5 text-left text-sm text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none"
        onClick={() => handleAction(() => onDelete(item))}
      >
        {t("claudeOverview.contextMenu.delete")}
      </Button>
    </div>
  );
}

interface ClaudeOverviewNameDialogProps {
  dialog: ClaudeOverviewNameDialogState;
  onCancel: () => void;
  onSubmit: (name: string) => void;
  t: (key: TranslationKey) => string;
}

function ClaudeOverviewNameDialog({
  dialog,
  onCancel,
  onSubmit,
  t,
}: ClaudeOverviewNameDialogProps) {
  const [name, setName] = useState(dialog.initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(name);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t(dialog.titleKey)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2 text-sm text-muted-foreground">
            <span>{t("claudeOverview.nameLabel")}</span>
            <Input
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("confirm.cancel")}
            </Button>
            <Button type="submit">{t(dialog.confirmKey)}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClaudeOverviewPage({ active = false }: { active?: boolean }) {
  const { language, t } = useI18n();
  const { isDark } = useTheme();
  const { showToast } = useToast();
  const cachedOverviewOnMountRef = useRef<ClaudeDirectoryOverview | null>(
    cachedClaudeOverviewState,
  );
  const [overview, setOverview] = useState<ClaudeDirectoryOverview>(
    () => cachedOverviewOnMountRef.current ?? EMPTY_OVERVIEW_STATE,
  );
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [openPreviews, setOpenPreviews] = useState<ClaudeFilePreview[]>([]);
  const [activePreviewPath, setActivePreviewPath] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(
    () => cachedOverviewOnMountRef.current === null,
  );
  // 首次 mount 时延迟一帧再挂载 FileTree,避免大型缓存数据导致首帧 paint 前的同步开销过大
  const [hasMounted, setHasMounted] = useState(false);
  // 刷新按钮专用显示态,与 loadingOverview 解耦,带最小持续时间,避免 IPC 极快返回时按钮抖动
  const [isRefreshButtonBusy, setIsRefreshButtonBusy] = useState(false);
  const [loadingPreviewPath, setLoadingPreviewPath] = useState<string | null>(null);
  // Markdown 文件默认进入渲染预览，其它文件维持源码视图；切换 tab/打开新文件时按文件类型重置
  const [viewMode, setViewMode] = useState<PreviewViewMode>("source");
  // 本页用 display:none keepalive（见 App.tsx）。从隐藏恢复可见时递增此 token 强制源码预览的
  // Pierre Virtualizer 重挂、重新测量容器高度——display:none 期间高度塌为 0，切回后 ResizeObserver
  // 在 WKWebView 中不一定触发恢复，会导致预览空白。
  const [previewRemountToken, setPreviewRemountToken] = useState(0);
  const wasActiveRef = useRef(active);
  const [nameDialog, setNameDialog] = useState<ClaudeOverviewNameDialogState | null>(null);
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<ClaudeOverviewDeleteState | null>(
    null,
  );
  // 拖拽状态：拖拽期间冻结预览内容宽度避免持续重排；由分隔条 pointerdown 启动、onLayoutChanged（拖拽结束）解冻
  const [isResizing, setIsResizing] = useState(false);
  const latestOverviewRequestIdRef = useRef(0);
  const latestPreviewRequestPathRef = useRef<string | null>(null);
  const activePreviewPathRef = useRef<string | null>(null);
  const openPreviewsRef = useRef<ClaudeFilePreview[]>([]);
  const refreshBusyTimerRef = useRef<number | null>(null);
  const resizeEndCleanupRef = useRef<(() => void) | null>(null);

  // 概览面板布局：横向（左右）/ 纵向（上下）随视口宽度切换，比例持久化到 localStorage
  const isNarrow = useIsNarrowViewport(900);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: OVERVIEW_PANES_LAYOUT_ID });

  const entryByPath = useMemo(() => {
    const map = new Map<string, ClaudeDirectoryEntry>();
    for (const entry of overview.entries) {
      map.set(entry.path, entry);
    }
    return map;
  }, [overview.entries]);

  const deferredOverviewEntries = useDeferredValue(overview.entries);
  const treeEntriesPending = deferredOverviewEntries !== overview.entries;
  const treePaths = useMemo(
    () => deferredOverviewEntries.map(treePathForEntry),
    [deferredOverviewEntries],
  );
  const activePreview = useMemo(
    () => openPreviews.find((preview) => preview.path === activePreviewPath) ?? null,
    [activePreviewPath, openPreviews],
  );
  const previewThemeType = isDark ? "dark" : "light";
  const claudeDirectoryDocsUrl = useMemo(() => getClaudeDirectoryDocsUrl(language), [language]);

  const selectedEntry = selectedPath ? entryByPath.get(selectedPath) : undefined;
  const activeEntry = activePreview
    ? (entryByPath.get(activePreview.path) ?? selectedEntry)
    : selectedEntry;

  useEffect(() => {
    openPreviewsRef.current = openPreviews;
  }, [openPreviews]);

  useEffect(() => {
    activePreviewPathRef.current = activePreviewPath;
  }, [activePreviewPath]);

  useEffect(
    () => () => {
      latestOverviewRequestIdRef.current += 1;
      resizeEndCleanupRef.current?.();
      resizeEndCleanupRef.current = null;
      if (refreshBusyTimerRef.current !== null) {
        window.clearTimeout(refreshBusyTimerRef.current);
        refreshBusyTimerRef.current = null;
      }
    },
    [],
  );

  const clearResizeEndListeners = useCallback(() => {
    resizeEndCleanupRef.current?.();
    resizeEndCleanupRef.current = null;
  }, []);

  const stopResizing = useCallback(() => {
    clearResizeEndListeners();
    setIsResizing(false);
  }, [clearResizeEndListeners]);

  const registerResizeEndListeners = useCallback(() => {
    clearResizeEndListeners();
    document.addEventListener("pointerup", stopResizing);
    document.addEventListener("pointercancel", stopResizing);
    window.addEventListener("blur", stopResizing);
    resizeEndCleanupRef.current = () => {
      document.removeEventListener("pointerup", stopResizing);
      document.removeEventListener("pointercancel", stopResizing);
      window.removeEventListener("blur", stopResizing);
    };
  }, [clearResizeEndListeners, stopResizing]);

  const loadOverview = useCallback(
    async (options: LoadOverviewOptions = {}) => {
      const requestId = latestOverviewRequestIdRef.current + 1;
      latestOverviewRequestIdRef.current = requestId;
      const preserveCurrent = options.preserveCurrent === true;
      setLoadingOverview(true);
      if (!preserveCurrent) {
        setSelectedPath(null);
        setOpenPreviews([]);
        setActivePreviewPath(null);
        setLoadingPreviewPath(null);
        latestPreviewRequestPathRef.current = null;
      }

      try {
        const nextOverview = await ipc.getClaudeDirectoryOverview();
        if (latestOverviewRequestIdRef.current !== requestId) {
          return null;
        }
        cachedClaudeOverviewState = nextOverview;
        startTransition(() => {
          setOverview(nextOverview);
          setLoadingOverview(false);
        });
        return nextOverview;
      } catch (error) {
        if (latestOverviewRequestIdRef.current !== requestId) {
          return null;
        }
        if (!preserveCurrent) {
          cachedClaudeOverviewState = null;
          startTransition(() => {
            setOverview(EMPTY_OVERVIEW_STATE);
          });
        }
        setLoadingOverview(false);
        showOperationError(showToast, t("claudeOverview.loadError"), error);
        return null;
      }
    },
    [showToast, t],
  );

  useEffect(() => {
    void loadOverview({ preserveCurrent: cachedOverviewOnMountRef.current !== null });
  }, [loadOverview]);

  useEffect(() => {
    // rAF 在浏览器 paint 之后触发,确保首帧先展示骨架屏再挂载重型 FileTree
    const frameId = window.requestAnimationFrame(() => {
      setHasMounted(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    // 从隐藏(display:none)恢复可见时 bump token，强制源码预览的 Virtualizer 重挂、重新测量尺寸。
    if (active && !wasActiveRef.current) {
      setPreviewRemountToken((token) => token + 1);
    }
    wasActiveRef.current = active;
  }, [active]);

  const loadPreview = useCallback(
    async (path: string) => {
      latestPreviewRequestPathRef.current = path;
      const openedPreview = openPreviewsRef.current.find((preview) => preview.path === path);
      if (openedPreview) {
        setSelectedPath(path);
        setActivePreviewPath(path);
        setViewMode(defaultViewModeForPath(path));
        return;
      }

      setSelectedPath(path);
      setActivePreviewPath(null);
      setLoadingPreviewPath(path);
      try {
        const nextPreview = await ipc.readClaudeFilePreview(path);
        setOpenPreviews((currentPreviews) => {
          if (currentPreviews.some((preview) => preview.path === nextPreview.path)) {
            return currentPreviews.map((preview) =>
              preview.path === nextPreview.path ? nextPreview : preview,
            );
          }
          return [...currentPreviews, nextPreview];
        });
        if (latestPreviewRequestPathRef.current === path) {
          setActivePreviewPath(nextPreview.path);
          setSelectedPath(nextPreview.path);
          setViewMode(defaultViewModeForPath(nextPreview.path));
        }
      } catch (error) {
        showOperationError(showToast, t("claudeOverview.previewError"), error);
      } finally {
        setLoadingPreviewPath((currentPath) => (currentPath === path ? null : currentPath));
      }
    },
    [showToast, t],
  );

  const refreshOpenPreview = useCallback(async (path: string) => {
    try {
      const nextPreview = await ipc.readClaudeFilePreview(path);
      setOpenPreviews((currentPreviews) =>
        currentPreviews.map((preview) => (preview.path === path ? nextPreview : preview)),
      );
      return nextPreview;
    } catch {
      return null;
    }
  }, []);

  const closePreviewPaths = useCallback((pathsToClose: Set<string>) => {
    if (pathsToClose.size === 0) {
      return;
    }

    setOpenPreviews((currentPreviews) => {
      const activePath = activePreviewPathRef.current;
      const closingIndex = activePath
        ? currentPreviews.findIndex((preview) => preview.path === activePath)
        : -1;
      const nextPreviews = currentPreviews.filter((preview) => !pathsToClose.has(preview.path));

      if (activePath && pathsToClose.has(activePath)) {
        const fallbackPreview =
          nextPreviews[closingIndex] ?? nextPreviews[closingIndex - 1] ?? null;
        const fallbackPath = fallbackPreview?.path ?? null;
        activePreviewPathRef.current = fallbackPath;
        latestPreviewRequestPathRef.current = fallbackPath;
        setActivePreviewPath(fallbackPath);
        setSelectedPath(fallbackPath);
      }

      return nextPreviews;
    });
  }, []);

  const handleClaudeDirectoryChanged = useCallback(
    async (event: ClaudeDirectoryChangedEvent) => {
      const changedPaths = event.paths.filter((path) => path.trim().length > 0);
      if (changedPaths.length === 0) {
        return;
      }

      const openPreviewsBeforeRefresh = openPreviewsRef.current;
      const affectedPreviews = openPreviewsBeforeRefresh.filter((preview) =>
        changedPaths.some((changedPath) => isPathAffectedByChangedPath(preview.path, changedPath)),
      );
      const nextOverview = await loadOverview({ preserveCurrent: true });
      if (!nextOverview || affectedPreviews.length === 0) {
        return;
      }

      const nextEntryByPath = new Map<string, ClaudeDirectoryEntry>();
      for (const entry of nextOverview.entries) {
        nextEntryByPath.set(entry.path, entry);
      }

      const pathsToClose = new Set<string>();
      const pathsToRefresh: string[] = [];
      for (const preview of affectedPreviews) {
        const nextEntry = nextEntryByPath.get(preview.path);
        if (nextEntry?.kind === "file") {
          pathsToRefresh.push(preview.path);
        } else {
          pathsToClose.add(preview.path);
        }
      }

      closePreviewPaths(pathsToClose);
      await Promise.all(pathsToRefresh.map((path) => refreshOpenPreview(path)));
    },
    [closePreviewPaths, loadOverview, refreshOpenPreview],
  );

  useTauriEvent<ClaudeDirectoryChangedEvent>(
    "claude-directory-changed",
    handleClaudeDirectoryChanged,
  );

  const handleSelectPath = useCallback(
    (path: string) => {
      const entry = entryByPath.get(path);
      setSelectedPath(path);
      if (!entry || entry.kind === "directory") {
        latestPreviewRequestPathRef.current = null;
        setActivePreviewPath(null);
        return;
      }
      void loadPreview(path);
    },
    [entryByPath, loadPreview],
  );

  const handleCreateFromContextMenu = useCallback(
    (item: ContextMenuItem, kind: ClaudeDirectoryEntryOperationKind) => {
      const parentPath = contextMenuParentPath(item);
      setNameDialog({
        mode: "create",
        kind,
        path: normalizeTreePath(item.path),
        parentPath,
        initialName: "",
        titleKey:
          kind === "file" ? "claudeOverview.createFileTitle" : "claudeOverview.createFolderTitle",
        confirmKey: "claudeOverview.createConfirm",
      });
    },
    [],
  );

  const handleRenameFromContextMenu = useCallback((item: ContextMenuItem) => {
    setNameDialog({
      mode: "rename",
      kind: contextMenuItemKind(item),
      path: normalizeTreePath(item.path),
      parentPath: getParentPath(item.path),
      initialName: item.name,
      titleKey: "claudeOverview.renameTitle",
      confirmKey: "claudeOverview.contextMenu.rename",
    });
  }, []);

  const handleDeleteFromContextMenu = useCallback((item: ContextMenuItem) => {
    setPendingDeleteEntry({
      kind: contextMenuItemKind(item),
      name: item.name,
      path: normalizeTreePath(item.path),
    });
  }, []);

  const handleSubmitNameDialog = useCallback(
    async (name: string) => {
      if (!nameDialog) {
        return;
      }

      const trimmedName = name.trim();
      if (!isValidEntryNameInput(trimmedName)) {
        showToast(t("claudeOverview.invalidName"), "error");
        return;
      }

      try {
        if (nameDialog.mode === "create") {
          await ipc.createClaudeDirectoryEntry(nameDialog.parentPath, trimmedName, nameDialog.kind);
          showToast(t("claudeOverview.createSuccess"));
        } else if (nameDialog.path) {
          const sourcePath = nameDialog.path;
          const destinationPath = joinClaudeRelativePath(nameDialog.parentPath, trimmedName);
          await ipc.renameClaudeDirectoryEntry(sourcePath, trimmedName);
          setOpenPreviews((currentPreviews) =>
            currentPreviews.map((preview) => {
              const nextPath = remapRenamedPath(preview.path, sourcePath, destinationPath);
              return nextPath === preview.path
                ? preview
                : {
                    ...preview,
                    path: nextPath,
                    name:
                      preview.path === sourcePath
                        ? trimmedName
                        : (nextPath.split("/").pop() ?? nextPath),
                  };
            }),
          );
          setSelectedPath((currentPath) =>
            currentPath ? remapRenamedPath(currentPath, sourcePath, destinationPath) : currentPath,
          );
          setActivePreviewPath((currentPath) =>
            currentPath ? remapRenamedPath(currentPath, sourcePath, destinationPath) : currentPath,
          );
          latestPreviewRequestPathRef.current = latestPreviewRequestPathRef.current
            ? remapRenamedPath(latestPreviewRequestPathRef.current, sourcePath, destinationPath)
            : null;
          showToast(t("claudeOverview.renameSuccess"));
        }
        setNameDialog(null);
        await loadOverview({ preserveCurrent: true });
      } catch (error) {
        showOperationError(showToast, t("claudeOverview.operationError"), error);
      }
    },
    [loadOverview, nameDialog, showToast, t],
  );

  const handleConfirmDeleteEntry = useCallback(async () => {
    if (!pendingDeleteEntry) {
      return;
    }

    const deletedPath = pendingDeleteEntry.path;
    try {
      await ipc.deleteClaudeDirectoryEntry(deletedPath);
      setOpenPreviews((currentPreviews) =>
        currentPreviews.filter((preview) => !isSameOrDescendantPath(preview.path, deletedPath)),
      );
      setSelectedPath((currentPath) =>
        currentPath && isSameOrDescendantPath(currentPath, deletedPath) ? null : currentPath,
      );
      setActivePreviewPath((currentPath) =>
        currentPath && isSameOrDescendantPath(currentPath, deletedPath) ? null : currentPath,
      );
      if (
        latestPreviewRequestPathRef.current &&
        isSameOrDescendantPath(latestPreviewRequestPathRef.current, deletedPath)
      ) {
        latestPreviewRequestPathRef.current = null;
      }
      setPendingDeleteEntry(null);
      showToast(t("claudeOverview.deleteSuccess"));
      await loadOverview({ preserveCurrent: true });
    } catch (error) {
      showOperationError(showToast, t("claudeOverview.operationError"), error);
    }
  }, [loadOverview, pendingDeleteEntry, showToast, t]);

  const renderTreeContextMenu = useCallback(
    (item: ContextMenuItem, context: ContextMenuOpenContext) => (
      <ClaudeOverviewContextMenu
        context={context}
        item={item}
        onCreate={handleCreateFromContextMenu}
        onDelete={handleDeleteFromContextMenu}
        onRename={handleRenameFromContextMenu}
        t={t}
      />
    ),
    [handleCreateFromContextMenu, handleDeleteFromContextMenu, handleRenameFromContextMenu, t],
  );

  const handleSelectPreviewTab = useCallback((path: string) => {
    latestPreviewRequestPathRef.current = path;
    setSelectedPath(path);
    setActivePreviewPath(path);
    setViewMode(defaultViewModeForPath(path));
  }, []);

  const handleClosePreview = useCallback(
    (path: string) => {
      setOpenPreviews((currentPreviews) => {
        const closingIndex = currentPreviews.findIndex((preview) => preview.path === path);
        const nextPreviews = currentPreviews.filter((preview) => preview.path !== path);
        if (activePreviewPath === path) {
          const fallbackPreview =
            nextPreviews[closingIndex] ?? nextPreviews[closingIndex - 1] ?? null;
          latestPreviewRequestPathRef.current = fallbackPreview?.path ?? null;
          setActivePreviewPath(fallbackPreview?.path ?? null);
          setSelectedPath(fallbackPreview?.path ?? null);
        }
        return nextPreviews;
      });
    },
    [activePreviewPath],
  );

  const handleCopyPath = useCallback(async () => {
    if (!activePreview) {
      return;
    }
    try {
      await navigator.clipboard.writeText(
        absolutePreviewPath(overview.rootPath, activePreview.path),
      );
      showToast(t("claudeOverview.pathCopied"));
    } catch (error) {
      showOperationError(showToast, t("claudeOverview.pathCopyError"), error);
    }
  }, [activePreview, overview.rootPath, showToast, t]);

  const handleOpenInFileBrowser = useCallback(async () => {
    if (!activePreview) {
      return;
    }
    try {
      await revealItemInDir(absolutePreviewPath(overview.rootPath, activePreview.path));
    } catch (error) {
      showOperationError(showToast, t("claudeOverview.openFileBrowserError"), error);
    }
  }, [activePreview, overview.rootPath, showToast, t]);

  const handleOpenInEditor = useCallback(async () => {
    if (!activePreview) {
      return;
    }
    try {
      await ipc.openClaudeFileInEditor(activePreview.path);
    } catch (error) {
      showOperationError(showToast, t("claudeOverview.openEditorError"), error);
    }
  }, [activePreview, showToast, t]);

  const handleOpenDocs = useCallback(async () => {
    try {
      await openUrl(claudeDirectoryDocsUrl);
    } catch (error) {
      showOperationError(showToast, t("claudeOverview.openDocsError"), error);
    }
  }, [claudeDirectoryDocsUrl, showToast, t]);

  const handleRefreshClick = useCallback(() => {
    if (refreshBusyTimerRef.current !== null) {
      window.clearTimeout(refreshBusyTimerRef.current);
      refreshBusyTimerRef.current = null;
    }
    setIsRefreshButtonBusy(true);
    const startedAt = performance.now();
    void loadOverview({ preserveCurrent: true }).finally(() => {
      const elapsed = performance.now() - startedAt;
      const remaining = MIN_REFRESH_FEEDBACK_MS - elapsed;
      if (remaining <= 0) {
        setIsRefreshButtonBusy(false);
        return;
      }
      refreshBusyTimerRef.current = window.setTimeout(() => {
        refreshBusyTimerRef.current = null;
        setIsRefreshButtonBusy(false);
      }, remaining);
    });
  }, [loadOverview]);

  // 拖拽起始（pointerdown）立即冻结预览内容宽度：v4 的 onResize 由 ResizeObserver 异步回调驱动，
  // 滞后于真正改变宽度的 flexGrow 写入约 2~3 帧，等它触发冻结会漏掉起步帧导致大文件 reflow 卡顿。
  // 库的拖拽靠 document capture 监听，不占用 separator 的合成 onPointerDown，可安全共存。
  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }
      registerResizeEndListeners();
      setIsResizing(true);
    },
    [registerResizeEndListeners],
  );

  // 拖拽结束（pointerup 后库触发 onLayoutChanged）：持久化布局；宽度冻结另由全局 pointer 兜底复位
  const handleLayoutChanged = useCallback(
    (layout: Parameters<typeof onLayoutChanged>[0]) => {
      onLayoutChanged(layout);
      stopResizing();
    },
    [onLayoutChanged, stopResizing],
  );

  // 首帧未 paint 骨架屏前,或没有任何已知数据且仍在加载时,展示骨架屏;一旦树有数据,刷新走 resetPaths 平滑替换
  const showTreeLoading =
    !hasMounted || ((loadingOverview || treeEntriesPending) && treePaths.length === 0);
  const treeLoadingLabel = loadingOverview
    ? t("claudeOverview.scanning")
    : t("claudeOverview.preparingTree");

  return (
    <section
      className="claude-overview-page relative flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden bg-secondary text-foreground"
      aria-labelledby="claude-overview-title"
    >
      {hasMounted ? <ClaudeOverviewIconSprite /> : null}
      <header className="claude-overview-header flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border bg-secondary px-5 py-2.5 shadow-toolbar backdrop-blur supports-[backdrop-filter]:bg-secondary/90 max-[700px]:items-start max-[700px]:justify-start max-[700px]:gap-2">
        <div className="claude-overview-title-group flex min-w-0 flex-1 basis-[280px] items-baseline gap-2.5 max-[700px]:flex-[0_1_auto] max-[700px]:flex-wrap">
          <h1 id="claude-overview-title" className={cn("whitespace-nowrap", TYPOGRAPHY.pageTitle)}>
            {t("claudeOverview.title")}
          </h1>
          <p className="font-mono text-xs leading-tight text-muted-foreground [overflow-wrap:anywhere]">
            {overview.rootPath}
          </p>
        </div>
        <div className="claude-overview-status flex min-h-0 shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">
            {t("claudeOverview.loadedEntryCount").replace(
              "{count}",
              String(overview.entries.length),
            )}
          </Badge>
          {overview.reachedEntryLimit ? (
            <Badge variant="outline">
              {t("claudeOverview.truncatedEntries").replace("{count}", String(overview.maxEntries))}
            </Badge>
          ) : null}
          {overview.skippedSymlinkCount > 0 ? (
            <Badge variant="outline">
              {t("claudeOverview.skippedSymlinks").replace(
                "{count}",
                String(overview.skippedSymlinkCount),
              )}
            </Badge>
          ) : null}
          {overview.skippedNodeModulesCount > 0 ? (
            <Badge variant="outline">
              {t("claudeOverview.skippedNodeModules").replace(
                "{count}",
                String(overview.skippedNodeModulesCount),
              )}
            </Badge>
          ) : null}
        </div>
        <div className="claude-overview-actions flex items-center gap-2">
          <Button variant="link" size="sm" asChild>
            <a
              href={claudeDirectoryDocsUrl}
              aria-label={t("claudeOverview.openDocsAriaLabel")}
              title={t("claudeOverview.openDocsAriaLabel")}
              onClick={(event) => {
                event.preventDefault();
                void handleOpenDocs();
              }}
            >
              <span>{t("claudeOverview.openDocs")}</span>
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefreshClick}
            disabled={isRefreshButtonBusy}
            aria-busy={isRefreshButtonBusy}
          >
            {/* 双 span 叠加保证按钮宽度始终按最长文案预留,切换状态时不抖动相邻元素 */}
            <span className="claude-overview-refresh-button-stack inline-grid items-center justify-items-center [grid-template-areas:'stack']">
              <span
                className={cn("[grid-area:stack]", !isRefreshButtonBusy && "invisible")}
                data-active={isRefreshButtonBusy}
              >
                {t("claudeOverview.refreshing")}
              </span>
              <span
                className={cn("[grid-area:stack]", isRefreshButtonBusy && "invisible")}
                data-active={!isRefreshButtonBusy}
              >
                {t("claudeOverview.refresh")}
              </span>
            </span>
          </Button>
        </div>
      </header>

      <div className="claude-overview-body min-h-0 w-full flex-1 bg-secondary p-3">
        <ResizablePanelGroup
          orientation={isNarrow ? "vertical" : "horizontal"}
          defaultLayout={defaultLayout}
          onLayoutChanged={handleLayoutChanged}
        >
          <ResizablePanel
            id="preview"
            defaultSize={PREVIEW_PANE_DEFAULT_SIZE}
            minSize={PREVIEW_PANE_MIN_SIZE}
            className="flex min-h-0 min-w-0 flex-col"
          >
            <section
              className={cn(
                "claude-overview-preview-pane flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border",
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
                isResizing={isResizing}
                remountToken={previewRemountToken}
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
          </ResizablePanel>

          <ResizableHandle
            aria-label={t("claudeOverview.resizePanes")}
            onPointerCancel={stopResizing}
            onPointerDown={handleResizeStart}
            onPointerUp={stopResizing}
          />

          <ResizablePanel
            id="tree"
            defaultSize={TREE_PANE_DEFAULT_SIZE}
            minSize={TREE_PANE_MIN_SIZE}
            maxSize={TREE_PANE_MAX_SIZE}
            className="flex min-h-0 min-w-0 flex-col"
          >
            <section
              className={cn(
                "claude-overview-tree-pane flex min-h-0 min-w-0 w-full flex-1 overflow-hidden",
                "[contain:content]",
              )}
              aria-label={t("claudeOverview.tree")}
            >
              {showTreeLoading ? (
                <div
                  className={cn(
                    "claude-overview-tree-loading-panel h-full min-h-0 w-full flex-1 overflow-hidden rounded-lg border",
                    PANEL_SURFACE_CLASS,
                  )}
                >
                  <ClaudeOverviewTreeLoading label={treeLoadingLabel} />
                </div>
              ) : treePaths.length > 0 ? (
                <div
                  className={cn(
                    "claude-overview-tree-ready h-full min-h-0 w-full flex-1 overflow-hidden rounded-lg border",
                    PANEL_SURFACE_CLASS,
                  )}
                >
                  <ClaudeDirectoryTree
                    paths={treePaths}
                    onSelectPath={handleSelectPath}
                    renderContextMenu={renderTreeContextMenu}
                  />
                </div>
              ) : (
                <div
                  className={cn(
                    "claude-overview-empty flex min-h-[180px] w-full flex-1 items-center justify-center rounded-lg border p-5 text-center leading-relaxed text-muted-foreground",
                    PANEL_SURFACE_CLASS,
                  )}
                >
                  {t("claudeOverview.empty")}
                </div>
              )}
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      {nameDialog ? (
        <ClaudeOverviewNameDialog
          dialog={nameDialog}
          onCancel={() => setNameDialog(null)}
          onSubmit={handleSubmitNameDialog}
          t={t}
        />
      ) : null}
      {pendingDeleteEntry ? (
        <ConfirmAlertDialog
          title={t("claudeOverview.deleteTitle").replace("{name}", pendingDeleteEntry.name)}
          message={t("claudeOverview.deleteMessage")}
          confirmText={t("confirm.delete")}
          cancelText={t("confirm.cancel")}
          onConfirm={handleConfirmDeleteEntry}
          onCancel={() => setPendingDeleteEntry(null)}
          danger
        />
      ) : null}
    </section>
  );
}

export default ClaudeOverviewPage;
