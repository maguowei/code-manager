import { json } from "@codemirror/lang-json";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useCodeMirrorTheme } from "../hooks/useCodeMirrorTheme";
import { useIsDark } from "../hooks/useIsDark";
import { useToast } from "../hooks/useToast";
import { showOperationError } from "../lib/user-facing-error";
import type {
  ClaudeDirectoryEntry,
  ClaudeDirectoryOverview,
  ClaudeFilePreview,
  ProjectClaudeSettingsScope,
} from "../types";
import MarkdownPreview from "./claude-overview/MarkdownPreview";
import type { TranslateFn } from "./project-detail-utils";
import { SUBTLE_SURFACE_CLASS } from "./surface-classes";
import { TONE_BADGE_CLASS } from "./tone-classes";
import { TYPOGRAPHY } from "./typography-classes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: string;
  hasSettingsJson: boolean;
  hasSettingsLocalJson: boolean;
  onAfterMutate?: () => void;
  t: TranslateFn;
};

// CodeMirror JSON 扩展常量化，避免每次渲染都重建实例
const JSON_EXTENSIONS: Extension[] = [json()];
const EMPTY_EXTENSIONS: Extension[] = [];

// 树节点：基于扁平 entries（每条带 path: "a/b/c"）按目录前缀重建
type TreeNode = {
  relativePath: string;
  name: string;
  kind: "file" | "directory";
  children: TreeNode[];
};

function buildTree(entries: ClaudeDirectoryEntry[]): TreeNode[] {
  // 用 Map<relativePath, TreeNode> 临时索引，便于把子节点挂到父节点
  const index = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // 先把所有节点建出来
  for (const entry of entries) {
    index.set(entry.path, {
      relativePath: entry.path,
      name: entry.name,
      kind: entry.kind,
      children: [],
    });
  }

  // 再把子节点挂到父节点（按路径前缀）
  for (const entry of entries) {
    const node = index.get(entry.path);
    if (!node) continue;
    const lastSlash = entry.path.lastIndexOf("/");
    if (lastSlash < 0) {
      roots.push(node);
      continue;
    }
    const parentPath = entry.path.slice(0, lastSlash);
    const parent = index.get(parentPath);
    if (parent) {
      parent.children.push(node);
    } else {
      // 异常：父节点不在 entries 里（理论上不应发生），降级为根
      roots.push(node);
    }
  }

  sortTree(roots);
  return roots;
}

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    // 目录优先，再按名称
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.children.length > 0) sortTree(node.children);
  }
}

function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

function isJsonPath(path: string): boolean {
  return path.toLowerCase().endsWith(".json");
}

export function ProjectClaudeExplorer({
  open,
  onOpenChange,
  project,
  hasSettingsJson,
  hasSettingsLocalJson,
  onAfterMutate,
  t,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-4xl"
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
  onAfterMutate?: () => void;
  t: TranslateFn;
};

function ProjectClaudeExplorerBody({
  project,
  hasSettingsJson,
  hasSettingsLocalJson,
  onAfterMutate,
  t,
}: BodyProps) {
  const { showToast } = useToast();
  const editorTheme = useCodeMirrorTheme();
  const isDark = useIsDark();
  const markdownTheme = isDark ? "dark" : "light";

  const [overview, setOverview] = useState<ClaudeDirectoryOverview | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<ClaudeFilePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [creatingScope, setCreatingScope] = useState<ProjectClaudeSettingsScope | null>(null);
  const [isOpeningEditor, setIsOpeningEditor] = useState(false);
  // 树节点展开状态：默认顶层目录展开、深层目录折叠，按需切换
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadOverview = useCallback(async () => {
    setIsLoadingOverview(true);
    try {
      const next = await invoke<ClaudeDirectoryOverview | null | undefined>(
        "get_project_claude_directory_overview",
        { project },
      );
      if (!next) {
        setOverview(null);
        return;
      }
      setOverview(next);
      // 初次加载时把所有顶层目录默认展开，便于扫一眼结构
      setExpanded((previous) => {
        if (previous.size > 0) return previous;
        const seeded = new Set<string>();
        for (const entry of next.entries ?? []) {
          if (entry.kind === "directory" && !entry.path.includes("/")) {
            seeded.add(entry.path);
          }
        }
        return seeded;
      });
    } catch (error) {
      showOperationError(showToast, t("projects.claudeExplorer.loadError"), error);
    } finally {
      setIsLoadingOverview(false);
    }
  }, [project, showToast, t]);

  // Body 仅在 Sheet 打开时挂载（Radix 默认 unmount on close）；切换项目时也重新挂载
  useEffect(() => {
    setOverview(null);
    setSelectedPath(null);
    setPreview(null);
    setExpanded(new Set());
    void loadOverview();
  }, [loadOverview]);

  // 选中文件后拉取预览
  useEffect(() => {
    if (!selectedPath) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setIsLoadingPreview(true);
    invoke<ClaudeFilePreview>("get_project_claude_file_preview", {
      project,
      relativePath: selectedPath,
    })
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setPreview(null);
          showOperationError(showToast, t("projects.claudeExplorer.previewError"), error);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, selectedPath, showToast, t]);

  const tree = useMemo(() => buildTree(overview?.entries ?? []), [overview]);

  const handleToggleDir = useCallback((path: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleSelectFile = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  const handleCreateSettings = useCallback(
    async (scope: ProjectClaudeSettingsScope) => {
      setCreatingScope(scope);
      try {
        await invoke("create_project_claude_settings_file", { project, scope });
        showToast(t("projects.claudeExplorer.settingsCreated"), "success");
        await loadOverview();
        onAfterMutate?.();
        // 自动选中新创建的文件
        setSelectedPath(scope === "shared" ? "settings.json" : "settings.local.json");
      } catch (error) {
        showOperationError(showToast, t("projects.claudeExplorer.createError"), error);
      } finally {
        setCreatingScope(null);
      }
    },
    [loadOverview, onAfterMutate, project, showToast, t],
  );

  const handleOpenInEditor = useCallback(async () => {
    if (!selectedPath) return;
    setIsOpeningEditor(true);
    try {
      await invoke("open_project_claude_file_in_editor", {
        project,
        relativePath: selectedPath,
      });
    } catch (error) {
      const message = typeof error === "string" ? error : String(error);
      const key = message.includes("默认编辑器")
        ? "projects.claudeExplorer.noDefaultEditor"
        : "projects.claudeExplorer.openEditorError";
      showOperationError(showToast, t(key), error);
    } finally {
      setIsOpeningEditor(false);
    }
  }, [project, selectedPath, showToast, t]);

  const showCreateButtons = !hasSettingsJson || !hasSettingsLocalJson;
  const isEmptyTree = !isLoadingOverview && tree.length === 0;

  return (
    <div className="projects-claude-explorer flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div
        className={cn(
          "projects-claude-explorer-grid grid min-h-0 flex-1 gap-3",
          "grid-cols-1 sm:grid-cols-[260px_minmax(0,1fr)]",
        )}
      >
        <div
          className={cn(
            "projects-claude-explorer-tree min-h-0 overflow-auto rounded-md border p-2",
            SUBTLE_SURFACE_CLASS,
          )}
        >
          {isEmptyTree ? (
            <p className="px-2 py-3 text-sm leading-6 text-muted-foreground">
              {t("projects.claudeExplorer.emptyTree")}
            </p>
          ) : (
            <TreeList
              nodes={tree}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggleDir={handleToggleDir}
              onSelectFile={handleSelectFile}
              depth={0}
            />
          )}
        </div>

        <div className="projects-claude-explorer-preview flex min-h-0 flex-col gap-2 overflow-hidden">
          <PreviewHeader
            selectedPath={selectedPath}
            preview={preview}
            isOpeningEditor={isOpeningEditor}
            onOpenInEditor={handleOpenInEditor}
            t={t}
          />
          <div
            className={cn("min-h-0 flex-1 overflow-auto rounded-md border", SUBTLE_SURFACE_CLASS)}
          >
            <PreviewBody
              selectedPath={selectedPath}
              preview={preview}
              isLoading={isLoadingPreview}
              editorTheme={editorTheme}
              markdownTheme={markdownTheme}
              t={t}
            />
          </div>
        </div>
      </div>

      {showCreateButtons && (
        <div className="projects-claude-explorer-actions flex shrink-0 flex-wrap gap-2">
          {!hasSettingsJson && (
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
          )}
          {!hasSettingsLocalJson && (
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
          )}
        </div>
      )}
    </div>
  );
}

type TreeListProps = {
  nodes: TreeNode[];
  expanded: Set<string>;
  selectedPath: string | null;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  depth: number;
};

function TreeList({
  nodes,
  expanded,
  selectedPath,
  onToggleDir,
  onSelectFile,
  depth,
}: TreeListProps) {
  return (
    <ul className="projects-claude-explorer-tree-list flex flex-col gap-0.5">
      {nodes.map((node) => (
        <TreeRow
          key={node.relativePath}
          node={node}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
          depth={depth}
        />
      ))}
    </ul>
  );
}

function TreeRow({
  node,
  expanded,
  selectedPath,
  onToggleDir,
  onSelectFile,
  depth,
}: {
  node: TreeNode;
  expanded: Set<string>;
  selectedPath: string | null;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  depth: number;
}) {
  const isExpanded = expanded.has(node.relativePath);
  const isSelected = selectedPath === node.relativePath;
  const indentPx = depth * 12;

  if (node.kind === "directory") {
    return (
      <li>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-auto w-full min-w-0 justify-start gap-1.5 rounded px-1.5 py-1 text-sm leading-5",
            "font-normal text-foreground",
          )}
          style={{ paddingLeft: `${6 + indentPx}px` }}
          onClick={() => onToggleDir(node.relativePath)}
        >
          {isExpanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          {isExpanded ? (
            <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Folder className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate">{node.name}</span>
        </Button>
        {isExpanded && node.children.length > 0 && (
          <TreeList
            nodes={node.children}
            expanded={expanded}
            selectedPath={selectedPath}
            onToggleDir={onToggleDir}
            onSelectFile={onSelectFile}
            depth={depth + 1}
          />
        )}
      </li>
    );
  }

  return (
    <li>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-auto w-full min-w-0 justify-start gap-1.5 rounded px-1.5 py-1 text-sm leading-5",
          "font-normal",
          isSelected ? "bg-primary/10 text-foreground hover:bg-primary/10" : "text-foreground",
        )}
        style={{ paddingLeft: `${6 + indentPx + 14}px` }}
        onClick={() => onSelectFile(node.relativePath)}
      >
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">{node.name}</span>
      </Button>
    </li>
  );
}

type PreviewHeaderProps = {
  selectedPath: string | null;
  preview: ClaudeFilePreview | null;
  isOpeningEditor: boolean;
  onOpenInEditor: () => void;
  t: TranslateFn;
};

function PreviewHeader({
  selectedPath,
  preview,
  isOpeningEditor,
  onOpenInEditor,
  t,
}: PreviewHeaderProps) {
  return (
    <div className="projects-claude-explorer-preview-header flex min-w-0 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "min-w-0 truncate font-mono text-xs",
            selectedPath ? "text-foreground" : "text-muted-foreground",
          )}
          title={selectedPath ?? undefined}
        >
          {selectedPath ?? t("projects.claudeExplorer.selectFile")}
        </span>
        {preview?.truncated && (
          <Badge variant="outline" className={cn("shrink-0", TONE_BADGE_CLASS.warning)}>
            {t("projects.claudeExplorer.truncated")}
          </Badge>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onOpenInEditor}
        disabled={!selectedPath || isOpeningEditor}
      >
        <ExternalLink className="size-4" />
        {t("projects.claudeExplorer.openInEditor")}
      </Button>
    </div>
  );
}

type PreviewBodyProps = {
  selectedPath: string | null;
  preview: ClaudeFilePreview | null;
  isLoading: boolean;
  editorTheme: Extension;
  markdownTheme: "light" | "dark";
  t: TranslateFn;
};

function PreviewBody({
  selectedPath,
  preview,
  isLoading,
  editorTheme,
  markdownTheme,
  t,
}: PreviewBodyProps) {
  if (!selectedPath) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm leading-6 text-muted-foreground">
        {t("projects.claudeExplorer.selectFile")}
      </div>
    );
  }
  if (isLoading || !preview) {
    return (
      <div className={cn("flex h-full items-center justify-center px-4", TYPOGRAPHY.auxiliary)}>
        …
      </div>
    );
  }
  if (preview.isBinary) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm leading-6 text-muted-foreground">
        {t("projects.claudeExplorer.binaryFile")}
      </div>
    );
  }
  if (isMarkdownPath(preview.path)) {
    return (
      <div className="px-4 py-3">
        <MarkdownPreview content={preview.content} themeType={markdownTheme} />
      </div>
    );
  }
  const extensions = isJsonPath(preview.path) ? JSON_EXTENSIONS : EMPTY_EXTENSIONS;
  return (
    <CodeMirror
      value={preview.content}
      extensions={extensions}
      theme={editorTheme}
      editable={false}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: false,
        foldGutter: false,
      }}
    />
  );
}

export default ProjectClaudeExplorer;
