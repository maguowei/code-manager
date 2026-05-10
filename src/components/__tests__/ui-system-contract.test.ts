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
    expect(css).toContain("--background: oklch(0.988 0.016 214)");
    expect(css).toContain("--card: oklch(1 0 0)");
    expect(css).toContain("--popover: oklch(1 0 0 / 98%)");
    expect(css).toContain("--primary: oklch(0.618 0.193 258.3)");
    expect(css).toContain("--secondary: oklch(0.94 0.026 216)");
    expect(css).toContain("--accent: oklch(0.925 0.07 212 / 56%)");
    expect(css).toContain("--input: oklch(0.78 0.045 220 / 62%)");
    expect(css).toContain("--ring: oklch(0.68 0.17 255)");
    expect(css).toContain("--chart-1: oklch(0.66 0.2 255)");
    expect(css).toContain("--chart-2: oklch(0.76 0.16 205)");
    expect(css).toContain("--color-accent-foreground: var(--accent-foreground)");
    expect(css).toContain("--sidebar: oklch(0.95 0.026 214 / 68%)");
    expect(css).toContain("--sidebar-primary: oklch(0.618 0.193 258.3)");
    expect(css).toContain("--background: oklch(0.176 0.014 258.4)");
    expect(css).toContain("--card: oklch(0.22 0.016 256.8 / 74%)");
    expect(css).toContain("--border: oklch(0.33 0.015 252.3 / 76%)");
    expect(css).toContain("--primary: oklch(0.618 0.193 258.3)");
    expect(css).toContain("text-rendering: geometricPrecision");
    expect(css).toContain("font-synthesis-weight: none");
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
    expect(source).not.toContain("self-stretch whitespace-normal rounded-none");
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
    const overviewSource = readFileSync("src/components/ClaudeOverviewPage.tsx", "utf8");

    expect(statsSource).toContain('surface="secondary"');
    expect(usageSource).toContain('surface="secondary"');
    expect(projectsSource).toContain('surface="secondary"');
    expect(historySource).toContain('surface="secondary"');
    expect(overviewSource).toContain("claude-overview-preview-pane");
    expect(overviewSource).toContain("bg-card");
    expect(overviewSource).toContain("claude-overview-tree-pane");
    expect(overviewSource).toContain("bg-secondary");
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

  it("uses InputGroup for plugin list search affordance", () => {
    const source = readFileSync("src/components/profile-editor/EnabledPluginsEditor.tsx", "utf8");

    expect(source).toContain("InputGroup");
    expect(source).toContain("InputGroupInput");
  });
});
