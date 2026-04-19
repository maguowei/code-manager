import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { SettingsPreset } from "../../types";
import PresetEditor from "../PresetEditor";

const SETTINGS_STORAGE_KEY = "ai-manager-settings";

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

const PRESETS: SettingsPreset[] = [
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
    modelSuggestions: ["claude-sonnet-4-6"],
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
    description: "团队计划预设",
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

const PRESET_FIXTURE: SettingsPreset = {
  id: "team-openrouter",
  name: "Team OpenRouter",
  localizedName: {
    zh: "团队 OpenRouter",
    en: "Team OpenRouter",
  },
  description: "团队默认预设",
  basePresetId: "builtin:openrouter",
  docUrl: "https://example.com/docs",
  modelSuggestions: ["claude-sonnet-4-6"],
  settingsPatch: {
    env: {
      ANTHROPIC_AUTH_TOKEN: "token",
    },
  },
  source: "custom",
};

function renderEditor(options?: {
  preset?: SettingsPreset | null;
  presets?: SettingsPreset[];
  onSave?: (data: {
    id?: string;
    name: string;
    localizedName?: {
      zh: string;
      en: string;
    };
    description: string;
    basePresetId?: string;
    docUrl?: string;
    models?: SettingsPreset["models"];
    modelSuggestions: string[];
    settingsPatch: Record<string, unknown>;
  }) => void | Promise<void>;
}) {
  const onSave =
    options?.onSave ??
    vi.fn<
      (data: {
        id?: string;
        name: string;
        localizedName?: {
          zh: string;
          en: string;
        };
        description: string;
        basePresetId?: string;
        docUrl?: string;
        models?: SettingsPreset["models"];
        modelSuggestions: string[];
        settingsPatch: Record<string, unknown>;
      }) => void | Promise<void>
    >();
  render(
    <I18nProvider>
      <PresetEditor
        preset={options?.preset ?? PRESET_FIXTURE}
        presets={options?.presets ?? PRESETS}
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

describe("PresetEditor", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders bilingual preset name inputs and saves localizedName", () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    expect(screen.getByLabelText("中文名称")).toHaveValue("团队 OpenRouter");
    expect(screen.getByLabelText("英文名称")).toHaveValue("Team OpenRouter");

    fireEvent.change(screen.getByLabelText("中文名称"), {
      target: { value: "团队路由" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Team OpenRouter",
        localizedName: {
          zh: "团队路由",
          en: "Team OpenRouter",
        },
      }),
    );
  });

  it("shows base preset names using the current UI language", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );

    renderEditor();

    expect(screen.getByRole("option", { name: "开放路由" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "OpenRouter" })).not.toBeInTheDocument();
  });

  it("renders control-first sections with unified mode switches and downgraded full json entry", () => {
    renderEditor();

    for (const heading of [
      "基础信息",
      "认证",
      "模型与行为",
      "环境变量",
      "权限",
      "Sandbox",
      "Hooks",
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
      "Patch 预览",
    ]);

    expect(screen.getByRole("button", { name: "整份配置 JSON" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "专家模式" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("config-preview-input")).not.toBeInTheDocument();

    const authSection = screen.getByRole("heading", { name: "认证", level: 3 }).closest("section");
    const basicSection = screen
      .getByRole("heading", { name: "基础信息", level: 3 })
      .closest("section");
    expect(basicSection).not.toBeNull();
    expect(authSection).not.toBeNull();
    if (authSection) {
      expect(within(authSection).getByLabelText("基础预设")).toBeInTheDocument();
      expect(within(authSection).getByLabelText("ANTHROPIC_AUTH_TOKEN")).toHaveValue("token");
      expect(within(authSection).getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("");
    }
    if (basicSection) {
      expect(within(basicSection).queryByLabelText("基础预设")).not.toBeInTheDocument();
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
      expect(within(sandboxSection).queryByLabelText("启用 Sandbox")).not.toBeInTheDocument();
      expect(within(sandboxSection).queryByLabelText("HTTP Proxy 端口")).not.toBeInTheDocument();
      expect(within(sandboxSection).queryByLabelText("允许域名 1")).not.toBeInTheDocument();
    }

    expect(screen.queryByRole("button", { name: "新增 Hook 事件" })).not.toBeInTheDocument();

    const hooksSection = screen.getByRole("heading", { name: "Hooks" }).closest("section");
    expect(hooksSection).not.toBeNull();
    if (hooksSection) {
      expect(within(hooksSection).queryByRole("button", { name: "控件" })).not.toBeInTheDocument();
      expect(within(hooksSection).queryByRole("button", { name: "JSON" })).not.toBeInTheDocument();
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
      expect(within(envSection).getByRole("button", { name: "控件" })).toBeInTheDocument();
      expect(within(envSection).getByRole("button", { name: "JSON" })).toBeInTheDocument();
      expect(
        within(envSection).queryByDisplayValue("ANTHROPIC_AUTH_TOKEN"),
      ).not.toBeInTheDocument();
      expect(within(envSection).getByDisplayValue("CLAUDE_CODE_EFFORT_LEVEL")).toBeInTheDocument();
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
        within(marketplacesSection).queryByLabelText("config-preview-input"),
      ).not.toBeInTheDocument();
    }

    const pluginsSection = screen
      .getByRole("heading", { name: "插件", level: 3 })
      .closest("section");
    expect(pluginsSection).not.toBeNull();
    if (pluginsSection) {
      expect(within(pluginsSection).getByText("0")).toBeInTheDocument();
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
      expect(
        within(pluginsSection).queryByLabelText("config-preview-input"),
      ).not.toBeInTheDocument();

      expect(
        within(marketplacesSection as HTMLElement).queryByRole("button", { name: "控件" }),
      ).not.toBeInTheDocument();
    }
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
      "auto",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(effortSelect).toHaveValue("auto");
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

    expect(within(envSection).queryByDisplayValue("ANTHROPIC_MODEL")).not.toBeInTheDocument();
    expect(within(envSection).getByDisplayValue("CLAUDE_CODE_EFFORT_LEVEL")).toBeInTheDocument();
    expect(
      within(envSection).queryByDisplayValue("ANTHROPIC_DEFAULT_OPUS_MODEL"),
    ).not.toBeInTheDocument();
    expect(
      within(envSection).queryByDisplayValue("ANTHROPIC_DEFAULT_SONNET_MODEL"),
    ).not.toBeInTheDocument();
    expect(
      within(envSection).queryByDisplayValue("ANTHROPIC_DEFAULT_HAIKU_MODEL"),
    ).not.toBeInTheDocument();
    expect(
      within(envSection).queryByDisplayValue("CLAUDE_CODE_SUBAGENT_MODEL"),
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
    expect(effortSelect).toHaveValue("auto");

    await act(async () => {
      fireEvent.change(screen.getByLabelText("模型"), {
        target: { value: "claude-opus-4-1" },
      });
      fireEvent.change(effortSelect, {
        target: { value: "auto" },
      });
      await Promise.resolve();
    });

    expect(within(envSection).getByDisplayValue("ANTHROPIC_MODEL")).toBeInTheDocument();
    expect(within(envSection).getByDisplayValue("CLAUDE_CODE_EFFORT_LEVEL")).toBeInTheDocument();
    expect(
      within(envSection).getByDisplayValue("ANTHROPIC_DEFAULT_OPUS_MODEL"),
    ).toBeInTheDocument();
    expect(
      within(envSection).getByDisplayValue("ANTHROPIC_DEFAULT_SONNET_MODEL"),
    ).toBeInTheDocument();
    expect(
      within(envSection).getByDisplayValue("ANTHROPIC_DEFAULT_HAIKU_MODEL"),
    ).toBeInTheDocument();
    expect(within(envSection).getByDisplayValue("CLAUDE_CODE_SUBAGENT_MODEL")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.settingsPatch.env).toEqual({
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: "claude-opus-4-1",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-1",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-6",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5",
      CLAUDE_CODE_SUBAGENT_MODEL: "claude-sonnet-4-6",
      CLAUDE_CODE_EFFORT_LEVEL: "auto",
    });
    expect(saved.settingsPatch).not.toHaveProperty("model");
    expect(saved.settingsPatch).not.toHaveProperty("effortLevel");
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
      const labelMeta = fieldGroup.querySelector(".profile-field-label-meta") as HTMLElement | null;
      expect(labelMeta).not.toBeNull();
      expect(fieldGroup.querySelector(".profile-field-badge")).toBeNull();
      expect(fieldGroup.querySelector(".profile-field-inline-meta")).toBeNull();
    }

    expect(screen.getByText("ANTHROPIC_DEFAULT_OPUS_MODEL")).toBeInTheDocument();
    expect(screen.getByText("ANTHROPIC_DEFAULT_SONNET_MODEL")).toBeInTheDocument();
    expect(screen.getByText("ANTHROPIC_DEFAULT_HAIKU_MODEL")).toBeInTheDocument();
    expect(screen.getByText("CLAUDE_CODE_SUBAGENT_MODEL")).toBeInTheDocument();
  });

  it("renders mapping controls inline inside field headers", async () => {
    await act(async () => {
      renderEditor();
      await Promise.resolve();
    });

    const modelGroup = screen.getByLabelText("模型").closest(".form-group") as HTMLElement | null;
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
      const modelLabelMeta = modelHeader.querySelector(
        ".profile-field-label-meta",
      ) as HTMLElement | null;
      const effortLabelMeta = effortHeader.querySelector(
        ".profile-field-label-meta",
      ) as HTMLElement | null;
      expect(modelLabelMeta).not.toBeNull();
      expect(effortLabelMeta).not.toBeNull();
      if (modelLabelMeta && effortLabelMeta) {
        expect(modelLabelMeta).toHaveTextContent("(ANTHROPIC_MODEL)");
        expect(effortLabelMeta).toHaveTextContent("(CLAUDE_CODE_EFFORT_LEVEL)");
      }
    }

    expect(modelGroup.querySelector(".profile-field-inline-meta")).toBeNull();
    expect(effortGroup.querySelector(".profile-field-inline-meta")).toBeNull();
    expect(screen.queryByLabelText("模型使用环境变量映射")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("努力级别使用环境变量映射")).not.toBeInTheDocument();
  });

  it("saves structured settingsPatch data without requiring raw json editing", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    fireEvent.change(screen.getByLabelText("模型"), {
      target: { value: "claude-opus-4-1" },
    });
    fireEvent.change(screen.getByLabelText("ANTHROPIC_AUTH_TOKEN"), {
      target: { value: "new-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "team-openrouter",
        settingsPatch: expect.objectContaining({
          env: {
            ANTHROPIC_AUTH_TOKEN: "new-token",
            ANTHROPIC_MODEL: "claude-opus-4-1",
            CLAUDE_CODE_EFFORT_LEVEL: "auto",
          },
        }),
      }),
    );
  });

  it("edits hooks through the local json editor only", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    const hooksSection = switchSectionToJson("Hooks");
    fireEvent.change(within(hooksSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
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
          null,
          2,
        ),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsPatch: expect.objectContaining({
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
        }),
      }),
    );
  });

  it("edits sandbox through the local json editor only", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    const sandboxSection = switchSectionToJson("Sandbox");
    fireEvent.change(within(sandboxSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            enabled: true,
            network: {
              allowedDomains: ["example.com"],
            },
          },
          null,
          2,
        ),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsPatch: expect.objectContaining({
          sandbox: {
            enabled: true,
            network: {
              allowedDomains: ["example.com"],
            },
          },
        }),
      }),
    );
  });

  it("saves behavior, permissions, env, plugins, and marketplaces from local json editors", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    const behaviorSection = switchSectionToJson("模型与行为");
    fireEvent.change(within(behaviorSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            env: {
              ANTHROPIC_MODEL: "claude-opus-4-1",
            },
            language: "english",
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

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsPatch: expect.objectContaining({
          language: "english",
          permissions: {
            defaultMode: "plan",
          },
          env: {
            ANTHROPIC_AUTH_TOKEN: "token",
            CLAUDE_CODE_EFFORT_LEVEL: "auto",
            OPENAI_API_KEY: "json-token",
          },
          enabledPlugins: {
            "formatter@anthropic-tools": ["format"],
          },
          extraKnownMarketplaces: {
            "team-market": {
              source: {
                source: "github",
                repo: "team/plugins",
              },
            },
          },
        }),
      }),
    );
  });

  it("renders authentication controls in a dedicated section and keeps hidden env keys in patch preview", () => {
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

    expect(within(authSection).getByLabelText("基础预设")).toBeInTheDocument();
    expect(within(authSection).getByLabelText("ANTHROPIC_AUTH_TOKEN")).toHaveValue("token");
    expect(within(authSection).getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("");
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

    const previewOutputs = screen.getAllByTestId("config-preview-output");
    const latestPreview = previewOutputs[previewOutputs.length - 1];
    expect(latestPreview).toHaveTextContent('"ANTHROPIC_AUTH_TOKEN": "auth-token"');
    expect(latestPreview).toHaveTextContent('"ANTHROPIC_BASE_URL": "https://example.com"');
  });

  it("autofills base url and all model levels from the selected base preset, then clears them when the base preset is removed", () => {
    renderEditor({
      preset: {
        ...PRESET_FIXTURE,
        basePresetId: undefined,
        settingsPatch: {
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

    fireEvent.change(screen.getByLabelText("基础预设"), {
      target: { value: "builtin:openrouter" },
    });
    expect(screen.getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("https://openrouter.ai/api");
    expect(screen.getByLabelText("模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("claude-opus-4-1");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("claude-haiku-4-5");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("claude-sonnet-4-6");

    fireEvent.change(screen.getByLabelText("基础预设"), {
      target: { value: "custom:team-plan" },
    });
    expect(screen.getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("https://openrouter.ai/api");
    expect(screen.getByLabelText("模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("claude-opus-4-1");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("claude-haiku-4-5");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("claude-sonnet-4-6");

    fireEvent.change(screen.getByLabelText("基础预设"), {
      target: { value: "custom:explicit-model" },
    });
    expect(screen.getByLabelText("模型")).toHaveValue("claude-opus-explicit");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("claude-opus-4-1");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("claude-haiku-4-5");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("claude-sonnet-4-6");

    fireEvent.change(screen.getByLabelText("基础预设"), {
      target: { value: "custom:env-level-overrides" },
    });
    expect(screen.getByLabelText("模型")).toHaveValue("claude-opus-explicit");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("haiku-env-override");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("subagent-env-override");

    fireEvent.change(screen.getByLabelText("基础预设"), {
      target: { value: "" },
    });
    expect(screen.getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("");
    expect(screen.getByLabelText("模型")).toHaveValue("");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("");
    expect(screen.getByLabelText("ANTHROPIC_AUTH_TOKEN")).toHaveValue("token");
  });
});
