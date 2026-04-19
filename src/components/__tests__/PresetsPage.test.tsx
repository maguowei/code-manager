import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ConfigWorkspace } from "../../types";
import PresetsPage from "../PresetsPage";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => null),
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

const SETTINGS_STORAGE_KEY = "ai-manager-settings";

const WORKSPACE_FIXTURE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    uiLanguage: "en",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
  },
  builtinPresets: [
    {
      id: "builtin:openrouter",
      name: "OpenRouter",
      localizedName: {
        zh: "开放路由",
        en: "OpenRouter",
      },
      description: "OpenRouter preset",
      modelSuggestions: ["claude-sonnet-4-6"],
      settingsPatch: {},
      source: "builtin",
    },
  ],
  customPresets: [],
  profiles: [],
  bindings: {
    projectBindings: [],
    localBindings: [],
  },
  knownProjects: [],
};

function renderPage() {
  render(
    <I18nProvider>
      <PresetsPage workspace={WORKSPACE_FIXTURE} onWorkspaceChange={async () => {}} />
    </I18nProvider>,
  );
}

describe("PresetsPage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("switches page copy with the current UI language", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );

    renderPage();

    expect(screen.getByRole("heading", { name: "Presets" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Built-in Presets" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Custom Presets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Preset/ })).toBeInTheDocument();
  });
});
