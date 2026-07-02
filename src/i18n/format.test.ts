import { describe, expect, it } from "vitest";
import {
  compareLocalized,
  formatCompactNumber,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatUsd,
  localeForLanguage,
} from "./format";

describe("locale formatters", () => {
  it("maps supported languages to explicit BCP-47 locales", () => {
    expect(localeForLanguage("zh")).toBe("zh-CN");
    expect(localeForLanguage("en")).toBe("en-US");
  });

  it("formats numbers and percentages with the selected UI language", () => {
    expect(formatNumber(1234.5, "en")).toBe(new Intl.NumberFormat("en-US").format(1234.5));
    expect(formatNumber(1234.5, "zh")).toBe(new Intl.NumberFormat("zh-CN").format(1234.5));
    expect(formatPercent(12.5, "en")).toBe(
      new Intl.NumberFormat("en-US", {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(0.125),
    );
  });

  it("keeps the product K/M/B convention across UI languages", () => {
    expect(formatCompactNumber(10_000, "zh")).toBe("10K");
    expect(formatCompactNumber(2_500_000, "en")).toBe("2.5M");
    expect(formatCompactNumber(3_400_000_000, "zh")).toBe("3.4B");
  });

  it("formats USD and dates using Intl instead of manual punctuation", () => {
    expect(formatUsd(12.34, "en")).toBe(
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(12.34),
    );
    expect(formatDateTime(Date.UTC(2026, 4, 23, 9, 30), "zh")).toBe(
      new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(Date.UTC(2026, 4, 23, 9, 30)),
    );
  });

  it("uses an Intl collator for user-visible sorting", () => {
    expect(compareLocalized("a", "B", "en")).toBeLessThan(0);
  });
});
