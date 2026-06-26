import type {
  FileOptions,
  ThemeTypes,
  WorkerInitializationRenderOptions,
  WorkerPoolOptions,
} from "@pierre/diffs/react";
import { File as PierreFile, Virtualizer, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { Code2, Copy, ExternalLink, Eye, SquarePen, X } from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TranslationKey } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ClaudeDirectoryEntry, ClaudeFilePreview } from "@/types";
import { Button } from "../ui/button";
import { ClaudeOverviewFileIcon } from "./ClaudeDirectoryTree";
import {
  fileContentsForPreview,
  formatBytes,
  formatModifiedAt,
  formatPreviewEncoding,
  isMarkdownPath,
  type PreviewViewMode,
} from "./file-viewer-utils";
import MarkdownPreview from "./MarkdownPreview";

interface ClaudeFilePreviewPaneProps {
  openPreviews: ClaudeFilePreview[];
  activePreview: ClaudeFilePreview | null;
  activePreviewPath: string | null;
  activeEntry?: ClaudeDirectoryEntry;
  selectedEntry?: ClaudeDirectoryEntry;
  loadingPreviewPath: string | null;
  viewMode: PreviewViewMode;
  previewThemeType: ThemeTypes;
  isResizing?: boolean;
  t: (key: TranslationKey) => string;
  onSelectPreviewTab: (path: string) => void;
  onClosePreview: (path: string) => void;
  onToggleViewMode: () => void;
  onCopyPath: () => void;
  onOpenFileBrowser: () => void;
  onOpenEditor: () => void;
}

const PIERRE_FILE_THEME = {
  dark: "pierre-dark",
  light: "pierre-light",
} as const;
const PIERRE_TOKENIZE_MAX_LINE_LENGTH = 2000;
// 渲染遮罩的兜底超时：Pierre 仅在成功渲染时回调 onPostRender，worker 高亮失败
// （tokenize 出错 / worker 加载被拦截 / worker 崩溃）时不会触发，超时后强制清除遮罩，
// 避免文件永久卡在“正在渲染预览”而无法查看。
const PIERRE_RENDER_TIMEOUT_MS = 8000;

const PIERRE_FILE_OPTIONS = {
  disableFileHeader: true,
  overflow: "scroll",
  theme: PIERRE_FILE_THEME,
  tokenizeMaxLineLength: PIERRE_TOKENIZE_MAX_LINE_LENGTH,
} satisfies FileOptions<undefined>;

const PIERRE_WORKER_POOL_OPTIONS = {
  poolSize: 2,
  workerFactory: () =>
    new Worker(new URL("@pierre/diffs/worker/worker-portable.js", import.meta.url), {
      type: "module",
    }),
} satisfies WorkerPoolOptions;

const PIERRE_WORKER_HIGHLIGHTER_OPTIONS = {
  langs: ["json", "jsonl", "markdown", "zsh", "toml", "yaml"],
  theme: PIERRE_FILE_THEME,
  tokenizeMaxLineLength: PIERRE_TOKENIZE_MAX_LINE_LENGTH,
} satisfies WorkerInitializationRenderOptions;

interface PierreSourcePreviewProps {
  file: ReturnType<typeof fileContentsForPreview>;
  options: FileOptions<undefined>;
  style: CSSProperties;
  previewThemeType: ThemeTypes;
  t: (key: TranslationKey) => string;
}

function PierreSourcePreview({
  file,
  options,
  style,
  previewThemeType,
  t,
}: PierreSourcePreviewProps) {
  // Pierre 在 Virtualizer 上下文中创建的 VirtualizedFile 会复用实例，其 render 用 `this.file ??= file`
  // 只认首个文件，切换文件不会更新内容。用 fileKey 作为 PierreFile 的 key 强制重建实例，避免 stale。
  const fileKey = file.cacheKey ?? `${file.name}:${file.contents.length}`;
  const renderKey = `${fileKey}:${previewThemeType}`;
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  const handlePostRender = useCallback<NonNullable<FileOptions<undefined>["onPostRender"]>>(() => {
    setRenderedKey(renderKey);
  }, [renderKey]);
  const optionsWithPostRender = useMemo(
    () => ({
      ...options,
      onPostRender: handlePostRender,
    }),
    [handlePostRender, options],
  );
  const isRendering = renderedKey !== renderKey;

  // 兜底：onPostRender 在 worker 高亮失败时不会触发，超时后强制清除遮罩，避免文件永久不可见。
  useEffect(() => {
    if (!isRendering) {
      return;
    }
    const timer = setTimeout(() => {
      setRenderedKey(renderKey);
    }, PIERRE_RENDER_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isRendering, renderKey]);

  return (
    <div className="claude-overview-source-preview relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <WorkerPoolContextProvider
        highlighterOptions={PIERRE_WORKER_HIGHLIGHTER_OPTIONS}
        poolOptions={PIERRE_WORKER_POOL_OPTIONS}
      >
        <Virtualizer
          className="claude-overview-preview-content block min-h-0 flex-1 overflow-auto"
          contentClassName="min-w-full"
        >
          <PierreFile
            key={fileKey}
            className="block min-w-full"
            file={file}
            options={optionsWithPostRender}
            style={style}
          />
        </Virtualizer>
      </WorkerPoolContextProvider>
      {isRendering ? (
        <div className="claude-overview-rendering-preview pointer-events-none absolute inset-0 flex items-center justify-center bg-card/95 p-5 text-center text-sm leading-relaxed text-muted-foreground">
          {t("claudeOverview.renderingPreview")}
        </div>
      ) : null}
    </div>
  );
}

export function ClaudeFilePreviewPane({
  openPreviews,
  activePreview,
  activePreviewPath,
  activeEntry,
  selectedEntry,
  loadingPreviewPath,
  viewMode,
  previewThemeType,
  isResizing,
  t,
  onSelectPreviewTab,
  onClosePreview,
  onToggleViewMode,
  onCopyPath,
  onOpenFileBrowser,
  onOpenEditor,
}: ClaudeFilePreviewPaneProps) {
  const previewFile = useMemo(() => {
    if (!activePreview || activePreview.isBinary) {
      return null;
    }
    return fileContentsForPreview(activePreview);
  }, [
    activePreview?.path,
    activePreview?.size,
    activePreview?.modifiedAt,
    activePreview?.content,
    activePreview?.isBinary,
    activePreview,
  ]);
  const previewFileOptions = useMemo(
    () => ({
      ...PIERRE_FILE_OPTIONS,
      themeType: previewThemeType,
    }),
    [previewThemeType],
  );
  const previewContentStyle = useMemo<CSSProperties>(
    () =>
      ({
        colorScheme: previewThemeType,
        "--diffs-dark": "var(--foreground)",
        "--diffs-dark-bg": "var(--card)",
        "--diffs-font-family": '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
        "--diffs-font-size": "0.875rem",
        "--diffs-gap-block": "1rem",
        "--diffs-gap-inline": "1.25rem",
        "--diffs-light": "var(--foreground)",
        "--diffs-light-bg": "var(--card)",
        "--diffs-line-height": "1.55",
      }) as CSSProperties,
    [previewThemeType],
  );

  // 拖拽分隔条期间冻结预览内容容器的宽度，避免 CodeMirror / Markdown 随容器尺寸持续重排（reflow）。
  // 只固定容器尺寸而不卸载内容：拖拽中容器尺寸不变，内部 ResizeObserver 不触发；松开后只重排一次，
  // 既不卡顿也不会因重新挂载大文件导致松手后的二次卡顿。
  // 窄屏纵向堆叠时拖拽改变的是高度、宽度不变，冻结宽度无副作用；此优化主要针对宽屏横向拖拽。
  const contentFreezeRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = contentFreezeRef.current;
    if (!el) {
      return;
    }
    if (isResizing) {
      const width = el.getBoundingClientRect().width;
      if (width > 0) {
        el.style.flex = "0 0 auto";
        el.style.width = `${width}px`;
      }
    } else {
      el.style.flex = "";
      el.style.width = "";
    }
  }, [isResizing]);

  return (
    <>
      {openPreviews.length > 0 ? (
        <div
          className="claude-overview-tabs flex min-h-8 shrink-0 items-end gap-1 overflow-x-auto border-b bg-card/95 px-4 pt-1.5"
          role="tablist"
          aria-label={t("claudeOverview.openFiles")}
        >
          {openPreviews.map((openedPreview) => {
            const isActive = openedPreview.path === activePreviewPath;
            return (
              <div
                key={openedPreview.path}
                className={cn(
                  "claude-overview-tab-shell flex h-7 min-w-0 max-w-60 shrink-0 items-center overflow-hidden rounded-t-md border border-b-0 bg-muted",
                  isActive && "active bg-background",
                )}
              >
                <Button
                  type="button"
                  role="tab"
                  variant="ghost"
                  aria-selected={isActive}
                  className="claude-overview-tab h-full min-w-0 flex-1 justify-start gap-1.5 overflow-hidden bg-transparent px-2.5 font-mono text-sm aria-selected:text-foreground aria-[selected=false]:text-muted-foreground"
                  onClick={() => onSelectPreviewTab(openedPreview.path)}
                >
                  <ClaudeOverviewFileIcon path={openedPreview.path} />
                  <span className="claude-overview-tab-label block min-w-0 flex-1 truncate">
                    {openedPreview.name || openedPreview.path}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="claude-overview-tab-close mr-0.5 size-6 shrink-0 rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  aria-label={t("claudeOverview.closePreview").replace(
                    "{name}",
                    openedPreview.name || openedPreview.path,
                  )}
                  onClick={() => onClosePreview(openedPreview.path)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

      {loadingPreviewPath && !activePreview ? (
        <div className="claude-overview-empty flex min-h-[180px] flex-1 items-center justify-center p-5 text-center leading-relaxed text-muted-foreground">
          {t("loading")}
        </div>
      ) : activePreview ? (
        <>
          <div
            className="claude-overview-preview-toolbar flex min-h-[38px] shrink-0 flex-nowrap items-center justify-end gap-3 border-b bg-card/95 px-4 py-1 max-[700px]:flex-col max-[700px]:items-start"
            data-testid="claude-overview-preview-toolbar"
          >
            {!activePreview.isBinary && isMarkdownPath(activePreview.path) ? (
              <div className="claude-overview-preview-view-toggle mr-auto flex items-center max-[700px]:mr-0">
                <Button
                  type="button"
                  variant={viewMode === "preview" ? "secondary" : "outline"}
                  size="icon-sm"
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
                  onClick={onToggleViewMode}
                >
                  {viewMode === "preview" ? (
                    <Code2 className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-[18px]" aria-hidden="true" />
                  )}
                </Button>
              </div>
            ) : null}
            <div className="claude-overview-preview-actions flex shrink-0 flex-wrap items-center justify-end gap-2 max-[700px]:justify-start">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t("claudeOverview.copyPath")}
                title={t("claudeOverview.copyPath")}
                onClick={onCopyPath}
              >
                <Copy className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t("claudeOverview.openFileBrowser")}
                title={t("claudeOverview.openFileBrowser")}
                onClick={onOpenFileBrowser}
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t("claudeOverview.openEditor")}
                title={t("claudeOverview.openEditor")}
                onClick={onOpenEditor}
              >
                <SquarePen className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div
            ref={contentFreezeRef}
            className="claude-overview-preview-body flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
            {activePreview.isBinary ? (
              <div className="claude-overview-empty flex min-h-[180px] flex-1 items-center justify-center p-5 text-center leading-relaxed text-muted-foreground">
                {t("claudeOverview.binaryFile")}
              </div>
            ) : isMarkdownPath(activePreview.path) && viewMode === "preview" ? (
              <MarkdownPreview
                className={cn(
                  "claude-overview-preview-content claude-overview-markdown flex-1 overflow-auto bg-transparent px-5 py-4 text-sm",
                  previewThemeType === "dark" ? "markdown-dark" : "markdown-light",
                )}
                content={activePreview.content}
                themeType={previewThemeType === "dark" ? "dark" : "light"}
              />
            ) : previewFile ? (
              <PierreSourcePreview
                file={previewFile}
                options={previewFileOptions}
                previewThemeType={previewThemeType}
                style={previewContentStyle}
                t={t}
              />
            ) : null}
          </div>
          <div
            className="claude-overview-preview-footer flex min-h-[34px] shrink-0 items-center border-t bg-card/95 px-4 py-1 max-[700px]:flex-col max-[700px]:items-start"
            data-testid="claude-overview-preview-footer"
          >
            <div className="claude-overview-preview-summary flex min-w-0 items-center gap-2 overflow-hidden truncate whitespace-nowrap text-xs leading-tight text-muted-foreground">
              <span>{formatBytes(activePreview.size)}</span>
              <span>{formatModifiedAt(activeEntry?.modifiedAt ?? activePreview.modifiedAt)}</span>
              <span>{formatPreviewEncoding(activePreview.encoding, t)}</span>
              {activePreview.truncated ? <span>{t("claudeOverview.fileTruncated")}</span> : null}
            </div>
          </div>
        </>
      ) : selectedEntry?.kind === "directory" ? (
        <div className="claude-overview-empty flex min-h-[180px] flex-1 items-center justify-center p-5 text-center leading-relaxed text-muted-foreground">
          {t("claudeOverview.directorySelected")}
        </div>
      ) : (
        <div className="claude-overview-empty flex min-h-[180px] flex-1 items-center justify-center p-5 text-center leading-relaxed text-muted-foreground">
          {t("claudeOverview.selectHint")}
        </div>
      )}
    </>
  );
}
