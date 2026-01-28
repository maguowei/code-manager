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
  // 元数据
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AppState {
  configs: ClaudeConfig[];
  activeConfigId: string | null;
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

  const result: Record<string, unknown> = {};

  if (config.alwaysThinkingEnabled) {
    result.alwaysThinkingEnabled = true;
  }

  result.env = env;

  return result;
}
