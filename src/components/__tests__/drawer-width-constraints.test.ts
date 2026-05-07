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

    expect(profileEditorSource).toContain('data-slot="profile-editor-body"');
    expect(profileEditorSource).toContain("items-center");
    expect(profileEditorSource).toContain(
      "[&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]",
    );
    expect(presetEditorSource).toContain('data-slot="preset-editor-panel"');
    expect(presetEditorSource).toContain("min-w-[560px]");
    expect(presetEditorSource).toContain('data-slot="preset-editor-body"');
    expect(presetEditorSource).toContain("items-center");
    expect(presetEditorSource).toContain(
      "[&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]",
    );
  });
});
