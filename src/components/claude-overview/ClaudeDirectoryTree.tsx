import {
  type ContextMenuItem,
  type ContextMenuOpenContext,
  createFileTreeIconResolver,
  type FileTreeDirectoryHandle,
  type FileTreeItemHandle,
  getBuiltInSpriteSheet,
  prepareFileTreeInput,
} from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { cn } from "@/lib/utils";
import { normalizeTreePath } from "./file-viewer-utils";

export type ClaudeOverviewTreeContextMenuRenderer = (
  item: ContextMenuItem,
  context: ContextMenuOpenContext,
) => ReactNode;

interface ClaudeDirectoryTreeProps {
  paths: string[];
  onSelectPath: (path: string) => void;
  renderContextMenu?: ClaudeOverviewTreeContextMenuRenderer;
}

const TREE_LOADING_ROWS = Array.from({ length: 11 }, (_, index) => index);
const TREE_LOADING_ROW_CLASS_NAMES = [
  "w-[62%]",
  "w-[48%]",
  "w-[76%]",
  "ml-[18px] w-[58%]",
  "ml-[18px] w-[70%]",
  "w-[52%]",
  "w-[82%]",
  "ml-[18px] w-[64%]",
  "ml-[36px] w-[44%]",
  "w-[72%]",
  "w-[55%]",
] as const;
const FILE_TREE_FILE_ICON_NAME = "file-tree-icon-file";
const FILE_TREE_ICON_RESOLVER = createFileTreeIconResolver();
const FILE_TREE_ICON_SPRITE_SHEET = getBuiltInSpriteSheet("complete");
const FILE_TREE_THEME_STYLE = {
  "--trees-accent-override": "var(--primary)",
  "--trees-bg-muted-override": "var(--muted)",
  "--trees-bg-override": "var(--card)",
  "--trees-border-color-override": "var(--border)",
  "--trees-fg-override": "var(--foreground)",
  "--trees-fg-muted-override": "var(--muted-foreground)",
  "--trees-focus-ring-color-override": "var(--ring)",
  "--trees-font-size-override": "0.8125rem",
  "--trees-input-bg-override": "var(--card)",
  "--trees-item-height": "1.75rem",
  "--trees-search-bg-override": "var(--card)",
  "--trees-search-fg-override": "var(--foreground)",
  "--trees-search-font-weight-override": "500",
  "--trees-selected-bg-override": "var(--accent)",
  "--trees-selected-fg-override": "var(--foreground)",
} as CSSProperties;

// 选择去重窗口（毫秒）：onSelectionChange 与 click 兜底两条通道可能对同一次点击各触发一次，
// 在此窗口内对同一路径只处理一次，避免重复打开/聚焦预览。
const TREE_SELECT_DEDUPE_MS = 80;

// @pierre/trees(beta) 暂无 row-click / item-activate 回调，onSelectionChange 仅在选择「变化」时触发，
// 无法捕获「重复点击已选中项以重开/聚焦预览」。故用事件委托从被点击元素读 data-itemPath 兜底，
// 与 onSelectionChange 通过 TREE_SELECT_DEDUPE_MS 去重。库补齐 activate 回调后可移除本通道。
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

function isFileTreeDirectoryHandle(
  item: FileTreeItemHandle | null,
): item is FileTreeDirectoryHandle {
  return item?.isDirectory() === true && "isExpanded" in item;
}

export function ClaudeDirectoryTree({
  paths,
  onSelectPath,
  renderContextMenu,
}: ClaudeDirectoryTreeProps) {
  const onSelectPathRef = useRef(onSelectPath);
  const lastHandledPathRef = useRef<{ path: string; timestamp: number } | null>(null);
  const previousPathsRef = useRef(paths);
  onSelectPathRef.current = onSelectPath;

  const handlePath = useCallback((path: string) => {
    const now = getMonotonicTime();
    const lastHandledPath = lastHandledPathRef.current;
    if (lastHandledPath?.path === path && now - lastHandledPath.timestamp < TREE_SELECT_DEDUPE_MS) {
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
    composition: renderContextMenu
      ? {
          contextMenu: {
            enabled: true,
            triggerMode: "both",
            buttonVisibility: "when-needed",
          },
        }
      : undefined,
    overscan: 16,
    onSelectionChange: (selectedPaths) => {
      const selectedPath = selectedPaths[selectedPaths.length - 1];
      if (selectedPath) {
        handlePath(normalizeTreePath(selectedPath));
      }
    },
    renaming: false,
    search: true,
    // 当前库默认即 hide-non-matches（官方推荐），显式声明以防御未来 beta 默认变更。
    fileTreeSearchMode: "hide-non-matches",
    density: "compact",
    // 借「行装饰」渲染主文件名 + 下方 unsafeCSS 隐藏库默认 content 段，是为了实现单行省略号：
    // @pierre/trees(beta) 默认主标签不支持 truncate/ellipsis。库支持主标签 truncate 后，
    // 可回归默认渲染并删除该段 unsafeCSS。
    renderRowDecoration: ({ item }) => ({
      text: item.name,
      title: item.name,
    }),
    unsafeCSS: `
      button[data-type='item'] {
        border-radius: 6px;
      }

      [data-file-tree-search-container] {
        margin-bottom: 0.25rem;
        padding-block: 0.75rem 0.5rem;
        padding-inline: 0.75rem;
      }

      [data-file-tree-search-input] {
        height: 2rem;
        padding-inline: 0.75rem;
        color: var(--foreground);
        background-color: var(--card);
        border-color: var(--border);
        border-radius: 0.5rem;
        box-shadow: none;
        transition:
          background-color 150ms ease,
          border-color 150ms ease,
          box-shadow 150ms ease;
      }

      [data-file-tree-search-input]:hover {
        background-color: var(--muted);
        border-color: color-mix(in oklch, var(--muted-foreground) 45%, var(--border));
      }

      [data-file-tree-search-input]:focus-visible,
      [data-file-tree-search-input][data-file-tree-search-input-fake-focus='true'] {
        background-color: var(--card);
        border-color: var(--primary);
        outline: none;
        box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 42%, transparent);
      }

      /* 省略号 workaround（见上方 renderRowDecoration 注释）：隐藏库默认主标签 content 段，
         改由 decoration 段渲染并 truncate。库支持主标签 truncate 后可整段删除。 */
      button[data-type='item']:not(:has([data-item-rename-input])) > [data-item-section='content'] {
        flex: 0 0 0;
        min-width: 0;
        visibility: hidden;
        width: 0;
      }

      button[data-type='item'] > [data-item-section='decoration'] {
        color: inherit;
        flex: 1 1 auto;
        justify-content: flex-start;
        text-align: start;
      }

      button[data-type='item'] > [data-item-section='decoration'] > span {
        color: inherit;
        justify-content: flex-start;
        min-width: 0;
        overflow: hidden;
        text-align: start;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
  });

  useEffect(() => {
    const nextPathSet = new Set(paths);
    const initialExpandedPaths = previousPathsRef.current.filter((path) => {
      if (!path.endsWith("/") || !nextPathSet.has(path)) {
        return false;
      }
      const item = model.getItem(path);
      return isFileTreeDirectoryHandle(item) && item.isExpanded();
    });
    model.resetPaths(paths, { preparedInput, initialExpandedPaths });
    previousPathsRef.current = paths;
  }, [model, paths, preparedInput]);

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
    <div
      className="claude-overview-file-tree-shell h-full min-h-0"
      style={FILE_TREE_THEME_STYLE}
      onClickCapture={handleTreeClickCapture}
    >
      <FileTree
        model={model}
        className="claude-overview-file-tree h-full w-full bg-card text-foreground"
        renderContextMenu={renderContextMenu}
      />
    </div>
  );
}

export function ClaudeOverviewTreeLoading({ label }: { label: string }) {
  return (
    <div
      className="claude-overview-tree-loading flex h-full min-h-0 flex-col gap-3 text-muted-foreground"
      aria-busy="true"
      aria-live="polite"
    >
      <div
        className="claude-overview-tree-loading-search h-8 shrink-0 rounded-md border bg-background"
        aria-hidden="true"
      />
      <div className="claude-overview-tree-loading-label px-2 text-xs leading-snug">{label}</div>
      <div
        className="claude-overview-tree-loading-list flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
        aria-hidden="true"
      >
        {TREE_LOADING_ROWS.map((rowIndex) => (
          <span
            key={rowIndex}
            className={cn(
              "h-[18px] rounded-sm bg-muted motion-safe:animate-pulse",
              TREE_LOADING_ROW_CLASS_NAMES[rowIndex],
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function ClaudeOverviewIconSprite() {
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

export function ClaudeOverviewFileIcon({ path }: { path: string }) {
  const icon = FILE_TREE_ICON_RESOLVER.resolveIcon(FILE_TREE_FILE_ICON_NAME, path);
  const iconToken = icon.token ?? "default";
  const iconWidth = icon.width ?? 16;
  const iconHeight = icon.height ?? 16;

  return (
    <svg
      className="claude-overview-tab-file-icon"
      aria-hidden="true"
      data-icon-name={icon.remappedFrom ?? icon.name}
      data-icon-token={iconToken}
      data-testid="claude-overview-tab-file-icon"
      height={iconHeight}
      viewBox={icon.viewBox ?? `0 0 ${iconWidth} ${iconHeight}`}
      width={iconWidth}
    >
      <use href={`#${icon.name.replace(/^#/, "")}`} />
    </svg>
  );
}
