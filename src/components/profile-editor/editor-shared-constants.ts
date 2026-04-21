import type { SectionEditorMode } from "./SettingsSectionModePanel";
import { PROFILE_SETTINGS_FORM_REGISTRY } from "./settings-form-registry";

export const AUTH_ENV_KEYS = ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"] as const;

export const PURE_SETTINGS_SECTION_KEYS = [
  "behavior",
  "env",
  "permissions",
  "sandbox",
  "hooks",
  "marketplaces",
  "plugins",
] as const;

export const LOW_FREQUENCY_SECTION_ORDER = [
  "permissions",
  "sandbox",
  "hooks",
  "marketplaces",
  "plugins",
] as const;

export const BEHAVIOR_ENV_DEFAULTS = PROFILE_SETTINGS_FORM_REGISTRY.flatMap((field) =>
  field.storage === "env-only" && field.envKey && field.defaultValue
    ? [{ envKey: field.envKey, defaultValue: field.defaultValue }]
    : [],
);

export type PureSettingsSectionKey = (typeof PURE_SETTINGS_SECTION_KEYS)[number];
export type LowFrequencySectionKey = (typeof LOW_FREQUENCY_SECTION_ORDER)[number];

export function chunkItems<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

export function createInitialSectionModes(): Record<PureSettingsSectionKey, SectionEditorMode> {
  return {
    behavior: "controls",
    env: "controls",
    permissions: "controls",
    sandbox: "controls",
    hooks: "controls",
    marketplaces: "controls",
    plugins: "controls",
  };
}

export function buildEnvSubset(
  env: Record<string, unknown>,
  hiddenKeys: readonly string[],
): Record<string, unknown> {
  const hiddenKeySet = new Set(hiddenKeys);
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !hiddenKeySet.has(key)),
  ) as Record<string, unknown>;
}

export function buildHiddenEnvEntries(
  env: Record<string, unknown>,
  hiddenKeys: readonly string[],
): Record<string, unknown> {
  const hiddenKeySet = new Set(hiddenKeys);
  return Object.fromEntries(Object.entries(env).filter(([key]) => hiddenKeySet.has(key))) as Record<
    string,
    unknown
  >;
}
