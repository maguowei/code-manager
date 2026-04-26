import type { LocalizedText, SettingsPreset } from "../types";

export function prettyJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cloneSettings(
  settings: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(settings ?? {})) as Record<string, unknown>;
}

export function setTopLevelString(
  settings: Record<string, unknown>,
  key: string,
  value: string,
): Record<string, unknown> {
  const next = cloneSettings(settings);
  const trimmed = value.trim();
  if (trimmed) {
    next[key] = trimmed;
  } else {
    delete next[key];
  }
  return next;
}

export function setTopLevelBoolean(
  settings: Record<string, unknown>,
  key: string,
  enabled: boolean,
): Record<string, unknown> {
  const next = cloneSettings(settings);
  if (enabled) {
    next[key] = true;
  } else {
    delete next[key];
  }
  return next;
}

export function setTopLevelObject(
  settings: Record<string, unknown>,
  key: string,
  value: Record<string, unknown>,
): Record<string, unknown> {
  const next = cloneSettings(settings);
  if (Object.keys(value).length === 0) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

export function readMappedString(
  settings: Record<string, unknown>,
  key: string,
  envKey: string,
): {
  mappedToEnv: boolean;
  value: string;
} {
  const env = readTopLevelObject(settings, "env");
  if (typeof env[envKey] === "string") {
    return {
      mappedToEnv: true,
      value: env[envKey] as string,
    };
  }

  return {
    mappedToEnv: false,
    value: typeof settings[key] === "string" ? (settings[key] as string) : "",
  };
}

export function readEnvString(settings: Record<string, unknown>, envKey: string): string {
  const env = readTopLevelObject(settings, "env");
  return typeof env[envKey] === "string" ? (env[envKey] as string) : "";
}

export function setMappedString(
  settings: Record<string, unknown>,
  key: string,
  envKey: string,
  value: string,
  mappedToEnv: boolean,
): Record<string, unknown> {
  const next = cloneSettings(settings);
  const trimmed = value.trim();
  const env = readTopLevelObject(next, "env");

  if (mappedToEnv) {
    delete next[key];
    if (trimmed) {
      env[envKey] = trimmed;
    } else {
      delete env[envKey];
    }
  } else {
    if (trimmed) {
      next[key] = trimmed;
    } else {
      delete next[key];
    }
    delete env[envKey];
  }

  if (Object.keys(env).length === 0) {
    delete next.env;
  } else {
    next.env = env;
  }

  return next;
}

export function setEnvString(
  settings: Record<string, unknown>,
  envKey: string,
  value: string,
): Record<string, unknown> {
  const next = cloneSettings(settings);
  const trimmed = value.trim();
  const env = readTopLevelObject(next, "env");

  if (trimmed) {
    env[envKey] = trimmed;
  } else {
    delete env[envKey];
  }

  if (Object.keys(env).length === 0) {
    delete next.env;
  } else {
    next.env = env;
  }

  return next;
}

export function applyEnvDefaults(
  settings: Record<string, unknown>,
  defaults: Array<{ envKey: string; defaultValue: string }>,
): Record<string, unknown> {
  return defaults.reduce((current, { envKey, defaultValue }) => {
    if (readEnvString(current, envKey)) {
      return current;
    }
    return setEnvString(current, envKey, defaultValue);
  }, settings);
}

export function readScopedSettings(
  settings: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  return keys.reduce<Record<string, unknown>>((accumulator, key) => {
    if (key in settings) {
      accumulator[key] = cloneSettings({ value: settings[key] }).value;
    }
    return accumulator;
  }, {});
}

export function replaceScopedSettings(
  settings: Record<string, unknown>,
  keys: string[],
  value: Record<string, unknown>,
): Record<string, unknown> {
  const next = cloneSettings(settings);
  for (const key of keys) {
    delete next[key];
  }
  for (const [key, entry] of Object.entries(value)) {
    if (keys.includes(key)) {
      next[key] = entry;
    }
  }
  return next;
}

export function readScopedSettingsWithEnv(
  settings: Record<string, unknown>,
  keys: string[],
  envKeys: string[],
): Record<string, unknown> {
  const next = readScopedSettings(settings, keys);
  const env = readTopLevelObject(settings, "env");
  const scopedEnv = envKeys.reduce<Record<string, unknown>>((accumulator, envKey) => {
    if (envKey in env) {
      accumulator[envKey] = cloneSettings({ value: env[envKey] }).value;
    }
    return accumulator;
  }, {});

  if (Object.keys(scopedEnv).length > 0) {
    next.env = scopedEnv;
  }

  return next;
}

export function replaceScopedSettingsWithEnv(
  settings: Record<string, unknown>,
  keys: string[],
  envKeys: string[],
  value: Record<string, unknown>,
): Record<string, unknown> {
  const next = replaceScopedSettings(settings, keys, value);
  const env = readTopLevelObject(next, "env");

  for (const envKey of envKeys) {
    delete env[envKey];
  }

  const nextEnvValue = isPlainObject(value.env) ? value.env : {};
  for (const envKey of envKeys) {
    if (envKey in nextEnvValue) {
      env[envKey] = cloneSettings({ value: nextEnvValue[envKey] }).value;
    }
  }

  if (Object.keys(env).length === 0) {
    delete next.env;
  } else {
    next.env = env;
  }

  return next;
}

export function readTopLevelObject(
  settings: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = settings[key];
  return isPlainObject(value) ? value : {};
}

export function getEnabledPluginsSummary(value: unknown): {
  enabledCount: number;
  totalCount: number;
} {
  const plugins = isPlainObject(value) ? value : {};
  const pluginValues = Object.values(plugins);
  return {
    enabledCount: pluginValues.filter(Boolean).length,
    totalCount: pluginValues.length,
  };
}

export function normalizeLocalizedText(
  value: LocalizedText | undefined,
  fallback: string,
): LocalizedText {
  const fallbackText = fallback.trim();
  const zh = value?.zh?.trim() || value?.en?.trim() || fallbackText;
  const en = value?.en?.trim() || value?.zh?.trim() || fallbackText;
  return { zh, en };
}

export function presetDisplayName(
  preset: Pick<SettingsPreset, "name" | "localizedName">,
  language: "zh" | "en",
): string {
  const localizedName = normalizeLocalizedText(preset.localizedName, preset.name);
  return language === "zh" ? localizedName.zh : localizedName.en;
}

export function presetSlugFromId(presetId: string | undefined): string {
  const trimmedId = presetId?.trim() ?? "";
  if (!trimmedId) {
    return "";
  }

  const separatorIndex = trimmedId.indexOf(":");
  return separatorIndex >= 0 ? trimmedId.slice(separatorIndex + 1).trim() : trimmedId;
}

export function presetNameById(
  presets: SettingsPreset[],
  presetId: string | undefined,
  language: "zh" | "en",
  noPresetLabel?: string,
): string {
  if (!presetId) {
    return noPresetLabel ?? (language === "zh" ? "无预设" : "No preset");
  }
  const preset = presets.find((item) => item.id === presetId);
  return preset ? presetDisplayName(preset, language) : presetId;
}

export interface PresetAutofillValues {
  resolvedBaseUrl?: string;
  resolvedModel?: string;
  resolvedOpusModel?: string;
  resolvedSonnetModel?: string;
  resolvedHaikuModel?: string;
  resolvedSubagentModel?: string;
}

export function resolvePresetAutofillValues(
  presets: SettingsPreset[],
  presetId: string | undefined,
): PresetAutofillValues {
  const chain = resolvePresetChain(presets, presetId, new Set<string>());
  const resolvedBaseUrl = resolveExplicitEnvValue(chain, "ANTHROPIC_BASE_URL");
  const explicitEnvModel = resolveExplicitEnvValue(chain, "ANTHROPIC_MODEL");
  const explicitTopLevelModel = resolveExplicitTopLevelModel(chain);
  const categoryOpusModel = resolveCategoryModel(chain, "opus");
  const categorySonnetModel = resolveCategoryModel(chain, "sonnet");
  const categoryHaikuModel = resolveCategoryModel(chain, "haiku");
  const categoryOtherModel = resolveCategoryModel(chain, "other");
  const firstPresetModel = resolveFirstPresetModel(chain);
  const suggestedModel = resolveSuggestedModel(chain);
  const resolvedModel =
    explicitEnvModel ||
    explicitTopLevelModel ||
    categorySonnetModel ||
    categoryOpusModel ||
    categoryHaikuModel ||
    categoryOtherModel ||
    firstPresetModel ||
    suggestedModel;

  return {
    resolvedBaseUrl,
    resolvedModel,
    resolvedOpusModel:
      resolveExplicitEnvValue(chain, "ANTHROPIC_DEFAULT_OPUS_MODEL") || categoryOpusModel,
    resolvedSonnetModel:
      resolveExplicitEnvValue(chain, "ANTHROPIC_DEFAULT_SONNET_MODEL") ||
      categorySonnetModel ||
      categoryOpusModel ||
      categoryOtherModel ||
      resolvedModel,
    resolvedHaikuModel:
      resolveExplicitEnvValue(chain, "ANTHROPIC_DEFAULT_HAIKU_MODEL") ||
      categoryHaikuModel ||
      categorySonnetModel ||
      categoryOpusModel ||
      categoryOtherModel ||
      resolvedModel,
    resolvedSubagentModel:
      resolveExplicitEnvValue(chain, "CLAUDE_CODE_SUBAGENT_MODEL") ||
      categorySonnetModel ||
      categoryOpusModel ||
      resolvedModel,
  };
}

function resolvePresetChain(
  presets: SettingsPreset[],
  presetId: string | undefined,
  visited: Set<string>,
): SettingsPreset[] {
  if (!presetId || visited.has(presetId)) {
    return [];
  }

  visited.add(presetId);
  const preset = presets.find((item) => item.id === presetId);
  if (!preset) {
    return [];
  }

  const inherited =
    preset.basePresetId && !visited.has(preset.basePresetId)
      ? resolvePresetChain(presets, preset.basePresetId, visited)
      : [];

  return [...inherited, preset];
}

function resolveExplicitEnvValue(chain: SettingsPreset[], envKey: string): string | undefined {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const patch = isPlainObject(chain[index]?.settingsPatch) ? chain[index].settingsPatch : {};
    const env = readTopLevelObject(patch, "env");
    const explicitValue = normalizePresetValue(env[envKey]);
    if (explicitValue) {
      return explicitValue;
    }
  }
  return undefined;
}

function resolveExplicitTopLevelModel(chain: SettingsPreset[]): string | undefined {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const patch = isPlainObject(chain[index]?.settingsPatch) ? chain[index].settingsPatch : {};
    const explicitValue = normalizePresetValue(patch.model);
    if (explicitValue) {
      return explicitValue;
    }
  }
  return undefined;
}

function resolveCategoryModel(
  chain: SettingsPreset[],
  category: "opus" | "sonnet" | "haiku" | "other",
): string | undefined {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    for (const model of chain[index]?.models ?? []) {
      if (model.category !== category) {
        continue;
      }
      const modelId = normalizePresetValue(model.id);
      if (modelId) {
        return modelId;
      }
    }
  }
  return undefined;
}

function resolveFirstPresetModel(chain: SettingsPreset[]): string | undefined {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    for (const model of chain[index]?.models ?? []) {
      const modelId = normalizePresetValue(model.id);
      if (modelId) {
        return modelId;
      }
    }
  }
  return undefined;
}

function resolveSuggestedModel(chain: SettingsPreset[]): string | undefined {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const suggestedModel = normalizePresetValue(chain[index]?.modelSuggestions?.[0]);
    if (suggestedModel) {
      return suggestedModel;
    }
  }
  return undefined;
}

function normalizePresetValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function applyPresetAutofill(
  settings: Record<string, unknown>,
  presets: SettingsPreset[],
  presetId: string | undefined,
): Record<string, unknown> {
  const resolved = resolvePresetAutofillValues(presets, presetId);
  const updates: Array<[string, string | undefined]> = [
    ["ANTHROPIC_BASE_URL", resolved.resolvedBaseUrl],
    ["ANTHROPIC_MODEL", resolved.resolvedModel],
    ["ANTHROPIC_DEFAULT_OPUS_MODEL", resolved.resolvedOpusModel],
    ["ANTHROPIC_DEFAULT_SONNET_MODEL", resolved.resolvedSonnetModel],
    ["ANTHROPIC_DEFAULT_HAIKU_MODEL", resolved.resolvedHaikuModel],
    ["CLAUDE_CODE_SUBAGENT_MODEL", resolved.resolvedSubagentModel],
  ];

  return updates.reduce(
    (current, [envKey, value]) => setEnvString(current, envKey, value ?? ""),
    settings,
  );
}
