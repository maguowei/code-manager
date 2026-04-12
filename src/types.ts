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

export interface ProviderModel {
  id: string;
  name: string;
  category: "opus" | "sonnet" | "haiku" | "other";
}

export interface Provider {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  docUrl?: string;
  isBuiltin: boolean;
  models: ProviderModel[];
  createdAt: number;
  updatedAt: number;
}

export interface ClaudeConfig {
  id: string;
  name: string;
  description: string;
  apiKey: string;
  baseUrl?: string;
  websiteUrl?: string;
  // 模型配置
  model?: string;
  haikuModel?: string;
  sonnetModel?: string;
  opusModel?: string;
  // 高级选项
  alwaysThinkingEnabled?: boolean;
  disableNonessentialTraffic?: boolean;
  skipWebFetchPreflight?: boolean;
  enableLspTool?: boolean;
  agentTeamsEnabled?: boolean;
  enableExtraMarketplaces?: boolean;
  hasCompletedOnboarding?: boolean;
  // 语言配置
  preferredLanguage?: string;
  // 通用配置
  useDefaults?: boolean;
  // 插件配置
  enabledPlugins?: Record<string, boolean>;
  // 额外字段（用户在 JSON 编辑器中手动添加的）
  extraFields?: Record<string, unknown>;
  // Provider 关联
  providerId?: string;
  // 元数据
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AppState {
  configs: ClaudeConfig[];
  activeConfigId: string | null;
  defaults?: string | null;
}

// 记忆条目
export interface Memory {
  id: string;
  name: string;
  content: string;
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
  messageCount: number;
  sessionCount: number;
  lastTimestamp: number;
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
