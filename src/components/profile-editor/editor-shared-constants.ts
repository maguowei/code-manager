import {
  cloneSettings,
  readTopLevelObject,
  setEnvString,
  setTopLevelBoolean,
} from "../config-workspace-utils";
import type { SectionEditorMode } from "./SettingsSectionModePanel";
import { PROFILE_SETTINGS_FORM_REGISTRY } from "./settings-form-registry";

export const AUTH_ENV_KEYS = ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"] as const;

export const PURE_SETTINGS_SECTION_KEYS = [
  "behavior",
  "common",
  "env",
  "permissions",
  "sandbox",
  "hooks",
  "marketplaces",
  "plugins",
  "statusLine",
] as const;

export const LOW_FREQUENCY_SECTION_ORDER = [
  "permissions",
  "sandbox",
  "hooks",
  "marketplaces",
  "plugins",
  "statusLine",
] as const;

export const BEHAVIOR_ENV_DEFAULTS = PROFILE_SETTINGS_FORM_REGISTRY.flatMap((field) =>
  field.storage === "env-only" && field.envKey && field.defaultValue
    ? [{ envKey: field.envKey, defaultValue: field.defaultValue }]
    : [],
);

const LEGACY_CO_AUTHORED_BY_KEY = "includeCoAuthoredBy";

export function readAttributionDisabled(settings: Record<string, unknown>): boolean {
  const attribution = readTopLevelObject(settings, "attribution");
  const hasCommit = typeof attribution.commit === "string";
  const hasPr = typeof attribution.pr === "string";

  if (hasCommit || hasPr) {
    return attribution.commit === "" && attribution.pr === "";
  }

  return settings[LEGACY_CO_AUTHORED_BY_KEY] === false;
}

export function setAttributionDisabled(
  settings: Record<string, unknown>,
  disabled: boolean,
): Record<string, unknown> {
  const next = cloneSettings(settings);
  delete next[LEGACY_CO_AUTHORED_BY_KEY];

  if (disabled) {
    next.attribution = {
      commit: "",
      pr: "",
    };
    return next;
  }

  const attribution = readTopLevelObject(next, "attribution");
  const hasCommit = typeof attribution.commit === "string";
  const hasPr = typeof attribution.pr === "string";

  if ((hasCommit || hasPr) && attribution.commit === "" && attribution.pr === "") {
    delete next.attribution;
  }

  return next;
}

export function applyCommonToggleDefaults(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  return PROFILE_SETTINGS_FORM_REGISTRY.reduce<Record<string, unknown>>((current, field) => {
    if (field.section !== "common" || field.kind !== "checkbox" || !field.defaultEnabled) {
      return current;
    }

    if (field.envKey) {
      const env = readTopLevelObject(current, "env");
      if (field.envKey in env) {
        return current;
      }

      return setEnvString(current, field.envKey, field.enabledValue ?? "1");
    }

    if (field.key in current) {
      return current;
    }

    return setTopLevelBoolean(current, field.key, true);
  }, settings);
}

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
    common: "controls",
    env: "controls",
    permissions: "controls",
    sandbox: "controls",
    hooks: "controls",
    marketplaces: "controls",
    plugins: "controls",
    statusLine: "controls",
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
