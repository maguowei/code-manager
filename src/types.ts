// 检测是否在 Tauri 环境中运行
export const isTauri = () =>
  typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;

// 侧边栏 Tab 类型
export type TabType =
  | "claudeOverview"
  | "configs"
  | "codex"
  | "memory"
  | "skills"
  | "projects"
  | "stats"
  | "usage"
  | "history"
  | "cheatsheet";

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
  /** 会话等待输入时是否播放提示音效。 */
  waitingSoundEnabled: boolean;
  /** 提示音效选择，对应 macOS 系统音效文件名。 */
  waitingSound: "glass" | "submarine" | "hero" | "ping" | "sosumi" | "tink";
  /** 防止休眠模式（off 不干预 / whileActive 仅活动会话运行时 / always 无条件，仅 macOS 生效）。 */
  sleepPrevention?: SleepPreventionMode;
  /** 屏幕常亮：与模式正交，开启后连显示器一起不熄；默认关（只挡系统空闲休眠）。仅 macOS 生效。 */
  keepDisplayAwake?: boolean;
}

/** 防止休眠三态：off 关闭 / whileActive 仅活动会话运行时 / always 始终。 */
export type SleepPreventionMode = "off" | "whileActive" | "always";

/** 防止休眠运行时状态：当前模式 + 此刻是否正持有断言（正在保持唤醒）。 */
export interface SleepPreventionStatus {
  mode: SleepPreventionMode;
  active: boolean;
}

export interface LocalizedText {
  zh: string;
  en: string;
}

export interface ProviderModel {
  id: string;
}

export interface Provider {
  id: string;
  name: string;
  localizedName?: LocalizedText;
  description: string;
  docUrl?: string;
  models?: ProviderModel[];
  modelSuggestions: string[];
  /** 供应商连接与模型映射环境变量（扁平键值对，不含认证密钥） */
  env: Record<string, string>;
}

/** 配置导入 deep link 解析结果（与后端 ResolvedProfileImportDeepLink 对齐）。 */
export interface ResolvedProfileImportDeepLink {
  name: string;
  description: string;
  settingsJson: string;
  containsSecrets: boolean;
  source: string;
}

export interface ConfigProfile {
  id: string;
  name: string;
  description: string;
  providerId?: string;
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
  builtinProviders: Provider[];
  profiles: ConfigProfile[];
  bindings: BindingState;
  unmanagedUserSettings?: UnmanagedUserSettings;
  activeUserSettingsMismatch?: ActiveUserSettingsMismatch;
}

// ===== Codex 配置(Codex Config System,ADR 0004)=====

/** 自定义 Codex Provider(内置只读项不落盘 registry,经 CodexWorkspace.providers 合并返回)。 */
export interface CodexProvider {
  id: string;
  name: string;
  baseUrl: string;
  /** 读取 API key 的环境变量名(`env_key`);可选,留空则 apply 内联 experimental_bearer_token(ADR 0005) */
  envKey?: string;
  /** `responses` 或 `chat` */
  wireApi: string;
  /** 可选模型目录,apply 时生成 ~/.codex/models.json(ADR 0005) */
  modelCatalog?: unknown;
  docUrl?: string;
}

/** Codex 认证模式(ADR 0005):从 Provider 推导,不是用户可选项。 */
export type CodexAuthMode = "chatGptLogin" | "apiKey";

/** Codex Profile:引用一个 Codex Provider + 一个 ApiKey(仅 ApiKey,无 OAuth)。 */
export interface CodexProfile {
  id: string;
  name: string;
  providerId: string;
  /** API key(敏感,展示与日志需脱敏) */
  apiKey: string;
  createdAt: string;
  updatedAt: string;
}

/** Codex 侧绑定态,记录当前激活(已 apply)的 Codex Profile。 */
export interface CodexBindingState {
  codexProfileId?: string;
  codexLastAppliedAt?: string;
}

/** Codex 工作区视图:内置只读 + 自定义 Provider、Profile、绑定。 */
export interface CodexWorkspace {
  providers: CodexProvider[];
  profiles: CodexProfile[];
  bindings: CodexBindingState;
  /** 内置只读 Provider 的 id 列表(前端据此禁用编辑/删除) */
  builtinProviderIds: string[];
}

/** Codex Apply 预览:不写盘的 provider 切换摘要,供用户确认不误伤 config.toml。 */
export interface CodexApplyPreview {
  currentModelProvider: string | null;
  nextModelProvider: string;
  providerName: string;
  providerBaseUrl: string;
  providerWireApi: string;
  /** 认证模式(ADR 0005):内置 openai 为 ChatGPT 登录,自定义第三方为 API key */
  authMode: CodexAuthMode;
  /** API key 模式下是否内联 experimental_bearer_token(chatgpt-login 模式恒 false) */
  willInlineBearerToken: boolean;
}

/** 新建/编辑自定义 Codex Provider 的输入。 */
export interface CodexProviderInput {
  id?: string | null;
  name: string;
  baseUrl: string;
  /** 可选;留空则 apply 内联 experimental_bearer_token(ADR 0005) */
  envKey?: string;
  wireApi: string;
  /** 可选模型目录,apply 时生成 ~/.codex/models.json(ADR 0005) */
  modelCatalog?: unknown;
  docUrl?: string;
}

/** 新建/编辑 Codex Profile 的输入。apiKey 为空表示编辑时保留已有 key。 */
export interface CodexProfileInput {
  id?: string | null;
  name: string;
  providerId: string;
  apiKey: string;
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
  /** 该项自身是否为软链（后代经软链可达时仍为 false） */
  isSymlink: boolean;
  /** read_link 原始目标 */
  linkTarget?: string | null;
  /** 解析后的绝对目标；损坏时为空 */
  linkTargetAbsolute?: string | null;
  /** 目标不存在或不可解析 */
  isBroken: boolean;
  /** 真实路径已扫描过（环/菱形），不再递归 */
  isCycle: boolean;
}

export interface ClaudeDirectoryOverview {
  rootPath: string;
  maxEntries: number;
  maxDepth: number;
  entries: ClaudeDirectoryEntry[];
  truncated: boolean;
  reachedEntryLimit: boolean;
  reachedDepthLimit: boolean;
  /** 扫描到的软链条目数（已收录） */
  symlinkCount: number;
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
  /** 叶子节点自身是否为软链 */
  isSymlink: boolean;
  /** 路径上第一个软链的逻辑相对路径 */
  viaSymlinkPath?: string | null;
  linkTarget?: string | null;
  linkTargetAbsolute?: string | null;
  isBroken: boolean;
}

/** 项目级 settings 文件的归属（共享 vs 本地覆盖） */
export type ProjectClaudeSettingsScope = "shared" | "local";

export interface ClaudeDirectoryChangedEvent {
  paths: string[];
}

export type SkillDirectoryImportSkipReason =
  | "invalid-id"
  | "exists"
  | "missing-skill-md"
  | "import-failed";

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

/** 项目自动记忆（auto-memory）状态：~/.claude/projects/<编码>/memory/ 的可见性与设置摘要 */
export interface ProjectAutoMemoryStatus {
  /** autoMemoryEnabled，缺省视为启用 */
  enabled: boolean;
  /** autoMemoryDirectory 自定义目录原始值；未自定义为 null */
  directoryOverride: string | null;
  /** 解析后的 memory 目录是否位于 ~/.claude 内；false 时不提供应用内浏览 */
  isInsideClaudeDir: boolean;
  /** memory 目录是否存在 */
  exists: boolean;
  /** memory 目录内的文件数（递归，不含目录条目） */
  memoryFileCount: number;
  /** 解析后的 memory 目录展示路径 */
  resolvedDirLabel: string;
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
  | { type: "plan"; summary: string; content: string }
  | {
      type: "hook";
      hooks: { command: string; duration_ms: number | null }[];
      errors: string[];
      prevented_continuation: boolean;
      stop_reason: string | null;
    }
  | { type: "mode_change"; mode: string }
  | { type: "plan_mode_entered"; plan_file_path: string | null }
  | { type: "plan_mode_exited"; plan_file_path: string | null };

// 一条对话消息
export interface SessionMessage {
  role: "user" | "assistant" | "system";
  blocks: MessageBlock[];
  timestamp?: string;
}

// 一个 subagent 侧链子时间线
export interface SubagentChain {
  agent_id: string;
  slug: string | null;
  messages: SessionMessage[];
}

// 会话详情
export interface SessionDetail {
  session_id: string;
  project: string;
  messages: SessionMessage[];
  // harness 注入且实际存在的关联 plan 文件绝对路径,无关联时为 null
  plan_file_path: string | null;
  // 按 agentId 聚合的 subagent 侧链
  subagents: SubagentChain[];
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
  webSearchRequests: number;
  webFetchRequests: number;
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
  webSearchRequests: number;
  webFetchRequests: number;
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
  webSearchRequests: number;
  webFetchRequests: number;
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
  webSearchRequests: number;
  webFetchRequests: number;
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
  webSearchRequests: number;
  webFetchRequests: number;
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
  webSearchRequests: number;
  webFetchRequests: number;
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
  totalWebSearchRequests: number;
  totalWebFetchRequests: number;
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
