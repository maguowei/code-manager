import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("StatsPage collapsible sections", () => {
  it("documents snapshot freshness and recent-session project context", () => {
    const source = readFileSync(`${process.cwd()}/src/components/StatsPage.tsx`, "utf8");
    const i18n = readFileSync(`${process.cwd()}/src/i18n.ts`, "utf8");

    expect(source).toContain("return parts.length > 0 ? parts.at(-1) || fullPath : fullPath;");
    expect(source).toContain('className="stats-staleness-note"');
    expect(source).toContain('t("stats.stalenessNotice")');
    expect(source).toContain('t("stats.projectSectionHint")');
    expect(source).toContain("p.lastSessionId");
    expect(source).toMatch(
      /<span className="stats-project-name">\{shortPath\(path\)\}<\/span>\s*<span className="stats-project-session-id" title=\{p\.lastSessionId \|\| "-"\}>/,
    );
    expect(source).not.toContain('t("stats.sessionId")');
    expect(source).not.toContain("formatSessionId");
    expect(source).toContain('title={p.lastSessionId || "-"}');
    expect(source).toContain('{p.lastSessionId || "-"}');
    expect(source).not.toContain('t("stats.recentSession")');
    expect(source).toMatch(
      /<div className="page-header">\s*<div className="stats-page-heading">\s*<h1 className="page-title">\{t\("stats\.title"\)\}<\/h1>\s*<div className="stats-staleness-note">\{t\("stats\.stalenessNotice"\)\}<\/div>/,
    );
    expect(i18n).toContain('"stats.stalenessNotice"');
    expect(i18n).toContain('"stats.projectSectionHint"');
    expect(i18n).toContain('"stats.sessionSection": "项目最近会话"');
  });

  it("keeps the whole collapsed section header clickable", () => {
    const css = readFileSync(`${process.cwd()}/src/components/StatsPage.css`, "utf8");

    expect(css).toMatch(/\.stats-section-collapsible\s*\{[^}]*padding:\s*0;/s);
    expect(css).toMatch(
      /\.stats-section-summary\s*\{[^}]*padding:\s*var\(--space-5\)\s+var\(--space-5\)\s+var\(--space-3\);/s,
    );
    expect(css).toMatch(
      /\.stats-section-collapsible:not\(\[open\]\)\s*>\s*\.stats-section-summary\s*\{[^}]*padding-bottom:\s*var\(--space-5\);/s,
    );
  });

  it("keeps the projects section open while project cards are collapsed by default", () => {
    const source = readFileSync(`${process.cwd()}/src/components/StatsPage.tsx`, "utf8");

    expect(source).toMatch(
      /<details\s+open\s+className="stats-section stats-section-collapsible stats-project-section"/,
    );
    expect(source).toMatch(/<summary className="stats-section-title stats-section-summary">/);
    expect(source).toMatch(/<details className="stats-project-card">/);
    expect(source).not.toMatch(/<details open className="stats-project-card">/);
  });

  it("presents project cards as compact professional disclosure rows", () => {
    const css = readFileSync(`${process.cwd()}/src/components/StatsPage.css`, "utf8");

    expect(css).toMatch(/\.stats-project-list\s*\{[^}]*gap:\s*var\(--space-5\);/s);
    expect(css).toMatch(
      /\.stats-project-card\s*\{[^}]*border:\s*1px\s+solid\s+var\(--border-muted\);/s,
    );
    expect(css).toMatch(/\.stats-project-card\s*\{[^}]*box-shadow:/s);
    expect(css).toMatch(/\.stats-project-session-id\s*\{[^}]*max-width:\s*min\(48vw,\s*560px\);/s);
    expect(css).not.toContain(".stats-project-session-id-label");
    expect(css).not.toContain(".stats-project-session-id-value");
    expect(css).toMatch(/\.stats-project-header\s*\{[^}]*min-height:\s*72px;/s);
    expect(css).toMatch(
      /\.stats-project-header\s*\{[^}]*border-left:\s*3px\s+solid\s+transparent;/s,
    );
    expect(css).toMatch(
      /\.stats-project-header:hover,\s*\.stats-project-header:focus-visible\s*\{/,
    );
    expect(css).toMatch(
      /\.stats-project-header:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--accent-blue\);/s,
    );
    expect(css).toMatch(
      /\.stats-project-card\[open\]\s*>\s*\.stats-project-header\s*\{[^}]*border-left-color:\s*var\(--accent-blue\);/s,
    );
  });

  it("uses compact grids and section headers for project details", () => {
    const css = readFileSync(`${process.cwd()}/src/components/StatsPage.css`, "utf8");

    expect(css).toMatch(
      /\.stats-project-body\s*\{[^}]*border-top:\s*1px\s+solid\s+var\(--border-default\);/s,
    );
    expect(css).toMatch(
      /\.stats-project-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/s,
    );
    expect(css).toMatch(/\.stats-project-detail-section\s*\{[^}]*display:\s*flex;/s);
    expect(css).toMatch(/\.stats-project-detail-title\s*\{[^}]*text-transform:\s*uppercase;/s);
    expect(css).toMatch(
      /\.stats-performance-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/s,
    );
  });

  it("keeps model details stable and readable across widths", () => {
    const css = readFileSync(`${process.cwd()}/src/components/StatsPage.css`, "utf8");

    expect(css).toMatch(/\.stats-model-table-wrap\s*\{[^}]*overflow-x:\s*auto;/s);
    expect(css).toMatch(/\.stats-model-table\s*\{[^}]*min-width:\s*640px;/s);
    expect(css).toMatch(
      /\.stats-model-header,\s*\.stats-model-row\s*\{[^}]*grid-template-columns:\s*minmax\(220px,\s*1fr\)\s+repeat\(3,\s*minmax\(96px,\s*auto\)\);/s,
    );
    expect(css).toMatch(
      /\.stats-model-header\s*>\s*span:not\(:first-child\),\s*\.stats-model-row\s*>\s*span:not\(:first-child\)\s*\{[^}]*text-align:\s*right;/s,
    );
  });

  it("includes responsive project layout rules", () => {
    const css = readFileSync(`${process.cwd()}/src/components/StatsPage.css`, "utf8");

    expect(css).toMatch(
      /@media\s*\(max-width:\s*900px\)\s*\{[^}]*\.stats-project-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*600px\)\s*\{[^}]*\.stats-project-header\s*\{[^}]*align-items:\s*flex-start;/s,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*600px\)\s*\{[^}]*\.stats-project-summary\s*\{[^}]*width:\s*100%;/s,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*600px\)\s*\{[^}]*\.stats-performance-grid\s*\{[^}]*grid-template-columns:\s*1fr;/s,
    );
  });
});
