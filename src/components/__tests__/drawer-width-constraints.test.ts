import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("drawer width constraints", () => {
  it("does not rely on horizontal scrolling for the main drawer", () => {
    const css = readText("src/index.css");
    const drawerRule = css.match(/\.drawer\s*\{(?<body>[\s\S]*?)\n {2}\}/)?.groups?.body ?? "";

    expect(css).toContain(".drawer {");
    expect(drawerRule).not.toContain("overflow-x: auto;");
  });

  it("keeps config editors at a shared minimum width and raises the app window minimum width to match", () => {
    const globalCss = readText("src/index.css");
    const profileEditorSource = readText("src/components/ProfileEditor.tsx");
    const tauriConfig = JSON.parse(readText("src-tauri/tauri.conf.json")) as {
      app?: {
        windows?: Array<{ minWidth?: number }>;
      };
    };

    expect(globalCss).toContain("--config-editor-min-width: 560px;");
    expect(profileEditorSource).toContain("profile-editor-panel");
    expect(profileEditorSource).toContain("min-w-[var(--config-editor-min-width)]");
    expect(tauriConfig.app?.windows?.[0]?.minWidth).toBe(620);
  });

  it("keeps the config editor scroll surface full width while constraining form content", () => {
    const profileEditorSource = readText("src/components/ProfileEditor.tsx");
    const presetEditorSource = readText("src/components/PresetEditor.tsx");

    expect(profileEditorSource).toContain("profile-editor-body");
    expect(profileEditorSource).toContain("items-center");
    expect(profileEditorSource).toContain("[&>:not(.editor-badge-large)]:w-[min(100%,880px)]");
    expect(presetEditorSource).toContain("preset-editor-panel");
    expect(presetEditorSource).toContain("min-w-[var(--config-editor-min-width)]");
    expect(presetEditorSource).toContain("preset-editor-body");
    expect(presetEditorSource).toContain("items-center");
    expect(presetEditorSource).toContain("[&>:not(.editor-badge-large)]:w-[min(100%,880px)]");
  });
});
