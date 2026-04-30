// 检测是否在 Tauri 环境中运行
export const isTauri = () =>
  typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;

// 侧边栏 Tab 类型
export type TabType =
  | "configs"
  | "providers"
  | "memory"
  | "skills"
  | "projects"
  | "stats"
  | "history";

export type DefaultTerminalApp = "terminal" | "iterm" | "warp" | "ghostty";

export type DefaultEditorApp = "vscode" | "cursor" | "windsurf" | "zed";

export interface AppPreferences {
  showTrayTitle: boolean;
  uiLanguage: "zh" | "en";
  defaultTerminalApp: DefaultTerminalApp;
  defaultEditorApp: DefaultEditorApp | null;
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

export interface ConfigWorkspace {
  app: AppPreferences;
  builtinPresets: SettingsPreset[];
  customPresets: SettingsPreset[];
  profiles: ConfigProfile[];
  bindings: BindingState;
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
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// 记忆状态
export interface MemoryState {
  memories: Memory[];
}

// ===== 统计页面类型 =====

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUsd: number;
}

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

export interface ProjectStats {
  lastCost: number;
  lastDuration: number;
  lastSessionId?: string;
  lastModelUsage: Record<string, ModelUsage>;
  lastSessionMetrics?: SessionMetrics;
  lastTotalInputTokens: number;
  lastTotalOutputTokens: number;
  lastTotalCacheCreationInputTokens: number;
  lastTotalCacheReadInputTokens: number;
}

export interface ClaudeStats {
  numStartups: number;
  firstStartTime?: string;
  projects: Record<string, ProjectStats>;
  toolUsage: Record<string, UsageEntry>;
  skillUsage: Record<string, UsageEntry>;
}

export interface Snapshot {
  timestamp: number;
  data: ClaudeStats;
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
}

// Skill 支持文件
export interface SkillFile {
  name: string;
  content: string;
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

export interface ProjectSummary {
  project: string;
  shortName: string;
  lastCost: number;
  lastDuration: number;
  lastSessionId?: string;
}

export type AgentsStatus = "missing" | "correctSymlink" | "wrongSymlink" | "plainFileConflict";

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

export interface ProjectDetail {
  path: string;
  shortName: string;
  exists: boolean;
  isGitRepo: boolean;
  repoRoot?: string;
  repositoryUrl?: string;
  hasClaudeMd: boolean;
  agentsStatus: AgentsStatus;
  branches: ProjectBranch[];
  worktrees: ProjectWorktree[];
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
}
