import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("ClaudeOverviewPage styles", () => {
  it("surfaces operation failure reasons through the shared toast helper", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    expect(source).toContain(
      'showOperationError(showToast, t("claudeOverview.operationError"), error)',
    );
  });

  it("allows the file preview surface to scroll", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    expect(source).toContain("claude-overview-preview-content block min-h-0 flex-1 overflow-auto");
    expect(source).toContain(
      "claude-overview-preview-content claude-overview-markdown flex-1 overflow-auto",
    );
  });

  it("places the preview and tree around a resizable separator", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    expect(source).toContain(
      "grid-cols-[minmax(0,var(--claude-overview-preview-width))_8px_minmax(0,var(--claude-overview-tree-width))]",
    );
    expect(source).toContain("TREE_PANE_RATIO_STORAGE_KEY");
    expect(source).toContain("LEGACY_TREE_PANE_WIDTH_STORAGE_KEY");
    expect(source).toContain("DEFAULT_TREE_PANE_RATIO = 0.28");
    expect(source).toContain("MIN_TREE_PANE_RATIO = 0.2");
    expect(source).toContain("MAX_TREE_PANE_RATIO = 0.52");
    expect(source).toContain("TREE_PANE_RATIO_STEP = 0.02");
    expect(source).toContain("clampTreePaneRatio");
    expect(source).toContain("ResizeObserver");
    expect(source).toContain("overviewBodyRef");
    expect(source).toContain("--claude-overview-preview-width");
    expect(source).toContain("writeOverviewPaneWidthVars");
    expect(source).toContain('style.setProperty("--claude-overview-preview-width"');
    expect(source).toContain("resizePreviewOverlayRef");
    expect(source).toContain("resizeShieldRef");
    expect(source).toContain("writeOverviewResizePreviewVars");
    expect(source).toContain('"--claude-overview-resize-preview-width"');
    expect(source).toContain('"--claude-overview-resize-tree-width"');
    expect(source).toContain("resizePreviewOverlay.style.setProperty");
    expect(source).toContain("setResizeDragChromeVisible(true)");
    expect(source).toContain("setPointerCapture");
    expect(source).toContain("applyResizeGuideRatio(moveEvent.clientX)");
    expect(source).toContain("applyTreePaneRatio(finalRatio, { commit: false })");
    expect(source).toContain("setTreePaneRatio(finalRatio)");
    expect(source).toContain("claude-overview-resizer relative min-w-2 cursor-col-resize");
    expect(source).toContain("claude-overview-resize-shield pointer-events-none absolute");
    expect(source).toContain("claude-overview-resize-preview-overlay pointer-events-none absolute");
    expect(source).toContain(
      "grid-cols-[minmax(0,var(--claude-overview-resize-preview-width))_8px_minmax(0,var(--claude-overview-resize-tree-width))]",
    );
    expect(source).toContain("claude-overview-resize-preview-pane");
    expect(source).toContain("claude-overview-resize-tree-preview-pane");
    expect(source).toContain("claude-overview-resize-preview-divider");
    expect(source).toContain("max-[900px]:hidden");
    expect(source).not.toContain("--claude-overview-resize-guide-x");
    expect(source).not.toContain("resizeGuide.style.transform");
    expect(source).not.toContain("claude-overview-resize-guide");
    expect(source).not.toContain("isResizingPanes");
    expect(source).not.toContain("applyTreePaneWidth");
  });

  it("keeps the overview chrome compact", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

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
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    expect(source).toContain("claude-overview-preview-footer flex min-h-[34px]");
    expect(source).toContain("border-t bg-card");
  });

  it("keeps preview actions and footer metadata in compact rows", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    expect(source).toContain("claude-overview-preview-toolbar flex min-h-[38px]");
    expect(source).toContain("justify-end");
    expect(source).toContain("claude-overview-preview-summary flex min-w-0 items-center gap-2");
    expect(source).toContain('size="icon-sm"');
  });

  it("truncates long preview tab filenames within the tab shell", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    expect(source).toContain("claude-overview-tab-shell flex h-7 min-w-0 max-w-60");
    expect(source).toContain("items-center overflow-hidden rounded-t-md");
    expect(source).toContain("claude-overview-tab h-full min-w-0 flex-1");
    expect(source).toContain("claude-overview-tab-label block min-w-0 flex-1 truncate");
    expect(source).toContain("claude-overview-tab-close mr-0.5 size-6 shrink-0");
  });

  it("bridges Pierre tree colors to the app theme", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

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

  it("uses stable loading skeletons and reduced-motion friendly transitions for the tree", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    expect(source).toContain("TREE_LOADING_ROW_CLASS_NAMES");
    expect(source).toContain("claude-overview-tree-loading flex h-full min-h-0");
    expect(source).toContain("motion-safe:animate-pulse");
  });

  it("places the file tree inside a card surface over the secondary canvas", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    expect(source).toContain("claude-overview-page relative flex h-full w-full");
    expect(source).toContain("claude-overview-body grid min-h-0 w-full flex-1 bg-secondary p-3");
    expect(source).toContain(
      "claude-overview-preview-pane flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border",
    );
    expect(source).toContain("claude-overview-file-tree h-full w-full bg-card text-foreground");
    expect(source).toContain(
      "claude-overview-tree-pane flex min-h-0 min-w-0 w-full overflow-hidden",
    );
    expect(source).toContain(
      "claude-overview-tree-ready h-full min-h-0 w-full flex-1 overflow-hidden rounded-lg border",
    );
    expect(source).toContain(
      "claude-overview-tree-loading-panel h-full min-h-0 w-full flex-1 overflow-hidden rounded-lg border",
    );
    expect(source).toContain(
      "claude-overview-resizer relative min-w-2 cursor-col-resize border-0 bg-transparent",
    );
    expect(source).toContain("PANEL_SURFACE_CLASS");
    expect(source).not.toContain(
      "claude-overview-tree-pane min-h-0 min-w-0 overflow-hidden bg-secondary p-2",
    );
  });

  it("marks markdown previews with explicit light and dark theme classes", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");
    const markdownPreview = readText("src/components/claude-overview/MarkdownPreview.tsx");

    expect(source).toContain('previewThemeType === "dark" ? "markdown-dark" : "markdown-light"');
    expect(source).toContain('"--diffs-dark-bg": "var(--card)"');
    expect(source).toContain('"--diffs-light-bg": "var(--card)"');
    expect(markdownPreview).toContain("markdown-preview-image-fallback inline-block");
  });
});
