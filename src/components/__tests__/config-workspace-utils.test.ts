import { describe, expect, it } from "vitest";
import type { Provider } from "../../types";
import {
  applyProviderAutofill,
  getEnabledPluginsSummary,
  resolveProviderAutofillValues,
} from "../config-workspace-utils";

/** 段 B：Provider 不再有 settingsPatch/basePresetId，只有 env 扁平字典 */
const PRESETS: Provider[] = [
  {
    id: "builtin:openrouter",
    name: "OpenRouter",
    description: "OpenRouter 供应商",
    localizedName: {
      zh: "开放路由",
      en: "OpenRouter",
    },
    models: [
      { id: "claude-opus-4-1", category: "opus" },
      { id: "claude-sonnet-4-6", category: "sonnet" },
      { id: "claude-haiku-4-5", category: "haiku" },
    ],
    modelSuggestions: ["claude-sonnet-4-6", "claude-opus-4-1"],
    env: {
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
    },
    source: "builtin",
  },
  {
    id: "custom:env-model",
    name: "Env Model",
    description: "环境变量模型供应商",
    localizedName: {
      zh: "环境变量模型",
      en: "Env Model",
    },
    modelSuggestions: ["claude-sonnet-4-6"],
    env: {
      ANTHROPIC_BASE_URL: "https://custom.api.com",
      ANTHROPIC_MODEL: "claude-env-override",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "haiku-env-override",
      CLAUDE_CODE_SUBAGENT_MODEL: "subagent-env-override",
    },
    source: "custom",
  },
  {
    id: "custom:suggestions-only",
    name: "Suggestions Only",
    description: "仅建议模型供应商",
    localizedName: {
      zh: "仅建议模型",
      en: "Suggestions Only",
    },
    modelSuggestions: ["claude-suggestion-only"],
    env: {},
    source: "custom",
  },
  {
    id: "custom:sonnet-only",
    name: "Sonnet Only",
    description: "仅 Sonnet 分类模型供应商",
    localizedName: {
      zh: "仅 Sonnet",
      en: "Sonnet Only",
    },
    models: [{ id: "claude-sonnet-only", category: "sonnet" }],
    modelSuggestions: [],
    env: {},
    source: "custom",
  },
  {
    id: "builtin:deepseek",
    name: "DeepSeek",
    description: "DeepSeek 供应商",
    localizedName: {
      zh: "DeepSeek",
      en: "DeepSeek",
    },
    models: [
      { id: "deepseek-v4-pro[1m]", category: "sonnet" },
      { id: "deepseek-v4-flash", category: "haiku" },
    ],
    modelSuggestions: ["deepseek-v4-pro[1m]", "deepseek-v4-flash"],
    env: {
      ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
      ANTHROPIC_MODEL: "deepseek-v4-pro[1m]",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-pro[1m]",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-v4-pro[1m]",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-v4-flash",
      CLAUDE_CODE_SUBAGENT_MODEL: "deepseek-v4-flash",
      CLAUDE_CODE_EFFORT_LEVEL: "max",
    },
    source: "builtin",
  },
];

describe("config-workspace-utils preset autofill", () => {
  it("counts enabled and total plugins with legacy truthy compatibility", () => {
    expect(
      getEnabledPluginsSummary({
        "formatter@anthropic-tools": true,
        "reviewer@anthropic-tools": false,
      }),
    ).toEqual({
      enabledCount: 1,
      totalCount: 2,
    });

    expect(
      getEnabledPluginsSummary({
        "docs@anthropic-tools": ["search"],
        "reviewer@anthropic-tools": false,
      }),
    ).toEqual({
      enabledCount: 1,
      totalCount: 2,
    });

    expect(getEnabledPluginsSummary({})).toEqual({
      enabledCount: 0,
      totalCount: 0,
    });

    expect(getEnabledPluginsSummary(null)).toEqual({
      enabledCount: 0,
      totalCount: 0,
    });
  });

  it("resolves categorized models from provider env and models array", () => {
    // 段 B：不再有继承链，直接从单个 provider 读取
    expect(resolveProviderAutofillValues(PRESETS, "builtin:openrouter")).toEqual({
      resolvedBaseUrl: "https://openrouter.ai/api",
      resolvedModel: "claude-sonnet-4-6", // categorySonnet 优先于 suggestion
      resolvedOpusModel: "claude-opus-4-1",
      resolvedSonnetModel: "claude-sonnet-4-6",
      resolvedHaikuModel: "claude-haiku-4-5",
      resolvedSubagentModel: undefined,
      resolvedEffortLevel: undefined,
    });
  });

  it("resolves env model overrides from provider env dict", () => {
    expect(resolveProviderAutofillValues(PRESETS, "custom:env-model")).toEqual({
      resolvedBaseUrl: "https://custom.api.com",
      resolvedModel: "claude-env-override",
      resolvedOpusModel: undefined,
      resolvedSonnetModel: "claude-env-override", // falls back to resolvedModel
      resolvedHaikuModel: "haiku-env-override",
      resolvedSubagentModel: "subagent-env-override",
      resolvedEffortLevel: undefined,
    });
  });

  it("falls back to model suggestions only after explicit values and categorized models are exhausted", () => {
    expect(resolveProviderAutofillValues(PRESETS, "custom:suggestions-only")).toEqual({
      resolvedBaseUrl: undefined,
      resolvedModel: "claude-suggestion-only",
      resolvedOpusModel: undefined,
      resolvedSonnetModel: "claude-suggestion-only",
      resolvedHaikuModel: "claude-suggestion-only",
      resolvedSubagentModel: undefined,
      resolvedEffortLevel: undefined,
    });
  });

  it("resolves sonnet-only provider with correct category fallbacks", () => {
    expect(resolveProviderAutofillValues(PRESETS, "custom:sonnet-only")).toEqual({
      resolvedBaseUrl: undefined,
      resolvedModel: "claude-sonnet-only",
      resolvedOpusModel: "claude-sonnet-only",
      resolvedSonnetModel: "claude-sonnet-only",
      resolvedHaikuModel: "claude-sonnet-only",
      resolvedSubagentModel: undefined,
      resolvedEffortLevel: undefined,
    });
  });

  it("resolves DeepSeek official subagent and effort env overrides from provider env", () => {
    expect(resolveProviderAutofillValues(PRESETS, "builtin:deepseek")).toEqual({
      resolvedBaseUrl: "https://api.deepseek.com/anthropic",
      resolvedModel: "deepseek-v4-pro[1m]",
      resolvedOpusModel: "deepseek-v4-pro[1m]",
      resolvedSonnetModel: "deepseek-v4-pro[1m]",
      resolvedHaikuModel: "deepseek-v4-flash",
      resolvedSubagentModel: "deepseek-v4-flash",
      resolvedEffortLevel: "max",
    });
  });

  it("returns empty autofill values when providerId is undefined", () => {
    expect(resolveProviderAutofillValues(PRESETS, undefined)).toEqual({});
  });

  it("applies provider autofill model env without touching auth or ANTHROPIC_BASE_URL (段 B: 地址由 provider 合并层提供)", () => {
    const seededSettings = {
      env: {
        ANTHROPIC_AUTH_TOKEN: "token",
        ANTHROPIC_BASE_URL: "https://manual.example.com",
        ANTHROPIC_MODEL: "manual-model",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "manual-opus",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "manual-sonnet",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "manual-haiku",
        CLAUDE_CODE_SUBAGENT_MODEL: "manual-subagent",
        CLAUDE_CODE_EFFORT_LEVEL: "manual-effort",
        OTHER_ENV: "keep-me",
      },
      permissions: {
        defaultMode: "plan",
      },
    };

    // 段 B：applyProviderAutofill 不再写 ANTHROPIC_BASE_URL 到 profile settings
    expect(applyProviderAutofill(seededSettings, PRESETS, "builtin:openrouter")).toEqual({
      env: {
        ANTHROPIC_AUTH_TOKEN: "token",
        // 地址保留原值（autofill 不覆盖 ANTHROPIC_BASE_URL）
        ANTHROPIC_BASE_URL: "https://manual.example.com",
        ANTHROPIC_MODEL: "claude-sonnet-4-6",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-1",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-6",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5",
        // CLAUDE_CODE_SUBAGENT_MODEL cleared (no override)
        OTHER_ENV: "keep-me",
      },
      permissions: {
        defaultMode: "plan",
      },
    });

    // 无 provider 时清空所有 autofill 项
    expect(applyProviderAutofill(seededSettings, PRESETS, undefined)).toEqual({
      env: {
        ANTHROPIC_AUTH_TOKEN: "token",
        ANTHROPIC_BASE_URL: "https://manual.example.com",
        OTHER_ENV: "keep-me",
      },
      permissions: {
        defaultMode: "plan",
      },
    });
  });

  it("applies DeepSeek official env defaults without touching auth or unrelated values", () => {
    const seededSettings = {
      env: {
        ANTHROPIC_AUTH_TOKEN: "token",
        ANTHROPIC_BASE_URL: "https://manual.example.com",
        OTHER_ENV: "keep-me",
      },
    };

    // 段 B：applyProviderAutofill 不写 ANTHROPIC_BASE_URL
    expect(applyProviderAutofill(seededSettings, PRESETS, "builtin:deepseek")).toEqual({
      env: {
        ANTHROPIC_AUTH_TOKEN: "token",
        ANTHROPIC_BASE_URL: "https://manual.example.com",
        ANTHROPIC_MODEL: "deepseek-v4-pro[1m]",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-pro[1m]",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-v4-pro[1m]",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-v4-flash",
        CLAUDE_CODE_SUBAGENT_MODEL: "deepseek-v4-flash",
        CLAUDE_CODE_EFFORT_LEVEL: "max",
        OTHER_ENV: "keep-me",
      },
    });
  });
});
