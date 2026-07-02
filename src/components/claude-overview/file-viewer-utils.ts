import type { FileContents } from "@pierre/diffs/react";
import type { TranslationKey } from "@/i18n";
import { formatDateTime, formatNumber } from "@/i18n/format";
import type { ClaudeDirectoryEntry, ClaudeFilePreview } from "@/types";

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

export type PreviewViewMode = "preview" | "source";

// 根据文件路径后缀判断是否为 Markdown，用于决定是否启用渲染预览
export function isMarkdownPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MARKDOWN_EXTENSIONS.has(ext);
}

// 切换到目标文件时计算默认视图：Markdown 默认渲染预览，其它一律源码
export function defaultViewModeForPath(path: string | null | undefined): PreviewViewMode {
  return path && isMarkdownPath(path) ? "preview" : "source";
}

export function treePathForEntry(entry: ClaudeDirectoryEntry) {
  return entry.kind === "directory" ? `${entry.path}/` : entry.path;
}

export function normalizeTreePath(path: string) {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${formatNumber(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${formatNumber(bytes / 1024, undefined, { maximumFractionDigits: 1 })} KB`;
  }
  return `${formatNumber(bytes / 1024 / 1024, undefined, { maximumFractionDigits: 1 })} MB`;
}

export function formatModifiedAt(timestamp: number) {
  if (!timestamp) {
    return "-";
  }
  return formatDateTime(timestamp * 1000);
}

export function formatPreviewEncoding(
  encoding: string | undefined,
  t: (key: TranslationKey) => string,
) {
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

export function fileContentsForPreview(preview: ClaudeFilePreview): FileContents {
  return {
    name: preview.name || preview.path,
    contents: preview.content,
    cacheKey: `${preview.path}:${preview.size}:${preview.modifiedAt}`,
  };
}

export function absolutePreviewPath(rootPath: string, relativePath: string) {
  return `${rootPath.replace(/\/$/, "")}/${relativePath}`;
}
