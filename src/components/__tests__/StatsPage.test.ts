import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("StatsPage collapsible sections", () => {
  it("documents snapshot freshness and recent-session project context", () => {
    const source = readFileSync(`${process.cwd()}/src/components/StatsPage.tsx`, "utf8");
    const headerSource = readFileSync(`${process.cwd()}/src/components/PageHeader.tsx`, "utf8");
    const i18n = readFileSync(`${process.cwd()}/src/i18n.ts`, "utf8");

    expect(source).toContain("return parts.length > 0 ? parts.at(-1) || fullPath : fullPath;");
    expect(source).toContain('descriptionClassName="stats-staleness-note"');
    expect(headerSource).toContain("max-w-[min(52vw,560px)] truncate");
    expect(source).toContain('t("stats.stalenessNotice")');
    expect(source).toContain('t("stats.projectSectionHint")');
    expect(source).toContain("p.lastSessionId");
    expect(source).toMatch(
      /<span className="stats-project-name[^"]*">\s*\{shortPath\(path\)\}\s*<\/span>/,
    );
    expect(source).toContain('className="stats-project-session-id block max-w-[min(48vw,560px)]');
    expect(source).toContain('title={p.lastSessionId || "-"}');
    expect(source).not.toContain('t("stats.sessionId")');
    expect(source).not.toContain("formatSessionId");
    expect(source).toContain('title={p.lastSessionId || "-"}');
    expect(source).toContain('{p.lastSessionId || "-"}');
    expect(source).not.toContain('t("stats.recentSession")');
    expect(source).toContain('"stats-project-section-hint px-5 pt-4 pb-0');
    expect(i18n).toContain('"stats.stalenessNotice"');
    expect(i18n).toContain('"stats.projectSectionHint"');
    expect(i18n).toContain('"stats.sessionSection": "项目最近会话"');
  });

  it("uses shadcn chart, card, and button primitives without the old css file", () => {
    const source = readFileSync(`${process.cwd()}/src/components/StatsPage.tsx`, "utf8");

    expect(source).not.toContain("StatsPage.css");
    expect(source).toContain('from "./ui/chart"');
    expect(source).toContain('from "./ui/card"');
    expect(source).toContain('from "./ui/button"');
    expect(source).toContain("<ChartContainer");
    expect(source).toContain("<ChartTooltip");
    expect(source).toContain("<ChartTooltipContent hideLabel />");
    expect(source).toContain('color: "var(--chart-1)"');
    expect(source).toContain('fill="var(--color-count)"');
  });

  it("keeps the whole collapsed section header clickable", () => {
    const source = readFileSync(`${process.cwd()}/src/components/StatsPage.tsx`, "utf8");

    expect(source).toContain("stats-section stats-section-collapsible group");
    expect(source).toContain(
      "stats-section-title stats-section-summary flex cursor-pointer list-none items-center gap-2 border-b px-5 py-3.5",
    );
    expect(source).toContain("[&::-webkit-details-marker]:hidden");
    expect(source).toContain("group-open:hidden");
    expect(source).toContain("group-open:rotate-90");
  });

  it("keeps the projects section open while project cards are collapsed by default", () => {
    const source = readFileSync(`${process.cwd()}/src/components/StatsPage.tsx`, "utf8");

    expect(source).toContain(
      '"stats-section stats-section-collapsible stats-project-section group rounded-xl border"',
    );
    expect(source).toContain("PANEL_SURFACE_CLASS");
    expect(source).toMatch(/<summary className="stats-section-title stats-section-summary/);
    expect(source).toContain('"stats-project-card group overflow-hidden rounded-lg border"');
    expect(source).not.toMatch(/<details open className="stats-project-card/);
  });

  it("uses subdued hover focus styling for the tool usage bar chart", () => {
    const source = readFileSync(`${process.cwd()}/src/components/StatsPage.tsx`, "utf8");

    expect(source).toContain('fill: "color-mix(in oklch, var(--chart-1) 15%, transparent)"');
    expect(source).toContain("cursor={TOOL_USAGE_CURSOR_STYLE}");
    expect(source).toContain("activeBar={TOOL_USAGE_ACTIVE_BAR_STYLE}");
    expect(source).toContain("fillOpacity={0.88}");
  });

  it("presents project cards as compact professional disclosure rows", () => {
    const source = readFileSync(`${process.cwd()}/src/components/StatsPage.tsx`, "utf8");

    expect(source).toContain("stats-project-list flex flex-col gap-5 p-5");
    expect(source).toContain('"stats-project-card group overflow-hidden rounded-lg border"');
    expect(source).toContain("PANEL_SURFACE_CLASS");
    expect(source).toContain("stats-project-session-id block max-w-[min(48vw,560px)]");
    expect(source).not.toContain(".stats-project-session-id-label");
    expect(source).not.toContain(".stats-project-session-id-value");
    expect(source).toContain("stats-project-header flex min-h-[72px]");
    expect(source).toContain("border-l-[3px] border-l-transparent");
    expect(source).toContain("hover:bg-muted/50 focus-visible:outline-2");
    expect(source).toContain("focus-visible:outline-primary");
    expect(source).toContain("group-open:border-l-primary");
  });

  it("uses compact grids and section headers for project details", () => {
    const source = readFileSync(`${process.cwd()}/src/components/StatsPage.tsx`, "utf8");

    expect(source).toContain("stats-project-body flex flex-col gap-4 border-t bg-muted/20 p-4");
    expect(source).toContain(
      "stats-project-metrics grid grid-cols-1 gap-2 min-[601px]:grid-cols-2 min-[901px]:grid-cols-4",
    );
    expect(source).toContain("stats-project-detail-section flex flex-col gap-2");
    expect(source).toContain(
      "stats-project-detail-title text-xs font-extrabold tracking-widest text-muted-foreground uppercase",
    );
    expect(source).toContain(
      "stats-performance-grid grid grid-cols-1 gap-2 min-[601px]:grid-cols-2 min-[901px]:grid-cols-4",
    );
  });

  it("keeps model details stable and readable across widths", () => {
    const source = readFileSync(`${process.cwd()}/src/components/StatsPage.tsx`, "utf8");

    expect(source).toContain('"stats-model-table-wrap overflow-x-auto rounded-md border"');
    expect(source).toContain("CONTROL_SURFACE_CLASS");
    expect(source).toContain("stats-model-table min-w-[640px]");
    expect(source).toContain(
      "stats-model-header grid grid-cols-[minmax(220px,1fr)_repeat(3,minmax(96px,auto))]",
    );
    expect(source).toContain(
      "stats-model-row grid grid-cols-[minmax(220px,1fr)_repeat(3,minmax(96px,auto))]",
    );
    expect(source).toContain("[&>span:not(:first-child)]:text-right");
  });

  it("includes responsive project layout rules", () => {
    const source = readFileSync(`${process.cwd()}/src/components/StatsPage.tsx`, "utf8");

    expect(source).toContain("min-[601px]:grid-cols-2");
    expect(source).toContain("min-[901px]:grid-cols-4");
    expect(source).toContain("max-[600px]:flex-wrap");
    expect(source).toContain("max-[600px]:items-start");
    expect(source).toContain("max-[600px]:w-full");
    expect(source).toContain("grid grid-cols-1 gap-2");
  });
});
