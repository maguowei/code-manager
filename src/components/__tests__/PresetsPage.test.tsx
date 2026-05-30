import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ConfigWorkspace } from "../../types";
import PresetsPage from "../PresetsPage";

const { invokeMock, openUrlMock, showToastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
  openUrlMock: vi.fn(async () => null),
  showToastMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

const SETTINGS_STORAGE_KEY = "ai-manager-settings";

const WORKSPACE_FIXTURE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    showTraySessions: true,
    systemNotificationsEnabled: false,
    collapseSidebarByDefault: false,
    thirdPartyProviderPricingEnabled: true,
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

function renderPage(
  workspace: ConfigWorkspace = WORKSPACE_FIXTURE,
  onOpenProfiles: () => void = vi.fn(),
) {
  render(
    <I18nProvider>
      <PresetsPage
        workspace={workspace}
        onWorkspaceChange={async () => {}}
        onOpenProfiles={onOpenProfiles}
      />
    </I18nProvider>,
  );
}

function workspaceWithCustomPresets(): ConfigWorkspace {
  return {
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
        settingsPatch: {},
        source: "custom",
      },
    ],
  };
}

describe("PresetsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(null);
    openUrlMock.mockClear();
    showToastMock.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => undefined),
      },
    });
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

  it("renders config section tabs with presets selected and opens profiles", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );
    const onOpenProfiles = vi.fn();

    renderPage(WORKSPACE_FIXTURE, onOpenProfiles);

    const tabs = screen.getByRole("group", { name: "Config sections" });
    const profilesTab = within(tabs).getByRole("button", { name: "Profiles" });
    const presetsTab = within(tabs).getByRole("button", { name: "Presets" });

    expect(profilesTab).toHaveAttribute("aria-pressed", "false");
    expect(presetsTab).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(profilesTab);

    expect(onOpenProfiles).toHaveBeenCalledTimes(1);
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

  it("shortens uuid custom preset ids while preserving the full id for copy", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );
    const fullId = "custom:8b7db6e3-1aa9-424e-b70a-54646a89d866";

    renderPage({
      ...WORKSPACE_FIXTURE,
      customPresets: [
        {
          id: fullId,
          name: "General Config",
          localizedName: {
            zh: "通用配置",
            en: "General Config",
          },
          description: "General preset",
          modelSuggestions: [],
          settingsPatch: {},
          source: "custom",
        },
        {
          id: "custom:team-plan",
          name: "Team Plan",
          localizedName: {
            zh: "团队计划",
            en: "Team Plan",
          },
          description: "Team preset",
          modelSuggestions: [],
          settingsPatch: {},
          source: "custom",
        },
      ],
    });

    const uuidCard = screen
      .getByRole("heading", { name: "General Config", level: 3 })
      .closest('[data-slot="preset-card"]') as HTMLElement | null;
    const readableCard = screen
      .getByRole("heading", { name: "Team Plan", level: 3 })
      .closest('[data-slot="preset-card"]') as HTMLElement | null;
    expect(uuidCard).not.toBeNull();
    expect(readableCard).not.toBeNull();
    if (!uuidCard || !readableCard) {
      return;
    }

    expect(within(uuidCard).queryByText(fullId)).not.toBeInTheDocument();
    expect(within(uuidCard).getByText("custom:8b7d…d866")).toHaveAttribute("title", fullId);
    expect(within(readableCard).getByText("custom:team-plan")).toBeInTheDocument();

    fireEvent.click(within(uuidCard).getByRole("button", { name: "Copy ID" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(fullId);
    });
  });

  it("asks before closing a dirty preset editor and can discard changes", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );

    renderPage(workspaceWithCustomPresets());

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue("Team Plan"), {
      target: { value: "Team Plan Draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("heading", { name: "Unsaved changes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Edit Preset" })).not.toBeInTheDocument();
    });
    expect(invokeMock).not.toHaveBeenCalledWith("upsert_preset", expect.anything());
  });

  it("keeps a dirty preset open when saving from the unsaved dialog fails", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );
    invokeMock.mockRejectedValueOnce(new Error("save failed"));

    renderPage(workspaceWithCustomPresets());

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue("Team Plan"), {
      target: { value: "Team Plan Draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and exit" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "upsert_preset",
        expect.objectContaining({
          data: expect.objectContaining({
            id: "custom:team-plan",
            name: "Team Plan Draft",
          }),
        }),
      );
    });
    expect(screen.getByRole("heading", { name: "Edit Preset", hidden: true })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Team Plan Draft")).toBeInTheDocument();
  });

  it("asks before switching to profiles while the preset editor has unsaved changes", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );
    const onOpenProfiles = vi.fn();

    renderPage(workspaceWithCustomPresets(), onOpenProfiles);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue("Team Plan"), {
      target: { value: "Team Plan Draft" },
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Config sections", hidden: true })).getByRole(
        "button",
        {
          name: "Profiles",
          hidden: true,
        },
      ),
    );

    expect(screen.getByRole("heading", { name: "Unsaved changes" })).toBeInTheDocument();
    expect(onOpenProfiles).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onOpenProfiles).toHaveBeenCalledTimes(1);
  });

  it("disables save in the unsaved preset dialog when the draft is invalid", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );

    renderPage(workspaceWithCustomPresets());

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue("团队计划"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByDisplayValue("Team Plan"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("button", { name: "Save and exit" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByRole("heading", { name: "Edit Preset" })).not.toBeInTheDocument();
  });
});
