import { describe, expect, it } from "vitest";
import {
  CACHE_HIT_RATE_GOOD,
  CACHE_HIT_RATE_POOR,
  cacheHitRateColorClass,
  METRIC_COLOR,
} from "./metric-colors";

describe("cacheHitRateColorClass", () => {
  it("≥70% 返回 success（含边界 70）", () => {
    expect(cacheHitRateColorClass(CACHE_HIT_RATE_GOOD)).toBe("text-success");
    expect(cacheHitRateColorClass(70)).toBe("text-success");
    expect(cacheHitRateColorClass(85)).toBe("text-success");
    expect(cacheHitRateColorClass(100)).toBe("text-success");
  });

  it("<40% 返回 warning（不含边界 40）", () => {
    expect(cacheHitRateColorClass(0)).toBe("text-warning");
    expect(cacheHitRateColorClass(39.9)).toBe("text-warning");
    expect(cacheHitRateColorClass(CACHE_HIT_RATE_POOR - 0.1)).toBe("text-warning");
  });

  it("40%~70% 之间返回中性前景色（含边界 40，不含 70）", () => {
    expect(cacheHitRateColorClass(CACHE_HIT_RATE_POOR)).toBe("text-foreground");
    expect(cacheHitRateColorClass(40)).toBe("text-foreground");
    expect(cacheHitRateColorClass(55)).toBe("text-foreground");
    expect(cacheHitRateColorClass(69.9)).toBe("text-foreground");
  });
});

describe("METRIC_COLOR", () => {
  it("各指标身份色：花费=金色，其余取语义身份色", () => {
    expect(METRIC_COLOR.cost).toBe("text-gold");
    expect(METRIC_COLOR.tokens).toBe("text-chart-1");
    expect(METRIC_COLOR.sessions).toBe("text-chart-4");
    expect(METRIC_COLOR.messages).toBe("text-chart-5");
    expect(METRIC_COLOR.cacheSavings).toBe("text-chart-2");
  });
});
