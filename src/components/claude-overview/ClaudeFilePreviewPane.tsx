import type { FileOptions, ThemeTypes } from "@pierre/diffs/react";
import { File as PierreFile } from "@pierre/diffs/react";
import { Code2, Copy, ExternalLink, Eye, SquarePen, X } from "lucide-react";
import { type CSSProperties, useMemo } from "react";
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
  t: (key: TranslationKey) => string;
  onSelectPreviewTab: (path: string) => void;
  onClosePreview: (path: string) => void;
  onToggleViewMode: () => void;
  onCopyPath: () => void;
  onOpenFileBrowser: () => void;
  onOpenEditor: () => void;
}

const PIERRE_FILE_OPTIONS = {
  disableFileHeader: true,
  overflow: "scroll",
  theme: {
    dark: "pierre-dark",
    light: "pierre-light",
  },
  tokenizeMaxLineLength: 2000,
} satisfies FileOptions<undefined>;

export function ClaudeFilePreviewPane({
  openPreviews,
  activePreview,
  activePreviewPath,
  activeEntry,
  selectedEntry,
  loadingPreviewPath,
  viewMode,
  previewThemeType,
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
            <PierreFile
              className="claude-overview-preview-content block min-h-0 flex-1 overflow-auto"
              file={previewFile}
              options={previewFileOptions}
              style={previewContentStyle}
              disableWorkerPool
            />
          ) : null}
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
