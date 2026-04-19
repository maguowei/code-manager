import { isPlainObject } from "../config-workspace-utils";

let rowCounter = 0;

export function createRowId(prefix = "row"): string {
  rowCounter += 1;
  return `${prefix}-${rowCounter}`;
}

export interface StringRow {
  id: string;
  value: string;
}

export interface KeyValueRow {
  id: string;
  key: string;
  value: string;
}

export type HookCommandType = "command" | "prompt" | "agent" | "http";

export interface HookCommandDraft {
  id: string;
  type: HookCommandType;
  command: string;
  prompt: string;
  url: string;
  model: string;
  timeout: string;
  async: boolean;
  statusMessage: string;
  headers: KeyValueRow[];
  allowedEnvVars: StringRow[];
}

export interface HookMatcherDraft {
  id: string;
  matcher: string;
  hooks: HookCommandDraft[];
}

export interface HookEventDraft {
  id: string;
  event: string;
  matchers: HookMatcherDraft[];
}

export interface PluginDraft {
  id: string;
  pluginId: string;
  enabled: boolean;
}

export type MarketplaceSourceType =
  | "url"
  | "hostPattern"
  | "github"
  | "git"
  | "npm"
  | "file"
  | "directory";

export interface MarketplaceDraft {
  id: string;
  marketplaceId: string;
  sourceType: MarketplaceSourceType;
  url: string;
  hostPattern: string;
  repo: string;
  ref: string;
  path: string;
  packageName: string;
  installLocation: string;
}

export const HOOK_EVENT_OPTIONS = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "Notification",
  "UserPromptSubmit",
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "Elicitation",
  "ElicitationResult",
  "TeammateIdle",
  "TaskCompleted",
  "Setup",
  "InstructionsLoaded",
  "CwdChanged",
  "FileChanged",
  "ConfigChange",
  "WorktreeCreate",
  "WorktreeRemove",
  "SessionStart",
  "SessionEnd",
] as const;

export const PERMISSION_MODE_OPTIONS = [
  "default",
  "acceptEdits",
  "plan",
  "dontAsk",
  "bypassPermissions",
  "delegate",
  "auto",
] as const;

export type PermissionModeOption = (typeof PERMISSION_MODE_OPTIONS)[number];

export const USER_VISIBLE_PERMISSION_MODE_OPTIONS = PERMISSION_MODE_OPTIONS.filter(
  (mode): mode is Exclude<PermissionModeOption, "delegate"> => mode !== "delegate",
);

export function readObject(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

export function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function readBoolean(value: unknown): boolean {
  return value === true;
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function rowsFromStringArray(values: string[]): StringRow[] {
  return values.map((value) => ({
    id: createRowId("string"),
    value,
  }));
}

export function stringArrayFromRows(rows: StringRow[]): string[] {
  return rows.map((row) => row.value.trim()).filter(Boolean);
}

export function keyValueRowsFromRecord(record: Record<string, unknown>): KeyValueRow[] {
  return Object.entries(record)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => ({
      id: createRowId("kv"),
      key,
      value: value as string,
    }));
}

export function recordFromKeyValueRows(rows: KeyValueRow[]): Record<string, string> {
  return rows.reduce<Record<string, string>>((accumulator, row) => {
    accumulator[row.key.trim()] = row.value;
    return accumulator;
  }, {});
}

export function looksSensitiveKey(key: string): boolean {
  return /(key|token|secret|password|auth)/i.test(key);
}

export function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function buildStringListError(
  rows: StringRow[],
  label: string,
  isZh: boolean,
  options?: { unique?: boolean },
): string {
  const values = rows.map((row) => row.value.trim());
  if (values.some((value) => !value)) {
    return isZh ? `${label} 不能为空` : `${label} cannot be empty`;
  }

  if (options?.unique) {
    const uniqueValues = new Set(values);
    if (uniqueValues.size !== values.length) {
      return isZh ? `${label} 不能重复` : `${label} must be unique`;
    }
  }

  return "";
}

export function buildKeyValueError(rows: KeyValueRow[], label: string, isZh: boolean): string {
  const keys = rows.map((row) => row.key.trim());
  if (keys.some((key) => !key)) {
    return isZh ? `${label} Key 不能为空` : `${label} key cannot be empty`;
  }

  const uniqueKeys = new Set(keys);
  if (uniqueKeys.size !== keys.length) {
    return isZh ? `${label} Key 不能重复` : `${label} keys must be unique`;
  }

  return "";
}

export function buildHookActionDraft(): HookCommandDraft {
  return {
    id: createRowId("hook-action"),
    type: "command",
    command: "",
    prompt: "",
    url: "",
    model: "",
    timeout: "",
    async: false,
    statusMessage: "",
    headers: [],
    allowedEnvVars: [],
  };
}

export function buildHookMatcherDraft(): HookMatcherDraft {
  return {
    id: createRowId("hook-matcher"),
    matcher: "",
    hooks: [buildHookActionDraft()],
  };
}

export function buildHookEventDraft(): HookEventDraft {
  return {
    id: createRowId("hook-event"),
    event: "",
    matchers: [buildHookMatcherDraft()],
  };
}

export function compactRecord<T extends Record<string, unknown>>(
  value: T,
): Record<string, unknown> {
  return Object.entries(value).reduce<Record<string, unknown>>((accumulator, [key, entry]) => {
    if (entry === undefined || entry === null || entry === "") {
      return accumulator;
    }
    if (Array.isArray(entry) && entry.length === 0) {
      return accumulator;
    }
    if (isPlainObject(entry) && Object.keys(entry).length === 0) {
      return accumulator;
    }
    accumulator[key] = entry;
    return accumulator;
  }, {});
}
