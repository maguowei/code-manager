import { describe, expect, it } from "vitest";
import type { Provider } from "../../types";
import {
  applyProviderAutofill,
  getEnabledPluginsSummary,
  resolveProviderAutofillValues,
} from "../config-workspace-utils";

/** 段 B：Provider 默认模型完全来自 env 显式声明，不再按模型 category 隐式推断 */
const PRESETS: Provider[] = [
  {
    id: "builtin:openrouter",
    name: "OpenRouter",
    description: "OpenRouter 供应商",
    localizedName: {
      zh: "开放路由",
      en: "OpenRouter",
    },
    models: [{ id: "claude-opus-4-1" }, { id: "claude-sonnet-4-6" }, { id: "claude-haiku-4-5" }],
    modelSuggestions: ["claude-sonnet-4-6", "claude-opus-4-1"],
    env: {
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
    },
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
  },
  {
    id: "custom:models-no-env",
    name: "Models Without Env",
    description: "仅有 models 但无 env 默认的供应商",
    localizedName: {
      zh: "无 env 模型",
      en: "Models Without Env",
    },
    models: [{ id: "claude-sonnet-only" }],
    modelSuggestions: [],
    env: {},
  },
  {
    id: "builtin:deepseek",
    name: "DeepSeek",
    description: "DeepSeek 供应商",
    localizedName: {
      zh: "DeepSeek",
      en: "DeepSeek",
    },
    models: [{ id: "deepseek-v4-pro[1m]" }, { id: "deepseek-v4-flash" }],
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

  it("ignores provider models without explicit env (no implicit category matching)", () => {
    // openrouter 有 models 列表但 env 未声明默认模型：模型字段一律为空，不再隐式推断
    expect(resolveProviderAutofillValues(PRESETS, "builtin:openrouter")).toEqual({
      resolvedBaseUrl: "https://openrouter.ai/api",
      resolvedModel: undefined,
      resolvedOpusModel: undefined,
      resolvedSonnetModel: undefined,
      resolvedHaikuModel: undefined,
      resolvedSubagentModel: undefined,
      resolvedEffortLevel: undefined,
    });
  });

  it("reads explicit env model overrides without falling back across levels", () => {
    expect(resolveProviderAutofillValues(PRESETS, "custom:env-model")).toEqual({
      resolvedBaseUrl: "https://custom.api.com",
      resolvedModel: "claude-env-override",
      resolvedOpusModel: undefined,
      resolvedSonnetModel: undefined, // 不再回退到 resolvedModel
      resolvedHaikuModel: "haiku-env-override",
      resolvedSubagentModel: "subagent-env-override",
      resolvedEffortLevel: undefined,
    });
  });

  it("does not fall back to model suggestions when env is empty", () => {
    expect(resolveProviderAutofillValues(PRESETS, "custom:suggestions-only")).toEqual({
      resolvedBaseUrl: undefined,
      resolvedModel: undefined,
      resolvedOpusModel: undefined,
      resolvedSonnetModel: undefined,
      resolvedHaikuModel: undefined,
      resolvedSubagentModel: undefined,
      resolvedEffortLevel: undefined,
    });
  });

  it("ignores models catalog when env declares no defaults", () => {
    expect(resolveProviderAutofillValues(PRESETS, "custom:models-no-env")).toEqual({
      resolvedBaseUrl: undefined,
      resolvedModel: undefined,
      resolvedOpusModel: undefined,
      resolvedSonnetModel: undefined,
      resolvedHaikuModel: undefined,
      resolvedSubagentModel: undefined,
      resolvedEffortLevel: undefined,
    });
  });

  it("resolves DeepSeek official model/subagent/effort env defaults from provider env", () => {
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

  it("keeps user model overrides untouched and only clears base url when switching to a resolvable provider", () => {
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

    // 覆盖层只存差异:不再覆盖用户已填的模型/effort,仅清掉残留地址(Provider 是地址单一事实源)
    expect(applyProviderAutofill(seededSettings, PRESETS, "builtin:deepseek")).toEqual({
      env: {
        ANTHROPIC_AUTH_TOKEN: "token",
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
    });

    // 无可解析 provider 时不动任何字段(含地址)
    expect(applyProviderAutofill(seededSettings, PRESETS, undefined)).toEqual(seededSettings);
  });
});
