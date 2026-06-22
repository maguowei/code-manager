import { commands } from "./bindings";
import type { HistoryResult } from "./history-utils";
import type * as AppTypes from "./types";

export type IpcCommandResult<T, E = unknown> =
  | { status: "ok"; data: T }
  | { status: "error"; error: E };

type AwaitedCommandResult<T> = T extends Promise<infer Value> ? Value : T;

type IpcCommandOkResult<T> = Extract<T, { status: "ok"; data: unknown }>;

type UnwrapGeneratedResult<T> = [IpcCommandOkResult<T>] extends [never]
  ? T
  : IpcCommandOkResult<T>["data"];

type WrappedCommand<T> = T extends (...args: infer Args) => infer Result
  ? (...args: Args) => Promise<UnwrapGeneratedResult<AwaitedCommandResult<Result>>>
  : never;

type IpcCommands = {
  [Name in keyof typeof commands]: WrappedCommand<(typeof commands)[Name]>;
};

type ProfileInput = {
  id?: string | null;
  name: string;
  description: string;
  providerId?: string | null;
  settings: Record<string, unknown>;
};

type ModelTestInput = ProfileInput & {
  promptText?: string | null;
};

type MemoryData = {
  id?: string | null;
  name: string;
  content: string;
  targetType: AppTypes.MemoryTargetType;
  rulePath?: string | null;
  pathPatterns?: string[];
};

type SkillData = {
  id?: string | null;
  name: string;
  description: string;
  content: string;
  disableModelInvocation: boolean;
  userInvocable: boolean;
};

type LogQuery = {
  level?: AppTypes.LogLevel | null;
  search?: string | null;
  limit?: number | null;
};

type StatusLinePresetInstallResult = {
  presetId: string;
  targetPath: string;
  commandPath: string;
  installed: boolean;
  needsOverwrite: boolean;
};

type CompatibleIpcOverrides = {
  addMemory(data: MemoryData): Promise<AppTypes.MemoryState>;
  addSkill(data: SkillData): Promise<AppTypes.Skill>;
  applyMemoryPreset(
    data: AppTypes.MemoryPresetApplyInput,
  ): Promise<AppTypes.MemoryPresetApplyResult>;
  applyProfile(id: string): Promise<null>;
  cleanupProjectBranches(
    project: string,
    branches: string[],
  ): Promise<AppTypes.ProjectGitCleanupResult>;
  cleanupProjectWorktrees(
    project: string,
    worktrees: string[],
  ): Promise<AppTypes.ProjectGitCleanupResult>;
  clearAppLogs(): Promise<AppTypes.LogView>;
  createClaudeDirectoryEntry(
    parentPath: string | null,
    name: string,
    kind: AppTypes.ClaudeDirectoryEntryKind,
  ): Promise<null>;
  createProjectAgentsSkillsSymlink(project: string): Promise<null>;
  createProjectAgentsSymlink(project: string): Promise<null>;
  createProjectClaudeSettingsFile(
    project: string,
    scope: AppTypes.ProjectClaudeSettingsScope,
  ): Promise<null>;
  deleteClaudeDirectoryEntry(path: string): Promise<null>;
  deleteMemory(id: string): Promise<AppTypes.MemoryState>;
  deleteProfile(id: string): Promise<null>;
  deleteSkill(id: string, isActive: boolean): Promise<null>;
  duplicateMemory(id: string, nameSuffix: string): Promise<AppTypes.MemoryState>;
  duplicateProfile(id: string, nameSuffix: string): Promise<AppTypes.ConfigProfile>;
  duplicateSkill(id: string, isActive: boolean, nameSuffix: string): Promise<AppTypes.Skill>;
  getAppLogs(query: LogQuery | null): Promise<AppTypes.LogView>;
  getClaudeDirectoryOverview(): Promise<AppTypes.ClaudeDirectoryOverview>;
  getConfigWorkspace(): Promise<AppTypes.ConfigWorkspace>;
  getHistory(): Promise<HistoryResult>;
  getHistoryIfChanged(lastMtime: number): Promise<HistoryResult | null>;
  getMemories(): Promise<AppTypes.MemoryState>;
  getMemoryPresetContent(
    data: AppTypes.MemoryPresetContentInput,
  ): Promise<AppTypes.MemoryPresetContentResult>;
  getNativeOpenAppOptions(): Promise<AppTypes.NativeOpenAppOptions>;
  getProjectClaudeDirectoryOverview(project: string): Promise<AppTypes.ClaudeDirectoryOverview>;
  getProjectClaudeFilePreview(
    project: string,
    relativePath: string,
  ): Promise<AppTypes.ClaudeFilePreview>;
  getProjectDetail(project: string): Promise<AppTypes.ProjectDetail>;
  getSessionDetail(project: string, sessionId: string): Promise<AppTypes.SessionDetail>;
  getSessionUsageDetail(sessionId: string): Promise<AppTypes.SessionUsageDetail>;
  getSkillFileTree(id: string, isActive: boolean): Promise<AppTypes.SkillFileTreeEntry[]>;
  getSkills(): Promise<AppTypes.Skill[]>;
  getStats(): Promise<AppTypes.ClaudeStats>;
  getUsageSnapshot(
    filter: AppTypes.UsageFilter,
    granularity: AppTypes.UsageTimeGranularity,
  ): Promise<AppTypes.UsageSnapshot>;
  importMemoriesFromDirectory(sourceDir: string): Promise<AppTypes.MemoryDirectoryImportResult>;
  importProfileFromFile(
    sourcePath: string,
    name: string,
    description: string,
  ): Promise<AppTypes.ConfigProfile>;
  importSkillsFromDirectory(sourceDir: string): Promise<AppTypes.SkillDirectoryImportResult>;
  importUnmanagedMemory(source: {
    targetType: AppTypes.MemoryTargetType;
    rulePath?: string | null;
  }): Promise<AppTypes.MemoryState>;
  importUserSettingsProfile(data: {
    name: string;
    description: string;
  }): Promise<AppTypes.ConfigProfile>;
  installStatusLinePreset(
    presetId: string,
    overwrite: boolean,
  ): Promise<StatusLinePresetInstallResult>;
  openClaudeFileInEditor(path: string): Promise<null>;
  openClaudeJsonInEditor(): Promise<null>;
  openLogsDir(): Promise<null>;
  openProjectClaudeFileInEditor(project: string, relativePath: string): Promise<null>;
  openProjectInEditor(project: string): Promise<null>;
  openProjectInTerminal(project: string): Promise<null>;
  openSessionFileInEditor(project: string, sessionId: string): Promise<null>;
  openSessionPlanInEditor(project: string, sessionId: string): Promise<null>;
  openSkillInEditor(id: string, isActive: boolean): Promise<null>;
  previewDeleteMemory(id: string): Promise<AppTypes.MemoryDeletePreview>;
  previewProfile(data: ProfileInput): Promise<string>;
  previewProjectBranchCleanup(project: string): Promise<AppTypes.ProjectGitCleanupPreview>;
  previewProjectLocalDataPurge(project: string): Promise<AppTypes.ProjectPurgeOutput>;
  previewProjectWorktreeCleanup(project: string): Promise<AppTypes.ProjectGitCleanupPreview>;
  purgeProjectLocalData(project: string): Promise<AppTypes.ProjectPurgeOutput>;
  readClaudeFilePreview(path: string): Promise<AppTypes.ClaudeFilePreview>;
  readSessionPlan(project: string, sessionId: string): Promise<AppTypes.SessionPlan>;
  refreshUsagePricing(): Promise<AppTypes.PricingTable>;
  renameClaudeDirectoryEntry(path: string, newName: string): Promise<null>;
  reorderProfiles(ids: string[]): Promise<null>;
  rescanUsage(): Promise<AppTypes.UsageScanResult>;
  setAppPreferences(data: AppTypes.AppPreferences): Promise<AppTypes.AppPreferences>;
  syncSharedProfileSettings(
    sourceId: string,
    topLevelKeys: string[],
    envKeys: string[],
  ): Promise<number>;
  syncSkillToCodex(id: string, isActive: boolean): Promise<null>;
  testProfileModel(data: ModelTestInput): Promise<AppTypes.ModelTestResult>;
  toggleMemory(id: string): Promise<AppTypes.MemoryState>;
  toggleSkill(id: string, isActive: boolean): Promise<AppTypes.Skill>;
  updateMemory(id: string, data: MemoryData): Promise<AppTypes.MemoryState>;
  updateSkill(id: string, isActive: boolean, data: SkillData): Promise<AppTypes.Skill>;
  upsertProfile(data: ProfileInput): Promise<AppTypes.ConfigProfile>;
};

type CompatibleIpc = Omit<IpcCommands, keyof CompatibleIpcOverrides> & CompatibleIpcOverrides;

function isIpcCommandResult(value: unknown): value is IpcCommandResult<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    ((value as { status?: unknown }).status === "ok" ||
      (value as { status?: unknown }).status === "error")
  );
}

export async function unwrapIpcResult<T, E>(result: Promise<IpcCommandResult<T, E>>): Promise<T> {
  const next = await result;

  if (next.status === "ok") {
    return next.data;
  }

  throw next.error;
}

async function unwrapCommandValue<T>(result: Promise<T>): Promise<UnwrapGeneratedResult<T>> {
  const next = await result;

  if (!isIpcCommandResult(next)) {
    return next as UnwrapGeneratedResult<T>;
  }

  if (next.status === "ok") {
    return next.data as UnwrapGeneratedResult<T>;
  }

  throw next.error;
}

function wrapCommand<T extends (...args: never[]) => Promise<unknown>>(
  command: T,
): WrappedCommand<T> {
  return ((...args: Parameters<T>) => unwrapCommandValue(command(...args))) as WrappedCommand<T>;
}

const generatedIpc = Object.fromEntries(
  Object.entries(commands).map(([name, command]) => [
    name,
    wrapCommand(command as (...args: never[]) => Promise<unknown>),
  ]),
) as IpcCommands;

export const ipc = generatedIpc as unknown as CompatibleIpc;
