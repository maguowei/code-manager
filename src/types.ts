// 检测是否在 Tauri 环境中运行
export const isTauri = () =>
  typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;

// 侧边栏 Tab 类型
export type TabType =
  | "claudeOverview"
  | "configs"
  | "providers"
  | "memory"
  | "skills"
  | "projects"
  | "stats"
  | "usage"
  | "history";

export type DefaultTerminalApp = "terminal" | "iterm" | "warp" | "ghostty";

export type DefaultEditorApp = "vscode" | "cursor" | "windsurf" | "zed";

export type SessionTrayCountStyle = "plain" | "superscript" | "superscriptCompact";

export type NativeOpenPlatform = "macos" | "linux" | "windows" | "other";

export interface NativeEditorAppOption {
  slug: DefaultEditorApp;
  label: string;
}

export interface NativeTerminalAppOption {
  slug: DefaultTerminalApp;
  label: string;
}

export interface NativeOpenAppOptions {
  platform: NativeOpenPlatform;
  supportedEditors: NativeEditorAppOption[];
  supportedTerminals: NativeTerminalAppOption[];
  editors: NativeEditorAppOption[];
  terminals: NativeTerminalAppOption[];
}

/** 会话状态 → LED 灯效模式映射（mode 0-5：0 关 / 1 顺时针 / 2 逆时针 / 3 交替 / 4 跳跃 / 5 闪烁）。 */
export interface LedControlPreferences {
  enabled: boolean;
  waitingMode: number;
  runningMode: number;
  idleMode: number;
}

/** 浮窗可展示的指标 key（顺序即展示顺序）。 */
export type WidgetMetric =
  | "cost"
  | "totalTokens"
  | "cacheHitRate"
  | "messages"
  | "sessions"
  | "topModel";

export interface AppPreferences {
  showTrayTitle: boolean;
  showTraySessions: boolean;
  systemNotificationsEnabled: boolean;
  collapseSidebarByDefault: boolean;
  thirdPartyProviderPricingEnabled: boolean;
  uiLanguage: "zh" | "en";
  defaultTerminalApp: DefaultTerminalApp;
  defaultEditorApp: DefaultEditorApp | null;
  trayTitleMaxChars: number | null;
  sessionTrayCountStyle: SessionTrayCountStyle;
  trayPulseWaiting: boolean;
  focusSessionShortcut: string | null;
  ledControl?: LedControlPreferences;
  /** 桌面用量浮窗是否启用。 */
  floatingWidgetEnabled: boolean;
  /** 浮窗展示的指标 key 列表，顺序即展示顺序。 */
  floatingWidgetMetrics: string[];
  /** 浮窗面板不透明度百分比（30-100）。 */
  floatingWidgetOpacity: number;
}

export type PresetSource = "builtin" | "custom";

export interface LocalizedText {
  zh: string;
  en: string;
}

export type PresetModelCategory = "opus" | "sonnet" | "haiku" | "other";

export interface SettingsPresetModel {
  id: string;
  category: PresetModelCategory;
}

export interface SettingsPreset {
  id: string;
  name: string;
  localizedName?: LocalizedText;
  description: string;
  basePresetId?: string;
  docUrl?: string;
  models?: SettingsPresetModel[];
  modelSuggestions: string[];
  settingsPatch: Record<string, unknown>;
  source: PresetSource;
}

export interface ConfigProfile {
  id: string;
  name: string;
  description: string;
  presetId?: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BindingState {
  userProfileId?: string;
  userLastAppliedAt?: string;
}

export type UnmanagedUserSettingsImportStatus =
  | "ready"
  | "invalidJson"
  | "invalidSchema"
  | "unsupportedSymlink"
  | "readError";

export interface UnmanagedUserSettings {
  sourcePath: string;
  settings: Record<string, unknown>;
  size: number;
  modifiedAt: number;
  importStatus: UnmanagedUserSettingsImportStatus;
  errorMessage?: string;
  matchedProfileId?: string;
}

export interface ActiveUserSettingsMismatch {
  profileId: string;
  sourcePath: string;
  expectedSettings: Record<string, unknown>;
  actualSettings: Record<string, unknown>;
}

export interface ConfigWorkspace {
  app: AppPreferences;
  builtinPresets: SettingsPreset[];
  customPresets: SettingsPreset[];
  profiles: ConfigProfile[];
  bindings: BindingState;
  unmanagedUserSettings?: UnmanagedUserSettings;
  activeUserSettingsMismatch?: ActiveUserSettingsMismatch;
}

export interface ModelTestResult {
  ok: boolean;
  responseText: string;
  promptText?: string;
  resolvedModel: string;
  providerModel?: string;
  durationMs: number;
  requestId?: string;
  stopReason?: string;
  statusCode?: number;
  errorMessage?: string;
  requestMethod?: string;
  requestUrl?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  rawResponse?: string;
}

// 记忆条目
export type MemoryTargetType = "claude" | "rule";

export interface Memory {
  id: string;
  name: string;
  content: string;
  targetType: MemoryTargetType;
  rulePath?: string;
  pathPatterns?: string[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export type UnmanagedMemoryImportStatus = "ready" | "managedPathConflict" | "unsupportedSymlink";

export interface UnmanagedMemory {
  id: string;
  name: string;
  content: string;
  targetType: MemoryTargetType;
  rulePath?: string;
  pathPatterns: string[];
  sourcePath: string;
  size: number;
  modifiedAt: number;
  importStatus: UnmanagedMemoryImportStatus;
}

// 记忆状态
export interface MemoryState {
  version?: number;
  memories: Memory[];
  unmanagedMemories?: UnmanagedMemory[];
}

export interface MemoryDeletePreview {
  cleanupDirs: string[];
}

export type MemoryDirectoryImportSkipReason =
  | "duplicateClaude"
  | "duplicateRulePath"
  | "unsupportedSymlink"
  | "invalidRulePath"
  | "readError";

export interface MemoryDirectoryImportItem {
  sourcePath: string;
  name: string;
  targetType: MemoryTargetType;
  rulePath?: string;
}

export interface MemoryDirectoryImportSkippedItem {
  sourcePath: string;
  reason: MemoryDirectoryImportSkipReason;
  detail?: string;
}

export interface MemoryDirectoryImportResult {
  state: MemoryState;
  imported: MemoryDirectoryImportItem[];
  skipped: MemoryDirectoryImportSkippedItem[];
}

export type MemoryPresetLanguage = "zh" | "en";

export type MemoryPresetAction = "createClaude";

export type MemoryPresetApplyOutcome = "createdClaude" | "activatedExisting";

export interface MemoryPresetApplyInput {
  presetId: string;
  language: MemoryPresetLanguage;
  action: MemoryPresetAction;
}

export interface MemoryPresetApplyResult {
  state: MemoryState;
  outcome: MemoryPresetApplyOutcome;
  memoryId: string;
}

export interface MemoryPresetContentInput {
  presetId: string;
  language: MemoryPresetLanguage;
}

export interface MemoryPresetContentResult {
  presetId: string;
  language: MemoryPresetLanguage;
  name: string;
  content: string;
  sourceUrl: string;
}

// ===== 统计页面类型 =====

export interface SessionMetrics {
  // Rust 端使用 snake_case 序列化，前端字段名需匹配
  frame_duration_ms_avg: number;
  frame_duration_ms_p95: number;
  hook_duration_ms_avg?: number;
  hook_duration_ms_p95?: number;
  hook_duration_ms_count?: number;
  pre_tool_hook_duration_ms_avg?: number;
  pre_tool_hook_duration_ms_p95?: number;
}

export interface UsageEntry {
  usageCount: number;
  lastUsedAt: number;
}

export interface ModelUsageEntry {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUsd: number;
}

export interface ProjectStats {
  lastCost: number;
  lastDuration: number;
  lastSessionId?: string;
  lastSessionMetrics?: SessionMetrics;
  lastTotalInputTokens: number;
  lastTotalOutputTokens: number;
  lastTotalCacheCreationInputTokens: number;
  lastTotalCacheReadInputTokens: number;
  lastSessionModified: number;
  lastLinesAdded: number;
  lastLinesRemoved: number;
  lastTotalWebSearchRequests: number;
  lastModelUsage?: Record<string, ModelUsageEntry>;
  lastSessionFirstPrompt?: string;
}

export interface ClaudeStats {
  numStartups: number;
  firstStartTime?: string;
  projects: Record<string, ProjectStats>;
  toolUsage: Record<string, UsageEntry>;
  skillUsage: Record<string, UsageEntry>;
  lastPlanModeUse?: number;
  btwUseCount?: number;
}

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace" | "unknown";

export interface LogEntry {
  timestamp?: string;
  level: LogLevel;
  target?: string;
  message: string;
  raw: string;
}

export interface LogView {
  logDir: string;
  entries: LogEntry[];
  truncated: boolean;
}

export type ClaudeDirectoryEntryKind = "file" | "directory";
export type ClaudeDirectoryEntryOperationKind = "file" | "directory";

export interface ClaudeDirectoryEntry {
  path: string;
  name: string;
  kind: ClaudeDirectoryEntryKind;
  size: number;
  modifiedAt: number;
}

export interface ClaudeDirectoryOverview {
  rootPath: string;
  maxEntries: number;
  maxDepth: number;
  entries: ClaudeDirectoryEntry[];
  truncated: boolean;
  reachedEntryLimit: boolean;
  reachedDepthLimit: boolean;
  skippedSymlinkCount: number;
  skippedNodeModulesCount: number;
}

export interface ClaudeFilePreview {
  path: string;
  name: string;
  content: string;
  isBinary: boolean;
  truncated: boolean;
  size: number;
  modifiedAt: number;
  encoding: string;
}

/** 项目级 settings 文件的归属（共享 vs 本地覆盖） */
export type ProjectClaudeSettingsScope = "shared" | "local";

export interface ClaudeDirectoryChangedEvent {
  paths: string[];
}

export type SkillDirectoryImportSkipReason = "invalid-id" | "exists" | "missing-skill-md";

// Skill 条目
export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  disableModelInvocation: boolean;
  userInvocable: boolean;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  isSymlink: boolean;
  hasSymlinkContent: boolean;
  linkTarget: string | null;
}

export interface SkillDirectoryImportSkippedItem {
  id: string;
  reason: SkillDirectoryImportSkipReason;
}

export interface SkillDirectoryImportResult {
  skills: Skill[];
  imported: string[];
  skipped: SkillDirectoryImportSkippedItem[];
}

export type SkillFileTreeEntryKind = "file" | "directory";

// Skill 支持文件树条目
export interface SkillFileTreeEntry {
  path: string;
  kind: SkillFileTreeEntryKind;
  size: number;
  isBinary: boolean;
}

// 历史记录条目
export interface HistoryEntry {
  display: string;
  pastedContents: Record<string, string>;
  timestamp: number;
  project: string;
  sessionId: string;
}

export interface ProjectRecentSessionSummary {
  sessionId: string;
  firstPrompt: string;
  lastPrompt: string;
  messageCount: number;
  firstTimestamp: number;
  lastTimestamp: number;
}

export interface ProjectSummary {
  project: string;
  shortName: string;
  lastActiveAt: number;
  messageCount: number;
  sessionCount: number;
  lastSessionId?: string;
  recentSessions: ProjectRecentSessionSummary[];
}

export type AgentsStatus = "missing" | "correctSymlink" | "wrongSymlink" | "plainFileConflict";

export type PairStatus =
  | "bothMissing"
  | "onlyClaude"
  | "onlyAgents"
  | "paired"
  | "wrongSymlink"
  | "conflict"
  | "orphanSymlink";

export interface ProjectBranch {
  name: string;
  isCurrent: boolean;
  lastCommitAt?: number;
  lastCommitSubject?: string;
}

export interface ProjectWorktree {
  path: string;
  branch?: string;
  head?: string;
  isCurrent: boolean;
  isDetached: boolean;
}

export interface ProjectSkillSummary {
  id: string;
  isSymlink: boolean;
}

export interface ProjectDetail {
  path: string;
  shortName: string;
  exists: boolean;
  isGitRepo: boolean;
  repoRoot?: string;
  repositoryUrl?: string;
  hasClaudeMd: boolean;
  hasProjectClaudeDir: boolean;
  hasProjectClaudeSkills: boolean;
  hasProjectClaudeSettings: boolean;
  hasProjectClaudeSettingsLocal: boolean;
  projectClaudeRulesCount: number;
  agentsStatus: AgentsStatus;
  agentsSkillsStatus: AgentsStatus;
  memoryPairStatus: PairStatus;
  skillsPairStatus: PairStatus;
  projectSkills: ProjectSkillSummary[];
  branches: ProjectBranch[];
  worktrees: ProjectWorktree[];
}

export interface ProjectPurgeOutput {
  project: string;
  output: string;
}

export type ProjectGitCleanupReason = "merged" | "upstreamGone";

export interface ProjectBranchCleanupCandidate {
  name: string;
  reason: ProjectGitCleanupReason;
  forceDelete: boolean;
  lastCommitAt?: number;
  lastCommitSubject?: string;
}

export interface ProjectWorktreeCleanupCandidate {
  path: string;
  branch?: string;
  head?: string;
  reason: ProjectGitCleanupReason;
  isDetached: boolean;
}

export interface ProjectGitCleanupPreview {
  project: string;
  repoRoot?: string;
  baseBranch?: string;
  branchCandidates: ProjectBranchCleanupCandidate[];
  worktreeCandidates: ProjectWorktreeCleanupCandidate[];
}

export interface ProjectGitCleanupResult {
  project: string;
  deletedBranches: string[];
  deletedWorktrees: string[];
  errors: string[];
}

// 对话消息内容块
export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; name: string; input_preview: string }
  | { type: "tool_result"; content: string }
  | { type: "command"; name: string; args?: string }
  | { type: "system"; summary: string }
  | { type: "image"; source_type: string; media_type: string; data?: string }
  | { type: "plan"; summary: string; content: string };

// 一条对话消息
export interface SessionMessage {
  role: "user" | "assistant";
  blocks: MessageBlock[];
  timestamp?: string;
}

// 会话详情
export interface SessionDetail {
  session_id: string;
  project: string;
  messages: SessionMessage[];
  // harness 注入且实际存在的关联 plan 文件绝对路径,无关联时为 null
  plan_file_path: string | null;
}

// 会话关联 plan 文件内容
export interface SessionPlan {
  path: string;
  content: string;
}

// =========== Token 用量统计（usage.rs 对应类型） ===========

export type PricingSource = "builtin" | "cache" | "network";

export interface ModelPrice {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
}

export interface PricingTable {
  source: PricingSource;
  fetchedAtMs: number | null;
  models: Record<string, ModelPrice>;
}

export interface UsageRecord {
  messageId: string;
  sessionId: string;
  projectPath: string;
  projectDir: string;
  timestampMs: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreation5m: number;
  cacheCreation1h: number;
  cacheRead: number;
  costUsd: number;
  gitBranch?: string | null;
  ccVersion?: string | null;
}

export interface ModelUsageStat {
  model: string;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

export interface DailyUsage {
  date: string;
  messages: number;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
  byModel: ModelUsageStat[];
}

export type UsageTimeGranularity = "day" | "hour" | "fiveMinute";

export interface UsageTimeSeriesPoint {
  bucket: string;
  bucketStartMs: number;
  messages: number;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
  inputCost: number;
  outputCost: number;
  cacheCreationCost: number;
  cacheReadCost: number;
  byModel: ModelUsageStat[];
}

export interface ProjectUsage {
  projectPath: string;
  projectDir: string;
  sessions: number;
  messages: number;
  lastActiveMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
  byModel: ModelUsageStat[];
}

export interface SessionUsage {
  sessionId: string;
  projectPath: string;
  projectDir: string;
  startedAtMs: number;
  lastActiveMs: number;
  messages: number;
  models: string[];
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

export interface ProjectOption {
  projectPath: string;
  projectDir: string;
}

export interface UsageSummary {
  totalMessages: number;
  totalSessions: number;
  totalProjects: number;
  totalInput: number;
  totalOutput: number;
  totalCacheCreation: number;
  totalCacheRead: number;
  totalCost: number;
  lastScanMs: number | null;
  pricing: PricingTable;
  thirdPartyProviderPricingEnabled: boolean;
  unknownModels: string[];
  allProjects: ProjectOption[];
  allModels: string[];
}

// 用量页一次刷新的全量聚合视图：把 summary/daily/timeSeries/projects/sessions/models 合并为单次响应
export interface UsageSnapshot {
  summary: UsageSummary;
  daily: DailyUsage[];
  timeSeries: UsageTimeSeriesPoint[];
  projects: ProjectUsage[];
  sessions: SessionUsage[];
  models: ModelUsageStat[];
}

export interface SessionUsageDetail {
  session: SessionUsage;
  messages: UsageRecord[];
}

export interface UsageFilter {
  startDate?: string;
  endDate?: string;
  projectPath?: string;
  sessionId?: string;
  model?: string;
  includeUnknownModels?: boolean;
}

export interface UsageScanResult {
  filesScanned: number;
  newRecords: number;
  elapsedMs: number;
}

export type UsageTab = "daily" | "project" | "session" | "model";
