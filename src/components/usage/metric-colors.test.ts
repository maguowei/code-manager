import { describe, expect, it } from "vitest";
import {
  CACHE_HIT_RATE_EXCELLENT,
  CACHE_HIT_RATE_GOOD,
  CACHE_HIT_RATE_PASS,
  cacheHitRateColorClass,
  METRIC_COLOR,
} from "./metric-colors";

describe("缓存命中率参考线阈值", () => {
  it("优秀 90 / 良好 70 / 及格 50 三条线", () => {
    expect(CACHE_HIT_RATE_EXCELLENT).toBe(90);
    expect(CACHE_HIT_RATE_GOOD).toBe(70);
    expect(CACHE_HIT_RATE_PASS).toBe(50);
  });
});

describe("cacheHitRateColorClass", () => {
  it("≥90% 返回 success（优秀，含边界 90）", () => {
    expect(cacheHitRateColorClass(CACHE_HIT_RATE_EXCELLENT)).toBe("text-success");
    expect(cacheHitRateColorClass(90)).toBe("text-success");
    expect(cacheHitRateColorClass(100)).toBe("text-success");
  });

  it("50%~89% 返回 warning（及格以上，含边界 50，不含 90）", () => {
    expect(cacheHitRateColorClass(CACHE_HIT_RATE_PASS)).toBe("text-warning");
    expect(cacheHitRateColorClass(50)).toBe("text-warning");
    expect(cacheHitRateColorClass(CACHE_HIT_RATE_GOOD)).toBe("text-warning");
    expect(cacheHitRateColorClass(70)).toBe("text-warning");
    expect(cacheHitRateColorClass(89.9)).toBe("text-warning");
  });

  it("<50% 返回 destructive（需排查，不含边界 50）", () => {
    expect(cacheHitRateColorClass(0)).toBe("text-destructive");
    expect(cacheHitRateColorClass(40)).toBe("text-destructive");
    expect(cacheHitRateColorClass(CACHE_HIT_RATE_PASS - 0.1)).toBe("text-destructive");
    expect(cacheHitRateColorClass(49.9)).toBe("text-destructive");
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
