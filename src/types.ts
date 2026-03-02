export interface ClaudeConfig {
  id: string;
  name: string;
  description: string;
  apiKey: string;
  apiUrl?: string;
  websiteUrl?: string;
  // 模型配置
  model?: string;
  thinkingModel?: string;
  haikuModel?: string;
  sonnetModel?: string;
  opusModel?: string;
  // 高级选项
  alwaysThinkingEnabled?: boolean;
  disableNonessentialTraffic?: boolean;
  skipWebFetchPreflight?: boolean;
  enableLspTool?: boolean;
  enableExtraMarketplaces?: boolean;
  hasCompletedOnboarding?: boolean;
  // 语言配置
  preferredLanguage?: string;
  // 通用配置
  useDefaults?: boolean;
  // 插件配置
  enabledPlugins?: Record<string, boolean>;
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

// 生成 Claude Code 配置 JSON
export function generateClaudeJson(config: ClaudeConfig): object {
  const env: Record<string, string> = {
    ANTHROPIC_AUTH_TOKEN: config.apiKey,
  };

  if (config.apiUrl) {
    env.ANTHROPIC_BASE_URL = config.apiUrl;
  }
  if (config.model) {
    env.ANTHROPIC_MODEL = config.model;
  }
  if (config.haikuModel) {
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = config.haikuModel;
  }
  if (config.sonnetModel) {
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = config.sonnetModel;
  }
  if (config.opusModel) {
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = config.opusModel;
  }
  if (config.disableNonessentialTraffic) {
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  }
  if (config.enableLspTool) {
    env.ENABLE_LSP_TOOL = "1";
  }

  const result: Record<string, unknown> = {};

  if (config.preferredLanguage && config.preferredLanguage !== "english") {
    result.language = config.preferredLanguage;
  }

  if (config.alwaysThinkingEnabled) {
    result.alwaysThinkingEnabled = true;
  }

  if (config.skipWebFetchPreflight) {
    result.skipWebFetchPreflight = true;
  }

  if (config.enableExtraMarketplaces) {
    result.extraKnownMarketplaces = {
      "claude-plugins-official": {
        source: {
          source: "github",
          repo: "anthropics/claude-plugins-official",
        },
      },
      "chrome-devtools-plugins": {
        source: {
          source: "github",
          repo: "ChromeDevTools/chrome-devtools-mcp",
        },
      },
    };
  }

  if (config.hasCompletedOnboarding) {
    result.hasCompletedOnboarding = true;
  }

  if (config.enabledPlugins && Object.keys(config.enabledPlugins).length > 0) {
    result.enabledPlugins = { ...config.enabledPlugins };
  }

  result.env = env;

  return result;
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
  frameDurationMsAvg: number;
  frameDurationMsP95: number;
  hookDurationMsAvg?: number;
  hookDurationMsP95?: number;
  hookDurationMsCount?: number;
  preToolHookDurationMsAvg?: number;
  preToolHookDurationMsP95?: number;
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

// 深度合并：base 为基础，overlay 的字段优先覆盖
// 对象递归合并，非对象类型 overlay 优先
export function deepMerge(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overlay)) {
    const baseVal = result[key];
    const overlayVal = overlay[key];
    if (
      baseVal !== null && overlayVal !== null &&
      typeof baseVal === "object" && !Array.isArray(baseVal) &&
      typeof overlayVal === "object" && !Array.isArray(overlayVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overlayVal as Record<string, unknown>
      );
    } else {
      result[key] = overlayVal;
    }
  }
  return result;
}
