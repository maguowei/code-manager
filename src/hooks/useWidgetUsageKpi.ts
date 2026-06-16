import { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "../ipc";
import { isTauri } from "../types";
import useTauriEvent from "./useTauriEvent";
import { createTodayUsageFilter } from "./useUsage";

/** 浮窗展示用的今日用量 KPI 派生值。 */
export interface WidgetUsageKpi {
  /** 今日总花费（USD）。 */
  cost: number;
  /** 今日输入/输出/缓存四类 token 之和。 */
  totalTokens: number;
  /** 缓存命中率百分比（0-100）。 */
  cacheHitRate: number;
  /** 今日消息数。 */
  messages: number;
  /** 今日活跃会话数。 */
  sessions: number;
  /** 今日花费最高的模型名（无数据时为 null）。 */
  topModel: string | null;
}

interface UseWidgetUsageKpiResult {
  kpi: WidgetUsageKpi | null;
  loading: boolean;
}

// 与 useUsage 一致的事件防抖窗口，避免 watcher 高频触发时重复请求
const POLL_DEBOUNCE_MS = 800;

const EMPTY_KPI: WidgetUsageKpi = {
  cost: 0,
  totalTokens: 0,
  cacheHitRate: 0,
  messages: 0,
  sessions: 0,
  topModel: null,
};

/**
 * 浮窗专用轻量数据 hook：仅拉取今日维度的 KPI，并订阅 usage 事件自动刷新。
 * 复用 get_usage_snapshot（今日 filter），从 summary（+ models 取 topModel）派生指标，
 * 不持有 useUsage 的 tab/filter/granularity 等浮窗用不到的状态。
 */
export function useWidgetUsageKpi(): UseWidgetUsageKpiResult {
  const [kpi, setKpi] = useState<WidgetUsageKpi | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  const reload = useCallback(async () => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    try {
      // 今日单日范围按小时粒度拉取，summary 已是今日聚合
      const snapshot = await ipc.getUsageSnapshot(createTodayUsageFilter(new Date()), "hour");
      if (requestSeq !== requestSeqRef.current) return;
      const s = snapshot.summary;
      const inputTotal = s.totalInput + s.totalCacheCreation + s.totalCacheRead;
      // models 已按成本倒序聚合，首项即今日花费最高的模型
      const topModel = snapshot.models[0]?.model ?? null;
      setKpi({
        cost: s.totalCost,
        totalTokens: s.totalInput + s.totalOutput + s.totalCacheCreation + s.totalCacheRead,
        cacheHitRate: inputTotal > 0 ? (s.totalCacheRead / inputTotal) * 100 : 0,
        messages: s.totalMessages,
        sessions: s.totalSessions,
        topModel,
      });
    } catch {
      if (requestSeq !== requestSeqRef.current) return;
      // 浮窗无 Toast 入口，失败时回落空 KPI 保持窗口可读
      setKpi((prev) => prev ?? EMPTY_KPI);
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // watcher 增量事件：debounce 后重查（与 useUsage 同窗口）
  const scheduleReload = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void reload();
    }, POLL_DEBOUNCE_MS);
  }, [reload]);

  useTauriEvent<unknown>("usage-records-changed", scheduleReload);
  useTauriEvent<unknown>("usage-pricing-updated", scheduleReload);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { kpi, loading };
}

export default useWidgetUsageKpi;
