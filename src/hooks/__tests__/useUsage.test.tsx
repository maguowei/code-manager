import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DailyUsage,
  ModelUsageStat,
  ProjectUsage,
  SessionUsage,
  UsageSummary,
  UsageTimeSeriesPoint,
} from "../../types";
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

interface UsageBatch {
  summary: Deferred<UsageSummary>;
  daily: Deferred<DailyUsage[]>;
  timeSeries: Deferred<UsageTimeSeriesPoint[]>;
  projects: Deferred<ProjectUsage[]>;
  sessions: Deferred<SessionUsage[]>;
  models: Deferred<ModelUsageStat[]>;
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

function makeBatch(): UsageBatch {
  return {
    summary: deferred<UsageSummary>(),
    daily: deferred<DailyUsage[]>(),
    timeSeries: deferred<UsageTimeSeriesPoint[]>(),
    projects: deferred<ProjectUsage[]>(),
    sessions: deferred<SessionUsage[]>(),
    models: deferred<ModelUsageStat[]>(),
  };
}

function resolveBatch(batch: UsageBatch, date: string, cost: number) {
  batch.summary.resolve(makeSummary(cost));
  batch.daily.resolve([makeDaily(date, cost)]);
  batch.timeSeries.resolve([
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
  ]);
  batch.projects.resolve([]);
  batch.sessions.resolve([]);
  batch.models.resolve([]);
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

  it("uses today as the default date filter", async () => {
    invokeMock.mockResolvedValue([]);

    render(<UsageProbe />);

    const today = formatDateInputValue(new Date());
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(6));
    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_usage_summary", {
      filter: { startDate: today, endDate: today },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "get_usage_time_series", {
      filter: { startDate: today, endDate: today },
      granularity: "hour",
    });
  });

  it("ignores stale reload responses when date filters change quickly", async () => {
    const batches = [makeBatch(), makeBatch()];
    let callIndex = 0;
    invokeMock.mockImplementation((command) => {
      const batch = batches[Math.floor(callIndex / 6)];
      callIndex += 1;
      if (!batch) return Promise.reject(new Error(`unexpected usage call: ${command}`));

      if (command === "get_usage_summary") return batch.summary.promise;
      if (command === "get_usage_daily") return batch.daily.promise;
      if (command === "get_usage_time_series") return batch.timeSeries.promise;
      if (command === "get_usage_by_project") return batch.projects.promise;
      if (command === "get_usage_by_session") return batch.sessions.promise;
      if (command === "get_usage_by_model") return batch.models.promise;
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });

    render(<UsageProbe />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(6));

    fireDateFilter();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(12));
    expect(invokeMock).toHaveBeenNthCalledWith(7, "get_usage_summary", {
      filter: { startDate: "2026-05-04", endDate: "2026-05-04" },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(9, "get_usage_time_series", {
      filter: { startDate: "2026-05-04", endDate: "2026-05-04" },
      granularity: "hour",
    });

    await act(async () => {
      resolveBatch(batches[1], "2026-05-04", 2);
      await flushPromises();
    });
    expect(screen.getByTestId("daily-date")).toHaveTextContent("2026-05-04");
    expect(screen.getByTestId("total-cost")).toHaveTextContent("2");

    await act(async () => {
      resolveBatch(batches[0], "2026-04-01", 1);
      await flushPromises();
    });
    expect(screen.getByTestId("daily-date")).toHaveTextContent("2026-05-04");
    expect(screen.getByTestId("total-cost")).toHaveTextContent("2");
  });

  it("uses day buckets for multi-day filters and preserves manual granularity until filters change", async () => {
    invokeMock.mockResolvedValue([]);

    render(<UsageProbe />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(6));

    fireMultiDayFilter();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(12));
    expect(invokeMock).toHaveBeenNthCalledWith(9, "get_usage_time_series", {
      filter: { startDate: "2026-05-01", endDate: "2026-05-31" },
      granularity: "day",
    });

    fireFiveMinuteGranularity();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(18));
    expect(invokeMock).toHaveBeenNthCalledWith(15, "get_usage_time_series", {
      filter: { startDate: "2026-05-01", endDate: "2026-05-31" },
      granularity: "fiveMinute",
    });

    fireDateFilter();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(24));
    expect(invokeMock).toHaveBeenNthCalledWith(21, "get_usage_time_series", {
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
