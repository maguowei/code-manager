import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("ClaudeOverviewPage styles", () => {
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
      "grid-cols-[minmax(0,1fr)_8px_minmax(260px,var(--claude-overview-tree-width,340px))]",
    );
    expect(source).toContain("claude-overview-resizer relative min-w-2 cursor-col-resize");
    expect(source).toContain("max-[900px]:hidden");
  });

  it("keeps the overview chrome compact", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    expect(source).toContain("claude-overview-header flex min-h-12");
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

  it("bridges Pierre tree colors to the app theme", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    expect(source).toContain('"--trees-bg-override": "var(--secondary)"');
    expect(source).toContain('"--trees-fg-override": "var(--foreground)"');
    expect(source).toContain('"--trees-fg-muted-override": "var(--muted-foreground)"');
    expect(source).toContain('"--trees-search-bg-override": "var(--background)"');
    expect(source).not.toContain("--trees-muted-fg-override");
  });

  it("uses stable loading skeletons and reduced-motion friendly transitions for the tree", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");

    expect(source).toContain("TREE_LOADING_ROW_CLASS_NAMES");
    expect(source).toContain("claude-overview-tree-loading flex h-full min-h-0");
    expect(source).toContain("motion-safe:animate-pulse");
  });

  it("marks markdown previews with explicit light and dark theme classes", () => {
    const source = readText("src/components/ClaudeOverviewPage.tsx");
    const markdownPreview = readText("src/components/claude-overview/MarkdownPreview.tsx");

    expect(source).toContain('previewThemeType === "dark" ? "markdown-dark" : "markdown-light"');
    expect(markdownPreview).toContain("markdown-preview-image-fallback inline-block");
  });
});
