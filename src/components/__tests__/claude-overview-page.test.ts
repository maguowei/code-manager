import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function readOverviewSources(): string {
  return [
    "src/components/ClaudeOverviewPage.tsx",
    "src/components/claude-overview/ClaudeDirectoryTree.tsx",
    "src/components/claude-overview/ClaudeFilePreviewPane.tsx",
    "src/components/claude-overview/file-viewer-utils.ts",
  ]
    .map(readText)
    .join("\n");
}

describe("ClaudeOverviewPage styles", () => {
  it("surfaces operation failure reasons through the shared toast helper", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    expect(source).toContain(
      'showOperationError(showToast, t("claudeOverview.operationError"), error)',
    );
  });

  it("allows the file preview surface to scroll", () => {
    const source = readOverviewSources();

    // 源码预览滚动容器带 scrollbar-stable：避免 WKWebView overlay 滚动条在大文件下看不到、抓不住
    expect(source).toContain(
      "claude-overview-preview-content scrollbar-stable block min-h-0 flex-1 overflow-auto",
    );
    expect(source).toContain(
      "claude-overview-preview-content claude-overview-markdown flex-1 overflow-auto",
    );
  });

  it("defines an always-visible scrollbar with a minimum thumb size", () => {
    const css = readText("src/index.css");

    expect(css).toContain(".scrollbar-stable::-webkit-scrollbar");
    // 行数极多时 thumb 比例极小，min-height 保证仍可见、可拖拽
    expect(css).toMatch(/\.scrollbar-stable::-webkit-scrollbar-thumb\s*\{[^}]*min-height/);
  });

  it("aligns Pierre virtualization metrics with the real preview line height", () => {
    const source = readText("src/components/claude-overview/ClaudeFilePreviewPane.tsx");

    // metrics.lineHeight 必须与 --diffs-line-height 精确一致，否则虚拟化估算偏差会导致大文件滚动卡顿
    expect(source).toContain("metrics={PIERRE_FILE_METRICS}");
    expect(source).toContain("lineHeight: 22");
    expect(source).toContain('"--diffs-line-height": "22px"');
  });

  it("places the preview and tree around a shadcn resizable separator", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    // 使用 shadcn Resizable（react-resizable-panels）替换自定义分隔条
    expect(source).toContain("ResizablePanelGroup");
    expect(source).toContain("ResizablePanel");
    expect(source).toContain("ResizableHandle");
    expect(source).toContain("useDefaultLayout");
    // 布局方向随视口宽度切换：宽屏左右、窄屏上下堆叠
    expect(source).toContain('orientation={isNarrow ? "vertical" : "horizontal"}');
    expect(source).toContain("useIsNarrowViewport(900)");
    // 比例边界：树默认 28%、20%~52%，预览默认 72%、最小 48%
    // v4 数字 size 会被当像素，必须用百分比字符串
    expect(source).toContain('TREE_PANE_DEFAULT_SIZE = "28%"');
    expect(source).toContain('TREE_PANE_MIN_SIZE = "20%"');
    expect(source).toContain('TREE_PANE_MAX_SIZE = "52%"');
    expect(source).toContain('PREVIEW_PANE_DEFAULT_SIZE = "72%"');
    expect(source).toContain('PREVIEW_PANE_MIN_SIZE = "48%"');
    expect(source).toContain("defaultSize={TREE_PANE_DEFAULT_SIZE}");
    expect(source).toContain("defaultSize={PREVIEW_PANE_DEFAULT_SIZE}");
    // 布局持久化走 useDefaultLayout + handleLayoutChanged（合并持久化与拖拽状态清理），不再使用旧的 CSS 变量方案
    expect(source).toContain("defaultLayout={defaultLayout}");
    expect(source).toContain("onLayoutChanged={handleLayoutChanged}");
    expect(source).toContain('OVERVIEW_PANES_LAYOUT_ID = "code-manager:claude-overview-panes"');
    expect(source).toContain('aria-label={t("claudeOverview.resizePanes")}');
    // 拖拽性能优化：pointerdown 立即标记 isResizing 冻结预览宽度，避免 v4 onResize(ResizeObserver 回调) 滞后漏帧
    expect(source).toContain("onPointerDown={handleResizeStart}");
    expect(source).toContain("isResizing");
    expect(source).not.toContain("onResize={handleTreeResize}");
    expect(source).not.toContain("resizeTimeoutRef");

    // 旧的自定义拖拽实现已完全移除
    expect(source).not.toContain("--claude-overview-preview-width");
    expect(source).not.toContain("--claude-overview-tree-width");
    expect(source).not.toContain("TREE_PANE_RATIO_STORAGE_KEY");
    expect(source).not.toContain("clampTreePaneRatio");
    expect(source).not.toContain("getPaneWidthsForRatio");
    expect(source).not.toContain("writeOverviewPaneWidthVars");
    expect(source).not.toContain("resizePreviewOverlayRef");
    expect(source).not.toContain("resizeShieldRef");
    expect(source).not.toContain("handleResizePointerDown");
    expect(source).not.toContain("handleResizeKeyDown");
    expect(source).not.toContain("claude-overview-resizer");
    expect(source).not.toContain("claude-overview-resize-shield");
    expect(source).not.toContain("claude-overview-resize-preview-overlay");
  });

  it("keeps the overview chrome compact", () => {
    const source = readOverviewSources();

    expect(source).toContain("claude-overview-header flex min-h-12");
    expect(source).toContain("bg-secondary");
    expect(source).toContain("supports-[backdrop-filter]:bg-secondary/90");
    expect(source).not.toContain("bg-card/95 px-4 py-2 shadow-toolbar");
    expect(source).toContain("claude-overview-status flex min-h-0");
    expect(source).toContain("claude-overview-preview-toolbar flex min-h-[38px]");
    expect(source).toContain("claude-overview-preview-footer flex min-h-[34px]");
  });

  it("resets desktop title flex sizing in the compact overview header", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    expect(source).toContain("claude-overview-title-group flex min-w-0");
    expect(source).toContain("max-[700px]:flex-[0_1_auto]");
    expect(source).toContain("max-[700px]:flex-wrap");
  });

  it("visually separates the preview metadata from file contents", () => {
    const source = readOverviewSources();

    expect(source).toContain("claude-overview-preview-footer flex min-h-[34px]");
    expect(source).toContain("border-t bg-card");
  });

  it("keeps preview actions and footer metadata in compact rows", () => {
    const source = readOverviewSources();

    expect(source).toContain("claude-overview-preview-toolbar flex min-h-[38px]");
    expect(source).toContain("justify-end");
    expect(source).toContain("claude-overview-preview-summary flex min-w-0 items-center gap-2");
    expect(source).toContain('size="icon-sm"');
  });

  it("truncates long preview tab filenames within the tab shell", () => {
    const source = readOverviewSources();

    expect(source).toContain("claude-overview-tab-shell flex h-7 min-w-0 max-w-60");
    expect(source).toContain("items-center overflow-hidden rounded-t-md");
    expect(source).toContain("claude-overview-tab h-full min-w-0 flex-1");
    expect(source).toContain("claude-overview-tab-label block min-w-0 flex-1 truncate");
    expect(source).toContain("claude-overview-tab-close mr-0.5 size-6 shrink-0");
  });

  it("bridges Pierre tree colors to the app theme", () => {
    const source = readOverviewSources();

    expect(source).toContain('"--trees-bg-override": "var(--card)"');
    expect(source).toContain('"--trees-fg-override": "var(--foreground)"');
    expect(source).toContain('"--trees-fg-muted-override": "var(--muted-foreground)"');
    expect(source).toContain('"--trees-search-bg-override": "var(--card)"');
    expect(source).toContain('"--trees-font-size-override": "0.8125rem"');
    expect(source).toContain('"--trees-item-height": "1.75rem"');
    expect(source).toContain('"--trees-search-font-weight-override": "500"');
    expect(source).toContain("[data-file-tree-search-input]");
    expect(source).toContain("background-color: var(--card);");
    expect(source).toContain(
      "box-shadow: 0 0 0 1px color-mix(in oklch, var(--primary) 42%, transparent);",
    );
    expect(source).not.toContain("--trees-muted-fg-override");
  });

  it("pins the Pierre tree search mode to the documented hide-non-matches default", () => {
    const source = readText("src/components/claude-overview/ClaudeDirectoryTree.tsx");

    // 显式声明 search mode，防御未来 @pierre/trees beta 默认变更
    expect(source).toContain('fileTreeSearchMode: "hide-non-matches"');
  });

  it("uses stable loading skeletons and reduced-motion friendly transitions for the tree", () => {
    const source = readOverviewSources();

    expect(source).toContain("TREE_LOADING_ROW_CLASS_NAMES");
    expect(source).toContain("claude-overview-tree-loading flex h-full min-h-0");
    expect(source).toContain("motion-safe:animate-pulse");
  });

  it("places the file tree inside a card surface over the secondary canvas", () => {
    const source = readOverviewSources();

    expect(source).toContain("claude-overview-page relative flex h-full w-full");
    expect(source).toContain("claude-overview-body min-h-0 w-full flex-1 bg-secondary p-3");
    expect(source).toContain(
      "claude-overview-preview-pane flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border",
    );
    expect(source).toContain("claude-overview-file-tree h-full w-full bg-card text-foreground");
    expect(source).toContain(
      "claude-overview-tree-pane flex min-h-0 min-w-0 w-full flex-1 overflow-hidden",
    );
    // 预览面板需要给 Pierre 的 ResizeObserver / Virtualizer 正常测量尺寸，不能使用 layout containment
    expect(source).not.toContain("[contain:layout_style]");
    expect(source).toContain("[contain:content]");
    expect(source).toContain(
      "claude-overview-tree-ready h-full min-h-0 w-full flex-1 overflow-hidden rounded-lg border",
    );
    expect(source).toContain(
      "claude-overview-tree-loading-panel h-full min-h-0 w-full flex-1 overflow-hidden rounded-lg border",
    );
    expect(source).toContain("PANEL_SURFACE_CLASS");
    expect(source).not.toContain(
      "claude-overview-tree-pane min-h-0 min-w-0 overflow-hidden bg-secondary p-2",
    );
  });

  it("marks markdown previews with explicit light and dark theme classes", () => {
    const source = readOverviewSources();
    const markdownPreview = readText("src/components/claude-overview/MarkdownPreview.tsx");

    expect(source).toContain('previewThemeType === "dark" ? "markdown-dark" : "markdown-light"');
    expect(source).toContain('"--diffs-dark-bg": "var(--card)"');
    expect(source).toContain('"--diffs-light-bg": "var(--card)"');
    expect(markdownPreview).toContain("markdown-preview-image-fallback inline-block");
  });

  it("renders source previews through Pierre worker pool and virtualizer", () => {
    const source = readText("src/components/claude-overview/ClaudeFilePreviewPane.tsx");

    expect(source).toContain("WorkerPoolContextProvider");
    expect(source).toContain("Virtualizer");
    expect(source).toContain('"@pierre/diffs/worker/worker-portable.js"');
    expect(source).toContain("claudeOverview.renderingPreview");
    expect(source).not.toContain("disableWorkerPool");
    // PierreFile 必须带 key，否则切换文件时 Pierre VirtualizedFile 会复用实例显示上一个文件内容
    expect(source).toContain("key={fileKey}");
  });

  it("remounts the source preview virtualizer when the overview becomes visible again", () => {
    const previewPane = readText("src/components/claude-overview/ClaudeFilePreviewPane.tsx");
    const overviewPage = readText("src/components/ClaudeOverviewPage.tsx");

    // display:none keepalive 切回可见时，借 remountToken 改变 Virtualizer 的 key 强制重挂、重新测量
    expect(previewPane).toContain("key={`pierre-virtualizer-");
    expect(previewPane).toContain("remountToken ?? 0}`}");
    expect(overviewPage).toContain("setPreviewRemountToken");
    expect(overviewPage).toContain("remountToken={previewRemountToken}");
    // App 把激活态传入，用于检测「隐藏→可见」转换
    expect(readText("src/App.tsx")).toContain('active={activeTab === "claudeOverview"}');
  });
});
