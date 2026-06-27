import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TranslationKey } from "../../i18n";
import type { SessionUsageDetail } from "../../types";
import { SessionKpiBar } from "../SessionKpiBar";

const t = (k: TranslationKey) => k as string;

const usage = {
  session: {
    sessionId: "s1",
    projectPath: "/p",
    projectDir: "p",
    startedAtMs: 1_000,
    lastActiveMs: 61_000,
    messages: 4,
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 200,
    cacheReadTokens: 1000,
    cost: 0.1234,
    models: ["claude-opus-4-8"],
  },
  messages: [],
} as unknown as SessionUsageDetail;

describe("SessionKpiBar", () => {
  it("展示成本、token、hook 错误数", () => {
    // Token 口径含 cache：100+50+200+1000 = 1350 → formatTokens 输出 "1.4K"（保留 1 位小数）
    // hookErrorCount 用 9 避免与成本 "$0.12" 或 Token "1.4K" 产生 getByText 碰撞
    render(<SessionKpiBar usage={usage} hookErrorCount={9} t={t} />);
    expect(screen.getByText(/\$0\.12/)).toBeInTheDocument();
    expect(screen.getByText(/1\.4K/)).toBeInTheDocument();
    expect(screen.getByText(/9/)).toBeInTheDocument();
  });

  it("usage 为 null 时不崩溃", () => {
    render(<SessionKpiBar usage={null} hookErrorCount={0} t={t} />);
    expect(screen.getByText(/history\.kpiCost/)).toBeInTheDocument();
  });
});
