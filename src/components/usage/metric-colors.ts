// 数字指标配色：用量页顶部 KPI 卡与桌面浮窗共用，保证两处视觉一致。
// 仅给数字文字着色（语义文字色方案）；花费=金色，命中率按高低走语义色，其余取固定身份色。

// 缓存命中率高低阈值，与用量页趋势图的 70/40 参考线保持一致
export const CACHE_HIT_RATE_GOOD = 70;
export const CACHE_HIT_RATE_POOR = 40;

/** 按命中率高低返回数值配色：≥70% 优秀(success)、<40% 偏低(warning)、其间中性。 */
export function cacheHitRateColorClass(rate: number): string {
  if (rate >= CACHE_HIT_RATE_GOOD) return "text-success";
  if (rate < CACHE_HIT_RATE_POOR) return "text-warning";
  return "text-foreground";
}

/**
 * 各数值指标的身份配色（数字文字色）。
 * cost 用金色语义；命中率不在此表（按高低走 cacheHitRateColorClass）。
 */
export const METRIC_COLOR = {
  cost: "text-gold", // 金：金钱
  tokens: "text-chart-1", // 蓝：中性主数据量
  sessions: "text-chart-4", // 紫：计数身份
  messages: "text-chart-5", // 红橙：计数身份
  cacheSavings: "text-chart-2", // 绿：省钱=正向
  webSearch: "text-chart-3", // 橙：Web 搜索工具计数身份
  webFetch: "text-chart-4", // 紫：Web 抓取工具计数身份
} as const;
