// Token 用量页面专用格式化工具
// 数字（带单位）、日期、时间长度

const NUM_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** 大数字简化为 K / M / B 后缀 */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000_000) return `${NUM_FMT.format(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${NUM_FMT.format(n / 1_000_000)}M`;
  if (n >= 1_000) return `${NUM_FMT.format(n / 1_000)}K`;
  return n.toLocaleString("en-US");
}

/** 紧凑成本显示（用于表格） */
export function formatCost(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  if (n >= 1000) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

/** ms 时间戳 -> 本地短日期字符串 */
export function formatDateTime(ms: number): string {
  if (!ms) return "-";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "-";
  }
}

/** ms 时间戳 -> YYYY-MM-DD HH:mm */
export function formatShortDateTime(ms: number): string {
  if (!ms) return "-";
  try {
    const d = new Date(ms);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${date} ${time}`;
  } catch {
    return "-";
  }
}

/** YYYY-MM-DD（输入框默认值） */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** path 缩短：只取最后一级目录 */
export function shortPath(p: string): string {
  if (!p) return "-";
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : p;
}

/** 项目显示名：优先从真实 cwd 取最后一级，避免展示 Claude 编码目录名 */
export function projectDisplayName(projectDir: string | undefined, projectPath: string): string {
  const pathName = shortPath(projectPath);
  if (pathName !== "-") return pathName;

  const normalizedDir = projectDir?.trim();
  return normalizedDir || "-";
}

/** 会话 ID 短显示（前 8 位） */
export function shortSessionId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
