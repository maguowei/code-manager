// Token 用量页面专用格式化工具
// 数字（带单位）、日期、时间长度

import type { TranslationKey } from "../../i18n";
import {
  formatCompactNumber,
  formatDateTime as formatLocaleDateTime,
  formatPercent as formatLocalePercent,
  formatNumber,
  formatUsd,
} from "../../i18n/format";
import type { PricingSource } from "../../types";

/** 大数字简化为 K / M / B 后缀 */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000) return formatCompactNumber(n);
  return formatNumber(n);
}

/** 整数千分位（用于计数类指标，如 web search 次数、消息数） */
export function formatCount(n: number): string {
  return formatNumber(n);
}

/** 紧凑成本显示（用于表格） */
export function formatCost(n: number): string {
  if (!Number.isFinite(n) || n <= 0) {
    return formatUsd(0, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (n < 0.01) {
    return `<${formatUsd(0.01, undefined, { minimumFractionDigits: 2 })}`;
  }
  return formatUsd(n, undefined, {
    minimumFractionDigits: n >= 1000 ? 0 : 2,
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  });
}

/** 比率（0-100）-> 百分比字符串 */
export function formatPercent(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0%";
  return formatLocalePercent(n);
}

/** 每百万 Token 单价显示 */
export function formatPricePerMillion(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return formatUsd(0, undefined, { maximumFractionDigits: 0 });
  if (n >= 0.01) {
    return formatUsd(n, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (n >= 0.0001) return formatUsd(n, undefined, { maximumFractionDigits: 4 });
  return `<${formatUsd(0.0001, undefined, { maximumFractionDigits: 4 })}`;
}

/** ms 时间戳 -> 本地短日期字符串 */
export function formatDateTime(ms: number): string {
  if (!ms) return "-";
  try {
    return formatLocaleDateTime(ms, undefined, { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return "-";
  }
}

/** ms 时间戳 -> YYYY-MM-DD HH:mm */
export function formatShortDateTime(ms: number): string {
  if (!ms) return "-";
  try {
    return formatLocaleDateTime(ms);
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

/** 价格表来源 → i18n 标签 */
export function pricingSourceLabel(
  source: PricingSource,
  t: (key: TranslationKey) => string,
): string {
  switch (source) {
    case "network":
      return t("usage.pricing.network");
    case "cache":
      return t("usage.pricing.cache");
    case "builtin":
      return t("usage.pricing.builtin");
  }
}
