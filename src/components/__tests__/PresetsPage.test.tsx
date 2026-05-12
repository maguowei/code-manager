import { render, screen, within } from "@testing-library/react";
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
    showTraySessions: true,
    collapseSidebarByDefault: false,
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
      docUrl: "https://docs.example.com/openrouter",
      modelSuggestions: ["claude-sonnet-4-6"],
      settingsPatch: {},
      source: "builtin",
    },
  ],
  customPresets: [],
  profiles: [],
  bindings: {},
} as ConfigWorkspace;

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

  it("renders builtin cards with docs as an inline helper link instead of a standalone action", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );

    renderPage();

    const builtinCard = screen
      .getByRole("heading", { name: "OpenRouter", level: 3 })
      .closest('[data-slot="preset-card"]') as HTMLElement | null;
    expect(builtinCard).not.toBeNull();
    if (!builtinCard) {
      return;
    }

    expect(within(builtinCard).queryByText("OpenRouter preset")).not.toBeInTheDocument();
    expect(within(builtinCard).getByText("builtin:openrouter")).toBeInTheDocument();
    expect(within(builtinCard).getByText("Suggested Models")).toBeInTheDocument();
    expect(within(builtinCard).getByText("claude-sonnet-4-6")).toBeInTheDocument();
    expect(within(builtinCard).queryByRole("button", { name: "Open Docs" })).toBeInTheDocument();
    expect(within(builtinCard).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(builtinCard).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(within(builtinCard).queryByText("Enabled 1/2")).not.toBeInTheDocument();
  });

  it("shows custom-only summaries and keeps docs outside the primary action row", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );

    render(
      <I18nProvider>
        <PresetsPage
          workspace={{
            ...WORKSPACE_FIXTURE,
            customPresets: [
              {
                id: "custom:team-plan",
                name: "Team Plan",
                localizedName: {
                  zh: "团队计划",
                  en: "Team Plan",
                },
                description: "Team default preset",
                basePresetId: "builtin:openrouter",
                docUrl: "https://docs.example.com/team-plan",
                modelSuggestions: ["claude-sonnet-4-6"],
                settingsPatch: {
                  enabledPlugins: {
                    "formatter@anthropic-tools": true,
                    "reviewer@anthropic-tools": false,
                  },
                },
                source: "custom",
              },
            ],
          }}
          onWorkspaceChange={async () => {}}
        />
      </I18nProvider>,
    );

    const customCard = screen
      .getByText("Team Plan")
      .closest('[data-slot="preset-card"]') as HTMLElement | null;
    expect(customCard).not.toBeNull();
    if (!customCard) {
      return;
    }

    expect(within(customCard).queryByText("Team default preset")).not.toBeInTheDocument();
    expect(within(customCard).getByText("Base Preset")).toBeInTheDocument();
    expect(within(customCard).getByText("OpenRouter")).toBeInTheDocument();
    expect(within(customCard).getByText("Suggested Models")).toBeInTheDocument();
    expect(within(customCard).getByText("Enabled")).toBeInTheDocument();
    expect(within(customCard).getByText("1/2")).toBeInTheDocument();
    expect(within(customCard).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(customCard).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(within(customCard).queryByRole("button", { name: "Open Docs" })).toBeInTheDocument();

    const builtinCard = screen
      .getByRole("heading", { name: "OpenRouter", level: 3 })
      .closest('[data-slot="preset-card"]') as HTMLElement | null;
    expect(builtinCard).not.toBeNull();
    if (!builtinCard) {
      return;
    }

    expect(within(builtinCard).queryByText("Enabled 1/2")).not.toBeInTheDocument();
  });
});
