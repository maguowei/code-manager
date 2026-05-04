import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DailyUsage,
  isTauri,
  type ModelUsageStat,
  type ProjectUsage,
  type SessionUsage,
  type UsageFilter,
  type UsageSummary,
  type UsageTab,
  type UsageTimeGranularity,
  type UsageTimeSeriesPoint,
} from "../types";
import useTauriEvent from "./useTauriEvent";

interface UseUsageResult {
  summary: UsageSummary | null;
  daily: DailyUsage[];
  timeSeries: UsageTimeSeriesPoint[];
  timeGranularity: UsageTimeGranularity;
  setTimeGranularity: (next: UsageTimeGranularity) => void;
  projects: ProjectUsage[];
  sessions: SessionUsage[];
  models: ModelUsageStat[];
  tab: UsageTab;
  setTab: (t: UsageTab) => void;
  filter: UsageFilter;
  setFilter: (next: UsageFilter | ((prev: UsageFilter) => UsageFilter)) => void;
  loading: boolean;
  refreshingPrice: boolean;
  rescanning: boolean;
  reload: () => Promise<void>;
  refreshPricing: () => Promise<void>;
  rescan: () => Promise<void>;
  error: string | null;
}

const POLL_DEBOUNCE_MS = 800;

export function createTodayUsageFilter(today = new Date()): UsageFilter {
  const value = formatDateInputValue(today);
  return { startDate: value, endDate: value };
}

export function getDefaultUsageTimeGranularity(filter: UsageFilter): UsageTimeGranularity {
  return filter.startDate && filter.endDate && filter.startDate === filter.endDate ? "hour" : "day";
}

export function useUsage(): UseUsageResult {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [daily, setDaily] = useState<DailyUsage[]>([]);
  const [timeSeries, setTimeSeries] = useState<UsageTimeSeriesPoint[]>([]);
  const [projects, setProjects] = useState<ProjectUsage[]>([]);
  const [sessions, setSessions] = useState<SessionUsage[]>([]);
  const [models, setModels] = useState<ModelUsageStat[]>([]);
  const [tab, setTab] = useState<UsageTab>("daily");
  const [filter, setFilterState] = useState<UsageFilter>(() => createTodayUsageFilter());
  const [manualTimeGranularity, setManualTimeGranularity] = useState<UsageTimeGranularity | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshingPrice, setRefreshingPrice] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filterRef = useRef(filter);
  filterRef.current = filter;
  const timeGranularity = manualTimeGranularity ?? getDefaultUsageTimeGranularity(filter);
  const timeGranularityRef = useRef(timeGranularity);
  timeGranularityRef.current = timeGranularity;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  const setFilter = useCallback((next: UsageFilter | ((prev: UsageFilter) => UsageFilter)) => {
    setManualTimeGranularity(null);
    setFilterState(next);
  }, []);

  const setTimeGranularity = useCallback((next: UsageTimeGranularity) => {
    setManualTimeGranularity(next);
  }, []);

  // 用 currentFilter 显式参数，避免在 useEffect deps 里隐式追加 filter
  const reloadWith = useCallback(
    async (currentFilter: UsageFilter, granularity: UsageTimeGranularity) => {
      if (!isTauri()) {
        setLoading(false);
        return;
      }
      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      setLoading(true);
      try {
        const [s, d, series, p, sess, m] = await Promise.all([
          invoke<UsageSummary>("get_usage_summary", { filter: currentFilter }),
          invoke<DailyUsage[]>("get_usage_daily", { filter: currentFilter }),
          invoke<UsageTimeSeriesPoint[]>("get_usage_time_series", {
            filter: currentFilter,
            granularity,
          }),
          invoke<ProjectUsage[]>("get_usage_by_project", { filter: currentFilter }),
          invoke<SessionUsage[]>("get_usage_by_session", { filter: currentFilter }),
          invoke<ModelUsageStat[]>("get_usage_by_model", { filter: currentFilter }),
        ]);
        if (requestSeq !== requestSeqRef.current) return;
        setSummary(s);
        setDaily(d);
        setTimeSeries(series);
        setProjects(p);
        setSessions(sess);
        setModels(m);
        setError(null);
      } catch (e) {
        if (requestSeq !== requestSeqRef.current) return;
        setError(typeof e === "string" ? e : String(e));
      } finally {
        if (requestSeq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  // 对外暴露的 reload：使用最新 filter（来自 ref）
  const reload = useCallback(
    () => reloadWith(filterRef.current, timeGranularityRef.current),
    [reloadWith],
  );

  // filter 或图表时间粒度变化 → 重新查询
  useEffect(() => {
    void reloadWith(filter, timeGranularity);
  }, [filter, timeGranularity, reloadWith]);

  // watcher 增量事件：debounce 后用最新 filter 重查
  const scheduleReload = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void reloadWith(filterRef.current, timeGranularityRef.current);
    }, POLL_DEBOUNCE_MS);
  }, [reloadWith]);

  useTauriEvent<unknown>("usage-records-changed", scheduleReload);
  useTauriEvent<unknown>("usage-pricing-updated", scheduleReload);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const refreshPricing = useCallback(async () => {
    if (!isTauri()) return;
    setRefreshingPrice(true);
    try {
      await invoke("refresh_usage_pricing");
      await reloadWith(filterRef.current, timeGranularityRef.current);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
      throw e;
    } finally {
      setRefreshingPrice(false);
    }
  }, [reloadWith]);

  const rescan = useCallback(async () => {
    if (!isTauri()) return;
    setRescanning(true);
    try {
      await invoke("rescan_usage");
      await reloadWith(filterRef.current, timeGranularityRef.current);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
      throw e;
    } finally {
      setRescanning(false);
    }
  }, [reloadWith]);

  return {
    summary,
    daily,
    timeSeries,
    timeGranularity,
    setTimeGranularity,
    projects,
    sessions,
    models,
    tab,
    setTab,
    filter,
    setFilter,
    loading,
    refreshingPrice,
    rescanning,
    reload,
    refreshPricing,
    rescan,
    error,
  };
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default useUsage;
