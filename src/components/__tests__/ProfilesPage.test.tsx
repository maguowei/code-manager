import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ConfigWorkspace } from "../../types";
import ProfilesPage from "../ProfilesPage";

const { invokeMock, showToastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
  showToastMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

vi.mock("../ConfigPreview", () => ({
  default: ({
    content,
    onChange,
    jsonError,
  }: {
    content: string;
    onChange?: (value: string) => void;
    jsonError?: string;
  }) => (
    <div>
      {onChange ? (
        <textarea
          aria-label="config-preview-input"
          value={content}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <pre data-testid="config-preview-output">{content}</pre>
      )}
      {jsonError ? <span>{jsonError}</span> : null}
    </div>
  ),
}));

const SETTINGS_STORAGE_KEY = "ai-manager-settings";

const WORKSPACE_FIXTURE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    uiLanguage: "zh",
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
      description: "OpenRouter 预设",
      modelSuggestions: ["claude-sonnet-4-6"],
      settingsPatch: {},
      source: "builtin",
    },
  ],
  customPresets: [],
  profiles: [
    {
      id: "user-openrouter",
      name: "OpenRouter User",
      description: "默认用户配置",
      presetId: "builtin:openrouter",
      settings: {
        env: {
          ANTHROPIC_AUTH_TOKEN: "token",
          ANTHROPIC_MODEL: "claude-sonnet-4-6",
          CLAUDE_CODE_EFFORT_LEVEL: "high",
        },
        enabledPlugins: {
          "formatter@anthropic-tools": true,
          "docs@anthropic-tools": false,
        },
      },
      createdAt: "2026-04-18T12:00:00Z",
      updatedAt: "2026-04-18T12:00:00Z",
    },
  ],
  bindings: {
    userProfileId: "user-openrouter",
  },
} as ConfigWorkspace;

function renderPage() {
  render(
    <I18nProvider>
      <ProfilesPage workspace={WORKSPACE_FIXTURE} onWorkspaceChange={async () => {}} />
    </I18nProvider>,
  );
}

function makeProfile(id: string, name: string) {
  return {
    id,
    name,
    description: `${name} 描述`,
    presetId: "builtin:openrouter",
    settings: {
      env: {
        ANTHROPIC_MODEL: `model-${id}`,
      },
    },
    createdAt: "2026-04-18T12:00:00Z",
    updatedAt: "2026-04-18T12:00:00Z",
  } as ConfigWorkspace["profiles"][number];
}

describe("ProfilesPage", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    showToastMock.mockReset();
    invokeMock.mockResolvedValue(null);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn(async () => undefined),
      },
      configurable: true,
    });
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      configurable: true,
    });
  });

  it("renders legacy config card summaries and actions in zh", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );

    renderPage();

    expect(screen.getByRole("heading", { name: "配置档案" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /新增档案/ })).toBeInTheDocument();

    const card = screen.getByText("OpenRouter User").closest(".profile-card") as HTMLElement | null;
    expect(card).not.toBeNull();
    if (!card) {
      return;
    }

    expect(within(card).queryByText("用户")).not.toBeInTheDocument();
    expect(within(card).getByText("使用中")).toBeInTheDocument();
    expect(within(card).queryByText("已应用到用户设置")).not.toBeInTheDocument();
    expect(within(card).getByText("开放路由")).toBeInTheDocument();
    expect(within(card).getByText("claude-sonnet-4-6")).toBeInTheDocument();
    expect(within(card).getByText("high")).toBeInTheDocument();
    expect(within(card).getByText("已启用 1/2")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "应用" })).not.toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "复制环境变量" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "复制" })).toBeInTheDocument();
  });

  it("renders profile cards in workspace order without re-sorting them", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );

    const orderedWorkspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [makeProfile("profile-b", "Beta"), makeProfile("profile-a", "Alpha")],
      bindings: {
        userProfileId: undefined,
      },
    } as ConfigWorkspace;

    render(
      <I18nProvider>
        <ProfilesPage workspace={orderedWorkspace} onWorkspaceChange={async () => {}} />
      </I18nProvider>,
    );

    const cardTitles = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
    expect(cardTitles).toEqual(["Beta", "Alpha"]);
  });

  it("copies resolved env exports from the card actions", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "preview_profile") {
        return JSON.stringify({
          env: {
            ANTHROPIC_AUTH_TOKEN: "token",
            ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
          },
          model: "claude-sonnet-4-6",
          effortLevel: "high",
        });
      }
      return null;
    });

    renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "复制环境变量" }));
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "preview_profile",
      expect.objectContaining({
        data: expect.objectContaining({
          id: "user-openrouter",
          name: "OpenRouter User",
        }),
      }),
    );
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        [
          'export ANTHROPIC_AUTH_TOKEN="token"',
          'export ANTHROPIC_BASE_URL="https://openrouter.ai/api"',
          'export ANTHROPIC_MODEL="claude-sonnet-4-6"',
          'export CLAUDE_CODE_EFFORT_LEVEL="high"',
        ].join("\n"),
      );
    });
  });

  it("duplicates a profile directly from the card without opening the editor", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    const onWorkspaceChange = vi.fn(async () => {});

    render(
      <I18nProvider>
        <ProfilesPage workspace={WORKSPACE_FIXTURE} onWorkspaceChange={onWorkspaceChange} />
      </I18nProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "复制" }));
      await Promise.resolve();
    });

    expect(screen.queryByRole("heading", { name: "新增档案" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("名称")).not.toBeInTheDocument();

    expect(invokeMock).toHaveBeenCalledWith(
      "upsert_profile",
      expect.objectContaining({
        data: expect.objectContaining({
          id: undefined,
          name: "OpenRouter User 副本",
          description: "默认用户配置",
          presetId: "builtin:openrouter",
        }),
      }),
    );
    expect(onWorkspaceChange).toHaveBeenCalledTimes(1);
    expect(showToastMock).toHaveBeenCalledWith("档案已复制");
  });

  it("keeps the list page state unchanged when duplicate fails", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    const onWorkspaceChange = vi.fn(async () => {});
    invokeMock.mockRejectedValueOnce(new Error("duplicate failed"));

    render(
      <I18nProvider>
        <ProfilesPage workspace={WORKSPACE_FIXTURE} onWorkspaceChange={onWorkspaceChange} />
      </I18nProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "复制" }));
      await Promise.resolve();
    });

    expect(screen.queryByRole("heading", { name: "新增档案" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("名称")).not.toBeInTheDocument();
    expect(onWorkspaceChange).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith("复制档案失败", "error");
  });

  it("persists drag reordering for profile cards", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    const onWorkspaceChange = vi.fn(async () => {});
    const orderedWorkspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [makeProfile("profile-a", "Alpha"), makeProfile("profile-b", "Beta")],
      bindings: {
        userProfileId: undefined,
      },
    } as ConfigWorkspace;

    render(
      <I18nProvider>
        <ProfilesPage workspace={orderedWorkspace} onWorkspaceChange={onWorkspaceChange} />
      </I18nProvider>,
    );

    const firstCard = screen.getByText("Alpha").closest(".profile-card") as HTMLElement | null;
    const secondCard = screen.getByText("Beta").closest(".profile-card") as HTMLElement | null;
    expect(firstCard).not.toBeNull();
    expect(secondCard).not.toBeNull();
    if (!firstCard || !secondCard) {
      return;
    }

    Object.defineProperty(secondCard, "getBoundingClientRect", {
      value: () => ({
        top: 100,
        height: 80,
        left: 0,
        right: 200,
        bottom: 180,
        width: 200,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      }),
      configurable: true,
    });

    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      setData: vi.fn(),
      getData: vi.fn(),
    } as unknown as DataTransfer;

    await act(async () => {
      fireEvent.dragStart(firstCard, { dataTransfer });
      fireEvent.dragOver(secondCard, { clientY: 170, dataTransfer });
      fireEvent.drop(secondCard, { clientY: 170, dataTransfer });
      fireEvent.dragEnd(firstCard, { dataTransfer });
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith("reorder_profiles", {
      ids: ["profile-b", "profile-a"],
    });
    expect(onWorkspaceChange).toHaveBeenCalledTimes(1);
  });
});
