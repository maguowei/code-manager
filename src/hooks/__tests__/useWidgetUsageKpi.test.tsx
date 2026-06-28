import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableTauriEnv } from "@/test/tauri-mock";
import type { UsageSnapshot } from "../../types";
import { useWidgetUsageKpi } from "../useWidgetUsageKpi";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
  listenMock:
    vi.fn<(event: string, handler: (e: { payload: unknown }) => void) => Promise<() => void>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

function makeSnapshot(date: string, cost: number): UsageSnapshot {
  return {
    summary: {
      totalMessages: 1,
      totalSessions: 1,
      totalProjects: 1,
      totalInput: 10,
      totalOutput: 5,
      totalCacheCreation: 3,
      totalCacheRead: 2,
      totalWebSearchRequests: 0,
      totalWebFetchRequests: 0,
      totalCost: cost,
      lastScanMs: Date.UTC(2026, 5, 25, 16, 0),
      pricing: {
        source: "builtin",
        fetchedAtMs: null,
        models: {},
      },
      thirdPartyProviderPricingEnabled: true,
      unknownModels: [],
      allProjects: [],
      allModels: [],
    },
    daily: [
      {
        date,
        messages: 1,
        sessions: 1,
        inputTokens: 10,
        outputTokens: 5,
        cacheCreationTokens: 3,
        cacheReadTokens: 2,
        webSearchRequests: 0,
        webFetchRequests: 0,
        cost,
        byModel: [],
      },
    ],
    timeSeries: [],
    projects: [],
    sessions: [],
    models: [
      {
        model: "claude-sonnet-4",
        messages: 1,
        inputTokens: 10,
        outputTokens: 5,
        cacheCreationTokens: 3,
        cacheReadTokens: 2,
        webSearchRequests: 0,
        webFetchRequests: 0,
        cost,
      },
    ],
  };
}

function mockUsageSnapshotsByRequestedDate() {
  invokeMock.mockImplementation(async (command, args) => {
    if (command !== "get_usage_snapshot") {
      throw new Error(`unexpected command: ${command}`);
    }
    const filter = (args as { filter: { startDate: string } }).filter;
    const date = filter.startDate;
    return makeSnapshot(date, date === "2026-06-26" ? 26 : 25);
  });
}

async function flushReactUpdates() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waitForInvokeCount(count: number) {
  await vi.waitFor(async () => {
    await flushReactUpdates();
    expect(invokeMock).toHaveBeenCalledTimes(count);
  });
}

function expectUsageSnapshotCall(callNumber: number, date: string) {
  expect(invokeMock).toHaveBeenNthCalledWith(callNumber, "get_usage_snapshot", {
    filter: { startDate: date, endDate: date },
    granularity: "hour",
  });
}

describe("useWidgetUsageKpi", () => {
  let restoreTauri: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset();
    listenMock.mockReset();
    listenMock.mockResolvedValue(() => undefined);
    restoreTauri = enableTauriEnv();
  });

  afterEach(() => {
    restoreTauri();
    vi.useRealTimers();
  });

  it("refreshes the widget KPI after local midnight even when usage events are quiet", async () => {
    vi.setSystemTime(new Date(2026, 5, 25, 23, 59, 30));
    mockUsageSnapshotsByRequestedDate();

    const { result } = renderHook(() => useWidgetUsageKpi());

    await waitForInvokeCount(1);
    expectUsageSnapshotCall(1, "2026-06-25");
    expect(result.current.kpi?.cost).toBe(25);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
      await Promise.resolve();
    });

    await waitForInvokeCount(2);
    expectUsageSnapshotCall(2, "2026-06-26");
    expect(result.current.kpi?.cost).toBe(26);
  });

  it("refreshes after waking past midnight when the widget window regains focus", async () => {
    vi.setSystemTime(new Date(2026, 5, 25, 23, 59, 30));
    mockUsageSnapshotsByRequestedDate();

    const { result } = renderHook(() => useWidgetUsageKpi());

    await waitForInvokeCount(1);
    expectUsageSnapshotCall(1, "2026-06-25");
    expect(result.current.kpi?.cost).toBe(25);

    vi.setSystemTime(new Date(2026, 5, 26, 8, 0, 0));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    await waitForInvokeCount(2);
    expectUsageSnapshotCall(2, "2026-06-26");
    expect(result.current.kpi?.cost).toBe(26);
  });

  it("derives a zero cache hit rate and null top model when today has no cached or model usage", async () => {
    vi.setSystemTime(new Date(2026, 5, 25, 12, 0, 0));
    invokeMock.mockImplementation(async (command) => {
      if (command !== "get_usage_snapshot") {
        throw new Error(`unexpected command: ${command}`);
      }
      const snapshot = makeSnapshot("2026-06-25", 0);
      snapshot.summary.totalInput = 0;
      snapshot.summary.totalOutput = 0;
      snapshot.summary.totalCacheCreation = 0;
      snapshot.summary.totalCacheRead = 0;
      snapshot.models = [];
      return snapshot;
    });

    const { result } = renderHook(() => useWidgetUsageKpi());

    await waitForInvokeCount(1);
    expect(result.current.kpi?.cacheHitRate).toBe(0);
    expect(result.current.kpi?.totalTokens).toBe(0);
    expect(result.current.kpi?.topModel).toBeNull();
  });

  it("re-checks the usage date only when the widget becomes visible", async () => {
    vi.setSystemTime(new Date(2026, 5, 25, 23, 59, 30));
    mockUsageSnapshotsByRequestedDate();

    const { result } = renderHook(() => useWidgetUsageKpi());

    await waitForInvokeCount(1);
    expectUsageSnapshotCall(1, "2026-06-25");
    expect(result.current.kpi?.cost).toBe(25);

    // 仍隐藏时的可见性事件不应触发请求
    vi.setSystemTime(new Date(2026, 5, 26, 8, 0, 0));
    await act(async () => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);

    // 恢复可见且已跨日，应基于新日期重新拉取
    await act(async () => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    await waitForInvokeCount(2);
    expectUsageSnapshotCall(2, "2026-06-26");
    expect(result.current.kpi?.cost).toBe(26);
  });

  it("retries the new day on focus when the midnight refresh fails", async () => {
    vi.setSystemTime(new Date(2026, 5, 25, 23, 59, 30));
    // 新一天的首个请求失败一次，模拟午夜瞬时 IPC 错误
    let failNewDayOnce = true;
    invokeMock.mockImplementation(async (command, args) => {
      if (command !== "get_usage_snapshot") {
        throw new Error(`unexpected command: ${command}`);
      }
      const date = (args as { filter: { startDate: string } }).filter.startDate;
      if (date === "2026-06-26" && failNewDayOnce) {
        failNewDayOnce = false;
        throw new Error("transient IPC failure");
      }
      return makeSnapshot(date, date === "2026-06-26" ? 26 : 25);
    });

    const { result } = renderHook(() => useWidgetUsageKpi());

    await waitForInvokeCount(1);
    expectUsageSnapshotCall(1, "2026-06-25");
    expect(result.current.kpi?.cost).toBe(25);

    // 跨过本地午夜：边界计时器请求新一天，但首个请求失败，应保留昨日数据
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
      await Promise.resolve();
    });

    await waitForInvokeCount(2);
    expectUsageSnapshotCall(2, "2026-06-26");
    expect(result.current.kpi?.cost).toBe(25);

    // 失败未把 06-26 记为已加载，窗口重新获得焦点时应再次重试并恢复新一天数据
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    await waitForInvokeCount(3);
    expectUsageSnapshotCall(3, "2026-06-26");
    expect(result.current.kpi?.cost).toBe(26);
  });
});
