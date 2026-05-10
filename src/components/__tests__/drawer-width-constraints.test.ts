import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("drawer width constraints", () => {
  it("does not restore legacy drawer CSS in the global stylesheet", () => {
    const css = readText("src/index.css");

    expect(css).not.toContain(".drawer {");
    expect(css).not.toContain("overflow-x: auto;");
  });

  it("keeps config editors at a shared minimum width and raises the app window minimum width to match", () => {
    const globalCss = readText("src/index.css");
    const profileEditorSource = readText("src/components/ProfileEditor.tsx");
    const tauriConfig = JSON.parse(readText("src-tauri/tauri.conf.json")) as {
      app?: {
        windows?: Array<{ minWidth?: number }>;
      };
    };

    expect(globalCss).not.toContain("--config-editor-min-width");
    expect(profileEditorSource).toContain('data-slot="profile-editor-panel"');
    expect(profileEditorSource).toContain("min-w-[560px]");
    expect(tauriConfig.app?.windows?.[0]?.minWidth).toBe(620);
  });

  it("keeps the config editor scroll surface full width while constraining form content", () => {
    const profileEditorSource = readText("src/components/ProfileEditor.tsx");
    const presetEditorSource = readText("src/components/PresetEditor.tsx");
    const memoryEditorSource = readText("src/components/MemoryEditor.tsx");
    const skillEditorSource = readText("src/components/SkillEditor.tsx");

    expect(profileEditorSource).toContain('data-slot="profile-editor-body"');
    expect(profileEditorSource).toContain("items-center");
    expect(profileEditorSource).toContain("bg-secondary");
    expect(profileEditorSource).toContain(
      "[&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]",
    );
    expect(presetEditorSource).toContain('data-slot="preset-editor-panel"');
    expect(presetEditorSource).toContain("min-w-[560px]");
    expect(presetEditorSource).toContain('data-slot="preset-editor-body"');
    expect(presetEditorSource).toContain("items-center");
    expect(presetEditorSource).toContain("bg-secondary");
    expect(presetEditorSource).toContain(
      "[&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]",
    );
    expect(memoryEditorSource).toContain("min-w-[560px]");
    expect(memoryEditorSource).toContain("bg-secondary");
    expect(memoryEditorSource).toContain(
      "[&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]",
    );
    expect(skillEditorSource).toContain("min-w-[560px]");
    expect(skillEditorSource).toContain("bg-secondary");
    expect(skillEditorSource).toContain(
      "[&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]",
    );
  });

  it("offsets list detail drawers after the sidebar and compressed list panel", () => {
    const layoutSizeSource = readText("src/components/layout-size-classes.ts");
    const profilesPageSource = readText("src/components/ProfilesPage.tsx");
    const presetsPageSource = readText("src/components/PresetsPage.tsx");
    const memoryPageSource = readText("src/components/MemoryPage.tsx");
    const skillsPageSource = readText("src/components/SkillsPage.tsx");

    expect(layoutSizeSource).toContain('LIST_PANEL_COMPRESSED_WIDTH_CLASS = "w-[300px]"');
    expect(layoutSizeSource).toContain("LIST_DETAIL_DRAWER_OFFSET_CLASS");
    expect(layoutSizeSource).toContain("left-[360px]");

    for (const source of [
      profilesPageSource,
      presetsPageSource,
      memoryPageSource,
      skillsPageSource,
    ]) {
      expect(source).toContain("LIST_DETAIL_DRAWER_OFFSET_CLASS");
      expect(source).not.toContain("left-[340px]");
    }
  });
});
