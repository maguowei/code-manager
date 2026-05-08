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

    expect(source).not.toContain("from-[var(");
    expect(source).not.toContain("text-[var(");
    expect(source).not.toContain("bg-[var(");
    expect(source).not.toContain("shadow-[");
    expect(source).not.toMatch(/<Icon[^>]*className=/);
    expect(source).not.toMatch(/<Settings[^>]*className=/);
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
    expect(css).toContain("--background: oklch(0.976 0.004 255)");
    expect(css).toContain("--sidebar: oklch(0.932 0.006 255)");
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

  it("uses InputGroup for plugin list search affordance", () => {
    const source = readFileSync("src/components/profile-editor/EnabledPluginsEditor.tsx", "utf8");

    expect(source).toContain("InputGroup");
    expect(source).toContain("InputGroupInput");
  });
});
