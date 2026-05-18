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
      <span data-testid="daily-date">{usage.daily.map((d) => d.date).join(",")}</span>
      <span data-testid="total-cost">{usage.summary?.totalCost ?? 0}</span>
      <span data-testid="granularity">{usage.timeGranularity}</span>
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
