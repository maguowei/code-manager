import { describe, expect, it, vi } from "vitest";
import { setActiveFormatLanguage } from "../../i18n/format";
import {
  formatCost,
  formatCount,
  formatDateTime,
  formatPercent,
  formatPricePerMillion,
  formatShortDateTime,
  formatTokens,
  pricingSourceLabel,
  projectDisplayName,
  shortPath,
  shortSessionId,
  todayIso,
} from "../usage/format";

const t = (key: string) => key;

describe("usage format helpers", () => {
  it("formats token and cost magnitudes across boundary values", () => {
    setActiveFormatLanguage("en");
    expect(formatTokens(Number.NaN)).toBe("0");
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1_200)).toBe("1.2K");
    expect(formatTokens(2_500_000)).toBe("2.5M");
    expect(formatTokens(3_400_000_000)).toBe("3.4B");

    expect(formatCost(Number.NaN)).toBe("$0.00");
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.005)).toBe("<$0.01");
    expect(formatCost(12.345)).toBe("$12.35");
    expect(formatCost(1500.49)).toBe("$1,500");
  });

  it("formats price, date, path, session, and pricing source labels", () => {
    setActiveFormatLanguage("en");
    expect(formatPricePerMillion(Number.NaN)).toBe("$0");
    expect(formatPricePerMillion(0)).toBe("$0");
    expect(formatPricePerMillion(1.234)).toBe("$1.23");
    expect(formatPricePerMillion(0.0012)).toBe("$0.0012");
    expect(formatPricePerMillion(0.00001)).toBe("<$0.0001");

    expect(formatDateTime(0)).toBe("-");
    expect(formatDateTime(Date.UTC(2026, 4, 23, 9, 30))).not.toBe("-");
    expect(formatShortDateTime(0)).toBe("-");
    expect(formatShortDateTime(Date.UTC(2026, 4, 23, 9, 30))).not.toBe("-");

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 23, 12, 0, 0));
    expect(todayIso()).toBe("2026-05-23");
    vi.useRealTimers();

    expect(formatCount(0)).toBe("0");
    expect(formatCount(12_345)).toBe("12,345");
    expect(formatPercent(Number.NaN)).toBe("0%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(88)).toBe("88.0%");

    expect(shortPath("")).toBe("-");
    // 仅含分隔符：split 后无有效段，回退原字符串
    expect(shortPath("///")).toBe("///");
    expect(shortPath("/Users/me/project")).toBe("project");
    expect(shortPath("C:\\Users\\me\\project")).toBe("project");
    expect(projectDisplayName("/encoded-project", "")).toBe("/encoded-project");
    expect(projectDisplayName("  ", "")).toBe("-");
    expect(projectDisplayName("/encoded-project", "/Users/me/project")).toBe("project");
    expect(shortSessionId("12345678")).toBe("12345678");
    expect(shortSessionId("1234567890")).toBe("12345678");

    expect(pricingSourceLabel("network", t)).toBe("usage.pricing.network");
    expect(pricingSourceLabel("cache", t)).toBe("usage.pricing.cache");
    expect(pricingSourceLabel("builtin", t)).toBe("usage.pricing.builtin");
  });

  it("follows the active UI language for compact numbers and dates", () => {
    setActiveFormatLanguage("en");
    const englishDate = formatDateTime(Date.UTC(2026, 4, 23, 9, 30));
    expect(formatTokens(10_000)).toBe("10K");

    setActiveFormatLanguage("zh");
    expect(formatTokens(10_000)).toBe("10K");
    expect(formatDateTime(Date.UTC(2026, 4, 23, 9, 30))).not.toBe(englishDate);

    setActiveFormatLanguage("en");
  });
});
