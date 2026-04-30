import { describe, expect, it } from "vitest";
import type { SettingsPreset } from "../../types";
import {
  applyPresetAutofill,
  getEnabledPluginsSummary,
  resolvePresetAutofillValues,
} from "../config-workspace-utils";

const PRESETS: SettingsPreset[] = [
  {
    id: "builtin:openrouter",
    name: "OpenRouter",
    description: "OpenRouter 预设",
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
    description: "团队计划预设",
    localizedName: {
      zh: "团队计划",
      en: "Team Plan",
    },
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
    description: "显式模型预设",
    localizedName: {
      zh: "显式模型",
      en: "Explicit Model",
    },
    basePresetId: "custom:team-plan",
    modelSuggestions: ["claude-sonnet-4-6"],
    settingsPatch: {
      model: "claude-opus-explicit",
    },
    source: "custom",
  },
  {
    id: "custom:env-model",
    name: "Env Model",
    description: "环境变量模型预设",
    localizedName: {
      zh: "环境变量模型",
      en: "Env Model",
    },
    basePresetId: "custom:explicit-model",
    modelSuggestions: ["claude-sonnet-4-6"],
    settingsPatch: {
      env: {
        ANTHROPIC_MODEL: "claude-env-override",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "haiku-env-override",
        CLAUDE_CODE_SUBAGENT_MODEL: "subagent-env-override",
      },
    },
    source: "custom",
  },
  {
    id: "custom:suggestions-only",
    name: "Suggestions Only",
    description: "仅建议模型预设",
    localizedName: {
      zh: "仅建议模型",
      en: "Suggestions Only",
    },
    modelSuggestions: ["claude-suggestion-only"],
    settingsPatch: {},
    source: "custom",
  },
  {
    id: "custom:sonnet-only",
    name: "Sonnet Only",
    description: "仅 Sonnet 分类模型预设",
    localizedName: {
      zh: "仅 Sonnet",
      en: "Sonnet Only",
    },
    models: [{ id: "claude-sonnet-only", category: "sonnet" }],
    modelSuggestions: [],
    settingsPatch: {},
    source: "custom",
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

  it("resolves categorized models across the inheritance chain with explicit overrides", () => {
    expect(resolvePresetAutofillValues(PRESETS, "builtin:openrouter")).toEqual({
      resolvedBaseUrl: "https://openrouter.ai/api",
      resolvedModel: "claude-sonnet-4-6",
      resolvedOpusModel: "claude-opus-4-1",
      resolvedSonnetModel: "claude-sonnet-4-6",
      resolvedHaikuModel: "claude-haiku-4-5",
      resolvedSubagentModel: undefined,
    });

    expect(resolvePresetAutofillValues(PRESETS, "custom:team-plan")).toEqual({
      resolvedBaseUrl: "https://openrouter.ai/api",
      resolvedModel: "claude-sonnet-4-6",
      resolvedOpusModel: "claude-opus-4-1",
      resolvedSonnetModel: "claude-sonnet-4-6",
      resolvedHaikuModel: "claude-haiku-4-5",
      resolvedSubagentModel: undefined,
    });

    expect(resolvePresetAutofillValues(PRESETS, "custom:explicit-model")).toEqual({
      resolvedBaseUrl: "https://openrouter.ai/api",
      resolvedModel: "claude-opus-explicit",
      resolvedOpusModel: "claude-opus-4-1",
      resolvedSonnetModel: "claude-sonnet-4-6",
      resolvedHaikuModel: "claude-haiku-4-5",
      resolvedSubagentModel: undefined,
    });

    expect(resolvePresetAutofillValues(PRESETS, "custom:env-model")).toEqual({
      resolvedBaseUrl: "https://openrouter.ai/api",
      resolvedModel: "claude-env-override",
      resolvedOpusModel: "claude-opus-4-1",
      resolvedSonnetModel: "claude-sonnet-4-6",
      resolvedHaikuModel: "haiku-env-override",
      resolvedSubagentModel: undefined,
    });

    expect(resolvePresetAutofillValues(PRESETS, "custom:sonnet-only")).toEqual({
      resolvedBaseUrl: undefined,
      resolvedModel: "claude-sonnet-only",
      resolvedOpusModel: "claude-sonnet-only",
      resolvedSonnetModel: "claude-sonnet-only",
      resolvedHaikuModel: "claude-sonnet-only",
      resolvedSubagentModel: undefined,
    });
  });

  it("falls back to model suggestions only after explicit values and categorized models are exhausted", () => {
    expect(resolvePresetAutofillValues(PRESETS, "custom:suggestions-only")).toEqual({
      resolvedBaseUrl: undefined,
      resolvedModel: "claude-suggestion-only",
      resolvedOpusModel: undefined,
      resolvedSonnetModel: "claude-suggestion-only",
      resolvedHaikuModel: "claude-suggestion-only",
      resolvedSubagentModel: undefined,
    });
  });

  it("applies and clears the full preset autofill env set without touching auth or unrelated values", () => {
    const seededSettings = {
      env: {
        ANTHROPIC_AUTH_TOKEN: "token",
        ANTHROPIC_BASE_URL: "https://manual.example.com",
        ANTHROPIC_MODEL: "manual-model",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "manual-opus",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "manual-sonnet",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "manual-haiku",
        CLAUDE_CODE_SUBAGENT_MODEL: "manual-subagent",
        OTHER_ENV: "keep-me",
      },
      permissions: {
        defaultMode: "plan",
      },
    };

    expect(applyPresetAutofill(seededSettings, PRESETS, "custom:team-plan")).toEqual({
      env: {
        ANTHROPIC_AUTH_TOKEN: "token",
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        ANTHROPIC_MODEL: "claude-sonnet-4-6",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-1",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-6",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5",
        OTHER_ENV: "keep-me",
      },
      permissions: {
        defaultMode: "plan",
      },
    });

    expect(applyPresetAutofill(seededSettings, PRESETS, undefined)).toEqual({
      env: {
        ANTHROPIC_AUTH_TOKEN: "token",
        OTHER_ENV: "keep-me",
      },
      permissions: {
        defaultMode: "plan",
      },
    });
  });
});
