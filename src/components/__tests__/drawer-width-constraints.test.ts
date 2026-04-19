import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("drawer width constraints", () => {
  it("does not rely on horizontal scrolling for the main drawer", () => {
    const css = readText("src/App.css");

    expect(css).toContain(".drawer {");
    expect(css).not.toContain("overflow-x: auto;");
  });

  it("keeps config editors at a shared minimum width and raises the app window minimum width to match", () => {
    const sharedCss = readText("src/styles/shared.css");
    const profileEditorCss = readText("src/components/ProfileEditor.css");
    const configEditorCss = readText("src/components/ConfigEditor.css");
    const tauriConfig = JSON.parse(readText("src-tauri/tauri.conf.json")) as {
      app?: {
        windows?: Array<{ minWidth?: number }>;
      };
    };

    expect(sharedCss).toContain("--config-editor-min-width: 560px;");
    expect(profileEditorCss).toContain(".profile-editor-panel,");
    expect(profileEditorCss).toContain("min-width: var(--config-editor-min-width);");
    expect(configEditorCss).toContain(".modal-large {");
    expect(configEditorCss).toContain("min-width: var(--config-editor-min-width);");
    expect(tauriConfig.app?.windows?.[0]?.minWidth).toBe(620);
  });
});
