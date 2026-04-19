import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ConfigProfile, ConfigWorkspace, SettingsPreset } from "../../types";
import ProfileEditor from "../ProfileEditor";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
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

const WORKSPACE_FIXTURE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
  },
  builtinPresets: [],
  customPresets: [],
  profiles: [],
  bindings: {},
} as ConfigWorkspace;

const BUILTIN_PRESETS: SettingsPreset[] = [
  {
    id: "builtin:openrouter",
    name: "OpenRouter",
    localizedName: {
      zh: "开放路由",
      en: "OpenRouter",
    },
    description: "OpenRouter 预设",
    models: [
      { id: "claude-opus-4-1", category: "opus" },
      { id: "claude-sonnet-4-6", category: "sonnet" },
      { id: "claude-haiku-4-5", category: "haiku" },
    ],
    modelSuggestions: ["claude-sonnet-4-6", "claude-opus-4-1"],
    settingsPatch: {
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      },
    },
    source: "builtin",
  },
  {
    id: "custom:team-plan",
    name: "Team Plan",
    localizedName: {
      zh: "团队计划",
      en: "Team Plan",
    },
    description: "Team Plan 预设",
    basePresetId: "builtin:openrouter",
    modelSuggestions: ["claude-haiku-fallback"],
    settingsPatch: {
      permissions: {
        defaultMode: "plan",
      },
    },
    source: "custom",
  },
  {
    id: "custom:explicit-model",
    name: "Explicit Model",
    localizedName: {
      zh: "显式模型",
      en: "Explicit Model",
    },
    description: "显式模型预设",
    basePresetId: "custom:team-plan",
    modelSuggestions: ["claude-sonnet-4-6"],
    settingsPatch: {
      model: "claude-opus-explicit",
    },
    source: "custom",
  },
  {
    id: "custom:env-level-overrides",
    name: "Env Level Overrides",
    localizedName: {
      zh: "环境变量级别覆盖",
      en: "Env Level Overrides",
    },
    description: "环境变量级别覆盖预设",
    basePresetId: "custom:explicit-model",
    modelSuggestions: ["claude-sonnet-4-6"],
    settingsPatch: {
      env: {
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "haiku-env-override",
        CLAUDE_CODE_SUBAGENT_MODEL: "subagent-env-override",
      },
    },
    source: "custom",
  },
];

const PROFILE_FIXTURE: ConfigProfile = {
  id: "user-openrouter",
  name: "OpenRouter User",
  description: "默认用户配置",
  presetId: "builtin:openrouter",
  settings: {
    env: {
      ANTHROPIC_AUTH_TOKEN: "token",
    },
  },
  createdAt: "2026-04-18T12:00:00Z",
  updatedAt: "2026-04-18T12:00:00Z",
};

function renderEditor(options?: {
  profile?: ConfigProfile | null;
  presets?: SettingsPreset[];
  onSave?: (data: {
    id?: string;
    name: string;
    description: string;
    presetId?: string;
    settings: Record<string, unknown>;
  }) => void | Promise<void>;
}) {
  const onSave =
    options?.onSave ??
    vi.fn<
      (data: {
        id?: string;
        name: string;
        description: string;
        presetId?: string;
        settings: Record<string, unknown>;
      }) => void | Promise<void>
    >();
  render(
    <I18nProvider>
      <ProfileEditor
        profile={options?.profile ?? PROFILE_FIXTURE}
        presets={options?.presets ?? BUILTIN_PRESETS}
        onSave={onSave}
        onClose={() => {}}
      />
    </I18nProvider>,
  );
  return { onSave };
}

function getSection(name: string): HTMLElement {
  const section = screen.getByRole("heading", { name, level: 3 }).closest("section");
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

function toggleAccordionSection(name: string) {
  const section = getSection(name);
  const [toggleButton] = within(section).getAllByRole("button");
  fireEvent.click(toggleButton);
  return section;
}

function switchSectionToJson(name: string, options?: { expandFirst?: boolean }) {
  const section = getSection(name);
  if (options?.expandFirst || !within(section).queryByRole("button", { name: "JSON" })) {
    toggleAccordionSection(name);
  }
  fireEvent.click(within(section).getByRole("button", { name: "JSON" }));
  expect(within(section).getAllByLabelText("config-preview-input")).toHaveLength(1);
  expect(within(section).queryByTestId("config-preview-output")).not.toBeInTheDocument();
  return section;
}

function openFullSettingsJson() {
  fireEvent.click(screen.getByRole("button", { name: "整份配置 JSON" }));
  const rawJsonInputs = screen.getAllByLabelText("config-preview-input");
  return rawJsonInputs[rawJsonInputs.length - 1] as HTMLTextAreaElement;
}

describe("ProfileEditor", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      if (command === "get_config_workspace") {
        return WORKSPACE_FIXTURE;
      }
      if (command === "preview_profile") {
        const settings =
          (payload as { data?: { settings?: Record<string, unknown> } } | undefined)?.data
            ?.settings ?? {};
        return JSON.stringify(
          {
            $schema: "https://json.schemastore.org/claude-code-settings.json",
            ...settings,
          },
          null,
          2,
        );
      }
      return null;
    });
  });

  it("renders control-first sections with unified mode switches and downgraded full json entry", async () => {
    renderEditor();

    expect(screen.queryByLabelText("降低动画")).not.toBeInTheDocument();

    for (const heading of [
      "基础信息",
      "认证",
      "模型与行为",
      "环境变量",
      "权限",
      "Sandbox",
      "Hooks",
      "插件市场",
      "插件",
    ]) {
      expect(screen.getByRole("heading", { name: heading, level: 3 })).toBeInTheDocument();
    }
    expect(screen.queryByRole("heading", { name: "集成", level: 3 })).not.toBeInTheDocument();

    const topLevelSectionHeadings = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(topLevelSectionHeadings).toEqual([
      "基础信息",
      "认证",
      "模型与行为",
      "环境变量",
      "权限",
      "Sandbox",
      "Hooks",
      "插件市场",
      "插件",
      "Resolved Preview",
    ]);

    expect(screen.getByRole("button", { name: "整份配置 JSON" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "专家模式" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("env")).not.toBeInTheDocument();

    const authSection = screen.getByRole("heading", { name: "认证", level: 3 }).closest("section");
    const basicSection = screen
      .getByRole("heading", { name: "基础信息", level: 3 })
      .closest("section");
    expect(basicSection).not.toBeNull();
    expect(authSection).not.toBeNull();
    if (authSection) {
      expect(within(authSection).getByLabelText("预设")).toBeInTheDocument();
      expect(within(authSection).getByLabelText("ANTHROPIC_AUTH_TOKEN")).toHaveValue("token");
      expect(within(authSection).getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("");
    }
    if (basicSection) {
      expect(within(basicSection).queryByLabelText("预设")).not.toBeInTheDocument();
      const nameLabel = basicSection.querySelector(
        'label[for="profile-name"]',
      ) as HTMLElement | null;
      expect(nameLabel).not.toBeNull();
      expect(nameLabel).toHaveClass("label-required");
      if (nameLabel) {
        expect(within(nameLabel).getByText("必填")).toBeInTheDocument();
      }
    }

    const sandboxSection = screen.getByRole("heading", { name: "Sandbox" }).closest("section");
    expect(sandboxSection).not.toBeNull();
    if (sandboxSection) {
      expect(
        within(sandboxSection).queryByRole("button", { name: "控件" }),
      ).not.toBeInTheDocument();
      expect(
        within(sandboxSection).queryByRole("button", { name: "JSON" }),
      ).not.toBeInTheDocument();
      expect(
        within(sandboxSection).getByRole("switch", { name: "Sandbox 头部开关" }),
      ).toHaveAttribute("aria-checked", "false");
      expect(within(sandboxSection).getByText("沙盒开关")).toBeInTheDocument();
      expect(within(sandboxSection).getByText("已关闭 · 无附加配置")).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(within(sandboxSection).getByRole("switch", { name: "Sandbox 头部开关" }));
        await Promise.resolve();
      });
      expect(within(sandboxSection).getByText("已启用 · 无附加配置")).toBeInTheDocument();
      expect(
        within(sandboxSection).queryByRole("button", { name: "控件" }),
      ).not.toBeInTheDocument();
    }

    expect(screen.queryByRole("button", { name: "新增 Hook 事件" })).not.toBeInTheDocument();

    const hooksSection = screen.getByRole("heading", { name: "Hooks" }).closest("section");
    expect(hooksSection).not.toBeNull();
    if (hooksSection) {
      expect(within(hooksSection).getByText("0")).toBeInTheDocument();
      expect(within(hooksSection).queryByRole("button", { name: "控件" })).not.toBeInTheDocument();
      expect(within(hooksSection).queryByRole("button", { name: "JSON" })).not.toBeInTheDocument();
      expect(within(hooksSection).queryByText("暂无 Hooks 配置。")).not.toBeInTheDocument();
      expect(within(hooksSection).queryByLabelText("config-preview-input")).not.toBeInTheDocument();
    }

    const behaviorSection = screen.getByRole("heading", { name: "模型与行为" }).closest("section");
    expect(behaviorSection).not.toBeNull();
    if (behaviorSection) {
      expect(within(behaviorSection).getByRole("button", { name: "控件" })).toBeInTheDocument();
      expect(within(behaviorSection).getByRole("button", { name: "JSON" })).toBeInTheDocument();
    }

    const permissionsSection = screen.getByRole("heading", { name: "权限" }).closest("section");
    expect(permissionsSection).not.toBeNull();
    if (permissionsSection) {
      const permissionModeSelect = within(permissionsSection).getByLabelText(
        "权限头部默认模式",
      ) as HTMLSelectElement;
      expect(permissionModeSelect).toHaveValue("");
      expect(Array.from(permissionModeSelect.options, (option) => option.value)).toEqual([
        "",
        "default",
        "acceptEdits",
        "plan",
        "dontAsk",
        "bypassPermissions",
        "auto",
      ]);
      expect(
        within(permissionsSection).queryByRole("button", { name: "控件" }),
      ).not.toBeInTheDocument();
      expect(
        within(permissionsSection).queryByRole("button", { name: "JSON" }),
      ).not.toBeInTheDocument();
    }

    const envSection = screen
      .getByRole("heading", { name: "环境变量", level: 3 })
      .closest("section");
    expect(envSection).not.toBeNull();
    if (envSection) {
      expect(within(envSection).queryByRole("button", { name: "控件" })).not.toBeInTheDocument();
      expect(within(envSection).queryByRole("button", { name: "JSON" })).not.toBeInTheDocument();
      expect(
        within(envSection).queryByDisplayValue("ANTHROPIC_AUTH_TOKEN"),
      ).not.toBeInTheDocument();

      toggleAccordionSection("环境变量");

      expect(within(envSection).getByRole("button", { name: "控件" })).toBeInTheDocument();
      expect(within(envSection).getByRole("button", { name: "JSON" })).toBeInTheDocument();
      expect(
        within(envSection).queryByRole("button", {
          name: "编辑环境变量 CLAUDE_CODE_EFFORT_LEVEL",
        }),
      ).not.toBeInTheDocument();
      expect(within(envSection).queryByLabelText("环境变量名称")).not.toBeInTheDocument();
      expect(within(envSection).queryByLabelText("环境变量值")).not.toBeInTheDocument();
    }

    const marketplacesSection = screen
      .getByRole("heading", { name: "插件市场", level: 3 })
      .closest("section");
    expect(marketplacesSection).not.toBeNull();
    if (marketplacesSection) {
      expect(within(marketplacesSection).getByText("0")).toBeInTheDocument();
      expect(
        within(marketplacesSection).queryByRole("button", { name: "新增 Marketplace" }),
      ).not.toBeInTheDocument();
      expect(
        within(marketplacesSection).queryByRole("button", { name: "JSON" }),
      ).not.toBeInTheDocument();

      toggleAccordionSection("插件市场");

      expect(within(marketplacesSection).getByRole("button", { name: "控件" })).toBeInTheDocument();
      expect(within(marketplacesSection).getByRole("button", { name: "JSON" })).toBeInTheDocument();
      expect(
        within(marketplacesSection).getByRole("button", { name: "新增 Marketplace" }),
      ).toBeInTheDocument();
      expect(
        within(marketplacesSection).queryByLabelText("Marketplace ID"),
      ).not.toBeInTheDocument();
      expect(
        within(marketplacesSection).queryByLabelText("config-preview-input"),
      ).not.toBeInTheDocument();
    }

    const pluginsSection = screen
      .getByRole("heading", { name: "插件", level: 3 })
      .closest("section");
    expect(pluginsSection).not.toBeNull();
    if (pluginsSection) {
      expect(within(pluginsSection).getByText("已启用 0/0")).toBeInTheDocument();
      expect(
        within(pluginsSection).queryByRole("button", { name: "新增插件" }),
      ).not.toBeInTheDocument();
      expect(
        within(pluginsSection).queryByRole("button", { name: "JSON" }),
      ).not.toBeInTheDocument();

      toggleAccordionSection("插件");

      expect(within(pluginsSection).getByRole("button", { name: "控件" })).toBeInTheDocument();
      expect(within(pluginsSection).getByRole("button", { name: "JSON" })).toBeInTheDocument();
      expect(within(pluginsSection).getByRole("button", { name: "新增插件" })).toBeInTheDocument();
      expect(within(pluginsSection).queryByLabelText("新插件 ID")).not.toBeInTheDocument();
      expect(within(pluginsSection).queryByText("插件模式")).not.toBeInTheDocument();
      expect(
        within(pluginsSection).queryByLabelText("config-preview-input"),
      ).not.toBeInTheDocument();

      expect(
        within(marketplacesSection as HTMLElement).queryByRole("button", { name: "控件" }),
      ).not.toBeInTheDocument();

      expect(
        within(envSection as HTMLElement).getByRole("button", { name: "控件" }),
      ).toBeInTheDocument();
    }
  });

  it("shows enabled plugin summary in the collapsed plugins section", () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          ...PROFILE_FIXTURE.settings,
          enabledPlugins: {
            "formatter@anthropic-tools": true,
            "reviewer@anthropic-tools": false,
          },
        },
      },
    });

    const pluginsSection = getSection("插件");
    expect(within(pluginsSection).getByText("已启用 1/2")).toBeInTheDocument();
    expect(
      within(pluginsSection).queryByRole("button", { name: "新增插件" }),
    ).not.toBeInTheDocument();
  });

  it("uses localized preset names in the preset selector", () => {
    renderEditor();

    expect(screen.getByRole("option", { name: "开放路由" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "OpenRouter" })).not.toBeInTheDocument();
  });

  it("hides scope and project path fields for user-only profiles", () => {
    renderEditor();

    expect(screen.queryByLabelText("作用域")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("项目路径")).not.toBeInTheDocument();
  });

  it("renders behavior controls in rows with at most two items", () => {
    renderEditor();

    const behaviorSection = screen.getByRole("heading", { name: "模型与行为" }).closest("section");
    expect(behaviorSection).not.toBeNull();
    if (!behaviorSection) {
      return;
    }

    const behaviorRows = behaviorSection.querySelectorAll(".form-row");
    expect(behaviorRows.length).toBeGreaterThan(1);
    for (const row of behaviorRows) {
      expect(row.querySelectorAll(".form-group").length).toBeLessThanOrEqual(2);
    }

    const toggleRows = behaviorSection.querySelectorAll(".profile-toggle-grid");
    expect(toggleRows.length).toBeGreaterThan(1);
    for (const row of toggleRows) {
      expect(row.querySelectorAll(".profile-toggle-item").length).toBeLessThanOrEqual(2);
    }
  });

  it("renders language as a select list and exposes the full effort enum set", async () => {
    await act(async () => {
      renderEditor();
      await Promise.resolve();
    });

    const languageSelect = screen.getByLabelText("回复语言") as HTMLSelectElement;
    expect(languageSelect.tagName).toBe("SELECT");
    expect(Array.from(languageSelect.options).map((option) => option.value)).toEqual(
      expect.arrayContaining([
        "english",
        "chinese",
        "japanese",
        "korean",
        "spanish",
        "french",
        "german",
        "portuguese",
        "russian",
        "arabic",
        "italian",
      ]),
    );

    const effortSelect = screen.getByLabelText("努力级别") as HTMLSelectElement;
    expect(Array.from(effortSelect.options).map((option) => option.value)).toEqual([
      "",
      "auto",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(effortSelect).toHaveValue("");
  });

  it("stores model and effort as standard env settings and keeps the env editor in sync", async () => {
    const onSave = vi.fn();
    await act(async () => {
      renderEditor({ onSave });
      await Promise.resolve();
    });

    const envSection = screen
      .getByRole("heading", { name: "环境变量", level: 3 })
      .closest("section") as HTMLElement | null;
    expect(envSection).not.toBeNull();
    if (!envSection) {
      return;
    }

    toggleAccordionSection("环境变量");

    expect(
      within(envSection).queryByRole("button", {
        name: "编辑环境变量 ANTHROPIC_MODEL",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(envSection).queryByRole("button", {
        name: "编辑环境变量 CLAUDE_CODE_EFFORT_LEVEL",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(envSection).queryByRole("button", {
        name: "编辑环境变量 ANTHROPIC_DEFAULT_OPUS_MODEL",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(envSection).queryByRole("button", {
        name: "编辑环境变量 ANTHROPIC_DEFAULT_SONNET_MODEL",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(envSection).queryByRole("button", {
        name: "编辑环境变量 ANTHROPIC_DEFAULT_HAIKU_MODEL",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(envSection).queryByRole("button", {
        name: "编辑环境变量 CLAUDE_CODE_SUBAGENT_MODEL",
      }),
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Opus 默认模型"), {
        target: { value: "claude-opus-4-1" },
      });
      fireEvent.change(screen.getByLabelText("Sonnet 默认模型"), {
        target: { value: "claude-sonnet-4-6" },
      });
      fireEvent.change(screen.getByLabelText("Haiku 默认模型"), {
        target: { value: "claude-haiku-4-5" },
      });
      fireEvent.change(screen.getByLabelText("Subagent 模型"), {
        target: { value: "claude-sonnet-4-6" },
      });
      await Promise.resolve();
    });

    const effortSelect = screen.getByLabelText("努力级别") as HTMLSelectElement;
    expect(effortSelect).toHaveValue("");

    await act(async () => {
      fireEvent.change(screen.getByLabelText("默认模型"), {
        target: { value: "claude-opus-4-1" },
      });
      fireEvent.change(effortSelect, {
        target: { value: "auto" },
      });
      await Promise.resolve();
    });

    expect(
      within(envSection).getByRole("button", {
        name: "编辑环境变量 ANTHROPIC_MODEL",
      }),
    ).toBeInTheDocument();
    expect(
      within(envSection).getByRole("button", {
        name: "编辑环境变量 CLAUDE_CODE_EFFORT_LEVEL",
      }),
    ).toBeInTheDocument();
    expect(
      within(envSection).getByRole("button", {
        name: "编辑环境变量 ANTHROPIC_DEFAULT_OPUS_MODEL",
      }),
    ).toBeInTheDocument();
    expect(
      within(envSection).getByRole("button", {
        name: "编辑环境变量 ANTHROPIC_DEFAULT_SONNET_MODEL",
      }),
    ).toBeInTheDocument();
    expect(
      within(envSection).getByRole("button", {
        name: "编辑环境变量 ANTHROPIC_DEFAULT_HAIKU_MODEL",
      }),
    ).toBeInTheDocument();
    expect(
      within(envSection).getByRole("button", {
        name: "编辑环境变量 CLAUDE_CODE_SUBAGENT_MODEL",
      }),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.settings.env).toEqual({
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: "claude-opus-4-1",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-1",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-6",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5",
      CLAUDE_CODE_SUBAGENT_MODEL: "claude-sonnet-4-6",
      CLAUDE_CODE_EFFORT_LEVEL: "auto",
    });
    expect(saved.settings).not.toHaveProperty("model");
    expect(saved.settings).not.toHaveProperty("effortLevel");
  });

  it("renders env-backed model override fields inside behavior", async () => {
    await act(async () => {
      renderEditor();
      await Promise.resolve();
    });

    for (const label of ["Opus 默认模型", "Sonnet 默认模型", "Haiku 默认模型", "Subagent 模型"]) {
      const fieldGroup = screen.getByLabelText(label).closest(".form-group") as HTMLElement | null;
      expect(fieldGroup).not.toBeNull();
      if (!fieldGroup) {
        continue;
      }
      const header = fieldGroup.querySelector(".profile-field-header") as HTMLElement | null;
      expect(header).not.toBeNull();
      expect(fieldGroup.querySelector(".profile-field-mapping-row")).toBeNull();
      expect(header).not.toBeNull();
      if (header) {
        expect(header.querySelector(".profile-field-label-meta")).toBeNull();
        const helpButton = within(header).getByRole("button", {
          name:
            label === "Opus 默认模型"
              ? "ANTHROPIC_DEFAULT_OPUS_MODEL"
              : label === "Sonnet 默认模型"
                ? "ANTHROPIC_DEFAULT_SONNET_MODEL"
                : label === "Haiku 默认模型"
                  ? "ANTHROPIC_DEFAULT_HAIKU_MODEL"
                  : "CLAUDE_CODE_SUBAGENT_MODEL",
        });
        expect(helpButton).toHaveAttribute("data-tooltip", helpButton.getAttribute("aria-label"));
      }
      expect(fieldGroup.querySelector(".profile-field-badge")).toBeNull();
      expect(fieldGroup.querySelector(".profile-field-inline-meta")).toBeNull();
    }

    expect(
      screen.getByRole("button", { name: "ANTHROPIC_DEFAULT_OPUS_MODEL" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ANTHROPIC_DEFAULT_SONNET_MODEL" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ANTHROPIC_DEFAULT_HAIKU_MODEL" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CLAUDE_CODE_SUBAGENT_MODEL" })).toBeInTheDocument();
  });

  it("renders mapping controls inline inside field headers", async () => {
    await act(async () => {
      renderEditor();
      await Promise.resolve();
    });

    const modelGroup = screen
      .getByLabelText("默认模型")
      .closest(".form-group") as HTMLElement | null;
    const effortGroup = screen
      .getByLabelText("努力级别")
      .closest(".form-group") as HTMLElement | null;

    expect(modelGroup).not.toBeNull();
    expect(effortGroup).not.toBeNull();

    if (!modelGroup || !effortGroup) {
      return;
    }

    const modelHeader = modelGroup.querySelector(".profile-field-header") as HTMLElement | null;
    const effortHeader = effortGroup.querySelector(".profile-field-header") as HTMLElement | null;

    expect(modelHeader).not.toBeNull();
    expect(effortHeader).not.toBeNull();
    expect(modelGroup.querySelector(".profile-field-mapping-row")).toBeNull();
    expect(effortGroup.querySelector(".profile-field-mapping-row")).toBeNull();

    if (modelHeader && effortHeader) {
      expect(modelHeader.querySelector(".profile-field-label-meta")).toBeNull();
      expect(effortHeader.querySelector(".profile-field-label-meta")).toBeNull();
      expect(within(modelHeader).getByRole("button", { name: "ANTHROPIC_MODEL" })).toHaveAttribute(
        "data-tooltip",
        "ANTHROPIC_MODEL",
      );
      expect(
        within(effortHeader).getByRole("button", { name: "CLAUDE_CODE_EFFORT_LEVEL" }),
      ).toHaveAttribute("data-tooltip", "CLAUDE_CODE_EFFORT_LEVEL");
    }

    expect(modelGroup.querySelector(".profile-field-inline-meta")).toBeNull();
    expect(effortGroup.querySelector(".profile-field-inline-meta")).toBeNull();
    expect(screen.queryByLabelText("模型使用环境变量映射")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("努力级别使用环境变量映射")).not.toBeInTheDocument();
  });

  it("syncs structured env, permissions, sandbox, and hooks json editor into expert json", async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("默认模型"), {
      target: { value: "claude-opus-4-1" },
    });
    fireEvent.change(screen.getByLabelText("ANTHROPIC_AUTH_TOKEN"), {
      target: { value: "new-token" },
    });

    fireEvent.change(screen.getByLabelText("权限头部默认模式"), {
      target: { value: "plan" },
    });
    toggleAccordionSection("权限");
    expect(screen.queryByLabelText("默认模式")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新增允许规则" }));
    fireEvent.change(screen.getByLabelText("允许规则 1"), {
      target: { value: "Bash(git status:*)" },
    });

    const sandboxSection = switchSectionToJson("Sandbox");
    fireEvent.change(within(sandboxSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            enabled: true,
            network: {
              allowedDomains: ["api.openai.com"],
            },
          },
          null,
          2,
        ),
      },
    });

    const hooksSection = switchSectionToJson("Hooks");
    fireEvent.change(within(hooksSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            PostToolUse: [
              {
                matcher: "Edit|Write",
                hooks: [
                  {
                    type: "command",
                    command: "pnpm biome:ci",
                  },
                ],
              },
            ],
          },
          null,
          2,
        ),
      },
    });

    const rawJsonValue = openFullSettingsJson().value;
    expect(rawJsonValue).toContain('"ANTHROPIC_MODEL": "claude-opus-4-1"');
    expect(rawJsonValue).toContain('"ANTHROPIC_AUTH_TOKEN": "new-token"');
    expect(rawJsonValue).toContain('"defaultMode": "plan"');
    expect(rawJsonValue).toContain('"Bash(git status:*)"');
    expect(rawJsonValue).toContain('"allowedDomains"');
    expect(rawJsonValue).toContain('"api.openai.com"');
    expect(rawJsonValue).toContain('"PostToolUse"');
    expect(rawJsonValue).toContain('"pnpm biome:ci"');
  });

  it("syncs local json editors for behavior, permissions, env, plugins, and marketplaces", async () => {
    renderEditor();

    const behaviorSection = switchSectionToJson("模型与行为");
    fireEvent.change(within(behaviorSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            env: {
              ANTHROPIC_MODEL: "claude-opus-4-1",
              CLAUDE_CODE_EFFORT_LEVEL: "high",
            },
            respectGitignore: true,
          },
          null,
          2,
        ),
      },
    });

    const permissionsSection = switchSectionToJson("权限");
    fireEvent.change(within(permissionsSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            defaultMode: "plan",
            allow: ["Bash(git status:*)"],
          },
          null,
          2,
        ),
      },
    });

    const envSection = switchSectionToJson("环境变量");
    fireEvent.change(within(envSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            OPENAI_API_KEY: "json-token",
          },
          null,
          2,
        ),
      },
    });

    const pluginsSection = switchSectionToJson("插件", { expandFirst: true });
    fireEvent.change(within(pluginsSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            "formatter@anthropic-tools": ["format"],
          },
          null,
          2,
        ),
      },
    });

    const marketplacesSection = switchSectionToJson("插件市场", { expandFirst: true });
    fireEvent.change(within(marketplacesSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            "team-market": {
              source: {
                source: "github",
                repo: "team/plugins",
              },
            },
          },
          null,
          2,
        ),
      },
    });

    const rawJsonValue = openFullSettingsJson().value;
    expect(rawJsonValue).toContain('"respectGitignore": true');
    expect(rawJsonValue).toContain('"defaultMode": "plan"');
    expect(rawJsonValue).toContain('"Bash(git status:*)"');
    expect(rawJsonValue).toContain('"OPENAI_API_KEY": "json-token"');
    expect(rawJsonValue).toContain('"formatter@anthropic-tools"');
    expect(rawJsonValue).toContain('"team-market"');
  });

  it("blocks save when behavior json is invalid", async () => {
    renderEditor();

    const behaviorSection = getSection("模型与行为");
    await act(async () => {
      fireEvent.click(within(behaviorSection).getByRole("button", { name: "JSON" }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.change(within(behaviorSection).getByLabelText("config-preview-input"), {
        target: { value: "[]" },
      });
      await Promise.resolve();
    });
    expect(
      within(behaviorSection).getAllByText("模型与行为 JSON 必须是 JSON 对象").length,
    ).toBeGreaterThan(0);
    expect(
      within(behaviorSection).getByText("当前草稿未生效，仍使用上一次合法 JSON。"),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("hydrates structured editors from profile settings", async () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          env: {
            ANTHROPIC_MODEL: "claude-haiku-4-5",
          },
          permissions: {
            defaultMode: "dontAsk",
            disableBypassPermissionsMode: "disable",
            deny: ["Read(.env)"],
          },
          sandbox: {
            enabled: true,
            network: {
              allowedDomains: ["example.com"],
            },
          },
          hooks: {
            PostToolUse: [
              {
                matcher: "Write",
                hooks: [
                  {
                    type: "command",
                    command: "pnpm build",
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-haiku-4-5");
    const permissionsSection = getSection("权限");
    expect(within(permissionsSection).getByLabelText("权限头部默认模式")).toHaveValue("dontAsk");
    toggleAccordionSection("权限");
    expect(screen.queryByLabelText("默认模式")).not.toBeInTheDocument();
    expect(screen.queryByText("权限规则")).not.toBeInTheDocument();
    expect(screen.queryByText("用规则构建器快速维护权限配置。")).not.toBeInTheDocument();
    const disableBypassSwitch = screen.getByRole("switch", {
      name: "禁用 bypassPermissions 模式",
    });
    expect(disableBypassSwitch).toHaveAttribute("aria-checked", "true");
    expect(disableBypassSwitch.className).toContain("profile-sandbox-switch-compact");
    expect(disableBypassSwitch.closest(".profile-toggle-item")).toBeNull();
    const disableBypassRow = disableBypassSwitch.closest(
      ".profile-inline-switch-row",
    ) as HTMLElement | null;
    expect(disableBypassRow).not.toBeNull();
    if (disableBypassRow) {
      expect(disableBypassRow).toHaveClass("profile-inline-switch-row-emphasis");
      expect(within(disableBypassRow).getByText("禁用 bypassPermissions 模式")).toHaveClass(
        "profile-inline-switch-title",
      );
    }
    expect(screen.getByLabelText("拒绝规则 1")).toHaveValue("Read(.env)");

    const sandboxSection = getSection("Sandbox");
    toggleAccordionSection("Sandbox");
    expect(within(sandboxSection).getByText("已启用 · 1 个附加配置键")).toBeInTheDocument();
    const headerSandboxSwitch = within(sandboxSection).getByRole("switch", {
      name: "Sandbox 头部开关",
    });
    expect(headerSandboxSwitch).toHaveAttribute("aria-checked", "true");
    expect(headerSandboxSwitch.className).toContain("profile-sandbox-switch-compact");
    expect(within(sandboxSection).getByText("沙盒开关")).toBeInTheDocument();
    expect(
      within(sandboxSection).queryByRole("switch", {
        name: "Sandbox 开关",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(sandboxSection).queryByText("横栏和此处开关会同步更新，详细配置请切到 JSON。"),
    ).toBeNull();
    expect(within(sandboxSection).getByText("当前状态：已启用")).toBeInTheDocument();
    expect(within(sandboxSection).getByText("当前有 1 个附加配置键。")).toBeInTheDocument();
    expect(within(sandboxSection).getByText("network")).toBeInTheDocument();
    expect(within(sandboxSection).queryByLabelText("允许域名 1")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(sandboxSection).getByRole("button", { name: "JSON" }));
      await Promise.resolve();
    });
    const sandboxJsonInput = within(sandboxSection).getByLabelText("config-preview-input");
    const sandboxJsonValue = (sandboxJsonInput as HTMLTextAreaElement).value;
    expect(sandboxJsonValue).toContain('"allowedDomains"');
    expect(sandboxJsonValue).toContain("example.com");

    const hooksSection = getSection("Hooks");
    expect(within(hooksSection).getByText("1")).toBeInTheDocument();
    toggleAccordionSection("Hooks");
    expect(within(hooksSection).getByText("PostToolUse")).toBeInTheDocument();
    expect(within(hooksSection).getByText("Write")).toBeInTheDocument();
    expect(within(hooksSection).getByText("command: pnpm build")).toBeInTheDocument();
    expect(within(hooksSection).queryByLabelText("Hook 事件 1")).not.toBeInTheDocument();
  });

  it("syncs permission default mode between header quick select and editor, and clears it on save", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    const permissionsSection = getSection("权限");
    const headerDefaultMode = within(permissionsSection).getByLabelText("权限头部默认模式");

    fireEvent.change(headerDefaultMode, {
      target: { value: "plan" },
    });

    toggleAccordionSection("权限");
    expect(screen.queryByLabelText("默认模式")).not.toBeInTheDocument();
    expect(within(permissionsSection).getByLabelText("权限头部默认模式")).toHaveValue("plan");

    fireEvent.change(within(permissionsSection).getByLabelText("权限头部默认模式"), {
      target: { value: "" },
    });
    expect(screen.queryByLabelText("默认模式")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]?.settings).not.toHaveProperty("permissions");
  });

  it("keeps delegate visible for existing permissions default mode without exposing it as a normal option", () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          ...PROFILE_FIXTURE.settings,
          permissions: {
            defaultMode: "delegate",
          },
        },
      },
    });

    const permissionsSection = getSection("权限");
    const permissionModeSelect = within(permissionsSection).getByLabelText(
      "权限头部默认模式",
    ) as HTMLSelectElement;

    expect(permissionModeSelect).toHaveValue("delegate");
    expect(Array.from(permissionModeSelect.options, (option) => option.value)).toEqual([
      "",
      "default",
      "acceptEdits",
      "plan",
      "dontAsk",
      "bypassPermissions",
      "delegate",
      "auto",
    ]);
  });

  it("keeps detailed sandbox json while toggling the sandbox switch off", async () => {
    const { onSave } = renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          ...PROFILE_FIXTURE.settings,
          sandbox: {
            enabled: true,
            network: {
              allowedDomains: ["example.com"],
            },
          },
        },
      },
    });

    const sandboxSection = getSection("Sandbox");
    toggleAccordionSection("Sandbox");
    await act(async () => {
      fireEvent.click(within(sandboxSection).getByRole("switch", { name: "Sandbox 头部开关" }));
      fireEvent.click(within(sandboxSection).getByRole("button", { name: "JSON" }));
      await Promise.resolve();
    });
    expect(within(sandboxSection).getByText("已关闭 · 1 个附加配置键")).toBeInTheDocument();
    const sandboxJsonInput = within(sandboxSection).getByLabelText("config-preview-input");
    const sandboxJsonValue = (sandboxJsonInput as HTMLTextAreaElement).value;
    expect(sandboxJsonValue).toContain('"allowedDomains"');
    expect(sandboxJsonValue).not.toContain('"enabled": true');

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          sandbox: {
            network: {
              allowedDomains: ["example.com"],
            },
          },
        }),
      }),
    );
  });

  it("blocks save when sandbox json is invalid", async () => {
    renderEditor();

    const sandboxSection = getSection("Sandbox");
    toggleAccordionSection("Sandbox");
    await act(async () => {
      fireEvent.click(within(sandboxSection).getByRole("button", { name: "JSON" }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.change(within(sandboxSection).getByLabelText("config-preview-input"), {
        target: { value: "[]" },
      });
      await Promise.resolve();
    });
    expect(
      within(sandboxSection).getAllByText("Sandbox JSON 必须是 JSON 对象").length,
    ).toBeGreaterThan(0);
    expect(
      within(sandboxSection).getByText("当前草稿未生效，仍使用上一次合法 JSON。"),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("renders resolved preview output after structured edits", async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("默认模型"), {
      target: { value: "claude-haiku-4-5" },
    });

    await act(async () => {
      await Promise.resolve();
    });

    const previewOutputs = screen.getAllByTestId("config-preview-output");
    const latestPreview = previewOutputs[previewOutputs.length - 1];
    expect(latestPreview).toHaveTextContent('"$schema"');
    expect(latestPreview).toHaveTextContent('"claude-haiku-4-5"');
    expect(invokeMock).toHaveBeenLastCalledWith(
      "preview_profile",
      expect.objectContaining({
        data: expect.not.objectContaining({
          target: expect.anything(),
        }),
      }),
    );
  });

  it("saves plugin and marketplace settings from structured controls", async () => {
    const { onSave } = renderEditor();

    const pluginsSection = screen
      .getByRole("heading", { name: "插件", level: 3 })
      .closest("section") as HTMLElement | null;
    expect(pluginsSection).not.toBeNull();
    if (!pluginsSection) {
      return;
    }

    toggleAccordionSection("插件");

    fireEvent.click(within(pluginsSection).getByRole("button", { name: "新增插件" }));
    const draftRow = within(pluginsSection)
      .getByRole("button", { name: "删除插件 新插件" })
      .closest(".profile-plugin-list-row");
    expect(draftRow).not.toBeNull();
    fireEvent.change(within(draftRow as HTMLElement).getByLabelText("新插件 ID"), {
      target: { value: "formatter@anthropic-tools" },
    });
    fireEvent.click(
      within(draftRow as HTMLElement).getByRole("switch", {
        name: "插件状态 formatter@anthropic-tools",
      }),
    );
    fireEvent.click(within(draftRow as HTMLElement).getByRole("button", { name: "保存插件" }));

    expect(within(pluginsSection).getByText("formatter@anthropic-tools")).toBeInTheDocument();
    expect(
      within(pluginsSection).getByRole("switch", {
        name: "插件状态 formatter@anthropic-tools",
      }),
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText("新插件 ID")).not.toBeInTheDocument();

    const marketplacesSection = screen
      .getByRole("heading", { name: "插件市场", level: 3 })
      .closest("section") as HTMLElement | null;
    expect(marketplacesSection).not.toBeNull();
    if (!marketplacesSection) {
      return;
    }

    toggleAccordionSection("插件市场");
    fireEvent.click(within(marketplacesSection).getByRole("button", { name: "新增 Marketplace" }));
    fireEvent.change(screen.getByLabelText("Marketplace ID"), {
      target: { value: "team-market" },
    });
    fireEvent.change(screen.getByLabelText("Marketplace 来源"), {
      target: { value: "github" },
    });
    fireEvent.change(screen.getByLabelText("Marketplace 仓库"), {
      target: { value: "team/plugins" },
    });
    fireEvent.change(screen.getByLabelText("Marketplace Ref"), {
      target: { value: "main" },
    });
    fireEvent.change(screen.getByLabelText("Marketplace 路径"), {
      target: { value: ".claude-plugin/marketplace.json" },
    });
    fireEvent.change(screen.getByLabelText("Marketplace 安装位置"), {
      target: { value: "/tmp/team-market" },
    });
    fireEvent.click(within(marketplacesSection).getByRole("button", { name: "保存 Marketplace" }));

    expect(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace team-market" }),
    ).toBeInTheDocument();
    expect(within(marketplacesSection).getByText("github")).toBeInTheDocument();
    expect(within(marketplacesSection).getByText("team/plugins")).toBeInTheDocument();
    expect(screen.queryByLabelText("Marketplace ID")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledWith({
      id: "user-openrouter",
      name: "OpenRouter User",
      description: "默认用户配置",
      presetId: "builtin:openrouter",
      settings: expect.objectContaining({
        env: {
          ANTHROPIC_AUTH_TOKEN: "token",
        },
        enabledPlugins: {
          "formatter@anthropic-tools": false,
        },
        extraKnownMarketplaces: {
          "team-market": {
            source: {
              source: "github",
              repo: "team/plugins",
              ref: "main",
              path: ".claude-plugin/marketplace.json",
            },
            installLocation: "/tmp/team-market",
          },
        },
      }),
    });
  }, 15000);

  it("renders marketplace summaries and blocks switching, adding, and deleting while a draft is dirty", () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          ...PROFILE_FIXTURE.settings,
          extraKnownMarketplaces: {
            "team-market": {
              source: {
                source: "github",
                repo: "team/plugins",
                ref: "main",
                path: ".claude-plugin/marketplace.json",
              },
              installLocation: "/tmp/team-market",
            },
            "docs-market": {
              source: {
                source: "url",
                url: "https://example.com/marketplace.json",
              },
            },
          },
        },
      },
    });

    const marketplacesSection = getSection("插件市场");
    toggleAccordionSection("插件市场");

    expect(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace team-market" }),
    ).toBeInTheDocument();
    const teamMarketplaceRowHead = within(marketplacesSection)
      .getByRole("button", { name: "编辑 Marketplace team-market" })
      .closest(".profile-marketplace-row-head");
    expect(teamMarketplaceRowHead).not.toBeNull();
    expect(
      within(teamMarketplaceRowHead as HTMLElement).getByRole("button", {
        name: "删除 Marketplace team-market",
      }),
    ).toBeInTheDocument();
    expect(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace docs-market" }),
    ).toBeInTheDocument();
    expect(within(marketplacesSection).getByText("team/plugins")).toBeInTheDocument();
    expect(
      within(marketplacesSection).getByText("https://example.com/marketplace.json"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Marketplace ID")).not.toBeInTheDocument();

    fireEvent.click(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace team-market" }),
    );
    fireEvent.change(screen.getByLabelText("Marketplace Ref"), {
      target: { value: "release" },
    });

    fireEvent.click(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace docs-market" }),
    );
    expect(
      within(marketplacesSection).getAllByText("请先保存或取消当前 Marketplace 编辑。").length,
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText("Marketplace Ref")).toHaveValue("release");

    fireEvent.click(within(marketplacesSection).getByRole("button", { name: "新增 Marketplace" }));
    expect(
      within(marketplacesSection).getAllByText("请先保存或取消当前 Marketplace 编辑。").length,
    ).toBeGreaterThan(0);

    fireEvent.click(
      within(marketplacesSection).getByRole("button", { name: "删除 Marketplace docs-market" }),
    );
    expect(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace docs-market" }),
    ).toBeInTheDocument();
    expect(
      within(marketplacesSection).getAllByText("请先保存或取消当前 Marketplace 编辑。").length,
    ).toBeGreaterThan(0);

    fireEvent.click(within(marketplacesSection).getByRole("button", { name: "保存 Marketplace" }));

    expect(screen.queryByLabelText("Marketplace Ref")).not.toBeInTheDocument();
    expect(within(marketplacesSection).getByText(/Ref: release/)).toBeInTheDocument();
  });

  it("allows deleting a new marketplace draft directly without saving first", () => {
    renderEditor();

    const marketplacesSection = getSection("插件市场");
    toggleAccordionSection("插件市场");

    fireEvent.click(within(marketplacesSection).getByRole("button", { name: "新增 Marketplace" }));
    fireEvent.change(screen.getByLabelText("Marketplace ID"), {
      target: { value: "draft-market" },
    });

    fireEvent.click(
      within(marketplacesSection).getByRole("button", {
        name: "删除 Marketplace draft-market",
      }),
    );

    expect(
      within(marketplacesSection).queryByRole("button", {
        name: "编辑 Marketplace draft-market",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Marketplace ID")).not.toBeInTheDocument();
    expect(
      within(marketplacesSection).queryByText("请先保存或取消当前 Marketplace 编辑。"),
    ).not.toBeInTheDocument();
  });

  it("switches preset without exposing removed legacy scope fields", () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        presetId: undefined,
      },
    });

    expect(screen.queryByLabelText("作用域")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/项目路径/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("预设"), {
      target: { value: "builtin:openrouter" },
    });
    fireEvent.click(screen.getByRole("button", { name: "claude-opus-4-1" }));
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-opus-4-1");

    const modelBehaviorSection = screen
      .getByRole("heading", { name: "模型与行为" })
      .closest("section");
    expect(modelBehaviorSection).not.toBeNull();
    if (modelBehaviorSection) {
      expect(
        within(modelBehaviorSection).queryByPlaceholderText("sk-ant-..."),
      ).not.toBeInTheDocument();
      expect(within(modelBehaviorSection).queryByText("Base URL")).not.toBeInTheDocument();
    }
  });

  it("autofills base url and all model levels from the selected preset, then clears them when preset is removed", () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        presetId: undefined,
        settings: {
          env: {
            ANTHROPIC_AUTH_TOKEN: "token",
            ANTHROPIC_BASE_URL: "https://manual.example.com",
            ANTHROPIC_MODEL: "manual-model",
            ANTHROPIC_DEFAULT_OPUS_MODEL: "manual-opus",
            ANTHROPIC_DEFAULT_SONNET_MODEL: "manual-sonnet",
            ANTHROPIC_DEFAULT_HAIKU_MODEL: "manual-haiku",
            CLAUDE_CODE_SUBAGENT_MODEL: "manual-subagent",
          },
        },
      },
    });

    fireEvent.change(screen.getByLabelText("预设"), {
      target: { value: "builtin:openrouter" },
    });
    expect(screen.getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("https://openrouter.ai/api");
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("claude-opus-4-1");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("claude-haiku-4-5");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("claude-sonnet-4-6");

    fireEvent.change(screen.getByLabelText("预设"), {
      target: { value: "custom:team-plan" },
    });
    expect(screen.getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("https://openrouter.ai/api");
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("claude-opus-4-1");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("claude-haiku-4-5");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("claude-sonnet-4-6");

    fireEvent.change(screen.getByLabelText("预设"), {
      target: { value: "custom:explicit-model" },
    });
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-opus-explicit");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("claude-opus-4-1");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("claude-haiku-4-5");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("claude-sonnet-4-6");

    fireEvent.change(screen.getByLabelText("预设"), {
      target: { value: "custom:env-level-overrides" },
    });
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-opus-explicit");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("haiku-env-override");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("subagent-env-override");

    fireEvent.change(screen.getByLabelText("预设"), {
      target: { value: "" },
    });
    expect(screen.getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("");
    expect(screen.getByLabelText("默认模型")).toHaveValue("");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("");
    expect(screen.getByLabelText("ANTHROPIC_AUTH_TOKEN")).toHaveValue("token");
  });

  it("renders authentication controls in a dedicated section and keeps hidden env keys in preview", async () => {
    renderEditor();

    const authSection = screen.getByRole("heading", { name: "认证", level: 3 }).closest("section");
    const envSection = screen
      .getByRole("heading", { name: "环境变量", level: 3 })
      .closest("section");
    expect(authSection).not.toBeNull();
    expect(envSection).not.toBeNull();
    if (!authSection || !envSection) {
      return;
    }

    expect(within(authSection).getByLabelText("预设")).toBeInTheDocument();
    expect(within(authSection).getByLabelText("ANTHROPIC_AUTH_TOKEN")).toHaveValue("token");
    expect(within(authSection).getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("");
    expect(
      Array.from(authSection.querySelectorAll("label"), (label) =>
        label.textContent?.trim(),
      ).filter(
        (label): label is string =>
          label === "预设" || label === "ANTHROPIC_BASE_URL" || label === "ANTHROPIC_AUTH_TOKEN",
      ),
    ).toEqual(["预设", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"]);
    expect(within(envSection).queryByDisplayValue("ANTHROPIC_AUTH_TOKEN")).not.toBeInTheDocument();
    expect(within(envSection).queryByDisplayValue("ANTHROPIC_BASE_URL")).not.toBeInTheDocument();

    fireEvent.change(within(authSection).getByLabelText("ANTHROPIC_AUTH_TOKEN"), {
      target: { value: "auth-token" },
    });
    fireEvent.change(within(authSection).getByLabelText("ANTHROPIC_BASE_URL"), {
      target: { value: "https://example.com" },
    });

    const rawJsonInput = openFullSettingsJson();
    expect(rawJsonInput.value).toContain('"ANTHROPIC_AUTH_TOKEN": "auth-token"');
    expect(rawJsonInput.value).toContain('"ANTHROPIC_BASE_URL": "https://example.com"');

    await act(async () => {
      await Promise.resolve();
    });

    const previewOutputs = screen.getAllByTestId("config-preview-output");
    const latestPreview = previewOutputs[previewOutputs.length - 1];
    expect(latestPreview).toHaveTextContent('"ANTHROPIC_AUTH_TOKEN": "auth-token"');
    expect(latestPreview).toHaveTextContent('"ANTHROPIC_BASE_URL": "https://example.com"');
  });
});
