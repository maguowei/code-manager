import type { FileContents } from "@pierre/diffs/react";
import type { TranslationKey } from "@/i18n";
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
  if (!path) {
    return "";
  }
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

/** 路径自身或其任一祖先是软链时，总览写操作只读 */
export function pathCrossesSymlink(
  path: string,
  entryByPath: Map<string, ClaudeDirectoryEntry>,
): boolean {
  const parts = path.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (entryByPath.get(current)?.isSymlink) {
      return true;
    }
  }
  return false;
}

export function formatSymlinkTargetLabel(options: {
  linkTarget?: string | null;
  linkTargetAbsolute?: string | null;
  isBroken?: boolean;
  isCycle?: boolean;
  t: (key: TranslationKey) => string;
}): string {
  const { linkTarget, linkTargetAbsolute, isBroken, isCycle, t } = options;
  if (isBroken) {
    const raw = linkTarget?.trim();
    return raw ? `${t("claudeOverview.symlinkBroken")}: ${raw}` : t("claudeOverview.symlinkBroken");
  }
  if (isCycle) {
    const absolute = linkTargetAbsolute?.trim() || linkTarget?.trim() || "";
    return absolute
      ? `${t("claudeOverview.symlinkCycle")}: ${absolute}`
      : t("claudeOverview.symlinkCycle");
  }
  const absolute = linkTargetAbsolute?.trim();
  const raw = linkTarget?.trim();
  if (absolute && raw && absolute !== raw) {
    return `${absolute} ← ${raw}`;
  }
  return absolute || raw || t("claudeOverview.symlinkBadge");
}

export function formatPreviewSymlinkFooter(
  preview: ClaudeFilePreview,
  t: (key: TranslationKey) => string,
): string | null {
  if (preview.isBroken) {
    return formatSymlinkTargetLabel({
      linkTarget: preview.linkTarget,
      linkTargetAbsolute: preview.linkTargetAbsolute,
      isBroken: true,
      t,
    });
  }
  if (!preview.viaSymlinkPath && !preview.isSymlink) {
    return null;
  }
  const target = formatSymlinkTargetLabel({
    linkTarget: preview.linkTarget,
    linkTargetAbsolute: preview.linkTargetAbsolute,
    t,
  });
  if (preview.isSymlink) {
    return `${t("claudeOverview.symlinkBadge")} → ${target}`;
  }
  return t("claudeOverview.viaSymlink")
    .replace("{path}", preview.viaSymlinkPath ?? "")
    .replace("{target}", target);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatModifiedAt(timestamp: number) {
  if (!timestamp) {
    return "-";
  }
  return new Date(timestamp * 1000).toLocaleString();
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
