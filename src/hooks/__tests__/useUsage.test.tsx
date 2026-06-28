import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyUsage, UsageSnapshot, UsageSummary } from "../../types";
import useUsage from "../useUsage";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeSummary(totalCost: number): UsageSummary {
  return {
    totalMessages: 1,
    totalSessions: 1,
    totalProjects: 1,
    totalInput: 1,
    totalOutput: 1,
    totalCacheCreation: 0,
    totalCacheRead: 0,
    totalWebSearchRequests: 0,
    totalWebFetchRequests: 0,
    totalCost,
    lastScanMs: Date.UTC(2026, 4, 4, 10, 0),
    pricing: {
      source: "builtin",
      fetchedAtMs: null,
      models: {},
    },
    thirdPartyProviderPricingEnabled: true,
    unknownModels: [],
    allProjects: [],
    allModels: [],
  };
}

function makeDaily(date: string, cost: number): DailyUsage {
  return {
    date,
    messages: 1,
    sessions: 1,
    inputTokens: 1,
    outputTokens: 1,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    webSearchRequests: 0,
    webFetchRequests: 0,
    cost,
    byModel: [],
  };
}

function makeSnapshot(date: string, cost: number): UsageSnapshot {
  return {
    summary: makeSummary(cost),
    daily: [makeDaily(date, cost)],
    timeSeries: [
      {
        bucket: `${date} 10:00`,
        bucketStartMs: Date.UTC(2026, 4, 4, 10, 0),
        messages: 1,
        sessions: 1,
        inputTokens: 1,
        outputTokens: 1,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        webSearchRequests: 0,
        webFetchRequests: 0,
        cost,
        inputCost: cost / 2,
        outputCost: cost / 2,
        cacheCreationCost: 0,
        cacheReadCost: 0,
        byModel: [],
      },
    ],
    projects: [],
    sessions: [],
    models: [],
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("useUsage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses today as the default date filter and single snapshot invoke", async () => {
    invokeMock.mockResolvedValue(makeSnapshot(formatDateInputValue(new Date()), 0));

    render(<UsageProbe />);

    const today = formatDateInputValue(new Date());
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_usage_snapshot", {
      filter: { startDate: today, endDate: today },
      granularity: "hour",
    });
  });

  it("ignores stale reload responses when date filters change quickly", async () => {
    const snapshots = [deferred<UsageSnapshot>(), deferred<UsageSnapshot>()];
    let callIndex = 0;
    invokeMock.mockImplementation((command) => {
      const slot = snapshots[callIndex];
      callIndex += 1;
      if (command === "get_usage_snapshot" && slot) return slot.promise;
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<UsageProbe />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    fireDateFilter();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock).toHaveBeenNthCalledWith(2, "get_usage_snapshot", {
      filter: { startDate: "2026-05-04", endDate: "2026-05-04" },
      granularity: "hour",
    });

    // 后发起的请求先回，应被采用
    await act(async () => {
      snapshots[1].resolve(makeSnapshot("2026-05-04", 2));
      await flushPromises();
    });
    expect(screen.getByTestId("daily-date")).toHaveTextContent("2026-05-04");
    expect(screen.getByTestId("total-cost")).toHaveTextContent("2");

    // 先发起的请求后回，必须被丢弃
    await act(async () => {
      snapshots[0].resolve(makeSnapshot("2026-04-01", 1));
      await flushPromises();
    });
    expect(screen.getByTestId("daily-date")).toHaveTextContent("2026-05-04");
    expect(screen.getByTestId("total-cost")).toHaveTextContent("2");
  });

  it("uses day buckets for multi-day filters and preserves manual granularity until filters change", async () => {
    invokeMock.mockResolvedValue(makeSnapshot("2026-05-04", 0));

    render(<UsageProbe />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    fireMultiDayFilter();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock).toHaveBeenNthCalledWith(2, "get_usage_snapshot", {
      filter: { startDate: "2026-05-01", endDate: "2026-05-31" },
      granularity: "day",
    });

    fireFiveMinuteGranularity();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(3));
    expect(invokeMock).toHaveBeenNthCalledWith(3, "get_usage_snapshot", {
      filter: { startDate: "2026-05-01", endDate: "2026-05-31" },
      granularity: "fiveMinute",
    });

    fireDateFilter();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(4));
    expect(invokeMock).toHaveBeenNthCalledWith(4, "get_usage_snapshot", {
      filter: { startDate: "2026-05-04", endDate: "2026-05-04" },
      granularity: "hour",
    });
  });

  it("refreshes pricing then reloads the snapshot, and surfaces refresh failures", async () => {
    invokeMock.mockImplementation((command) => {
      if (command === "get_usage_snapshot") return Promise.resolve(makeSnapshot("2026-05-04", 0));
      if (command === "refresh_usage_pricing") return Promise.resolve({});
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<UsageProbe />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    // 成功路径：刷新价格后再次拉取快照
    act(() => {
      screen.getByRole("button", { name: "refresh-pricing" }).click();
    });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("refresh_usage_pricing"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId("error")).toHaveTextContent("");

    // 失败路径：刷新抛错时落到 catch 分支并写入 error
    invokeMock.mockImplementation((command) => {
      if (command === "refresh_usage_pricing")
        return Promise.reject(new Error("pricing source offline"));
      return Promise.resolve(makeSnapshot("2026-05-04", 0));
    });
    act(() => {
      screen.getByRole("button", { name: "refresh-pricing" }).click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent("pricing source offline"),
    );
  });

  it("rescans usage then reloads, and surfaces rescan failures", async () => {
    invokeMock.mockImplementation((command) => {
      if (command === "get_usage_snapshot") return Promise.resolve(makeSnapshot("2026-05-04", 0));
      if (command === "rescan_usage") return Promise.resolve({});
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<UsageProbe />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));

    // 成功路径：重扫后再次拉取快照
    act(() => {
      screen.getByRole("button", { name: "rescan" }).click();
    });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("rescan_usage"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId("error")).toHaveTextContent("");

    // 失败路径：重扫抛错时落到 catch 分支并写入 error
    invokeMock.mockImplementation((command) => {
      if (command === "rescan_usage") return Promise.reject(new Error("rescan crashed"));
      return Promise.resolve(makeSnapshot("2026-05-04", 0));
    });
    act(() => {
      screen.getByRole("button", { name: "rescan" }).click();
    });
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("rescan crashed"));
  });
});

function UsageProbe() {
  const usage = useUsage();
  return (
    <div>
      <button
        type="button"
        onClick={() => usage.setFilter({ startDate: "2026-05-04", endDate: "2026-05-04" })}
      >
        filter
      </button>
      <button
        type="button"
        onClick={() => usage.setFilter({ startDate: "2026-05-01", endDate: "2026-05-31" })}
      >
        multi-day
      </button>
      <button type="button" onClick={() => usage.setTimeGranularity("fiveMinute")}>
        five-minute
      </button>
      <button type="button" onClick={() => void usage.refreshPricing().catch(() => {})}>
        refresh-pricing
      </button>
      <button type="button" onClick={() => void usage.rescan().catch(() => {})}>
        rescan
      </button>
      <span data-testid="daily-date">{usage.daily.map((d) => d.date).join(",")}</span>
      <span data-testid="total-cost">{usage.summary?.totalCost ?? 0}</span>
      <span data-testid="granularity">{usage.timeGranularity}</span>
      <span data-testid="error">{usage.error ?? ""}</span>
    </div>
  );
}

function fireDateFilter() {
  act(() => {
    screen.getByRole("button", { name: "filter" }).click();
  });
}

function fireMultiDayFilter() {
  act(() => {
    screen.getByRole("button", { name: "multi-day" }).click();
  });
}

function fireFiveMinuteGranularity() {
  act(() => {
    screen.getByRole("button", { name: "five-minute" }).click();
  });
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
