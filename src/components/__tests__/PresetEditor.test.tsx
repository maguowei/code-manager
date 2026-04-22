import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { SettingsPreset } from "../../types";
import PresetEditor from "../PresetEditor";
import {
  MOJIBAKE_POST_TOOL_USE_COMMAND,
  MOJIBAKE_PRE_TOOL_USE_COMMAND,
} from "../profile-editor/hook-presets";
import {
  OFFICIAL_MARKETPLACE_ID,
  OFFICIAL_MARKETPLACE_REPO,
} from "../profile-editor/marketplace-presets";

const SETTINGS_STORAGE_KEY = "ai-manager-settings";
const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

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
  const preset = options && "preset" in options ? (options.preset ?? null) : PRESET_FIXTURE;
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
        preset={preset}
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

function switchDocumentSectionToEdit(name: string, editButtonName: string): HTMLTextAreaElement {
  const section = getSection(name);
  fireEvent.click(within(section).getByRole("button", { name: editButtonName }));
  return within(section).getByLabelText("config-preview-input") as HTMLTextAreaElement;
}

describe("PresetEditor", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
  });

  it("renders bilingual preset name inputs and saves localizedName", () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    expect(screen.getByLabelText(/中文名称/)).toHaveValue("团队 OpenRouter");
    expect(screen.getByLabelText(/英文名称/)).toHaveValue("Team OpenRouter");

    fireEvent.change(screen.getByLabelText(/中文名称/), {
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

  it("renders settings patch labels in english", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );

    renderEditor();

    const documentSection = getSection("Settings Patch");
    expect(within(documentSection).getByRole("button", { name: "Preview" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(documentSection).getByRole("button", { name: "Edit JSON" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Full Settings JSON" })).not.toBeInTheDocument();
  });

  it("renders control-first sections with unified mode switches and downgraded full json entry", async () => {
    renderEditor();

    expect(screen.queryByLabelText("降低动画")).not.toBeInTheDocument();

    for (const heading of [
      "基础信息",
      "认证",
      "模型与行为",
      "常用选项",
      "环境变量",
      "权限",
      "Sandbox",
      "Hooks",
      "插件",
      "Status Line",
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
      "常用选项",
      "环境变量",
      "权限",
      "Sandbox",
      "Hooks",
      "插件市场",
      "插件",
      "Status Line",
      "配置补丁",
    ]);

    const documentSection = getSection("配置补丁");
    expect(within(documentSection).getByRole("button", { name: "预览" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(documentSection).getByRole("button", { name: "编辑 JSON" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "整份配置 JSON" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("config-preview-input")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "常用选项", level: 3 }).closest("button"),
    ).toHaveClass("profile-accordion-trigger-large-target");
    expect(screen.getByRole("heading", { name: "权限", level: 3 }).closest("button")).toHaveClass(
      "profile-accordion-trigger-large-target",
    );

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
      const nameZhLabel = basicSection.querySelector(
        'label[for="preset-name-zh"]',
      ) as HTMLElement | null;
      const nameEnLabel = basicSection.querySelector(
        'label[for="preset-name-en"]',
      ) as HTMLElement | null;
      expect(nameZhLabel).not.toBeNull();
      expect(nameEnLabel).not.toBeNull();
      expect(nameZhLabel).toHaveClass("label-required");
      expect(nameEnLabel).toHaveClass("label-required");
      if (nameZhLabel && nameEnLabel) {
        expect(within(nameZhLabel).getByText("至少一项")).toBeInTheDocument();
        expect(within(nameEnLabel).getByText("至少一项")).toBeInTheDocument();
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
      expect(within(sandboxSection).queryByLabelText("HTTP Proxy 端口")).not.toBeInTheDocument();
      expect(within(sandboxSection).queryByLabelText("允许域名 1")).not.toBeInTheDocument();
    }

    expect(screen.queryByRole("button", { name: "新增 Hook 事件" })).not.toBeInTheDocument();

    const hooksSection = screen.getByRole("heading", { name: "Hooks" }).closest("section");
    expect(hooksSection).not.toBeNull();
    if (hooksSection) {
      expect(within(hooksSection).getByText("0")).toBeInTheDocument();
      expect(within(hooksSection).queryByRole("button", { name: "控件" })).not.toBeInTheDocument();
      expect(within(hooksSection).queryByRole("button", { name: "JSON" })).not.toBeInTheDocument();
    }

    const behaviorSection = screen.getByRole("heading", { name: "模型与行为" }).closest("section");
    const commonSection = screen.getByRole("heading", { name: "常用选项" }).closest("section");
    expect(behaviorSection).not.toBeNull();
    expect(commonSection).not.toBeNull();
    if (behaviorSection) {
      expect(within(behaviorSection).getByRole("button", { name: "控件" })).toBeInTheDocument();
      expect(within(behaviorSection).getByRole("button", { name: "JSON" })).toBeInTheDocument();
      expect(within(behaviorSection).queryByText("默认启用深度思考")).not.toBeInTheDocument();
      expect(within(behaviorSection).queryByText("尊重 .gitignore")).not.toBeInTheDocument();
    }
    if (commonSection) {
      expect(within(commonSection).getByRole("button", { name: "收起 常用选项" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(within(commonSection).getByRole("button", { name: "控件" })).toBeInTheDocument();
      expect(within(commonSection).getByRole("button", { name: "JSON" })).toBeInTheDocument();
      const outputStyleSelect = within(commonSection).getByRole("combobox", {
        name: "输出风格",
      }) as HTMLSelectElement;
      expect(outputStyleSelect).toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "输出风格" })).not.toBeInTheDocument();
      expect(outputStyleSelect).toHaveValue("");
      expect(Array.from(outputStyleSelect.options, (option) => option.value)).toEqual([
        "",
        "default",
        "Explanatory",
        "Learning",
      ]);
      expect(within(commonSection).getAllByRole("switch")).toHaveLength(14);
      expect(within(commonSection).getByText("默认启用深度思考")).toBeInTheDocument();
      expect(within(commonSection).getByText("显示 Thinking 摘要")).toBeInTheDocument();
      expect(within(commonSection).getByText("接受计划时显示清理上下文")).toBeInTheDocument();
      expect(within(commonSection).getByText("禁用所有 Hooks")).toBeInTheDocument();
      expect(within(commonSection).getByText("禁用 AI 署名")).toBeInTheDocument();
      expect(within(commonSection).getByText("已完成引导设置")).toBeInTheDocument();
      expect(within(commonSection).getByText("启用 Fast Mode")).toBeInTheDocument();
      expect(within(commonSection).getByText("启用 Agent Teams")).toBeInTheDocument();
      expect(within(commonSection).getByText("启用新版 Init")).toBeInTheDocument();
      expect(within(commonSection).getByText("启用无闪烁模式")).toBeInTheDocument();
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
      preset: {
        ...PRESET_FIXTURE,
        settingsPatch: {
          ...PRESET_FIXTURE.settingsPatch,
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
    expect(toggleRows.length).toBe(0);
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

  it("stores common options as top-level booleans and env switches", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    const commonSection = getSection("常用选项");
    fireEvent.change(screen.getByLabelText("输出风格"), {
      target: { value: "Learning" },
    });
    const labels = [
      "默认启用深度思考",
      "显示 Thinking 摘要",
      "接受计划时显示清理上下文",
      "禁用所有 Hooks",
      "禁用 AI 署名",
      "已完成引导设置",
      "启用 Fast Mode",
      "尊重 .gitignore",
      "跳过 WebFetch 预检",
      "禁用非必要网络请求",
      "启用 LSP 工具",
      "启用新版 Init",
      "启用无闪烁模式",
      "启用 Agent Teams",
    ];

    for (const label of labels) {
      const option = within(commonSection)
        .getByText(label)
        .closest(".profile-common-option-item") as HTMLElement | null;
      expect(option).not.toBeNull();
      if (option) {
        await act(async () => {
          fireEvent.click(within(option).getByRole("switch"));
          await Promise.resolve();
        });
      }
    }

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.settingsPatch).toMatchObject({
      outputStyle: "Learning",
      alwaysThinkingEnabled: true,
      showThinkingSummaries: true,
      showClearContextOnPlanAccept: true,
      disableAllHooks: true,
      attribution: {
        commit: "",
        pr: "",
      },
      hasCompletedOnboarding: true,
      fastMode: true,
      respectGitignore: true,
      skipWebFetchPreflight: true,
    });
    expect(saved.settingsPatch.env).toMatchObject({
      ANTHROPIC_AUTH_TOKEN: "token",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      ENABLE_LSP_TOOL: "1",
      CLAUDE_CODE_NEW_INIT: "1",
      CLAUDE_CODE_NO_FLICKER: "1",
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
    });
  });

  it("preserves custom outputStyle values from common json", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });
    const commonSection = switchSectionToJson("常用选项");

    fireEvent.change(within(commonSection).getByLabelText("config-preview-input"), {
      target: { value: '{\n  "outputStyle": "MyTeamStyle"\n}' },
    });
    fireEvent.click(within(commonSection).getByRole("button", { name: "控件" }));
    expect(within(getSection("常用选项")).getByRole("combobox", { name: "输出风格" })).toHaveValue(
      "MyTeamStyle",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].settingsPatch.outputStyle).toBe("MyTeamStyle");
  });

  it("stores built-in outputStyle values from the outputStyle select", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });
    const commonSection = getSection("常用选项");

    fireEvent.change(within(commonSection).getByRole("combobox", { name: "输出风格" }), {
      target: { value: "default" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].settingsPatch.outputStyle).toBe("default");
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

    const languageGroup = screen
      .getByLabelText("回复语言")
      .closest(".form-group") as HTMLElement | null;
    expect(languageGroup).not.toBeNull();
    if (languageGroup) {
      const languageHeader = languageGroup.querySelector(
        ".profile-field-header",
      ) as HTMLElement | null;
      expect(languageHeader).not.toBeNull();
      if (languageHeader) {
        expect(within(languageHeader).getByRole("button", { name: "language" })).toHaveAttribute(
          "data-tooltip",
          "language",
        );
      }
    }

    expect(modelGroup.querySelector(".profile-field-inline-meta")).toBeNull();
    expect(effortGroup.querySelector(".profile-field-inline-meta")).toBeNull();
    expect(screen.queryByLabelText("模型使用环境变量映射")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("努力级别使用环境变量映射")).not.toBeInTheDocument();
  });

  it("shows helper buttons for top-level common options", () => {
    renderEditor();

    const commonSection = getSection("常用选项");
    expect(within(commonSection).getByRole("button", { name: "outputStyle" })).toHaveAttribute(
      "data-tooltip",
      "outputStyle",
    );
    expect(
      within(commonSection).getByRole("button", { name: "alwaysThinkingEnabled" }),
    ).toHaveAttribute("data-tooltip", "alwaysThinkingEnabled");
    expect(
      within(commonSection).getByRole("button", { name: "showThinkingSummaries" }),
    ).toHaveAttribute("data-tooltip", "showThinkingSummaries");
    expect(
      within(commonSection).getByRole("button", { name: "showClearContextOnPlanAccept" }),
    ).toHaveAttribute("data-tooltip", "showClearContextOnPlanAccept");
    expect(within(commonSection).getByRole("button", { name: "disableAllHooks" })).toHaveAttribute(
      "data-tooltip",
      "disableAllHooks",
    );
    expect(within(commonSection).getByRole("button", { name: "attribution" })).toHaveAttribute(
      "data-tooltip",
      "attribution",
    );
    expect(
      within(commonSection).getByRole("button", { name: "hasCompletedOnboarding" }),
    ).toHaveAttribute("data-tooltip", "hasCompletedOnboarding");
    expect(
      within(commonSection).getByRole("button", { name: "skipWebFetchPreflight" }),
    ).toHaveAttribute("data-tooltip", "skipWebFetchPreflight");
    expect(within(commonSection).getByRole("button", { name: "fastMode" })).toHaveAttribute(
      "data-tooltip",
      "fastMode",
    );
    expect(within(commonSection).getByRole("button", { name: "respectGitignore" })).toHaveAttribute(
      "data-tooltip",
      "respectGitignore",
    );
    expect(
      within(commonSection).getByRole("button", { name: "CLAUDE_CODE_NO_FLICKER" }),
    ).toHaveAttribute("data-tooltip", "CLAUDE_CODE_NO_FLICKER");
  });

  it("saves structured settingsPatch data without requiring raw json editing", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    fireEvent.change(screen.getByLabelText("默认模型"), {
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

    toggleAccordionSection("Hooks");
    expect(within(hooksSection).getByText("1")).toBeInTheDocument();
    expect(within(hooksSection).queryByLabelText("config-preview-input")).not.toBeInTheDocument();

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

  it("adds the mojibake hook preset from the hooks shortcut in preset view", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    const hooksSection = getSection("Hooks");
    toggleAccordionSection("Hooks");

    fireEvent.click(within(hooksSection).getByRole("button", { name: "添加乱码检查预设" }));

    expect(within(hooksSection).getByText("PreToolUse")).toBeInTheDocument();
    expect(within(hooksSection).getByText("PostToolUse")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsPatch: expect.objectContaining({
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  {
                    type: "command",
                    command: MOJIBAKE_PRE_TOOL_USE_COMMAND,
                  },
                ],
              },
            ],
            PostToolUse: [
              {
                matcher: "Edit|Write",
                hooks: [
                  {
                    type: "command",
                    command: MOJIBAKE_POST_TOOL_USE_COMMAND,
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

  it("blocks save when settings patch json is invalid", async () => {
    renderEditor();

    const documentSection = getSection("配置补丁");
    await act(async () => {
      fireEvent.click(within(documentSection).getByRole("button", { name: "编辑 JSON" }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.change(within(documentSection).getByLabelText("config-preview-input"), {
        target: { value: "[]" },
      });
      await Promise.resolve();
    });

    expect(within(documentSection).getByText("settingsPatch 必须是 JSON 对象")).toBeInTheDocument();
    expect(
      within(documentSection).getByText("当前草稿未生效，仍使用上一次合法 JSON。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("blocks save when status line json is invalid", async () => {
    renderEditor();

    const statusLineSection = switchSectionToJson("Status Line", { expandFirst: true });
    fireEvent.change(within(statusLineSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            type: "command",
            command: "",
            refreshInterval: 0,
          },
          null,
          2,
        ),
      },
    });

    expect(
      within(statusLineSection).getAllByText("Status Line JSON 中的 command 不能为空").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("shows sandbox state details without a second toggle in expanded preset view", () => {
    renderEditor({
      preset: {
        ...PRESET_FIXTURE,
        settingsPatch: {
          ...PRESET_FIXTURE.settingsPatch,
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
    expect(within(sandboxSection).getByText("沙盒开关")).toBeInTheDocument();

    toggleAccordionSection("Sandbox");

    expect(within(sandboxSection).queryByRole("switch", { name: "Sandbox 开关" })).toBeNull();
    expect(
      within(sandboxSection).queryByText("横栏和此处开关会同步更新，详细配置请切到 JSON。"),
    ).toBeNull();
    expect(within(sandboxSection).getByText("当前状态：已启用")).toBeInTheDocument();
    expect(within(sandboxSection).getByText("当前有 1 个附加配置键。")).toBeInTheDocument();
    expect(within(sandboxSection).getByText("network")).toBeInTheDocument();
  });

  it("renders marketplace summaries and opens inline marketplace editing in preset view", () => {
    renderEditor({
      preset: {
        ...PRESET_FIXTURE,
        settingsPatch: {
          ...PRESET_FIXTURE.settingsPatch,
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
        },
      },
    });

    const marketplacesSection = getSection("插件市场");
    toggleAccordionSection("插件市场");

    expect(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace team-market" }),
    ).toBeInTheDocument();
    const marketplaceRowHead = within(marketplacesSection)
      .getByRole("button", { name: "编辑 Marketplace team-market" })
      .closest(".profile-marketplace-row-head");
    expect(marketplaceRowHead).not.toBeNull();
    expect(
      within(marketplaceRowHead as HTMLElement).getByRole("button", {
        name: "删除 Marketplace team-market",
      }),
    ).toBeInTheDocument();
    expect(within(marketplacesSection).getByText("github")).toBeInTheDocument();
    expect(within(marketplacesSection).getByText("team/plugins")).toBeInTheDocument();
    expect(screen.queryByLabelText("Marketplace ID")).not.toBeInTheDocument();

    fireEvent.click(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace team-market" }),
    );

    expect(screen.getByLabelText("Marketplace ID")).toHaveValue("team-market");
    expect(screen.getByLabelText("Marketplace 仓库")).toHaveValue("team/plugins");
    expect(screen.getByLabelText("Marketplace Ref")).toHaveValue("main");
  });

  it("renders plugin rows with read-only ids and switch controls in preset view", () => {
    renderEditor({
      preset: {
        ...PRESET_FIXTURE,
        settingsPatch: {
          ...PRESET_FIXTURE.settingsPatch,
          enabledPlugins: {
            "formatter@anthropic-tools": true,
            "reviewer@anthropic-tools": false,
          },
        },
      },
    });

    const pluginsSection = getSection("插件");
    toggleAccordionSection("插件");

    expect(within(pluginsSection).getByText("formatter@anthropic-tools")).toBeInTheDocument();
    expect(within(pluginsSection).getByText("reviewer@anthropic-tools")).toBeInTheDocument();
    expect(
      within(pluginsSection).getByRole("switch", {
        name: "插件状态 formatter@anthropic-tools",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(pluginsSection).getByRole("switch", {
        name: "插件状态 reviewer@anthropic-tools",
      }),
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText("插件 ID 1")).not.toBeInTheDocument();
    expect(within(pluginsSection).queryByText("插件模式")).not.toBeInTheDocument();
    expect(within(pluginsSection).queryByText("插件工具")).not.toBeInTheDocument();
  });

  it("saves the official marketplace from the shared marketplace shortcut in preset view", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    const marketplacesSection = getSection("插件市场");
    toggleAccordionSection("插件市场");

    await act(async () => {
      fireEvent.click(within(marketplacesSection).getByRole("button", { name: "启用官方市场" }));
      await Promise.resolve();
    });

    expect(
      within(marketplacesSection).getByRole("button", {
        name: `编辑 Marketplace ${OFFICIAL_MARKETPLACE_ID}`,
      }),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsPatch: expect.objectContaining({
          extraKnownMarketplaces: {
            [OFFICIAL_MARKETPLACE_ID]: {
              source: {
                source: "github",
                repo: OFFICIAL_MARKETPLACE_REPO,
              },
            },
          },
        }),
      }),
    );
  });

  it("loads official plugins in preset view and saves them as disabled by default", async () => {
    const onSave = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        plugins: [{ name: "reviewer-plugin" }],
      }),
    });
    renderEditor({
      onSave,
      preset: {
        ...PRESET_FIXTURE,
        settingsPatch: {
          ...PRESET_FIXTURE.settingsPatch,
          extraKnownMarketplaces: {
            [OFFICIAL_MARKETPLACE_ID]: {
              source: {
                source: "github",
                repo: OFFICIAL_MARKETPLACE_REPO,
              },
            },
          },
          enabledPlugins: {
            "formatter@anthropic-tools": true,
          },
        },
      },
    });

    const pluginsSection = getSection("插件");
    toggleAccordionSection("插件");

    await act(async () => {
      fireEvent.click(within(pluginsSection).getByRole("button", { name: "加载官方插件" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      within(pluginsSection).getByText("reviewer-plugin@claude-plugins-official"),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsPatch: expect.objectContaining({
          enabledPlugins: {
            "formatter@anthropic-tools": true,
            "reviewer-plugin@claude-plugins-official": false,
          },
        }),
      }),
    );
  });

  it("saves status line settings from structured controls in preset view", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    const statusLineSection = getSection("Status Line");
    toggleAccordionSection("Status Line");

    fireEvent.change(within(statusLineSection).getByLabelText("Status Line 命令"), {
      target: { value: "~/.claude/statusline.sh" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("Status Line padding"), {
      target: { value: "2" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("Status Line refreshInterval"), {
      target: { value: "5" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsPatch: expect.objectContaining({
          statusLine: {
            type: "command",
            command: "~/.claude/statusline.sh",
            padding: 2,
            refreshInterval: 5,
          },
        }),
      }),
    );
  });

  it("saves behavior, common options, permissions, env, plugins, marketplaces, and status line from local json editors", async () => {
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

    const commonSection = switchSectionToJson("常用选项");
    fireEvent.change(within(commonSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            env: {
              ENABLE_LSP_TOOL: "1",
            },
            outputStyle: "Explanatory",
            alwaysThinkingEnabled: true,
            showThinkingSummaries: true,
            showClearContextOnPlanAccept: true,
            disableAllHooks: true,
            attribution: {
              commit: "",
              pr: "",
            },
            hasCompletedOnboarding: true,
          },
          null,
          2,
        ),
      },
    });
    fireEvent.click(within(commonSection).getByRole("button", { name: "控件" }));
    expect(screen.getByLabelText("输出风格")).toHaveValue("Explanatory");
    for (const label of [
      "默认启用深度思考",
      "显示 Thinking 摘要",
      "接受计划时显示清理上下文",
      "禁用所有 Hooks",
      "已完成引导设置",
    ]) {
      expect(
        within(commonSection).getByRole("switch", {
          name: `切换常用选项 ${label}`,
        }),
      ).toHaveAttribute("aria-checked", "true");
    }
    expect(
      within(commonSection).getByRole("switch", {
        name: "切换常用选项 禁用 AI 署名",
      }),
    ).toHaveAttribute("aria-checked", "true");

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

    const statusLineSection = switchSectionToJson("Status Line", { expandFirst: true });
    fireEvent.change(within(statusLineSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            type: "command",
            command: "~/.claude/statusline.sh",
            padding: 2,
            refreshInterval: 5,
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
          alwaysThinkingEnabled: true,
          hasCompletedOnboarding: true,
          permissions: {
            defaultMode: "plan",
          },
          env: {
            ANTHROPIC_AUTH_TOKEN: "token",
            ENABLE_LSP_TOOL: "1",
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
          statusLine: {
            type: "command",
            command: "~/.claude/statusline.sh",
            padding: 2,
            refreshInterval: 5,
          },
        }),
      }),
    );
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
    expect(screen.queryByText("权限规则")).not.toBeInTheDocument();
    expect(screen.queryByText("用规则构建器快速维护权限配置。")).not.toBeInTheDocument();
    expect(within(permissionsSection).getByLabelText("权限头部默认模式")).toHaveValue("plan");

    fireEvent.change(within(permissionsSection).getByLabelText("权限头部默认模式"), {
      target: { value: "" },
    });
    expect(screen.queryByLabelText("默认模式")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]?.settingsPatch).not.toHaveProperty("permissions");
  });

  it("renders permission rows without reorder actions and with shared input styling", async () => {
    renderEditor();

    toggleAccordionSection("权限");
    const allowSection = screen
      .getByRole("heading", { name: "允许规则" })
      .closest(".profile-subsection") as HTMLElement | null;
    const directorySection = screen
      .getByRole("heading", { name: "附加目录" })
      .closest(".profile-subsection") as HTMLElement | null;

    expect(allowSection).not.toBeNull();
    expect(directorySection).not.toBeNull();

    if (!allowSection || !directorySection) {
      return;
    }

    const emptyAllowHint = allowSection.querySelector(".profile-empty-state") as HTMLElement | null;
    const addAllowButton = within(allowSection).getByRole("button", { name: "新增允许规则" });

    expect(emptyAllowHint).not.toBeNull();
    expect(
      within(allowSection).queryByRole("button", { name: "收起 允许规则" }),
    ).not.toBeInTheDocument();
    if (emptyAllowHint) {
      expect(
        emptyAllowHint.compareDocumentPosition(addAllowButton) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }

    await act(async () => {
      fireEvent.click(addAllowButton);
      fireEvent.click(within(directorySection).getByRole("button", { name: "新增附加目录" }));
      await Promise.resolve();
    });

    const allowRuleInput = screen.getByLabelText("允许规则 1");
    const directoryInput = screen.getByLabelText("附加目录 1");
    expect(allowRuleInput).toHaveClass("form-input");
    expect(directoryInput).toHaveClass("form-input");
    expect(screen.queryByRole("button", { name: "上移 允许规则 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下移 允许规则 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除 允许规则 1" })).toBeInTheDocument();
    expect(within(allowSection).getByRole("button", { name: "收起 允许规则" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(directorySection).getByRole("button", { name: "收起 附加目录" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      allowRuleInput.compareDocumentPosition(
        within(allowSection).getByRole("button", { name: "新增允许规则" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      directoryInput.compareDocumentPosition(
        within(directorySection).getByRole("button", { name: "新增附加目录" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await act(async () => {
      fireEvent.click(within(allowSection).getByRole("button", { name: "收起 允许规则" }));
      fireEvent.click(within(directorySection).getByRole("button", { name: "收起 附加目录" }));
      await Promise.resolve();
    });

    expect(within(allowSection).queryByLabelText("允许规则 1")).not.toBeInTheDocument();
    expect(
      within(allowSection).queryByRole("button", { name: "新增允许规则" }),
    ).not.toBeInTheDocument();
    expect(within(directorySection).queryByLabelText("附加目录 1")).not.toBeInTheDocument();
    expect(
      within(directorySection).queryByRole("button", { name: "新增附加目录" }),
    ).not.toBeInTheDocument();
  });

  it("keeps delegate visible for existing permissions default mode without exposing it as a normal option", () => {
    renderEditor({
      preset: {
        ...PRESET_FIXTURE,
        settingsPatch: {
          ...PRESET_FIXTURE.settingsPatch,
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
    expect(
      Array.from(authSection.querySelectorAll("label"), (label) =>
        label.textContent?.trim(),
      ).filter(
        (label): label is string =>
          label === "基础预设" ||
          label === "ANTHROPIC_BASE_URL" ||
          label === "ANTHROPIC_AUTH_TOKEN",
      ),
    ).toEqual(["基础预设", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"]);
    expect(within(envSection).queryByDisplayValue("ANTHROPIC_AUTH_TOKEN")).not.toBeInTheDocument();
    expect(within(envSection).queryByDisplayValue("ANTHROPIC_BASE_URL")).not.toBeInTheDocument();

    fireEvent.change(within(authSection).getByLabelText("ANTHROPIC_AUTH_TOKEN"), {
      target: { value: "auth-token" },
    });
    fireEvent.change(within(authSection).getByLabelText("ANTHROPIC_BASE_URL"), {
      target: { value: "https://example.com" },
    });

    const rawJsonInput = switchDocumentSectionToEdit("配置补丁", "编辑 JSON");
    expect(rawJsonInput.value).toContain('"ANTHROPIC_AUTH_TOKEN": "auth-token"');
    expect(rawJsonInput.value).toContain('"ANTHROPIC_BASE_URL": "https://example.com"');
    fireEvent.click(within(getSection("配置补丁")).getByRole("button", { name: "预览" }));

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
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("claude-opus-4-1");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("claude-haiku-4-5");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("claude-sonnet-4-6");

    fireEvent.change(screen.getByLabelText("基础预设"), {
      target: { value: "custom:team-plan" },
    });
    expect(screen.getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("https://openrouter.ai/api");
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("claude-opus-4-1");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("claude-haiku-4-5");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("claude-sonnet-4-6");

    fireEvent.change(screen.getByLabelText("基础预设"), {
      target: { value: "custom:explicit-model" },
    });
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-opus-explicit");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("claude-opus-4-1");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("claude-haiku-4-5");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("claude-sonnet-4-6");

    fireEvent.change(screen.getByLabelText("基础预设"), {
      target: { value: "custom:env-level-overrides" },
    });
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-opus-explicit");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("haiku-env-override");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("subagent-env-override");

    fireEvent.change(screen.getByLabelText("基础预设"), {
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

  it("seeds default-enabled common options for new presets", async () => {
    const onSave = vi.fn();
    renderEditor({ preset: null, onSave });

    const commonSection = getSection("常用选项");
    for (const label of [
      "默认启用深度思考",
      "已完成引导设置",
      "跳过 WebFetch 预检",
      "禁用非必要网络请求",
      "启用 LSP 工具",
      "启用新版 Init",
      "启用无闪烁模式",
    ]) {
      expect(
        within(commonSection).getByRole("switch", {
          name: `切换常用选项 ${label}`,
        }),
      ).toHaveAttribute("aria-checked", "true");
    }
    expect(screen.getByLabelText("输出风格")).toHaveValue("");
    for (const label of [
      "显示 Thinking 摘要",
      "接受计划时显示清理上下文",
      "禁用 AI 署名",
      "禁用所有 Hooks",
      "启用 Fast Mode",
      "尊重 .gitignore",
      "启用 Agent Teams",
    ]) {
      expect(
        within(commonSection).getByRole("switch", {
          name: `切换常用选项 ${label}`,
        }),
      ).toHaveAttribute("aria-checked", "false");
    }

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/中文名称/), {
        target: { value: "默认预设" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.settingsPatch).toMatchObject({
      alwaysThinkingEnabled: true,
      hasCompletedOnboarding: true,
      skipWebFetchPreflight: true,
    });
    expect(saved.settingsPatch.env).toMatchObject({
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      CLAUDE_CODE_NEW_INIT: "1",
      CLAUDE_CODE_NO_FLICKER: "1",
      ENABLE_LSP_TOOL: "1",
    });
    expect(saved.settingsPatch).not.toHaveProperty("fastMode");
    expect(saved.settingsPatch).not.toHaveProperty("respectGitignore");
    expect(saved.settingsPatch).not.toHaveProperty("outputStyle");
    expect(saved.settingsPatch).not.toHaveProperty("attribution");
    expect(saved.settingsPatch.env).not.toHaveProperty("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS");
  });
});
