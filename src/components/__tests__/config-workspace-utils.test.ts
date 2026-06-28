import { describe, expect, it } from "vitest";
import type { Provider } from "../../types";
import {
  applyEnvDefaults,
  applyProviderAutofill,
  getEnabledPluginsSummary,
  prettyJson,
  providerDisplayName,
  providerNameById,
  providerSlugFromId,
  readEnvString,
  readMappedString,
  readScopedSettingsWithEnv,
  replaceScopedSettingsWithEnv,
  resolveProviderAutofillValues,
  setEnvString,
  setMappedString,
  setTopLevelBoolean,
  setTopLevelObject,
  setTopLevelString,
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

describe("config-workspace-utils settings mutators", () => {
  it("serializes nullish values to an empty object literal", () => {
    expect(prettyJson(undefined)).toBe("{}");
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it("sets or deletes a top-level string based on trimmed value", () => {
    expect(setTopLevelString({}, "name", "  hi  ")).toEqual({ name: "hi" });
    expect(setTopLevelString({ name: "old" }, "name", "   ")).toEqual({});
  });

  it("sets a top-level boolean only when enabled, deleting otherwise", () => {
    expect(setTopLevelBoolean({}, "flag", true)).toEqual({ flag: true });
    expect(setTopLevelBoolean({ flag: true }, "flag", false)).toEqual({});
  });

  it("stores a top-level object only when it has keys", () => {
    expect(setTopLevelObject({}, "env", { A: "1" })).toEqual({ env: { A: "1" } });
    expect(setTopLevelObject({ env: { A: "1" } }, "env", {})).toEqual({});
  });

  it("reads a string mapped to env first, then top-level, then empty", () => {
    expect(readMappedString({ env: { TOKEN: "from-env" } }, "token", "TOKEN")).toEqual({
      mappedToEnv: true,
      value: "from-env",
    });
    expect(readMappedString({ token: "from-top" }, "token", "TOKEN")).toEqual({
      mappedToEnv: false,
      value: "from-top",
    });
    expect(readMappedString({}, "token", "TOKEN")).toEqual({ mappedToEnv: false, value: "" });
    expect(readEnvString({ env: { TOKEN: "x" } }, "TOKEN")).toBe("x");
    expect(readEnvString({}, "TOKEN")).toBe("");
  });

  it("moves a mapped string between env and top-level and prunes empty env", () => {
    // 映射到 env：删除顶层键，写入 env
    expect(setMappedString({ token: "old" }, "token", "TOKEN", "v", true)).toEqual({
      env: { TOKEN: "v" },
    });
    // 映射到 env 但值为空：env 被清空后整体删除
    expect(setMappedString({ env: { TOKEN: "x" } }, "token", "TOKEN", "  ", true)).toEqual({});
    // 不映射：写入顶层键并删除 env 内残留
    expect(setMappedString({ env: { TOKEN: "x" } }, "token", "TOKEN", "v", false)).toEqual({
      token: "v",
    });
    // 不映射且值为空：删除顶层键
    expect(setMappedString({ token: "old" }, "token", "TOKEN", "", false)).toEqual({});
  });

  it("sets or removes an env string and prunes empty env", () => {
    expect(setEnvString({}, "TOKEN", "v")).toEqual({ env: { TOKEN: "v" } });
    expect(setEnvString({ env: { TOKEN: "x" } }, "TOKEN", "  ")).toEqual({});
  });

  it("applies env defaults only for missing keys", () => {
    expect(
      applyEnvDefaults({ env: { A: "kept" } }, [
        { envKey: "A", defaultValue: "ignored" },
        { envKey: "B", defaultValue: "added" },
      ]),
    ).toEqual({ env: { A: "kept", B: "added" } });
  });

  it("reads and replaces scoped settings together with their env keys", () => {
    const source = {
      permissions: { defaultMode: "plan" },
      hooks: { PreToolUse: [] },
      env: { SCOPED: "1", OTHER: "2" },
    };
    expect(readScopedSettingsWithEnv(source, ["permissions"], ["SCOPED"])).toEqual({
      permissions: { defaultMode: "plan" },
      env: { SCOPED: "1" },
    });

    // 替换：清掉旧 scoped/env 键，写入新值，env 清空后整体删除
    expect(
      replaceScopedSettingsWithEnv(
        { permissions: { defaultMode: "plan" }, env: { SCOPED: "1", KEEP: "2" } },
        ["permissions"],
        ["SCOPED"],
        { permissions: { defaultMode: "default" } },
      ),
    ).toEqual({ permissions: { defaultMode: "default" }, env: { KEEP: "2" } });

    expect(replaceScopedSettingsWithEnv({ env: { SCOPED: "1" } }, [], ["SCOPED"], {})).toEqual({});
  });

  it("derives a provider slug from the id segment after the colon", () => {
    expect(providerSlugFromId(undefined)).toBe("");
    expect(providerSlugFromId("  ")).toBe("");
    expect(providerSlugFromId("builtin:deepseek")).toBe("deepseek");
    expect(providerSlugFromId("plain")).toBe("plain");
  });

  it("resolves a provider display name by id with localized fallbacks", () => {
    expect(providerNameById(PRESETS, "builtin:deepseek", "zh")).toBe("DeepSeek");
    expect(providerNameById(PRESETS, "missing-id", "en")).toBe("missing-id");
    expect(providerNameById(PRESETS, undefined, "zh")).toBe("自定义");
    expect(providerNameById(PRESETS, undefined, "en")).toBe("Custom");
    expect(providerNameById(PRESETS, undefined, "zh", "未指定")).toBe("未指定");
  });

  it("picks the localized provider name per language", () => {
    const provider = PRESETS[0];
    expect(providerDisplayName(provider, "zh")).toBe("开放路由");
    expect(providerDisplayName(provider, "en")).toBe("OpenRouter");
  });

  it("ignores non-string and whitespace-only env values when resolving autofill", () => {
    const providers: Provider[] = [
      {
        id: "custom:dirty-env",
        name: "Dirty Env",
        description: "",
        localizedName: { zh: "脏 env", en: "Dirty Env" },
        modelSuggestions: [],
        env: {
          ANTHROPIC_MODEL: "   ",
          ANTHROPIC_BASE_URL: "https://ok.example.com",
        } as unknown as Record<string, string>,
      },
    ];
    expect(resolveProviderAutofillValues(providers, "custom:dirty-env")).toEqual({
      resolvedBaseUrl: "https://ok.example.com",
      resolvedModel: undefined,
      resolvedOpusModel: undefined,
      resolvedSonnetModel: undefined,
      resolvedHaikuModel: undefined,
      resolvedSubagentModel: undefined,
      resolvedEffortLevel: undefined,
    });
    // provider 不存在时返回空对象
    expect(resolveProviderAutofillValues(providers, "missing")).toEqual({});
  });

  it("treats a provider without an env field as having no autofill values", () => {
    const providers = [
      {
        id: "custom:no-env",
        name: "No Env",
        description: "",
        localizedName: { zh: "无 env", en: "No Env" },
        modelSuggestions: [],
      },
    ] as unknown as Provider[];
    expect(resolveProviderAutofillValues(providers, "custom:no-env")).toEqual({
      resolvedBaseUrl: undefined,
      resolvedModel: undefined,
      resolvedOpusModel: undefined,
      resolvedSonnetModel: undefined,
      resolvedHaikuModel: undefined,
      resolvedSubagentModel: undefined,
      resolvedEffortLevel: undefined,
    });
  });
});
