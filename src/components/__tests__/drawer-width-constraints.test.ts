import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("drawer width constraints", () => {
  it("does not rely on horizontal scrolling for the main drawer", () => {
    const css = readText("src/index.css");

    expect(css).toContain(".drawer {");
    expect(css).not.toContain("overflow-x: auto;");
  });

  it("keeps config editors at a shared minimum width and raises the app window minimum width to match", () => {
    const globalCss = readText("src/index.css");
    const profileEditorSource = readText("src/components/ProfileEditor.tsx");
    const configEditorCss = readText("src/components/ConfigEditor.css");
    const tauriConfig = JSON.parse(readText("src-tauri/tauri.conf.json")) as {
      app?: {
        windows?: Array<{ minWidth?: number }>;
      };
    };

    expect(globalCss).toContain("--config-editor-min-width: 560px;");
    expect(profileEditorSource).toContain("profile-editor-panel");
    expect(profileEditorSource).toContain("min-w-[var(--config-editor-min-width)]");
    expect(configEditorCss).toContain(".modal-large {");
    expect(configEditorCss).toContain("min-width: var(--config-editor-min-width);");
    expect(tauriConfig.app?.windows?.[0]?.minWidth).toBe(620);
  });

  it("keeps the config editor scroll surface full width while constraining form content", () => {
    const profileEditorSource = readText("src/components/ProfileEditor.tsx");
    const presetEditorCss = readText("src/components/PresetEditor.css");

    expect(profileEditorSource).toContain("profile-editor-body");
    expect(profileEditorSource).toContain("items-center");
    expect(profileEditorSource).toContain("[&>:not(.editor-badge-large)]:w-[min(100%,880px)]");
    expect(presetEditorCss).toMatch(
      /\.preset-editor-body\s*\{[\s\S]*?max-width:\s*none;[\s\S]*?margin:\s*0;[\s\S]*?align-items:\s*center;/,
    );
    expect(presetEditorCss).toMatch(
      /\.preset-editor-body\s*>\s*:not\(\.editor-badge-large\)\s*\{[\s\S]*?width:\s*min\(100%,\s*880px\);/,
    );
  });
});
