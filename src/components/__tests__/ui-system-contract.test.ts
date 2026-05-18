import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const uiRoot = join(process.cwd(), "src", "components", "ui");

describe("ui system contract", () => {
  it("includes the shadcn primitives used by the unified management UI", () => {
    for (const file of ["empty.tsx", "field.tsx", "input-group.tsx", "spinner.tsx"]) {
      expect(existsSync(join(uiRoot, file)), file).toBe(true);
    }
  });

  it("keeps SettingsDrawer on grouped shadcn form/select composition", () => {
    const source = readFileSync("src/components/SettingsDrawer.tsx", "utf8");

    expect(source).toContain("FieldGroup");
    expect(source).toContain("FieldContent");

    const selectBlocks = source.match(/<SelectContent>[\s\S]*?<\/SelectContent>/g) ?? [];
    expect(selectBlocks.length).toBeGreaterThan(0);
    for (const block of selectBlocks) {
      expect(block).toContain("<SelectGroup>");
    }
  });

  it("routes common page empty and loading states through shared shadcn wrappers", () => {
    const sharedSource = readFileSync("src/components/EmptyState.tsx", "utf8");
    expect(sharedSource).toContain("@/components/ui/empty");
    expect(sharedSource).toContain("@/components/ui/spinner");

    for (const file of [
      "src/components/ProfilesPage.tsx",
      "src/components/PresetsPage.tsx",
      "src/components/MemoryPage.tsx",
      "src/components/SkillsPage.tsx",
      "src/components/StatsPage.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("EmptyState");
    }
  });

  it("keeps Sidebar on semantic shadcn button styling", () => {
    const source = readFileSync("src/components/Sidebar.tsx", "utf8");
    const buttonSource = readFileSync("src/components/ui/button.tsx", "utf8");

    expect(source).not.toContain("from-[var(");
    expect(source).not.toContain("text-[var(");
    expect(source).not.toContain("bg-[var(");
    expect(source).not.toContain("shadow-[");
    expect(source).not.toMatch(/<Icon[^>]*className=/);
    expect(source).not.toMatch(/<Settings[^>]*className=/);
    expect(source).toContain('size="icon-lg"');
    expect(buttonSource).toContain(`"icon-lg": "size-10 [&_svg:not([class*='size-'])]:size-5"`);
  });

  it("keeps primary list item cards on semantic surfaces", () => {
    for (const file of [
      "src/components/MemoryItem.tsx",
      "src/components/SkillItem.tsx",
      "src/components/UnmanagedMemoryItem.tsx",
      "src/components/PresetsPage.tsx",
      "src/components/ProfileNameBadge.tsx",
    ]) {
      const source = readFileSync(file, "utf8");

      expect(source, file).not.toContain("color-mix");
      expect(source, file).not.toContain("bg-[linear-gradient");
      expect(source, file).not.toContain("border-[var(");
      expect(source, file).not.toContain("shadow-[");
      expect(source, file).not.toContain("text-[var(");
      expect(source, file).not.toContain("bg-[var(");
      expect(source, file).not.toMatch(/<(?:Copy|Trash2|RefreshCw|Plus)[^>]*className=/);
    }

    const presetsSource = readFileSync("src/components/PresetsPage.tsx", "utf8");
    expect(presetsSource).toContain("PRESET_CARD_CLASS");
    expect(presetsSource).toContain("bg-card");
    expect(presetsSource).not.toContain('PRESET_BUILTIN_CARD_CLASS = "builtin bg-muted');
  });

  it("keeps the app shell background on semantic tokens", () => {
    const source = readFileSync("src/App.tsx", "utf8");

    expect(source).not.toContain("bg-[var(");
  });

  it("defines desktop shell tokens without raw utility color overrides", () => {
    const css = readFileSync("src/index.css", "utf8");

    expect(css).toContain("--shadow-panel:");
    expect(css).toContain("--shadow-floating:");
    expect(css).toContain("--shadow-toolbar:");
    expect(css).toContain("--shadow-panel: 0 1px 2px");
    expect(css).toContain("0 18px 45px");
    expect(css).toContain("--shadow-toolbar: 0 1px 0");
    expect(css).toContain("--background: oklch(0.986 0.012 230)");
    expect(css).toContain("--foreground: oklch(0.205 0.035 252)");
    expect(css).toContain("--card: oklch(0.998 0.004 230)");
    expect(css).toContain("--popover: oklch(0.998 0.004 230)");
    expect(css).toContain("--primary: oklch(0.618 0.193 258.3)");
    expect(css).toContain("--primary-foreground: oklch(0.985 0.012 220)");
    expect(css).toContain("--secondary: oklch(0.957 0.018 232)");
    expect(css).toContain("--accent: oklch(0.94 0.032 224)");
    expect(css).toContain("--input: oklch(0.875 0.024 232)");
    expect(css).toContain("--ring: oklch(0.68 0.17 255)");
    expect(css).toContain("--success: oklch(0.53 0.13 170)");
    expect(css).toContain("--warning: oklch(0.57 0.13 78)");
    expect(css).toContain("--info: oklch(0.56 0.15 235)");
    expect(css).toContain("--chart-1: oklch(0.56 0.17 248)");
    expect(css).toContain("--chart-2: oklch(0.58 0.14 172)");
    expect(css).toContain("--chart-3: oklch(0.66 0.16 78)");
    expect(css).toContain("--chart-4: oklch(0.58 0.15 304)");
    expect(css).toContain("--chart-5: oklch(0.64 0.15 28)");
    expect(css).toContain("--color-accent-foreground: var(--accent-foreground)");
    expect(css).toContain("--color-success: var(--success)");
    expect(css).toContain("--color-warning: var(--warning)");
    expect(css).toContain("--color-info: var(--info)");
    expect(css).toContain("--sidebar: oklch(0.952 0.018 232)");
    expect(css).toContain("--sidebar-primary: oklch(0.618 0.193 258.3)");
    expect(css).not.toContain("--background: oklch(1 0 0)");
    expect(css).not.toContain("--foreground: oklch(0.145 0 0)");
    expect(css).not.toContain("--secondary: oklch(0.985 0 0)");
    expect(css).not.toContain("--accent: oklch(0.97 0 0)");
    expect(css).toContain("--background: oklch(0.17 0.02 250)");
    expect(css).toContain("--card: oklch(0.225 0.025 248 / 78%)");
    expect(css).toContain("--border: oklch(0.34 0.032 244 / 76%)");
    expect(css).toContain("--primary: oklch(0.618 0.193 258.3)");
    expect(css).toContain("--success: oklch(0.76 0.13 178)");
    expect(css).toContain("--warning: oklch(0.82 0.15 82)");
    expect(css).toContain("--info: oklch(0.72 0.14 235)");
    expect(css).toContain("text-rendering: geometricPrecision");
    expect(css).toContain("font-synthesis-weight: none");
  });

  it("keeps status colors on shared tone tokens instead of raw utility hues", () => {
    const toneSource = readFileSync("src/components/tone-classes.ts", "utf8");

    expect(toneSource).toContain("success");
    expect(toneSource).toContain("warning");
    expect(toneSource).toContain("info");
    expect(toneSource).toContain("border-success/30 bg-success/10 text-success");
    expect(toneSource).toContain("border-warning/35 bg-warning/10 text-warning");
    expect(toneSource).toContain("border-info/30 bg-info/10 text-info");

    for (const file of [
      "src/components/ProjectDetailPanel.tsx",
      "src/components/LogViewer.tsx",
      "src/components/profile-editor/ModelTestResultDialog.tsx",
    ]) {
      const source = readFileSync(file, "utf8");

      expect(source, file).not.toMatch(/(?:text|bg|border)-(?:yellow|emerald)-\d/);
      expect(source, file).not.toContain("text-white");
    }
  });

  it("keeps profile editor surfaces off raw theme formulas", () => {
    for (const file of [
      "src/components/profile-editor/SandboxEditor.tsx",
      "src/components/profile-editor/EnvEditor.tsx",
      "src/components/profile-editor/StringListEditor.tsx",
      "src/components/profile-editor/DocumentEditorSection.tsx",
      "src/components/profile-editor/SettingsSectionModePanel.tsx",
      "src/components/profile-editor/EnabledPluginsEditor.tsx",
      "src/components/profile-editor/HooksEditor.tsx",
      "src/components/profile-editor/MarketplaceEditor.tsx",
      "src/components/MemoryEditor.tsx",
      "src/components/SkillEditor.tsx",
      "src/components/SessionDetailDrawer.tsx",
    ]) {
      const source = readFileSync(file, "utf8");

      expect(source, file).not.toContain("color-mix");
      expect(source, file).not.toContain("[var(");
      expect(source, file).not.toContain("shadow-[");
      expect(source, file).not.toContain("space-y-");
    }
  });

  it("keeps accordion section focus from drawing a full-row shadcn button ring", () => {
    const source = readFileSync(
      "src/components/profile-editor/SettingsSectionModePanel.tsx",
      "utf8",
    );

    expect(source).toContain("focus-visible:ring-0");
    expect(source).toContain("focus-visible:outline-primary/60");
    expect(source).toContain("hover:border-muted-foreground/40");
    expect(source).toContain("dark:hover:bg-transparent");
    expect(source).toContain("cursor-pointer");
    expect(source).toContain("px-5 py-3");
    expect(source).toContain("min-h-10");
    expect(source).toContain("event.stopPropagation()");
    expect(source).not.toContain(
      'className="flex w-full cursor-pointer items-center justify-between gap-4 bg-transparent px-6 py-5"',
    );
    expect(source).not.toContain(
      "gap-3 self-stretch whitespace-normal rounded-md bg-transparent px-2 py-5",
    );
    expect(source).not.toContain("self-stretch whitespace-normal rounded-none");
  });

  it("keeps profile editor mode switches noticeable without stealing focus", () => {
    for (const file of [
      "src/components/profile-editor/SettingsSectionModePanel.tsx",
      "src/components/profile-editor/DocumentEditorSection.tsx",
    ]) {
      const source = readFileSync(file, "utf8");

      expect(source, file).toContain("border-border/80 bg-muted/40 p-1 shadow-xs");
      expect(source, file).toContain("hover:bg-primary/10 hover:text-primary");
      expect(source, file).toContain("bg-primary/10 text-primary shadow-xs");
      expect(source, file).not.toContain("border-primary/30");
      expect(source, file).not.toContain("ring-primary/10");
      expect(source, file).not.toContain("bg-primary text-primary-foreground");
      expect(source, file).not.toContain("border border-border bg-muted/50 p-1");
    }
  });

  it("keeps switch controls large enough for comfortable pointer use", () => {
    const source = readFileSync("src/components/ui/switch.tsx", "utf8");

    expect(source).toContain("data-[size=default]:h-6 data-[size=default]:w-11");
    expect(source).toContain("data-[size=sm]:h-5 data-[size=sm]:w-9");
    expect(source).toContain("group-data-[size=default]/switch:size-5");
    expect(source).toContain("group-data-[size=sm]/switch:size-4");
    expect(source).toContain("data-[state=checked]:translate-x-[calc(100%+2px)]");
    expect(source).not.toContain("data-[size=default]:h-[1.15rem]");
    expect(source).not.toContain("data-[size=sm]:h-3.5");
  });

  it("keeps text-adjacent switch hit areas clickable", () => {
    for (const file of [
      "src/components/profile-editor/SandboxEditor.tsx",
      "src/components/MemoryItem.tsx",
      "src/components/SkillItem.tsx",
    ]) {
      const source = readFileSync(file, "utf8");

      expect(source, file).toContain('data-slot="switch-hit-area"');
      expect(source, file).toContain("cursor-pointer");
    }
  });

  it("keeps memory and skill switch hit areas quiet until hover", () => {
    for (const file of ["src/components/MemoryItem.tsx", "src/components/SkillItem.tsx"]) {
      const source = readFileSync(file, "utf8");

      expect(source, file).toContain("border border-transparent bg-transparent");
      expect(source, file).toContain("hover:border-border/80 hover:bg-card/80");
      expect(source, file).toContain("focus-within:border-border/80 focus-within:bg-card/80");
      expect(source, file).not.toContain("border border-border/80 bg-card/80");
    }
  });

  it("keeps split editor drawers on semantic sheet surfaces", () => {
    for (const file of [
      "src/components/ProfilesPage.tsx",
      "src/components/PresetsPage.tsx",
      "src/components/MemoryPage.tsx",
      "src/components/SkillsPage.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("shadow-[-");
    }
  });

  it("keeps global page and drawer canvases visually separated from content surfaces", () => {
    for (const file of [
      "src/components/ProfileEditor.tsx",
      "src/components/PresetEditor.tsx",
      "src/components/MemoryEditor.tsx",
      "src/components/SkillEditor.tsx",
      "src/components/usage/SessionUsageDrawer.tsx",
      "src/components/SessionDetailDrawer.tsx",
      "src/components/StatsPage.tsx",
      "src/components/UsagePage.tsx",
      "src/components/ProjectsPage.tsx",
      "src/components/HistoryPage.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("bg-secondary");
    }

    const statsSource = readFileSync("src/components/StatsPage.tsx", "utf8");
    const usageSource = readFileSync("src/components/UsagePage.tsx", "utf8");
    const projectsSource = readFileSync("src/components/ProjectsPage.tsx", "utf8");
    const historySource = readFileSync("src/components/HistoryPage.tsx", "utf8");
    const historyProjectsSource = readFileSync("src/components/HistoryProjectList.tsx", "utf8");
    const historySessionsSource = readFileSync("src/components/HistorySessionList.tsx", "utf8");
    const overviewSource = readFileSync("src/components/ClaudeOverviewPage.tsx", "utf8");

    expect(statsSource).toContain('surface="secondary"');
    expect(usageSource).toContain('surface="secondary"');
    expect(projectsSource).toContain('surface="secondary"');
    expect(historySource).toContain('surface="secondary"');
    expect(historySource).toContain("history-body grid min-h-0 flex-1");
    expect(historySource).toContain("PANEL_SURFACE_CLASS");
    expect(historyProjectsSource).toContain("PANEL_SURFACE_CLASS");
    expect(historyProjectsSource).not.toContain("border-r bg-secondary");
    expect(historySessionsSource).toContain("bg-card");
    expect(historySessionsSource).not.toContain("bg-secondary px-3 py-2");
    expect(projectsSource).toContain("projects-body flex min-h-0 flex-1 gap-3");
    expect(projectsSource).toContain("projects-list flex w-[280px]");
    expect(projectsSource).toContain(
      "projects-list-card gap-0 rounded-lg border-border/80 bg-card",
    );
    expect(projectsSource).toContain("PANEL_SURFACE_CLASS");
    expect(projectsSource).not.toContain("border-r bg-secondary");
    expect(projectsSource).not.toContain("border-transparent bg-transparent");
    expect(projectsSource).not.toContain(
      "projects-list-card gap-0 rounded-lg border-border/80 bg-background",
    );
    expect(overviewSource).toContain("claude-overview-page relative flex h-full w-full");
    expect(overviewSource).toContain("claude-overview-header flex min-h-12 shrink-0 flex-wrap");
    expect(overviewSource).toContain("supports-[backdrop-filter]:bg-secondary/90");
    expect(overviewSource).not.toContain("bg-card/95 px-4 py-2 shadow-toolbar");
    expect(overviewSource).toContain(
      "claude-overview-body grid min-h-0 w-full flex-1 bg-secondary p-3",
    );
    expect(overviewSource).toContain(
      "grid-cols-[minmax(0,var(--claude-overview-preview-width))_8px_minmax(0,var(--claude-overview-tree-width))]",
    );
    expect(overviewSource).toContain(
      "claude-overview-preview-pane flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border",
    );
    expect(overviewSource).toContain(
      "claude-overview-tree-pane flex min-h-0 min-w-0 w-full overflow-hidden",
    );
    expect(overviewSource).toContain("claude-overview-tree-ready h-full min-h-0 w-full flex-1");
    expect(overviewSource).toContain("PANEL_SURFACE_CLASS");
    expect(overviewSource).toContain("TREE_PANE_RATIO_STORAGE_KEY");
    expect(overviewSource).toContain('"--trees-font-size-override": "0.8125rem"');
    expect(overviewSource).toContain('"--diffs-light-bg": "var(--card)"');
    expect(overviewSource).not.toContain(
      "claude-overview-tree-pane min-h-0 min-w-0 overflow-hidden bg-secondary p-2",
    );
  });

  it("keeps the projects detail hero on card panels instead of the page canvas", () => {
    const detailSource = readFileSync("src/components/ProjectDetailPanel.tsx", "utf8");

    expect(detailSource).toContain("projects-hero grid gap-6");
    expect(detailSource).toContain("lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.95fr)]");
    expect(detailSource).toContain("projects-hero-main flex min-w-0 flex-col gap-4 rounded-lg p-5");
    expect(detailSource).toContain("projects-hero-side min-w-0 gap-4 rounded-lg p-5");
    expect(detailSource).toContain("projects-agents-panel gap-5 rounded-lg p-5");
    expect(detailSource).toContain("PROJECT_TAG_PAIR_CLASS");
    expect(detailSource).toContain("PANEL_SURFACE_CLASS");
    expect(detailSource).not.toContain("projects-status-strip");
    expect(detailSource).not.toContain("projects-status-item");
    expect(detailSource).not.toContain("projects-hero grid gap-6 border-b pb-5");
    expect(detailSource).not.toContain("SUBTLE_SURFACE_CLASS");
  });

  it("keeps session detail drawer content panels distinct from the secondary canvas", () => {
    const source = readFileSync("src/components/SessionDetailDrawer.tsx", "utf8");

    expect(source).toContain("border-l bg-secondary");
    expect(source).toContain('SheetHeader className="shrink-0 border-b bg-card/95');
    expect(source).toContain('data-slot="session-event"');
    expect(source).toContain("rounded-md border bg-card px-3 py-2 shadow-xs");
    expect(source).toContain("rounded-md border bg-background px-3 py-2");
    expect(source).toContain("rounded-sm bg-card px-1.5 py-0.5");
    expect(source).not.toContain("rounded-md border bg-muted/20 px-3 py-2");
    expect(source).not.toContain("rounded-md border bg-muted/40 px-3 py-2");
  });

  it("keeps usage session detail summary cards on bright panel surfaces", () => {
    const source = readFileSync("src/components/usage/SessionUsageDrawer.tsx", "utf8");

    expect(source).toContain("bg-secondary");
    expect(source).toContain("usage-summary-card grid gap-1 rounded-lg border p-3");
    expect(source).toContain("PANEL_SURFACE_CLASS");
    expect(source).not.toContain("SUBTLE_SURFACE_CLASS");
  });

  it("keeps stats project detail metric cards on bright panel surfaces", () => {
    const source = readFileSync("src/components/StatsPage.tsx", "utf8");

    expect(source).toContain("stats-project-body flex flex-col gap-4 border-t bg-muted/20 p-4");
    expect(source).toMatch(
      /"stats-project-metric flex min-w-0 flex-col gap-1 rounded-md border p-3",\s*PANEL_SURFACE_CLASS/,
    );
    expect(source).toMatch(
      /"stats-performance-card min-w-0 rounded-md border p-3",\s*PANEL_SURFACE_CLASS/,
    );
    expect(source).not.toMatch(
      /"stats-project-metric flex min-w-0 flex-col gap-1 rounded-md border p-3",\s*SUBTLE_SURFACE_CLASS/,
    );
    expect(source).not.toMatch(
      /"stats-performance-card min-w-0 rounded-md border p-3",\s*SUBTLE_SURFACE_CLASS/,
    );
  });

  it("keeps local surface controls responsive without thick focus treatment", () => {
    const surfaceSource = readFileSync("src/components/surface-classes.ts", "utf8");
    const memoryEditorSource = readFileSync("src/components/MemoryEditor.tsx", "utf8");
    const inputSource = readFileSync("src/components/ui/input.tsx", "utf8");
    const selectSource = readFileSync("src/components/ui/select.tsx", "utf8");
    const textareaSource = readFileSync("src/components/ui/textarea.tsx", "utf8");
    const buttonSource = readFileSync("src/components/ui/button.tsx", "utf8");

    expect(surfaceSource).toContain("bg-background");
    expect(surfaceSource).toContain("hover:bg-muted");
    expect(surfaceSource).toContain("hover:border-muted-foreground/45");
    expect(surfaceSource).toContain("focus-visible:bg-background");
    expect(surfaceSource).toContain("focus-visible:ring-0");
    expect(surfaceSource).toContain("focus-within:bg-background");
    expect(surfaceSource).toContain("focus-within:ring-0");
    expect(surfaceSource).toContain("ring-border/30");
    expect(surfaceSource).toContain("bg-secondary/45");
    expect(surfaceSource).not.toContain("focus-visible:shadow-toolbar");
    expect(surfaceSource).not.toContain("focus-within:shadow-toolbar");
    expect(inputSource).toContain("border-input bg-background");
    expect(selectSource).toContain("border-input bg-background");
    expect(textareaSource).toContain("border-input bg-background");
    expect(buttonSource).toContain("outline:");
    expect(buttonSource).toContain("border border-input bg-card");
    expect(memoryEditorSource).toContain("group-focus-within/memory-target:bg-muted/60");
    expect(memoryEditorSource).toContain('data-slot="memory-editor-section"');
    expect(memoryEditorSource).toContain("PANEL_SURFACE_CLASS");
    expect(memoryEditorSource).toContain("SUBTLE_SURFACE_CLASS");
    expect(memoryEditorSource).toContain("bg-secondary");
    expect(memoryEditorSource).not.toContain("group-focus-within/memory-target:shadow-toolbar");
  });

  it("keeps memory and skill editors on card-like content sections over the secondary canvas", () => {
    const memoryEditorSource = readFileSync("src/components/MemoryEditor.tsx", "utf8");
    const skillEditorSource = readFileSync("src/components/SkillEditor.tsx", "utf8");

    expect(memoryEditorSource).toContain('data-slot="memory-editor-section"');
    expect(skillEditorSource).toContain('data-slot="skill-editor-section"');
    expect(memoryEditorSource).toContain("PANEL_SURFACE_CLASS");
    expect(skillEditorSource).toContain("PANEL_SURFACE_CLASS");
    expect(memoryEditorSource).toContain("bg-secondary");
    expect(skillEditorSource).toContain("bg-secondary");
  });

  it("routes shared typography hierarchy through typography classes", () => {
    for (const [file, expectedTokens] of [
      ["src/components/PageHeader.tsx", ["TYPOGRAPHY.pageTitle", "TYPOGRAPHY.pageDescription"]],
      ["src/components/editor-layout.tsx", ["TYPOGRAPHY.sectionTitle"]],
      ["src/components/profile-editor/SettingsSectionModePanel.tsx", ["TYPOGRAPHY.sectionTitle"]],
      ["src/components/profile-editor/DocumentEditorSection.tsx", ["TYPOGRAPHY.sectionTitle"]],
      ["src/components/ui/card.tsx", ["TYPOGRAPHY.cardTitle"]],
      ["src/components/ui/dialog.tsx", ["TYPOGRAPHY.dialogTitle"]],
      ["src/components/ui/alert-dialog.tsx", ["TYPOGRAPHY.dialogTitle"]],
      ["src/components/ui/sheet.tsx", ["TYPOGRAPHY.drawerTitle"]],
    ] as const) {
      const source = readFileSync(file, "utf8");

      for (const token of expectedTokens) {
        expect(source, file).toContain(token);
      }
    }
  });

  it("routes page-level typography refinements through the shared hierarchy", () => {
    for (const [file, expectedTokens] of [
      ["src/components/ClaudeOverviewPage.tsx", ["TYPOGRAPHY.pageTitle"]],
      ["src/components/ProjectDetailPanel.tsx", ["TYPOGRAPHY.pageTitle"]],
      ["src/components/ProfilesPage.tsx", ["TYPOGRAPHY.badge"]],
      ["src/components/PresetsPage.tsx", ["TYPOGRAPHY.mutedBody"]],
      [
        "src/components/UsagePage.tsx",
        ["TYPOGRAPHY.metricEmphasis", "TYPOGRAPHY.metricValue", "[&_.num]:tabular-nums"],
      ],
    ] as const) {
      const source = readFileSync(file, "utf8");

      for (const token of expectedTokens) {
        expect(source, file).toContain(token);
      }
    }
  });

  it("uses InputGroup for plugin list search affordance", () => {
    const source = readFileSync("src/components/profile-editor/EnabledPluginsTab.tsx", "utf8");

    expect(source).toContain("InputGroup");
    expect(source).toContain("InputGroupInput");
  });
});
