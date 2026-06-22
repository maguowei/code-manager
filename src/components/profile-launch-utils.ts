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
}

// 双引号字符串内的 POSIX 转义：反斜杠、双引号、美元符、反引号。
function quoteDouble(value: string): string {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

// 单引号字符串内嵌单引号的 POSIX 写法：' -> '\''。
function quoteSingle(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/// 由后端载荷拼出文件路径式与内联 JSON 式两条 claude 启动命令。
export function buildLaunchCommands(input: LaunchCommandInput): LaunchCommands {
  return {
    filePathCommand: `claude --settings ${quoteDouble(input.settingsPath)}`,
    inlineJsonCommand: `claude --settings ${quoteSingle(input.envOnlyJson)}`,
  };
}
