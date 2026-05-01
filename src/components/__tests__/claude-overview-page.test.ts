import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("ClaudeOverviewPage styles", () => {
  it("allows the file preview surface to scroll", () => {
    const css = readText("src/components/ClaudeOverviewPage.css");
    const previewContentRule = css.match(/\.claude-overview-preview-content\s*{(?<body>[^}]*)}/);

    expect(previewContentRule?.groups?.body).toContain("overflow: auto;");
  });

  it("places the preview and tree around a resizable separator", () => {
    const css = readText("src/components/ClaudeOverviewPage.css");
    const bodyRule = css.match(/\.claude-overview-body\s*{(?<body>[^}]*)}/);
    const resizerRule = css.match(/\.claude-overview-resizer\s*{(?<body>[^}]*)}/);

    expect(bodyRule?.groups?.body).toContain(
      "grid-template-columns: minmax(0, 1fr) 8px minmax(260px, var(--claude-overview-tree-width, 340px));",
    );
    expect(resizerRule?.groups?.body).toContain("cursor: col-resize;");
  });

  it("keeps the overview chrome compact", () => {
    const css = readText("src/components/ClaudeOverviewPage.css");
    const headerRule = css.match(/\.claude-overview-header\s*{(?<body>[^}]*)}/);
    const statusRule = css.match(/\.claude-overview-status\s*{(?<body>[^}]*)}/);
    const previewHeadRule = css.match(/\.claude-overview-preview-head\s*{(?<body>[^}]*)}/);

    expect(headerRule?.groups?.body).toContain("min-height: 48px;");
    expect(statusRule?.groups?.body).toContain("min-height: 0;");
    expect(previewHeadRule?.groups?.body).toContain("min-height: 40px;");
  });

  it("visually separates the preview metadata from file contents", () => {
    const css = readText("src/components/ClaudeOverviewPage.css");
    const previewHeadRule = css.match(/\.claude-overview-preview-head\s*{(?<body>[^}]*)}/);

    expect(previewHeadRule?.groups?.body).toContain("background: var(--bg-primary);");
    expect(previewHeadRule?.groups?.body).toContain(
      "border-bottom: 1px solid var(--border-default);",
    );
  });

  it("keeps the active file metadata and actions on one compact row", () => {
    const css = readText("src/components/ClaudeOverviewPage.css");
    const previewHeadRule = css.match(/\.claude-overview-preview-head\s*{(?<body>[^}]*)}/);
    const previewSummaryRule = css.match(/\.claude-overview-preview-summary\s*{(?<body>[^}]*)}/);
    const actionButtonRule = css.match(
      /\.claude-overview-preview-actions button\s*{(?<body>[^}]*)}/,
    );

    expect(previewHeadRule?.groups?.body).toContain("min-height: 40px;");
    expect(previewHeadRule?.groups?.body).toContain("flex-wrap: nowrap;");
    expect(previewSummaryRule?.groups?.body).toContain("white-space: nowrap;");
    expect(actionButtonRule?.groups?.body).toContain("width: 30px;");
  });

  it("bridges Pierre tree colors to the app theme", () => {
    const css = readText("src/components/ClaudeOverviewPage.css");
    const fileTreeRule = css.match(/\.claude-overview-file-tree\s*{(?<body>[^}]*)}/);

    expect(fileTreeRule?.groups?.body).toContain("--trees-bg-override: var(--bg-secondary);");
    expect(fileTreeRule?.groups?.body).toContain("--trees-fg-override: var(--text-primary);");
    expect(fileTreeRule?.groups?.body).toContain(
      "--trees-fg-muted-override: var(--text-secondary);",
    );
    expect(fileTreeRule?.groups?.body).toContain("--trees-search-bg-override: var(--bg-primary);");
    expect(fileTreeRule?.groups?.body).not.toContain("--trees-muted-fg-override");
  });

  it("uses stable loading skeletons and reduced-motion friendly transitions for the tree", () => {
    const css = readText("src/components/ClaudeOverviewPage.css");
    const treeReadyRule = css.match(/\.claude-overview-tree-ready\s*{(?<body>[^}]*)}/);
    const treeLoadingRule = css.match(/\.claude-overview-tree-loading\s*{(?<body>[^}]*)}/);
    const skeletonRowRule = css.match(
      /\.claude-overview-tree-loading-list span\s*{(?<body>[^}]*)}/,
    );

    expect(treeReadyRule?.groups?.body).toContain("animation: claude-overview-tree-enter");
    expect(treeLoadingRule?.groups?.body).toContain("height: 100%;");
    expect(skeletonRowRule?.groups?.body).toContain("animation: claude-overview-skeleton-pulse");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
