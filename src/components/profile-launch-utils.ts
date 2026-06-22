/// 多配置启动命令拼接工具。仅面向 POSIX shell（bash/zsh），与现有 copy-env 的 export 约定一致。

/// 后端 prepare_profile_launch 返回的载荷（settingsPath + envOnlyJson）。
export interface LaunchCommandInput {
  settingsPath: string;
  envOnlyJson: string;
}

/// 拼接好的两条启动命令。
export interface LaunchCommands {
  filePathCommand: string;
  inlineJsonCommand: string;
  /// 内联式的展示用打码版本：密钥类 env 值被掩码，仅用于界面展示，不用于复制。
  inlineJsonCommandMasked: string;
}

// 双引号字符串内的 POSIX 转义：反斜杠、双引号、美元符、反引号。
function quoteDouble(value: string): string {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

// 单引号字符串内嵌单引号的 POSIX 写法：' -> '\''。
function quoteSingle(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

// 命中这些片段的 env key 视为密钥，展示时掩码其值。
const SECRET_KEY_PATTERN = /TOKEN|KEY|SECRET|PASSWORD/i;
const SECRET_MASK = "••••••";

// 把 env-only JSON 里密钥类 key 的值替换为掩码，得到展示用 JSON；解析失败则原样返回。
function maskInlineEnvJson(envOnlyJson: string): string {
  try {
    const parsed = JSON.parse(envOnlyJson) as { env?: Record<string, unknown> };
    const env = parsed.env;
    if (!env || typeof env !== "object") {
      return envOnlyJson;
    }
    const maskedEnv: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(env)) {
      maskedEnv[key] = SECRET_KEY_PATTERN.test(key) ? SECRET_MASK : value;
    }
    return JSON.stringify({ ...parsed, env: maskedEnv });
  } catch {
    return envOnlyJson;
  }
}

/// 由后端载荷拼出文件路径式与内联 JSON 式两条 claude 启动命令。
export function buildLaunchCommands(input: LaunchCommandInput): LaunchCommands {
  return {
    filePathCommand: `claude --settings ${quoteDouble(input.settingsPath)}`,
    inlineJsonCommand: `claude --settings ${quoteSingle(input.envOnlyJson)}`,
    inlineJsonCommandMasked: `claude --settings ${quoteSingle(maskInlineEnvJson(input.envOnlyJson))}`,
  };
}
