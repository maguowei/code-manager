import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { type HistoryResult, parseJsonl } from "../history-utils";
import type { HistoryEntry } from "../types";
import { isTauri } from "../types";
import { useToast } from "./useToast";

const POLL_INTERVAL = 5000;

export function useHistoryEntries(errorMessage: string) {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const mtimeRef = useRef(0);

  const loadHistory = useCallback(async () => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }

    try {
      const result = await invoke<HistoryResult>("get_history");
      mtimeRef.current = result.mtime;
      setEntries(parseJsonl(result.content));
    } catch {
      showToast(errorMessage, "error");
    } finally {
      setLoading(false);
    }
  }, [errorMessage, showToast]);

  const pollHistory = useCallback(async () => {
    if (!isTauri()) return;

    try {
      const result = await invoke<HistoryResult | null>("get_history_if_changed", {
        lastMtime: mtimeRef.current,
      });
      if (!result) return;
      mtimeRef.current = result.mtime;
      const next = parseJsonl(result.content);
      // 仅在条目数或末尾时间戳变化时才更新 state，避免空内容刷新触发整页重渲染
      setEntries((prev) => {
        const prevLast = prev.length > 0 ? prev[prev.length - 1].timestamp : 0;
        const nextLast = next.length > 0 ? next[next.length - 1].timestamp : 0;
        if (prev.length === next.length && prevLast === nextLast) return prev;
        return next;
      });
    } catch {
      // 轮询失败静默忽略
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | undefined;

    const startPolling = () => {
      timerId = setInterval(pollHistory, POLL_INTERVAL);
    };

    const stopPolling = () => {
      if (timerId !== undefined) {
        clearInterval(timerId);
        timerId = undefined;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
        return;
      }
      startPolling();
    };

    if (!document.hidden) startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pollHistory]);

  return { entries, loading };
}
