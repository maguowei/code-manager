import type { FileContents, FileOptions, ThemeTypes } from "@pierre/diffs/react";
import { File as PierreFile } from "@pierre/diffs/react";
import {
  type ContextMenuItem,
  type ContextMenuOpenContext,
  createFileTreeIconResolver,
  getBuiltInFileIconColor,
  getBuiltInSpriteSheet,
  prepareFileTreeInput,
} from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useToast } from "../hooks/useToast";
import { type Theme, type TranslationKey, useI18n } from "../i18n";
import type {
  ClaudeDirectoryEntry,
  ClaudeDirectoryEntryOperationKind,
  ClaudeDirectoryOverview,
  ClaudeFilePreview,
} from "../types";
import ConfirmDialog from "./ConfirmDialog";
import MarkdownPreview from "./claude-overview/MarkdownPreview";
import { CodeIcon, CopyIcon, EditIcon, ExternalLinkIcon, EyeIcon } from "./Icons";
import "./ClaudeOverviewPage.css";

interface ClaudeDirectoryTreeProps {
  paths: string[];
  onSelectPath: (path: string) => void;
  renderContextMenu: (item: ContextMenuItem, context: ContextMenuOpenContext) => ReactNode;
}

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

const PIERRE_FILE_OPTIONS = {
  disableFileHeader: true,
  overflow: "wrap",
  theme: {
    dark: "pierre-dark",
    light: "pierre-light",
  },
  tokenizeMaxLineLength: 2000,
} satisfies FileOptions<undefined>;

const DEFAULT_TREE_PANE_WIDTH = 340;
// 刷新按钮"刷新中..."状态的最小展示时长,避免本地 IPC 极快返回时按钮抖动看不清反馈
const MIN_REFRESH_FEEDBACK_MS = 500;
const MIN_TREE_PANE_WIDTH = 260;
const MAX_TREE_PANE_WIDTH = 720;
const TREE_PANE_WIDTH_STEP = 20;
const TREE_PANE_WIDTH_STORAGE_KEY = "ai-manager:claude-overview-tree-pane-width";
const TREE_LOADING_ROWS = Array.from({ length: 11 }, (_, index) => index);
const FILE_TREE_FILE_ICON_NAME = "file-tree-icon-file";
const FILE_TREE_ICON_RESOLVER = createFileTreeIconResolver();
const FILE_TREE_ICON_SPRITE_SHEET = getBuiltInSpriteSheet("complete");
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);
const CONTEXT_MENU_WIDTH = 176;
const CONTEXT_MENU_ESTIMATED_HEIGHT = 152;
const CONTEXT_MENU_EDGE_GAP = 8;
const CONTEXT_MENU_ANCHOR_GAP = 8;

// 根据文件路径后缀判断是否为 Markdown，用于决定是否启用渲染预览
function isMarkdownPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MARKDOWN_EXTENSIONS.has(ext);
}

type PreviewViewMode = "preview" | "source";
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

// 切换到目标文件时计算默认视图：Markdown 默认渲染预览，其它一律源码
function defaultViewModeForPath(path: string | null | undefined): PreviewViewMode {
  return path && isMarkdownPath(path) ? "preview" : "source";
}

let cachedClaudeOverviewState: ClaudeDirectoryOverview | null = null;

type ClaudeOverviewBodyStyle = CSSProperties & {
  "--claude-overview-tree-width": string;
};

function clampTreePaneWidth(width: number) {
  return Math.min(MAX_TREE_PANE_WIDTH, Math.max(MIN_TREE_PANE_WIDTH, Math.round(width)));
}

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

function readInitialTreePaneWidth() {
  if (typeof localStorage === "undefined") {
    return DEFAULT_TREE_PANE_WIDTH;
  }

  const storedValue = localStorage.getItem(TREE_PANE_WIDTH_STORAGE_KEY);
  if (storedValue === null) {
    return DEFAULT_TREE_PANE_WIDTH;
  }

  const storedWidth = Number(storedValue);
  return Number.isFinite(storedWidth) ? clampTreePaneWidth(storedWidth) : DEFAULT_TREE_PANE_WIDTH;
}

function saveTreePaneWidth(width: number) {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(TREE_PANE_WIDTH_STORAGE_KEY, String(clampTreePaneWidth(width)));
  } catch {
    // 本地布局偏好写入失败不影响目录浏览。
  }
}

function treePathForEntry(entry: ClaudeDirectoryEntry) {
  return entry.kind === "directory" ? `${entry.path}/` : entry.path;
}

function normalizeTreePath(path: string) {
  return path.endsWith("/") ? path.slice(0, -1) : path;
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

function getEventTreeItemPath(event: ReactMouseEvent<HTMLElement>) {
  const nativeEvent = event.nativeEvent as MouseEvent & {
    composedPath?: () => EventTarget[];
  };
  const eventPath =
    typeof nativeEvent.composedPath === "function" ? nativeEvent.composedPath() : [];

  for (const target of eventPath) {
    if (!(target instanceof HTMLElement)) {
      continue;
    }
    const treeItemElement =
      target.dataset.type === "item" ? target : target.closest<HTMLElement>("[data-type='item']");
    const itemPath = treeItemElement?.dataset.itemPath;
    if (itemPath) {
      return normalizeTreePath(itemPath);
    }
  }

  if (event.target instanceof HTMLElement) {
    const treeItemElement = event.target.closest<HTMLElement>("[data-type='item']");
    const itemPath = treeItemElement?.dataset.itemPath;
    if (itemPath) {
      return normalizeTreePath(itemPath);
    }
  }

  return null;
}

function getMonotonicTime() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatModifiedAt(timestamp: number) {
  if (!timestamp) {
    return "-";
  }
  return new Date(timestamp * 1000).toLocaleString();
}

function formatPreviewEncoding(encoding: string | undefined, t: (key: TranslationKey) => string) {
  switch (encoding) {
    case "utf-8":
      return t("claudeOverview.encodingUtf8");
    case "utf-8-lossy":
      return t("claudeOverview.encodingUtf8Lossy");
    case "binary":
      return t("claudeOverview.encodingBinary");
    default:
      return encoding || t("claudeOverview.encodingUnknown");
  }
}

function getSystemPierreThemeType(): ThemeTypes {
  if (typeof window === "undefined") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolvePierreThemeType(theme: Theme, systemThemeType: ThemeTypes): ThemeTypes {
  if (theme === "light" || theme === "dark") {
    return theme;
  }
  return systemThemeType;
}

function usePierreThemeType(theme: Theme): ThemeTypes {
  const [systemThemeType, setSystemThemeType] = useState<ThemeTypes>(getSystemPierreThemeType);

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemThemeType(event.matches ? "dark" : "light");
    };

    setSystemThemeType(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  return useMemo(() => resolvePierreThemeType(theme, systemThemeType), [systemThemeType, theme]);
}

function fileContentsForPreview(preview: ClaudeFilePreview): FileContents {
  return {
    name: preview.name || preview.path,
    contents: preview.content,
    cacheKey: `${preview.path}:${preview.size}:${preview.modifiedAt}`,
  };
}

function absolutePreviewPath(rootPath: string, relativePath: string) {
  return `${rootPath.replace(/\/$/, "")}/${relativePath}`;
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
    <div className="claude-overview-context-menu" role="menu" style={menuStyle}>
      <button
        type="button"
        role="menuitem"
        onClick={() => handleAction(() => onCreate(item, "file"))}
      >
        {t("claudeOverview.contextMenu.newFile")}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => handleAction(() => onCreate(item, "directory"))}
      >
        {t("claudeOverview.contextMenu.newFolder")}
      </button>
      <button type="button" role="menuitem" onClick={() => handleAction(() => onRename(item))}>
        {t("claudeOverview.contextMenu.rename")}
      </button>
      <div className="claude-overview-context-menu-separator" aria-hidden="true" />
      <button
        type="button"
        role="menuitem"
        className="danger"
        onClick={() => handleAction(() => onDelete(item))}
      >
        {t("claudeOverview.contextMenu.delete")}
      </button>
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
    <div className="claude-overview-name-dialog-overlay" onClick={onCancel}>
      <form
        className="claude-overview-name-dialog"
        aria-label={t(dialog.titleKey)}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="claude-overview-name-dialog-title">{t(dialog.titleKey)}</div>
        <label className="claude-overview-name-dialog-field">
          <span>{t("claudeOverview.nameLabel")}</span>
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <div className="claude-overview-name-dialog-actions">
          <button type="button" onClick={onCancel}>
            {t("confirm.cancel")}
          </button>
          <button type="submit">{t(dialog.confirmKey)}</button>
        </div>
      </form>
    </div>
  );
}

function ClaudeDirectoryTree({ paths, onSelectPath, renderContextMenu }: ClaudeDirectoryTreeProps) {
  const onSelectPathRef = useRef(onSelectPath);
  const lastHandledPathRef = useRef<{ path: string; timestamp: number } | null>(null);
  onSelectPathRef.current = onSelectPath;

  const handlePath = useCallback((path: string) => {
    const now = getMonotonicTime();
    const lastHandledPath = lastHandledPathRef.current;
    if (lastHandledPath?.path === path && now - lastHandledPath.timestamp < 80) {
      return;
    }
    lastHandledPathRef.current = { path, timestamp: now };
    onSelectPathRef.current(path);
  }, []);

  // 把 raw paths 转成 @pierre/trees 的 preparedInput,避免组件内反复整形大型路径列表
  const preparedInput = useMemo(() => prepareFileTreeInput(paths), [paths]);

  const { model } = useFileTree({
    preparedInput,
    dragAndDrop: false,
    flattenEmptyDirectories: false,
    initialExpansion: "closed",
    initialExpandedPaths: [],
    initialVisibleRowCount: 24,
    composition: {
      contextMenu: {
        enabled: true,
        triggerMode: "both",
        buttonVisibility: "when-needed",
      },
    },
    overscan: 8,
    onSelectionChange: (selectedPaths) => {
      const selectedPath = selectedPaths[selectedPaths.length - 1];
      if (selectedPath) {
        handlePath(normalizeTreePath(selectedPath));
      }
    },
    renaming: false,
    search: true,
    density: "compact",
    unsafeCSS: `
      button[data-type='item'] {
        border-radius: 6px;
      }
    `,
  });

  useEffect(() => {
    model.resetPaths(paths, { initialExpandedPaths: [] });
  }, [model, paths]);

  const handleTreeClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const clickedPath = getEventTreeItemPath(event);
      if (clickedPath) {
        handlePath(clickedPath);
      }
    },
    [handlePath],
  );

  return (
    <div className="claude-overview-file-tree-shell" onClickCapture={handleTreeClickCapture}>
      <FileTree
        model={model}
        className="claude-overview-file-tree"
        renderContextMenu={renderContextMenu}
      />
    </div>
  );
}

function ClaudeOverviewTreeLoading({ label }: { label: string }) {
  return (
    <div className="claude-overview-tree-loading" aria-busy="true" aria-live="polite">
      <div className="claude-overview-tree-loading-search" aria-hidden="true" />
      <div className="claude-overview-tree-loading-label">{label}</div>
      <div className="claude-overview-tree-loading-list" aria-hidden="true">
        {TREE_LOADING_ROWS.map((rowIndex) => (
          <span key={rowIndex} />
        ))}
      </div>
    </div>
  );
}

function ClaudeOverviewIconSprite() {
  return (
    <div
      className="claude-overview-icon-sprite"
      aria-hidden="true"
      // Pierre Trees 的内置图标以 symbol sprite 暴露；这里复用同一份 sprite 保持标签页图标一致。
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sprite 来自本地 @pierre/trees 包，不包含用户输入。
      dangerouslySetInnerHTML={{ __html: FILE_TREE_ICON_SPRITE_SHEET }}
    />
  );
}

function ClaudeOverviewFileIcon({ path }: { path: string }) {
  const icon = FILE_TREE_ICON_RESOLVER.resolveIcon(FILE_TREE_FILE_ICON_NAME, path);
  const iconToken = icon.token ?? "default";
  const iconWidth = icon.width ?? 16;
  const iconHeight = icon.height ?? 16;
  const iconStyle = useMemo<CSSProperties>(
    () => ({
      color: getBuiltInFileIconColor(iconToken),
    }),
    [iconToken],
  );

  return (
    <svg
      className="claude-overview-tab-file-icon"
      aria-hidden="true"
      data-icon-name={icon.remappedFrom ?? icon.name}
      data-icon-token={iconToken}
      height={iconHeight}
      style={iconStyle}
      viewBox={icon.viewBox ?? `0 0 ${iconWidth} ${iconHeight}`}
      width={iconWidth}
    >
      <use href={`#${icon.name.replace(/^#/, "")}`} />
    </svg>
  );
}

function ClaudeOverviewPage() {
  const { t, theme } = useI18n();
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
  const [treePaneWidth, setTreePaneWidth] = useState(readInitialTreePaneWidth);
  // Markdown 文件默认进入渲染预览，其它文件维持源码视图；切换 tab/打开新文件时按文件类型重置
  const [viewMode, setViewMode] = useState<PreviewViewMode>("source");
  const [nameDialog, setNameDialog] = useState<ClaudeOverviewNameDialogState | null>(null);
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<ClaudeOverviewDeleteState | null>(
    null,
  );
  const latestOverviewRequestIdRef = useRef(0);
  const latestPreviewRequestPathRef = useRef<string | null>(null);
  const latestTreePaneWidthRef = useRef(treePaneWidth);
  const openPreviewsRef = useRef<ClaudeFilePreview[]>([]);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeStateRef = useRef<{ startWidth: number; startX: number } | null>(null);
  const refreshBusyTimerRef = useRef<number | null>(null);

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
  const overviewBodyStyle = useMemo<ClaudeOverviewBodyStyle>(
    () => ({
      "--claude-overview-tree-width": `${treePaneWidth}px`,
    }),
    [treePaneWidth],
  );
  const activePreview = useMemo(
    () => openPreviews.find((preview) => preview.path === activePreviewPath) ?? null,
    [activePreviewPath, openPreviews],
  );
  const previewFile = useMemo(() => {
    if (!activePreview || activePreview.isBinary) {
      return null;
    }
    return fileContentsForPreview(activePreview);
  }, [activePreview]);
  const previewThemeType = usePierreThemeType(theme);
  const previewFileOptions = useMemo(
    () => ({
      ...PIERRE_FILE_OPTIONS,
      themeType: previewThemeType,
    }),
    [previewThemeType],
  );
  const previewContentStyle = useMemo<CSSProperties>(
    () => ({
      colorScheme: previewThemeType,
    }),
    [previewThemeType],
  );

  const selectedEntry = selectedPath ? entryByPath.get(selectedPath) : undefined;
  const activeEntry = activePreview
    ? (entryByPath.get(activePreview.path) ?? selectedEntry)
    : selectedEntry;

  useEffect(() => {
    openPreviewsRef.current = openPreviews;
  }, [openPreviews]);

  useEffect(
    () => () => {
      latestOverviewRequestIdRef.current += 1;
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
      if (refreshBusyTimerRef.current !== null) {
        window.clearTimeout(refreshBusyTimerRef.current);
        refreshBusyTimerRef.current = null;
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    [],
  );

  const applyTreePaneWidth = useCallback((nextWidth: number) => {
    const clampedWidth = clampTreePaneWidth(nextWidth);
    latestTreePaneWidthRef.current = clampedWidth;
    setTreePaneWidth(clampedWidth);
  }, []);

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
        const nextOverview = await invoke<ClaudeDirectoryOverview>("get_claude_directory_overview");
        if (latestOverviewRequestIdRef.current !== requestId) {
          return;
        }
        cachedClaudeOverviewState = nextOverview;
        startTransition(() => {
          setOverview(nextOverview);
          setLoadingOverview(false);
        });
      } catch {
        if (latestOverviewRequestIdRef.current !== requestId) {
          return;
        }
        if (!preserveCurrent) {
          cachedClaudeOverviewState = null;
          startTransition(() => {
            setOverview(EMPTY_OVERVIEW_STATE);
          });
        }
        setLoadingOverview(false);
        showToast(t("claudeOverview.loadError"), "error");
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
        const nextPreview = await invoke<ClaudeFilePreview>("read_claude_file_preview", { path });
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
      } catch {
        showToast(t("claudeOverview.previewError"), "error");
      } finally {
        setLoadingPreviewPath((currentPath) => (currentPath === path ? null : currentPath));
      }
    },
    [showToast, t],
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
          await invoke("create_claude_directory_entry", {
            parentPath: nameDialog.parentPath,
            name: trimmedName,
            kind: nameDialog.kind,
          });
          showToast(t("claudeOverview.createSuccess"));
        } else if (nameDialog.path) {
          const sourcePath = nameDialog.path;
          const destinationPath = joinClaudeRelativePath(nameDialog.parentPath, trimmedName);
          await invoke("rename_claude_directory_entry", {
            path: sourcePath,
            newName: trimmedName,
          });
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
      } catch {
        showToast(t("claudeOverview.operationError"), "error");
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
      await invoke("delete_claude_directory_entry", { path: deletedPath });
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
    } catch {
      showToast(t("claudeOverview.operationError"), "error");
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
    } catch {
      showToast(t("claudeOverview.pathCopyError"), "error");
    }
  }, [activePreview, overview.rootPath, showToast, t]);

  const handleOpenInFileBrowser = useCallback(async () => {
    if (!activePreview) {
      return;
    }
    try {
      await revealItemInDir(absolutePreviewPath(overview.rootPath, activePreview.path));
    } catch {
      showToast(t("claudeOverview.openFileBrowserError"), "error");
    }
  }, [activePreview, overview.rootPath, showToast, t]);

  const handleOpenInEditor = useCallback(async () => {
    if (!activePreview) {
      return;
    }
    try {
      await invoke("open_claude_file_in_editor", { path: activePreview.path });
    } catch {
      showToast(t("claudeOverview.openEditorError"), "error");
    }
  }, [activePreview, showToast, t]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      resizeStateRef.current = {
        startWidth: latestTreePaneWidthRef.current,
        startX: event.clientX,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const applyPointerWidth = (clientX: number) => {
        const resizeState = resizeStateRef.current;
        if (!resizeState) {
          return;
        }
        applyTreePaneWidth(resizeState.startWidth - (clientX - resizeState.startX));
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current);
        }
        resizeFrameRef.current = window.requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          applyPointerWidth(moveEvent.clientX);
        });
      };

      const finishResize = (endEvent: PointerEvent) => {
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current);
          resizeFrameRef.current = null;
        }
        applyPointerWidth(endEvent.clientX);
        resizeStateRef.current = null;
        saveTreePaneWidth(latestTreePaneWidthRef.current);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", finishResize);
        window.removeEventListener("pointercancel", finishResize);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", finishResize, { once: true });
      window.addEventListener("pointercancel", finishResize, { once: true });
    },
    [applyTreePaneWidth],
  );

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const currentWidth = latestTreePaneWidthRef.current;
      let nextWidth: number | null = null;

      if (event.key === "ArrowLeft") {
        nextWidth = currentWidth + TREE_PANE_WIDTH_STEP;
      } else if (event.key === "ArrowRight") {
        nextWidth = currentWidth - TREE_PANE_WIDTH_STEP;
      } else if (event.key === "Home") {
        nextWidth = MIN_TREE_PANE_WIDTH;
      } else if (event.key === "End") {
        nextWidth = MAX_TREE_PANE_WIDTH;
      }

      if (nextWidth === null) {
        return;
      }

      event.preventDefault();
      applyTreePaneWidth(nextWidth);
      saveTreePaneWidth(nextWidth);
    },
    [applyTreePaneWidth],
  );

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

  // 首帧未 paint 骨架屏前,或没有任何已知数据且仍在加载时,展示骨架屏;一旦树有数据,刷新走 resetPaths 平滑替换
  const showTreeLoading =
    !hasMounted || ((loadingOverview || treeEntriesPending) && treePaths.length === 0);
  const treeLoadingLabel = loadingOverview
    ? t("claudeOverview.scanning")
    : t("claudeOverview.preparingTree");

  return (
    <section className="claude-overview-page" aria-labelledby="claude-overview-title">
      {hasMounted ? <ClaudeOverviewIconSprite /> : null}
      <header className="claude-overview-header">
        <div className="claude-overview-title-group">
          <h1 id="claude-overview-title">{t("claudeOverview.title")}</h1>
          <p>{overview.rootPath}</p>
        </div>
        <div className="claude-overview-status">
          <span>
            {t("claudeOverview.loadedEntryCount").replace(
              "{count}",
              String(overview.entries.length),
            )}
          </span>
          {overview.reachedEntryLimit ? (
            <span>
              {t("claudeOverview.truncatedEntries").replace("{count}", String(overview.maxEntries))}
            </span>
          ) : null}
          {overview.skippedSymlinkCount > 0 ? (
            <span>
              {t("claudeOverview.skippedSymlinks").replace(
                "{count}",
                String(overview.skippedSymlinkCount),
              )}
            </span>
          ) : null}
          {overview.skippedNodeModulesCount > 0 ? (
            <span>
              {t("claudeOverview.skippedNodeModules").replace(
                "{count}",
                String(overview.skippedNodeModulesCount),
              )}
            </span>
          ) : null}
        </div>
        <div className="claude-overview-actions">
          <button
            type="button"
            onClick={handleRefreshClick}
            disabled={isRefreshButtonBusy}
            aria-busy={isRefreshButtonBusy}
          >
            {/* 双 span 叠加保证按钮宽度始终按最长文案预留,切换状态时不抖动相邻元素 */}
            <span className="claude-overview-refresh-button-stack">
              <span data-active={isRefreshButtonBusy}>{t("claudeOverview.refreshing")}</span>
              <span data-active={!isRefreshButtonBusy}>{t("claudeOverview.refresh")}</span>
            </span>
          </button>
        </div>
      </header>

      <div className="claude-overview-body" style={overviewBodyStyle}>
        <section className="claude-overview-preview-pane" aria-label={t("claudeOverview.preview")}>
          {openPreviews.length > 0 ? (
            <div
              className="claude-overview-tabs"
              role="tablist"
              aria-label={t("claudeOverview.openFiles")}
            >
              {openPreviews.map((openedPreview) => {
                const isActive = openedPreview.path === activePreviewPath;
                return (
                  <div
                    key={openedPreview.path}
                    className={`claude-overview-tab-shell ${isActive ? "active" : ""}`}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className="claude-overview-tab"
                      onClick={() => handleSelectPreviewTab(openedPreview.path)}
                    >
                      <ClaudeOverviewFileIcon path={openedPreview.path} />
                      <span className="claude-overview-tab-label">
                        {openedPreview.name || openedPreview.path}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="claude-overview-tab-close"
                      aria-label={t("claudeOverview.closePreview").replace(
                        "{name}",
                        openedPreview.name || openedPreview.path,
                      )}
                      onClick={() => handleClosePreview(openedPreview.path)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {loadingPreviewPath && !activePreview ? (
            <div className="claude-overview-empty">{t("loading")}</div>
          ) : activePreview ? (
            <>
              <div className="claude-overview-preview-toolbar">
                {!activePreview.isBinary && isMarkdownPath(activePreview.path) ? (
                  <div className="claude-overview-preview-view-toggle">
                    <button
                      type="button"
                      aria-label={
                        viewMode === "preview"
                          ? t("claudeOverview.toggleToSource")
                          : t("claudeOverview.toggleToPreview")
                      }
                      title={
                        viewMode === "preview"
                          ? t("claudeOverview.toggleToSource")
                          : t("claudeOverview.toggleToPreview")
                      }
                      aria-pressed={viewMode === "preview"}
                      onClick={() =>
                        setViewMode((current) => (current === "preview" ? "source" : "preview"))
                      }
                    >
                      {viewMode === "preview" ? <CodeIcon /> : <EyeIcon />}
                    </button>
                  </div>
                ) : null}
                <div className="claude-overview-preview-actions">
                  <button
                    type="button"
                    aria-label={t("claudeOverview.copyPath")}
                    title={t("claudeOverview.copyPath")}
                    onClick={handleCopyPath}
                  >
                    <CopyIcon />
                  </button>
                  <button
                    type="button"
                    aria-label={t("claudeOverview.openFileBrowser")}
                    title={t("claudeOverview.openFileBrowser")}
                    onClick={handleOpenInFileBrowser}
                  >
                    <ExternalLinkIcon />
                  </button>
                  <button
                    type="button"
                    aria-label={t("claudeOverview.openEditor")}
                    title={t("claudeOverview.openEditor")}
                    onClick={handleOpenInEditor}
                  >
                    <EditIcon />
                  </button>
                </div>
              </div>
              {activePreview.isBinary ? (
                <div className="claude-overview-empty">{t("claudeOverview.binaryFile")}</div>
              ) : isMarkdownPath(activePreview.path) && viewMode === "preview" ? (
                <MarkdownPreview
                  className="claude-overview-preview-content claude-overview-markdown"
                  content={activePreview.content}
                  themeType={previewThemeType === "dark" ? "dark" : "light"}
                />
              ) : previewFile ? (
                <PierreFile
                  className="claude-overview-preview-content"
                  file={previewFile}
                  options={previewFileOptions}
                  style={previewContentStyle}
                  disableWorkerPool
                />
              ) : null}
              <div className="claude-overview-preview-footer">
                <div className="claude-overview-preview-summary">
                  <span>{formatBytes(activePreview.size)}</span>
                  <span>
                    {formatModifiedAt(activeEntry?.modifiedAt ?? activePreview.modifiedAt)}
                  </span>
                  <span>{formatPreviewEncoding(activePreview.encoding, t)}</span>
                  {activePreview.truncated ? (
                    <span>{t("claudeOverview.fileTruncated")}</span>
                  ) : null}
                </div>
              </div>
            </>
          ) : selectedEntry?.kind === "directory" ? (
            <div className="claude-overview-empty">{t("claudeOverview.directorySelected")}</div>
          ) : (
            <div className="claude-overview-empty">{t("claudeOverview.selectHint")}</div>
          )}
        </section>

        <div
          className="claude-overview-resizer"
          role="separator"
          aria-label={t("claudeOverview.resizePanes")}
          aria-orientation="vertical"
          aria-valuemin={MIN_TREE_PANE_WIDTH}
          aria-valuemax={MAX_TREE_PANE_WIDTH}
          aria-valuenow={treePaneWidth}
          tabIndex={0}
          onKeyDown={handleResizeKeyDown}
          onPointerDown={handleResizePointerDown}
        />

        <section className="claude-overview-tree-pane" aria-label={t("claudeOverview.tree")}>
          {showTreeLoading ? (
            <ClaudeOverviewTreeLoading label={treeLoadingLabel} />
          ) : treePaths.length > 0 ? (
            <div className="claude-overview-tree-ready">
              <ClaudeDirectoryTree
                paths={treePaths}
                onSelectPath={handleSelectPath}
                renderContextMenu={renderTreeContextMenu}
              />
            </div>
          ) : (
            <div className="claude-overview-empty">{t("claudeOverview.empty")}</div>
          )}
        </section>
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
        <ConfirmDialog
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
