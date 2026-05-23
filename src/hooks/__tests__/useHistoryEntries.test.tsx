import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryResult } from "@/history-utils";
import { enableTauriEnv } from "@/test/tauri-mock";
import type { HistoryEntry } from "@/types";
import { useHistoryEntries } from "../useHistoryEntries";

const { invokeMock, showToastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
  showToastMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("../useToast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

function makeEntry(sessionId: string, timestamp: number, text = "hi"): HistoryEntry {
  return {
    project: "/p",
    sessionId,
    timestamp,
    role: "user",
    text,
  } as unknown as HistoryEntry;
}

function jsonlOf(entries: HistoryEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n");
}

async function waitForHookExpectation(expectation: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      // 每次重试只提交已完成的异步更新；等待次数由 vi.waitFor 控制。
      await Promise.resolve();
    });
    expectation();
  });
}

async function advancePollingInterval() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.resolve();
  });
}

describe("useHistoryEntries", () => {
  let restoreTauri: () => void;

  beforeEach(() => {
    invokeMock.mockReset();
    showToastMock.mockReset();
    restoreTauri = enableTauriEnv();
    // 还原默认可见性，避免上一个用例的 hidden 状态泄漏
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(() => {
    restoreTauri();
    vi.useRealTimers();
  });

  it("非 Tauri 环境下不调用 invoke，loading 立刻变为 false", async () => {
    restoreTauri();
    restoreTauri = () => undefined;

    const { result } = renderHook(() => useHistoryEntries("加载失败"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("初次加载完成后填充 entries 并把 loading 置 false", async () => {
    const payload: HistoryResult = {
      mtime: 100,
      content: jsonlOf([makeEntry("s1", 1)]),
    };
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_history") return payload;
      return null;
    });

    const { result } = renderHook(() => useHistoryEntries("加载失败"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].sessionId).toBe("s1");
  });

  it("初次加载失败时通过 toast 反馈，不静默吞错", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_history") throw new Error("permission denied");
      return null;
    });

    renderHook(() => useHistoryEntries("加载失败"));

    await waitFor(() => expect(showToastMock).toHaveBeenCalled());
    // 第一个参数是 toast 标题，包含传入的错误前缀
    expect(showToastMock.mock.calls[0]?.[0]).toContain("加载失败");
  });

  it("reloadHistory 支持 suppressErrorToast 抑制错误提示", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_history") throw new Error("boom");
      return null;
    });

    const { result } = renderHook(() => useHistoryEntries("加载失败"));

    // 等首次失败的 toast 出现，确保不是没调用 reload
    await waitFor(() => expect(showToastMock).toHaveBeenCalledTimes(1));
    showToastMock.mockClear();

    let reloadError: unknown;
    await act(async () => {
      try {
        await result.current.reloadHistory({ suppressErrorToast: true });
      } catch (error) {
        reloadError = error;
      }
    });

    expect(reloadError).toBeInstanceOf(Error);
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it("轮询发现新数据时更新 entries", async () => {
    vi.useFakeTimers();

    const initial: HistoryResult = {
      mtime: 100,
      content: jsonlOf([makeEntry("s1", 1)]),
    };
    const next: HistoryResult = {
      mtime: 200,
      content: jsonlOf([makeEntry("s1", 1), makeEntry("s2", 2)]),
    };

    invokeMock.mockImplementation(async (command) => {
      if (command === "get_history") return initial;
      if (command === "get_history_if_changed") return next;
      return null;
    });

    const { result } = renderHook(() => useHistoryEntries("加载失败"));

    // 等初次加载完成；fake timers 下 microtask 仍走，需要让 react state 更新
    await waitForHookExpectation(() => expect(result.current.loading).toBe(false));
    expect(result.current.loading).toBe(false);
    expect(result.current.entries).toHaveLength(1);

    // 推进 5s 轮询一次
    await advancePollingInterval();

    expect(result.current.entries).toHaveLength(2);
  });

  it("轮询发现条目数与末尾时间戳都未变时复用旧 entries 引用", async () => {
    vi.useFakeTimers();

    const initial: HistoryResult = {
      mtime: 100,
      content: jsonlOf([makeEntry("s1", 1)]),
    };
    const sameLogical: HistoryResult = {
      mtime: 200, // mtime 变了，但条目数与末尾时间戳没变
      content: jsonlOf([makeEntry("s1", 1)]),
    };

    invokeMock.mockImplementation(async (command) => {
      if (command === "get_history") return initial;
      if (command === "get_history_if_changed") return sameLogical;
      return null;
    });

    const { result } = renderHook(() => useHistoryEntries("加载失败"));
    await waitForHookExpectation(() => expect(result.current.loading).toBe(false));
    expect(result.current.loading).toBe(false);
    const before = result.current.entries;

    await advancePollingInterval();

    // 引用相等说明没触发整页 rerender
    expect(result.current.entries).toBe(before);
  });

  it("轮询失败时静默吞错，不打扰用户", async () => {
    vi.useFakeTimers();

    invokeMock.mockImplementation(async (command) => {
      if (command === "get_history") {
        return { mtime: 1, content: "" } satisfies HistoryResult;
      }
      if (command === "get_history_if_changed") throw new Error("timeout");
      return null;
    });

    renderHook(() => useHistoryEntries("加载失败"));
    await waitForHookExpectation(() => expect(invokeMock).toHaveBeenCalledWith("get_history"));
    expect(invokeMock).toHaveBeenCalledWith("get_history");
    showToastMock.mockClear();

    await advancePollingInterval();

    expect(showToastMock).not.toHaveBeenCalled();
  });
});
