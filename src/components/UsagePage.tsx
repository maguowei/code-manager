import { type ReactNode, useCallback, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useToast } from "../hooks/useToast";
import useUsage, { createTodayUsageFilter } from "../hooks/useUsage";
import { useI18n } from "../i18n";
import type {
  DailyUsage,
  ModelUsageStat,
  ProjectUsage,
  SessionUsage,
  UsageFilter,
  UsageTab,
  UsageTimeGranularity,
  UsageTimeSeriesPoint,
} from "../types";
import { formatUSD } from "./project-detail-utils";
import "./UsagePage.css";
import { formatCost, formatShortDateTime, formatTokens, projectDisplayName } from "./usage/format";
import SessionUsageDrawer from "./usage/SessionUsageDrawer";

// Recharts 无法读取 CSS 变量，这里使用当前设计令牌对应的稳定色值
const COLORS = {
  blue: "#58a6ff",
  green: "#3fb950",
  orange: "#f78166",
  purple: "#bc8cff",
  red: "#f85149",
  teal: "#39d2c0",
  pink: "#f778ba",
  yellow: "#d29922",
  total: "#f2cc60",
};

const SERIES_COLORS = [
  COLORS.green,
  COLORS.purple,
  COLORS.orange,
  COLORS.blue,
  COLORS.teal,
  COLORS.pink,
  COLORS.yellow,
  COLORS.red,
];

const TICK_STYLE = { fill: "#7d8590", fontSize: 11 };
const TICK_STYLE_SM = { fill: "#7d8590", fontSize: 10 };
const CHART_CURSOR_FILL = "rgba(242, 204, 96, 0.1)";
const TOOLTIP_STYLE = {
  backgroundColor: "rgba(22, 27, 34, 0.94)",
  border: "1px solid #30363d",
  borderRadius: 8,
  color: "#e6edf3",
  backdropFilter: "blur(12px)",
  boxShadow: "0 10px 24px rgba(0, 0, 0, 0.22)",
};

const TAB_ORDER: UsageTab[] = ["daily", "project", "session", "model"];
type DateRangePreset = "today" | "week" | "month" | "year" | "all";
const DATE_RANGE_PRESETS: DateRangePreset[] = ["today", "week", "month", "year", "all"];
type TrendChartStyle = "curve" | "bar";
const TREND_CHART_STYLE_ORDER: TrendChartStyle[] = ["curve", "bar"];
type TrendBreakdownMode = "model" | "type";
const TREND_BREAKDOWN_MODE_ORDER: TrendBreakdownMode[] = ["model", "type"];
const CLAUDE_MODEL_FILTER = "claude-*";
const TOTAL_COST_KEY = "__totalCost";
const TOTAL_TOKEN_KEY = "totalTokens";
const COST_TYPE_KEYS = {
  input: "inputCost",
  output: "outputCost",
  cacheCreate: "cacheCreationCost",
  cacheRead: "cacheReadCost",
} as const;

type SeriesVisibility = Record<string, boolean>;

interface TrendSeriesItem {
  dataKey: string;
  name: string;
  color: string;
  total?: number;
  originalName?: string;
}

interface ModelCostDatum {
  name: string;
  value: number;
  percent: number;
  color: string;
}

interface TimeSeriesTokenTrendDatum extends Record<string, string | number> {
  bucket: string;
  label: string;
  totalTokens: number;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
}

const sortTooltipItemsByValueDesc = (item: { value?: unknown }) => -Number(item.value ?? 0);
const tokenModelDataKey = (model: string) => `model:${encodeURIComponent(model)}`;

function tooltipNumber(value: unknown): number {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const numericValue = Number(rawValue ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function isSeriesVisible(visibility: SeriesVisibility, key: string, totalKey: string) {
  return visibility[key] ?? key === totalKey;
}

function hiddenSeriesSet(keys: string[], visibility: SeriesVisibility, totalKey: string) {
  return new Set(keys.filter((key) => !isSeriesVisible(visibility, key, totalKey)));
}

function defaultOnlyTotalVisibility(keys: string[], totalKey: string) {
  return Object.fromEntries(keys.map((key) => [key, key === totalKey])) as SeriesVisibility;
}

function activeBarStyle(color: string) {
  return { fill: color, fillOpacity: 0.92, stroke: color, strokeWidth: 1.4 };
}

function soloSeriesVisibility(
  keys: string[],
  visibility: SeriesVisibility,
  key: string,
  totalKey: string,
) {
  const allSoloed = keys.every((candidate) =>
    candidate === key
      ? isSeriesVisible(visibility, candidate, totalKey)
      : !isSeriesVisible(visibility, candidate, totalKey),
  );
  if (allSoloed) return defaultOnlyTotalVisibility(keys, totalKey);
  return Object.fromEntries(
    keys.map((candidate) => [candidate, candidate === key]),
  ) as SeriesVisibility;
}

function UsagePage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const u = useUsage();
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  // 图表层级的模型可见性切换；与顶部 Filters.model 单选互不影响、不触发后端
  const [costVisibility, setCostVisibility] = useState<SeriesVisibility>(() => ({}));
  const [tokenVisibility, setTokenVisibility] = useState<SeriesVisibility>(() => ({}));
  const [trendChartStyle, setTrendChartStyle] = useState<TrendChartStyle>("curve");
  const [trendBreakdownMode, setTrendBreakdownMode] = useState<TrendBreakdownMode>("model");

  const handleRefreshPrice = useCallback(async () => {
    try {
      await u.refreshPricing();
      showToast(t("usage.refreshSuccess"));
    } catch {
      showToast(t("usage.refreshError"), "error");
    }
  }, [u, showToast, t]);

  const handleRescan = useCallback(async () => {
    try {
      await u.rescan();
      showToast(t("usage.rescanSuccess"));
    } catch {
      showToast(t("usage.rescanError"), "error");
    }
  }, [u, showToast, t]);

  const updateFilter = useCallback(
    (patch: Partial<UsageFilter>) => {
      u.setFilter((prev) => compactUsageFilter({ ...prev, ...patch }));
    },
    [u],
  );

  const resetFilter = useCallback(() => {
    u.setFilter(createTodayUsageFilter());
  }, [u]);

  const timeSeriesChartData = useMemo(() => {
    const allModels = new Set<string>();
    for (const point of u.timeSeries) {
      for (const m of point.byModel) allModels.add(m.model);
    }
    // 按字母序固定颜色映射，避免数据变动导致同一模型换色
    const sortedModels = Array.from(allModels).sort();
    const colorMap = new Map<string, string>();
    sortedModels.forEach((model, idx) => {
      colorMap.set(model, SERIES_COLORS[idx % SERIES_COLORS.length]);
    });
    const totalsByModel = new Map<string, number>();
    for (const model of sortedModels) totalsByModel.set(model, 0);
    let totalCost = 0;
    const rows = u.timeSeries.map((point) => {
      const costTotal = +point.cost.toFixed(4);
      totalCost += point.cost;
      const row: Record<string, string | number> = {
        bucket: point.bucket,
        label: formatTimeBucketLabel(point, u.timeGranularity, u.filter),
        [TOTAL_COST_KEY]: costTotal,
      };
      for (const model of sortedModels) {
        const found = point.byModel.find((x) => x.model === model);
        const cost = found ? +found.cost.toFixed(4) : 0;
        row[model] = cost;
        totalsByModel.set(model, (totalsByModel.get(model) ?? 0) + cost);
      }
      return row;
    });
    // 按合计花费降序排列，主力模型靠前；柱状图堆叠时也保持稳定顺序
    const modelStats = sortedModels
      .map((model) => ({
        key: model,
        displayName: model,
        color: colorMap.get(model) ?? SERIES_COLORS[0],
        totalCost: totalsByModel.get(model) ?? 0,
      }))
      .sort((a, b) => b.totalCost - a.totalCost || a.key.localeCompare(b.key));
    return { rows, modelStats, totalCost: +totalCost.toFixed(4) };
  }, [u.timeSeries, u.timeGranularity, u.filter]);

  const modelCostData = useMemo<ModelCostDatum[]>(() => {
    const rows = u.models.filter((m) => m.cost > 0).sort((a, b) => b.cost - a.cost);
    const total = rows.reduce((sum, m) => sum + m.cost, 0);
    return rows.map((m, index) => ({
      name: m.model,
      value: +m.cost.toFixed(4),
      percent: total > 0 ? (m.cost / total) * 100 : 0,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
    }));
  }, [u.models]);

  const modelCostTotal = modelCostData.reduce((sum, m) => sum + m.value, 0);

  const tokenTotals = useMemo(() => {
    const summary = u.summary;
    return {
      input: summary?.totalInput ?? 0,
      output: summary?.totalOutput ?? 0,
      cacheCreate: summary?.totalCacheCreation ?? 0,
      cacheRead: summary?.totalCacheRead ?? 0,
    };
  }, [u.summary]);

  const totalTokens =
    tokenTotals.input + tokenTotals.output + tokenTotals.cacheCreate + tokenTotals.cacheRead;

  const tokenBreakdownData = useMemo(
    () => [
      {
        name: t("usage.charts.tokenInput"),
        value: tokenTotals.input,
        color: COLORS.blue,
      },
      {
        name: t("usage.charts.tokenOutput"),
        value: tokenTotals.output,
        color: COLORS.green,
      },
      {
        name: t("usage.charts.tokenCacheCreate"),
        value: tokenTotals.cacheCreate,
        color: COLORS.orange,
      },
      {
        name: t("usage.charts.tokenCacheRead"),
        value: tokenTotals.cacheRead,
        color: COLORS.purple,
      },
    ],
    [t, tokenTotals],
  );

  const tokenTrendData = useMemo<TimeSeriesTokenTrendDatum[]>(
    () =>
      u.timeSeries.map((point) => ({
        bucket: point.bucket,
        label: formatTimeBucketLabel(point, u.timeGranularity, u.filter),
        totalTokens:
          point.inputTokens +
          point.outputTokens +
          point.cacheCreationTokens +
          point.cacheReadTokens,
        input: point.inputTokens,
        output: point.outputTokens,
        cacheCreate: point.cacheCreationTokens,
        cacheRead: point.cacheReadTokens,
      })),
    [u.timeSeries, u.timeGranularity, u.filter],
  );

  const tokenTrendSeries = useMemo(
    (): TrendSeriesItem[] => [
      { dataKey: TOTAL_TOKEN_KEY, name: t("usage.charts.totalTokens"), color: COLORS.total },
      { dataKey: "input", name: t("usage.charts.tokenInput"), color: COLORS.blue },
      { dataKey: "output", name: t("usage.charts.tokenOutput"), color: COLORS.green },
      { dataKey: "cacheCreate", name: t("usage.charts.tokenCacheCreate"), color: COLORS.orange },
      { dataKey: "cacheRead", name: t("usage.charts.tokenCacheRead"), color: COLORS.purple },
    ],
    [t],
  );

  const costTrendByModelSeries = useMemo(
    (): TrendSeriesItem[] => [
      {
        dataKey: TOTAL_COST_KEY,
        name: t("usage.charts.totalCost"),
        color: COLORS.total,
        total: timeSeriesChartData.totalCost,
      },
      ...timeSeriesChartData.modelStats.map((stat) => ({
        dataKey: stat.key,
        name: stat.displayName,
        originalName: stat.key,
        color: stat.color,
        total: stat.totalCost,
      })),
    ],
    [timeSeriesChartData.modelStats, timeSeriesChartData.totalCost, t],
  );

  const costTrendByType = useMemo(() => {
    const totals = {
      input: 0,
      output: 0,
      cacheCreate: 0,
      cacheRead: 0,
    };
    let totalCost = 0;
    const rows = u.timeSeries.map((point) => {
      const inputCost = point.inputCost ?? 0;
      const outputCost = point.outputCost ?? 0;
      const cacheCreationCost = point.cacheCreationCost ?? 0;
      const cacheReadCost = point.cacheReadCost ?? 0;
      totalCost += point.cost;
      totals.input += inputCost;
      totals.output += outputCost;
      totals.cacheCreate += cacheCreationCost;
      totals.cacheRead += cacheReadCost;
      return {
        bucket: point.bucket,
        label: formatTimeBucketLabel(point, u.timeGranularity, u.filter),
        [TOTAL_COST_KEY]: +point.cost.toFixed(4),
        [COST_TYPE_KEYS.input]: +inputCost.toFixed(4),
        [COST_TYPE_KEYS.output]: +outputCost.toFixed(4),
        [COST_TYPE_KEYS.cacheCreate]: +cacheCreationCost.toFixed(4),
        [COST_TYPE_KEYS.cacheRead]: +cacheReadCost.toFixed(4),
      };
    });
    const series: TrendSeriesItem[] = [
      {
        dataKey: TOTAL_COST_KEY,
        name: t("usage.charts.totalCost"),
        color: COLORS.total,
        total: +totalCost.toFixed(4),
      },
      {
        dataKey: COST_TYPE_KEYS.input,
        name: t("usage.charts.tokenInput"),
        color: COLORS.blue,
        total: +totals.input.toFixed(4),
      },
      {
        dataKey: COST_TYPE_KEYS.output,
        name: t("usage.charts.tokenOutput"),
        color: COLORS.green,
        total: +totals.output.toFixed(4),
      },
      {
        dataKey: COST_TYPE_KEYS.cacheCreate,
        name: t("usage.charts.tokenCacheCreate"),
        color: COLORS.orange,
        total: +totals.cacheCreate.toFixed(4),
      },
      {
        dataKey: COST_TYPE_KEYS.cacheRead,
        name: t("usage.charts.tokenCacheRead"),
        color: COLORS.purple,
        total: +totals.cacheRead.toFixed(4),
      },
    ];
    return { rows, series, totalCost: +totalCost.toFixed(4) };
  }, [u.timeSeries, u.timeGranularity, u.filter, t]);

  const tokenTrendByModel = useMemo(() => {
    const allModels = new Set<string>();
    for (const point of u.timeSeries) {
      for (const m of point.byModel) allModels.add(m.model);
    }
    const sortedModels = Array.from(allModels).sort();
    const colorMap = new Map<string, string>();
    sortedModels.forEach((model, idx) => {
      colorMap.set(model, SERIES_COLORS[idx % SERIES_COLORS.length]);
    });
    const totalsByModel = new Map<string, number>();
    for (const model of sortedModels) totalsByModel.set(model, 0);
    const rows = u.timeSeries.map((point) => {
      const total =
        point.inputTokens + point.outputTokens + point.cacheCreationTokens + point.cacheReadTokens;
      const row: Record<string, string | number> = {
        bucket: point.bucket,
        label: formatTimeBucketLabel(point, u.timeGranularity, u.filter),
        [TOTAL_TOKEN_KEY]: total,
      };
      for (const model of sortedModels) {
        const found = point.byModel.find((x) => x.model === model);
        const tokenTotal = found
          ? found.inputTokens +
            found.outputTokens +
            found.cacheCreationTokens +
            found.cacheReadTokens
          : 0;
        const key = tokenModelDataKey(model);
        row[key] = tokenTotal;
        totalsByModel.set(model, (totalsByModel.get(model) ?? 0) + tokenTotal);
      }
      return row;
    });
    const series: TrendSeriesItem[] = [
      { dataKey: TOTAL_TOKEN_KEY, name: t("usage.charts.totalTokens"), color: COLORS.total },
      ...sortedModels
        .map((model) => ({
          dataKey: tokenModelDataKey(model),
          name: model,
          originalName: model,
          color: colorMap.get(model) ?? SERIES_COLORS[0],
          total: totalsByModel.get(model) ?? 0,
        }))
        .sort((a, b) => (b.total ?? 0) - (a.total ?? 0) || a.name.localeCompare(b.name)),
    ];
    return { rows, series };
  }, [u.timeSeries, u.timeGranularity, u.filter, t]);

  const activeCostTrendData =
    trendBreakdownMode === "model" ? timeSeriesChartData.rows : costTrendByType.rows;
  const activeCostTrendSeries =
    trendBreakdownMode === "model" ? costTrendByModelSeries : costTrendByType.series;
  const activeCostTotal =
    trendBreakdownMode === "model" ? timeSeriesChartData.totalCost : costTrendByType.totalCost;
  const activeTokenTrendData =
    trendBreakdownMode === "type" ? tokenTrendData : tokenTrendByModel.rows;
  const activeTokenTrendSeries =
    trendBreakdownMode === "type" ? tokenTrendSeries : tokenTrendByModel.series;

  const costSeriesKeys = useMemo(
    () => activeCostTrendSeries.map((series) => series.dataKey),
    [activeCostTrendSeries],
  );

  const tokenSeriesKeys = useMemo(
    () => activeTokenTrendSeries.map((series) => series.dataKey),
    [activeTokenTrendSeries],
  );

  const hiddenCostModels = useMemo(
    () => hiddenSeriesSet(costSeriesKeys, costVisibility, TOTAL_COST_KEY),
    [costSeriesKeys, costVisibility],
  );

  const hiddenTokenSeries = useMemo(
    () => hiddenSeriesSet(tokenSeriesKeys, tokenVisibility, TOTAL_TOKEN_KEY),
    [tokenSeriesKeys, tokenVisibility],
  );

  const toggleCostModel = useCallback((key: string) => {
    setCostVisibility((prev) => ({
      ...prev,
      [key]: !isSeriesVisible(prev, key, TOTAL_COST_KEY),
    }));
  }, []);

  const toggleTokenSeries = useCallback((key: string) => {
    setTokenVisibility((prev) => ({
      ...prev,
      [key]: !isSeriesVisible(prev, key, TOTAL_TOKEN_KEY),
    }));
  }, []);

  const soloCostModel = useCallback(
    (key: string) => {
      setCostVisibility((prev) => soloSeriesVisibility(costSeriesKeys, prev, key, TOTAL_COST_KEY));
    },
    [costSeriesKeys],
  );

  const soloTokenSeries = useCallback(
    (key: string) => {
      setTokenVisibility((prev) =>
        soloSeriesVisibility(tokenSeriesKeys, prev, key, TOTAL_TOKEN_KEY),
      );
    },
    [tokenSeriesKeys],
  );

  const cacheSavings = useMemo(() => {
    if (!u.summary) return 0;
    const pricing = u.summary.pricing.models;
    let saved = 0;
    for (const m of u.models) {
      const price = pricing[m.model];
      if (!price) continue;
      saved += (m.cacheReadTokens * (price.input - price.cache_read)) / 1_000_000;
    }
    return Math.max(saved, 0);
  }, [u.summary, u.models]);

  const tabCounts = useMemo(
    () => ({
      daily: u.daily.length,
      project: u.projects.length,
      session: u.sessions.length,
      model: u.models.length,
    }),
    [u.daily.length, u.projects.length, u.sessions.length, u.models.length],
  );

  const isInitialLoading = u.loading && !u.summary;
  const isEmpty =
    !isInitialLoading &&
    !!u.summary &&
    u.summary.totalMessages === 0 &&
    !u.filter.startDate &&
    !u.filter.endDate &&
    !u.filter.projectPath &&
    !u.filter.model;

  return (
    <div className="usage-page">
      <div className="page-header usage-header">
        <div className="usage-page-heading">
          <h1 className="page-title">{t("usage.title")}</h1>
          <p className="usage-subtitle">{t("usage.subtitle")}</p>
        </div>
        <div className="usage-header-actions">
          {u.summary && (
            <div className="usage-meta" role="group" aria-label={t("usage.metaLabel")}>
              <span
                className={`usage-badge usage-badge-${u.summary.pricing.source}`}
                title={
                  u.summary.pricing.fetchedAtMs
                    ? `${t("usage.pricingFetched")}: ${formatShortDateTime(u.summary.pricing.fetchedAtMs)}`
                    : undefined
                }
              >
                {pricingSourceLabel(u.summary.pricing.source, t)}
              </span>
              {u.summary.lastScanMs && (
                <span className="usage-meta-text">
                  {t("usage.lastScan")}: {formatShortDateTime(u.summary.lastScanMs)}
                </span>
              )}
            </div>
          )}
          <button
            type="button"
            className="usage-icon-btn"
            onClick={handleRefreshPrice}
            disabled={u.refreshingPrice}
            title={u.refreshingPrice ? t("usage.refreshing") : t("usage.refresh")}
          >
            <RefreshIcon />
            <span>{u.refreshingPrice ? t("usage.refreshing") : t("usage.refresh")}</span>
          </button>
          <button
            type="button"
            className={`usage-icon-btn usage-icon-btn-primary ${u.rescanning ? "usage-icon-btn-busy" : ""}`}
            onClick={handleRescan}
            disabled={u.rescanning}
            title={u.rescanning ? t("usage.rescanning") : t("usage.rescan")}
          >
            <ScanIcon />
            <span>{u.rescanning ? t("usage.rescanning") : t("usage.rescan")}</span>
          </button>
        </div>
      </div>

      <div className="usage-scroll">
        {isInitialLoading ? (
          <EmptyState title={t("usage.scanning")} />
        ) : isEmpty ? (
          <EmptyState title={t("usage.empty")} hint={t("usage.emptyHint")} />
        ) : (
          <>
            {u.error && <div className="usage-error">{u.error}</div>}

            <Filters
              t={t}
              filter={u.filter}
              allProjects={u.summary?.allProjects ?? []}
              allModels={u.summary?.allModels ?? []}
              onChange={updateFilter}
              onReset={resetFilter}
            />

            <div className="usage-cockpit">
              <main className="usage-main-column">
                <section className="usage-summary-grid" aria-label={t("usage.summaryLabel")}>
                  <div className="usage-cost-panel">
                    <span className="usage-panel-label">{t("usage.cards.totalCost")}</span>
                    <strong className="usage-cost-value">
                      {u.summary ? formatUSD(u.summary.totalCost) : "-"}
                    </strong>
                    <span className="usage-panel-subtle">{t("usage.cards.totalCostHint")}</span>
                  </div>
                  <div className="usage-kpi-grid">
                    <MetricCard
                      label={t("usage.cards.totalTokens")}
                      value={formatDetailedTokens(totalTokens)}
                      tone="blue"
                    />
                    <MetricCard
                      label={t("usage.cards.totalSessions")}
                      value={u.summary ? String(u.summary.totalSessions) : "-"}
                      tone="purple"
                    />
                    <MetricCard
                      label={t("usage.cards.totalMessages")}
                      value={u.summary ? formatCount(u.summary.totalMessages) : "-"}
                      tone="orange"
                    />
                    <MetricCard
                      label={t("usage.cards.cacheSavings")}
                      value={formatUSD(cacheSavings)}
                      tone="green"
                      hint={t("usage.cards.cacheSavingsHint")}
                    />
                  </div>
                </section>

                <section className="usage-trend-section" aria-label={t("usage.charts.trends")}>
                  <header className="usage-trend-toolbar">
                    <h3 className="usage-trend-title">{t("usage.charts.trends")}</h3>
                    <div className="usage-trend-controls">
                      <TrendBreakdownModeSwitch
                        value={trendBreakdownMode}
                        onChange={setTrendBreakdownMode}
                        t={t}
                      />
                      <TrendChartStyleSwitch
                        value={trendChartStyle}
                        onChange={setTrendChartStyle}
                        t={t}
                      />
                      <TimeGranularitySwitch
                        value={u.timeGranularity}
                        onChange={u.setTimeGranularity}
                        t={t}
                      />
                    </div>
                  </header>

                  <ChartPanel title={t("usage.charts.costTrend")} className="usage-chart-primary">
                    {activeCostTrendData.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={300}>
                          {trendChartStyle === "curve" ? (
                            <AreaChart
                              data={activeCostTrendData}
                              margin={{ left: 8, right: 18, top: 10, bottom: 4 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#30363d"
                                vertical={false}
                              />
                              <XAxis dataKey="label" tick={TICK_STYLE_SM} />
                              <YAxis tick={TICK_STYLE} tickFormatter={(v) => `$${v}`} width={44} />
                              <Tooltip
                                formatter={(v) => formatUSD(tooltipNumber(v))}
                                itemSorter={sortTooltipItemsByValueDesc}
                                cursor={{ stroke: COLORS.total, strokeOpacity: 0.34 }}
                                labelFormatter={(_, payload) =>
                                  payload?.[0]?.payload?.bucket ?? t("usage.charts.costTrend")
                                }
                                contentStyle={TOOLTIP_STYLE}
                              />
                              {activeCostTrendSeries
                                .filter(
                                  (series) =>
                                    series.dataKey !== TOTAL_COST_KEY &&
                                    !hiddenCostModels.has(series.dataKey),
                                )
                                .map((series) => (
                                  <Area
                                    key={series.dataKey}
                                    type="monotone"
                                    dataKey={series.dataKey}
                                    stroke={series.color}
                                    fill={series.color}
                                    fillOpacity={0.5}
                                    strokeWidth={1.5}
                                    dot={{ r: 2.4, stroke: series.color, strokeWidth: 1.4 }}
                                    activeDot={{ r: 4.2, stroke: series.color, strokeWidth: 1.6 }}
                                    name={series.name}
                                  />
                                ))}
                              {!hiddenCostModels.has(TOTAL_COST_KEY) && (
                                <Area
                                  key={TOTAL_COST_KEY}
                                  type="monotone"
                                  dataKey={TOTAL_COST_KEY}
                                  stroke={COLORS.total}
                                  fill={COLORS.total}
                                  fillOpacity={0.04}
                                  strokeWidth={2.2}
                                  dot={{ r: 2.6, stroke: COLORS.total, strokeWidth: 1.4 }}
                                  activeDot={{ r: 4.4, stroke: COLORS.total, strokeWidth: 1.6 }}
                                  name={t("usage.charts.totalCost")}
                                />
                              )}
                            </AreaChart>
                          ) : (
                            <BarChart
                              data={activeCostTrendData}
                              margin={{ left: 8, right: 18, top: 10, bottom: 4 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#30363d"
                                vertical={false}
                              />
                              <XAxis dataKey="label" tick={TICK_STYLE_SM} />
                              <YAxis tick={TICK_STYLE} tickFormatter={(v) => `$${v}`} width={44} />
                              <Tooltip
                                formatter={(v) => formatUSD(tooltipNumber(v))}
                                itemSorter={sortTooltipItemsByValueDesc}
                                cursor={{ fill: CHART_CURSOR_FILL }}
                                labelFormatter={(_, payload) =>
                                  payload?.[0]?.payload?.bucket ?? t("usage.charts.costTrend")
                                }
                                contentStyle={TOOLTIP_STYLE}
                              />
                              {activeCostTrendSeries
                                .filter(
                                  (series) =>
                                    series.dataKey !== TOTAL_COST_KEY &&
                                    !hiddenCostModels.has(series.dataKey),
                                )
                                .map((series) => (
                                  <Bar
                                    key={series.dataKey}
                                    dataKey={series.dataKey}
                                    stackId="cost"
                                    fill={series.color}
                                    fillOpacity={0.78}
                                    radius={[3, 3, 0, 0]}
                                    activeBar={activeBarStyle(series.color)}
                                    name={series.name}
                                  />
                                ))}
                              {!hiddenCostModels.has(TOTAL_COST_KEY) && (
                                <Bar
                                  key={TOTAL_COST_KEY}
                                  dataKey={TOTAL_COST_KEY}
                                  fill={COLORS.total}
                                  fillOpacity={0.72}
                                  radius={[3, 3, 0, 0]}
                                  activeBar={activeBarStyle(COLORS.total)}
                                  name={t("usage.charts.totalCost")}
                                />
                              )}
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                        <TrendLegend
                          items={activeCostTrendSeries.map((series) => ({
                            key: series.dataKey,
                            color: series.color,
                            displayName: series.name,
                            originalName: series.originalName ?? series.name,
                            meta:
                              series.dataKey === TOTAL_COST_KEY
                                ? formatUSD(activeCostTotal)
                                : series.total
                                  ? formatUSD(series.total)
                                  : undefined,
                          }))}
                          hidden={hiddenCostModels}
                          onToggle={toggleCostModel}
                          onSolo={soloCostModel}
                          ariaLabel={t("usage.charts.costTrend")}
                          t={t}
                        />
                      </>
                    ) : (
                      <NoData />
                    )}
                  </ChartPanel>

                  <ChartPanel
                    title={t("usage.charts.tokenTrend")}
                    className="usage-chart-secondary"
                  >
                    {activeTokenTrendData.length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={240}>
                          {trendChartStyle === "curve" ? (
                            <AreaChart
                              data={activeTokenTrendData}
                              margin={{ left: 8, right: 18, top: 10, bottom: 4 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#30363d"
                                vertical={false}
                              />
                              <XAxis dataKey="label" tick={TICK_STYLE_SM} />
                              <YAxis
                                tick={TICK_STYLE}
                                tickFormatter={(v) => formatTokens(v)}
                                width={54}
                              />
                              <Tooltip
                                formatter={(v) => formatTokens(tooltipNumber(v))}
                                itemSorter={sortTooltipItemsByValueDesc}
                                cursor={{ stroke: COLORS.total, strokeOpacity: 0.34 }}
                                labelFormatter={(_, payload) =>
                                  payload?.[0]?.payload?.bucket ?? t("usage.charts.tokenTrend")
                                }
                                contentStyle={TOOLTIP_STYLE}
                              />
                              {activeTokenTrendSeries
                                .filter(
                                  (series) =>
                                    series.dataKey !== TOTAL_TOKEN_KEY &&
                                    !hiddenTokenSeries.has(series.dataKey),
                                )
                                .map((series) => (
                                  <Area
                                    key={series.dataKey}
                                    type="monotone"
                                    dataKey={series.dataKey}
                                    stroke={series.color}
                                    fill={series.color}
                                    fillOpacity={0.12}
                                    strokeWidth={1.8}
                                    dot={{ r: 2.4, stroke: series.color, strokeWidth: 1.4 }}
                                    activeDot={{ r: 4.2, stroke: series.color, strokeWidth: 1.6 }}
                                    name={series.name}
                                  />
                                ))}
                              {!hiddenTokenSeries.has(TOTAL_TOKEN_KEY) && (
                                <Area
                                  key={TOTAL_TOKEN_KEY}
                                  type="monotone"
                                  dataKey={TOTAL_TOKEN_KEY}
                                  stroke={COLORS.total}
                                  fill={COLORS.total}
                                  fillOpacity={0.04}
                                  strokeWidth={2.2}
                                  dot={{ r: 2.6, stroke: COLORS.total, strokeWidth: 1.4 }}
                                  activeDot={{ r: 4.4, stroke: COLORS.total, strokeWidth: 1.6 }}
                                  name={t("usage.charts.totalTokens")}
                                />
                              )}
                            </AreaChart>
                          ) : (
                            <BarChart
                              data={activeTokenTrendData}
                              margin={{ left: 8, right: 18, top: 10, bottom: 4 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#30363d"
                                vertical={false}
                              />
                              <XAxis dataKey="label" tick={TICK_STYLE_SM} />
                              <YAxis
                                tick={TICK_STYLE}
                                tickFormatter={(v) => formatTokens(v)}
                                width={54}
                              />
                              <Tooltip
                                formatter={(v) => formatTokens(tooltipNumber(v))}
                                itemSorter={sortTooltipItemsByValueDesc}
                                cursor={{ fill: CHART_CURSOR_FILL }}
                                labelFormatter={(_, payload) =>
                                  payload?.[0]?.payload?.bucket ?? t("usage.charts.tokenTrend")
                                }
                                contentStyle={TOOLTIP_STYLE}
                              />
                              {activeTokenTrendSeries
                                .filter(
                                  (series) =>
                                    series.dataKey !== TOTAL_TOKEN_KEY &&
                                    !hiddenTokenSeries.has(series.dataKey),
                                )
                                .map((series) => (
                                  <Bar
                                    key={series.dataKey}
                                    dataKey={series.dataKey}
                                    stackId="tokens"
                                    fill={series.color}
                                    fillOpacity={0.78}
                                    radius={[3, 3, 0, 0]}
                                    activeBar={activeBarStyle(series.color)}
                                    name={series.name}
                                  />
                                ))}
                              {!hiddenTokenSeries.has(TOTAL_TOKEN_KEY) && (
                                <Bar
                                  key={TOTAL_TOKEN_KEY}
                                  dataKey={TOTAL_TOKEN_KEY}
                                  fill={COLORS.total}
                                  fillOpacity={0.72}
                                  radius={[3, 3, 0, 0]}
                                  activeBar={activeBarStyle(COLORS.total)}
                                  name={t("usage.charts.totalTokens")}
                                />
                              )}
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                        <TrendLegend
                          items={activeTokenTrendSeries.map((series) => ({
                            key: series.dataKey,
                            color: series.color,
                            displayName: series.name,
                            originalName: series.originalName ?? series.name,
                            meta:
                              series.dataKey === TOTAL_TOKEN_KEY
                                ? formatTokens(totalTokens)
                                : series.total
                                  ? formatTokens(series.total)
                                  : undefined,
                          }))}
                          hidden={hiddenTokenSeries}
                          onToggle={toggleTokenSeries}
                          onSolo={soloTokenSeries}
                          ariaLabel={t("usage.charts.tokenTrend")}
                          t={t}
                        />
                      </>
                    ) : (
                      <NoData />
                    )}
                  </ChartPanel>
                </section>
              </main>

              <aside className="usage-side-rail" aria-label={t("usage.sideRailLabel")}>
                <ChartPanel title={t("usage.charts.byModel")}>
                  {modelCostData.length > 0 ? (
                    <ModelCostShare
                      data={modelCostData}
                      total={modelCostTotal}
                      label={t("usage.charts.byModel")}
                    />
                  ) : (
                    <NoData />
                  )}
                </ChartPanel>

                <ChartPanel title={t("usage.charts.tokenComposition")}>
                  <div className="usage-token-stack">
                    <div className="usage-token-total">
                      <span>{t("usage.table.totalTokens")}</span>
                      <strong>{formatDetailedTokens(totalTokens)}</strong>
                    </div>
                    {tokenBreakdownData.map((item) => (
                      <TokenBar
                        key={item.name}
                        label={item.name}
                        value={item.value}
                        total={totalTokens}
                        color={item.color}
                      />
                    ))}
                  </div>
                </ChartPanel>

                {u.summary && u.summary.unknownModels.length > 0 && (
                  <UnknownModelsAlert models={u.summary.unknownModels} t={t} />
                )}
              </aside>
            </div>

            <section className="usage-detail-workspace" aria-label={t("usage.details.title")}>
              <div className="usage-detail-header">
                <div>
                  <h2>{t("usage.details.title")}</h2>
                  <p>{t("usage.details.hint")}</p>
                </div>
                <div className="usage-detail-count">
                  {u.summary ? `${u.summary.totalProjects} ${t("usage.table.project")}` : "-"}
                </div>
              </div>

              <div className="usage-tabs" role="tablist" aria-label={t("usage.details.title")}>
                {TAB_ORDER.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={u.tab === key}
                    className={`usage-tab-btn ${u.tab === key ? "active" : ""}`}
                    onClick={() => u.setTab(key)}
                  >
                    <span>{t(`usage.tabs.${key}`)}</span>
                    <span className="usage-tab-count">{tabCounts[key]}</span>
                  </button>
                ))}
              </div>

              <div className="usage-tab-body">
                {u.tab === "daily" && <DailyTable rows={u.daily} t={t} />}
                {u.tab === "project" && <ProjectTable rows={u.projects} t={t} />}
                {u.tab === "session" && (
                  <SessionTable rows={u.sessions} t={t} onOpen={(id) => setOpenSessionId(id)} />
                )}
                {u.tab === "model" && <ModelTable rows={u.models} t={t} />}
              </div>
            </section>
          </>
        )}
      </div>

      {openSessionId && (
        <SessionUsageDrawer sessionId={openSessionId} onClose={() => setOpenSessionId(null)} />
      )}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  tone: "blue" | "green" | "orange" | "purple";
  hint?: string;
}

function MetricCard({ label, value, tone, hint }: MetricCardProps) {
  return (
    <div className={`usage-metric usage-metric-${tone}`} title={hint}>
      <span className="usage-metric-label">{label}</span>
      <strong className="usage-metric-value">{value}</strong>
    </div>
  );
}

function ChartPanel({
  title,
  className,
  actions,
  children,
}: {
  title: string;
  className?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`usage-panel ${className ?? ""}`}>
      <div className="usage-panel-header">
        <div className="usage-panel-title">{title}</div>
        {actions && <div className="usage-panel-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

const TIME_GRANULARITY_ORDER: UsageTimeGranularity[] = ["day", "hour", "fiveMinute"];

function TrendChartStyleSwitch({
  value,
  onChange,
  t,
}: {
  value: TrendChartStyle;
  onChange: (next: TrendChartStyle) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div
      className="usage-time-granularity usage-chart-style-switch"
      role="group"
      aria-label={t("usage.charts.style.ariaLabel")}
    >
      {TREND_CHART_STYLE_ORDER.map((key) => (
        <button
          key={key}
          type="button"
          className={`usage-time-granularity-btn ${value === key ? "active" : ""}`}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {t(`usage.charts.style.${key}`)}
        </button>
      ))}
    </div>
  );
}

function TrendBreakdownModeSwitch({
  value,
  onChange,
  t,
}: {
  value: TrendBreakdownMode;
  onChange: (next: TrendBreakdownMode) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div
      className="usage-time-granularity usage-trend-mode-switch"
      role="group"
      aria-label={t("usage.charts.breakdown.ariaLabel")}
    >
      {TREND_BREAKDOWN_MODE_ORDER.map((key) => (
        <button
          key={key}
          type="button"
          className={`usage-time-granularity-btn ${value === key ? "active" : ""}`}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {t(`usage.charts.breakdown.${key}`)}
        </button>
      ))}
    </div>
  );
}

function TimeGranularitySwitch({
  value,
  onChange,
  t,
}: {
  value: UsageTimeGranularity;
  onChange: (next: UsageTimeGranularity) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div
      className="usage-time-granularity"
      role="group"
      aria-label={t("usage.granularity.ariaLabel")}
    >
      {TIME_GRANULARITY_ORDER.map((key) => (
        <button
          key={key}
          type="button"
          className={`usage-time-granularity-btn ${value === key ? "active" : ""}`}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {t(`usage.granularity.${key}`)}
        </button>
      ))}
    </div>
  );
}

interface TrendLegendItem {
  key: string;
  color: string;
  displayName: string;
  originalName: string;
  meta?: string;
}

function TrendLegend({
  items,
  hidden,
  onToggle,
  onSolo,
  ariaLabel,
  t,
}: {
  items: TrendLegendItem[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onSolo?: (key: string) => void;
  ariaLabel: string;
  t: ReturnType<typeof useI18n>["t"];
}) {
  if (items.length === 0) return null;
  const hint = t("usage.charts.legendToggle");
  const soloHint = t("usage.charts.legendSolo");
  const hiddenLabel = t("usage.charts.legendHidden");
  return (
    <ul className="usage-legend-list" aria-label={ariaLabel}>
      {items.map((item) => {
        const isHidden = hidden.has(item.key);
        const title = isHidden
          ? `${item.originalName} · ${hiddenLabel}`
          : `${item.originalName} · ${hint} · ${soloHint}`;
        return (
          <li key={item.key}>
            <button
              type="button"
              className={`usage-legend-chip ${isHidden ? "muted" : ""}`}
              aria-pressed={!isHidden}
              title={title}
              onClick={() => onToggle(item.key)}
              onDoubleClick={() => onSolo?.(item.key)}
            >
              <span
                className="usage-legend-chip-swatch"
                style={{
                  background: isHidden ? "transparent" : item.color,
                  borderColor: item.color,
                }}
                aria-hidden="true"
              />
              <span className="usage-legend-chip-name">{item.displayName}</span>
              {item.meta && <span className="usage-legend-chip-meta">{item.meta}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ModelCostShare({
  data,
  total,
  label,
}: {
  data: ModelCostDatum[];
  total: number;
  label: string;
}) {
  return (
    <div className="usage-model-share">
      <div className="usage-model-donut">
        <ResponsiveContainer width="100%" height={150}>
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={68}
              paddingAngle={2}
              stroke="#161b22"
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => formatUSD(tooltipNumber(v))}
              contentStyle={TOOLTIP_STYLE}
              itemStyle={{ color: "#e6edf3" }}
              labelStyle={{ color: "#e6edf3" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="usage-model-donut-center" aria-hidden="true">
          <span>{label}</span>
          <strong>{formatUSD(total)}</strong>
        </div>
      </div>

      <div className="usage-model-share-list" role="list" aria-label={label}>
        {data.map((item) => (
          <div key={item.name} className="usage-model-share-item" role="listitem">
            <div className="usage-model-share-row">
              <span className="usage-model-swatch" style={{ background: item.color }} />
              <span className="usage-model-name" title={item.name}>
                {item.name}
              </span>
              <span className="usage-model-percent">{item.percent.toFixed(1)}%</span>
              <strong className="usage-model-cost">{formatUSD(item.value)}</strong>
            </div>
            <div className="usage-model-track" aria-hidden="true">
              <span
                style={{
                  width: `${Math.max(item.percent, item.value > 0 ? 3 : 0)}%`,
                  background: item.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface FiltersProps {
  t: ReturnType<typeof useI18n>["t"];
  filter: UsageFilter;
  allProjects: { projectPath: string; projectDir: string }[];
  allModels: string[];
  onChange: (patch: Partial<UsageFilter>) => void;
  onReset: () => void;
}

function Filters({ t, filter, allProjects, allModels, onChange, onReset }: FiltersProps) {
  const hasActiveFilter = Boolean(
    filter.startDate || filter.endDate || filter.projectPath || filter.model,
  );
  const activePreset = getActiveDateRangePreset(filter);
  const sortedModels = useMemo(
    () =>
      Array.from(new Set(allModels))
        .filter((model) => model !== CLAUDE_MODEL_FILTER)
        .sort((a, b) => a.localeCompare(b)),
    [allModels],
  );
  const hasClaudeModels = sortedModels.some((model) => model.startsWith("claude-"));

  return (
    <div className="usage-command-bar" role="group" aria-label={t("usage.filter.ariaLabel")}>
      <div className="usage-filter-cluster usage-filter-cluster-date">
        <span className="usage-filter-label">{t("usage.filter.dateRange")}</span>
        <div className="usage-date-range">
          <input
            type="date"
            value={filter.startDate ?? ""}
            onChange={(e) => onChange({ startDate: e.target.value || undefined })}
            aria-label={t("usage.filter.startDate")}
          />
          <span className="usage-date-sep">-</span>
          <input
            type="date"
            value={filter.endDate ?? ""}
            onChange={(e) => onChange({ endDate: e.target.value || undefined })}
            aria-label={t("usage.filter.endDate")}
          />
        </div>
      </div>
      <div
        className="usage-quick-ranges"
        role="group"
        aria-label={t("usage.filter.quick.ariaLabel")}
      >
        {DATE_RANGE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`usage-quick-range-btn ${activePreset === preset ? "active" : ""}`}
            aria-pressed={activePreset === preset}
            onClick={() => onChange(getDateRangePresetPatch(preset))}
          >
            {t(`usage.filter.quick.${preset}`)}
          </button>
        ))}
      </div>
      <label className="usage-filter-cluster">
        <span className="usage-filter-label">{t("usage.filter.project")}</span>
        <select
          value={filter.projectPath ?? ""}
          onChange={(e) => onChange({ projectPath: e.target.value || undefined })}
        >
          <option value="">{t("usage.filter.allProjects")}</option>
          {allProjects.map((p) => (
            <option key={p.projectPath} value={p.projectPath}>
              {projectDisplayName(p.projectDir, p.projectPath)}
            </option>
          ))}
        </select>
      </label>
      <label className="usage-filter-cluster">
        <span className="usage-filter-label">{t("usage.filter.model")}</span>
        <select
          value={filter.model ?? ""}
          onChange={(e) => onChange({ model: e.target.value || undefined })}
        >
          <option value="">{t("usage.filter.allModels")}</option>
          {hasClaudeModels && (
            <option value={CLAUDE_MODEL_FILTER}>{t("usage.filter.claudeModels")}</option>
          )}
          {sortedModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="usage-reset-btn"
        onClick={onReset}
        disabled={!hasActiveFilter}
      >
        {t("usage.filter.reset")}
      </button>
    </div>
  );
}

function compactUsageFilter(filter: UsageFilter): UsageFilter {
  const next: UsageFilter = {};
  if (filter.startDate) next.startDate = filter.startDate;
  if (filter.endDate) next.endDate = filter.endDate;
  if (filter.projectPath) next.projectPath = filter.projectPath;
  if (filter.sessionId) next.sessionId = filter.sessionId;
  if (filter.model) next.model = filter.model;
  if (filter.includeUnknownModels !== undefined) {
    next.includeUnknownModels = filter.includeUnknownModels;
  }
  return next;
}

function getDateRangePresetPatch(
  preset: DateRangePreset,
  today = new Date(),
): Partial<UsageFilter> {
  if (preset === "all") {
    return { startDate: undefined, endDate: undefined };
  }

  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (preset === "today") {
    const value = formatDateInputValue(current);
    return { startDate: value, endDate: value };
  }

  if (preset === "week") {
    const daysFromMonday = (current.getDay() + 6) % 7;
    const start = new Date(current);
    start.setDate(current.getDate() - daysFromMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { startDate: formatDateInputValue(start), endDate: formatDateInputValue(end) };
  }

  if (preset === "month") {
    const start = new Date(current.getFullYear(), current.getMonth(), 1);
    const end = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    return { startDate: formatDateInputValue(start), endDate: formatDateInputValue(end) };
  }

  const start = new Date(current.getFullYear(), 0, 1);
  const end = new Date(current.getFullYear(), 11, 31);
  return { startDate: formatDateInputValue(start), endDate: formatDateInputValue(end) };
}

function getActiveDateRangePreset(filter: UsageFilter): DateRangePreset | null {
  if (!filter.startDate && !filter.endDate) return "all";

  for (const preset of DATE_RANGE_PRESETS) {
    if (preset === "all") continue;
    const range = getDateRangePresetPatch(preset);
    if (filter.startDate === range.startDate && filter.endDate === range.endDate) {
      return preset;
    }
  }
  return null;
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function DailyTable({ rows, t }: { rows: DailyUsage[]; t: ReturnType<typeof useI18n>["t"] }) {
  if (rows.length === 0) return <EmptyTable t={t} />;
  return (
    <div className="usage-table-wrap">
      <table className="usage-table">
        <thead>
          <tr>
            <th>{t("usage.table.date")}</th>
            <th className="num">{t("usage.table.sessions")}</th>
            <th className="num">{t("usage.table.messages")}</th>
            <th className="num">{t("usage.table.input")}</th>
            <th className="num">{t("usage.table.output")}</th>
            <th className="num">{t("usage.table.cacheCreate")}</th>
            <th className="num">{t("usage.table.cacheRead")}</th>
            <th className="num">{t("usage.table.cost")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.date}>
              <td className="mono">{d.date}</td>
              <td className="num">{d.sessions}</td>
              <td className="num">{d.messages}</td>
              <td className="num">{formatTokens(d.inputTokens)}</td>
              <td className="num">{formatTokens(d.outputTokens)}</td>
              <td className="num">{formatTokens(d.cacheCreationTokens)}</td>
              <td className="num">{formatTokens(d.cacheReadTokens)}</td>
              <td className="num accent-green">{formatCost(d.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectTable({ rows, t }: { rows: ProjectUsage[]; t: ReturnType<typeof useI18n>["t"] }) {
  if (rows.length === 0) return <EmptyTable t={t} />;
  return (
    <div className="usage-table-wrap">
      <table className="usage-table">
        <thead>
          <tr>
            <th>{t("usage.table.project")}</th>
            <th>{t("usage.table.lastActive")}</th>
            <th className="num">{t("usage.table.sessions")}</th>
            <th className="num">{t("usage.table.messages")}</th>
            <th className="num">{t("usage.table.input")}</th>
            <th className="num">{t("usage.table.output")}</th>
            <th className="num">{t("usage.table.cacheCreate")}</th>
            <th className="num">{t("usage.table.cacheRead")}</th>
            <th className="num">{t("usage.table.cost")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.projectPath}>
              <td title={p.projectPath} className="ellipsis strong-cell">
                {projectDisplayName(p.projectDir, p.projectPath)}
              </td>
              <td>{formatShortDateTime(p.lastActiveMs)}</td>
              <td className="num">{p.sessions}</td>
              <td className="num">{p.messages}</td>
              <td className="num">{formatTokens(p.inputTokens)}</td>
              <td className="num">{formatTokens(p.outputTokens)}</td>
              <td className="num">{formatTokens(p.cacheCreationTokens)}</td>
              <td className="num">{formatTokens(p.cacheReadTokens)}</td>
              <td className="num accent-green">{formatCost(p.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionTable({
  rows,
  t,
  onOpen,
}: {
  rows: SessionUsage[];
  t: ReturnType<typeof useI18n>["t"];
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) return <EmptyTable t={t} />;
  return (
    <div className="usage-table-wrap">
      <table className="usage-table">
        <thead>
          <tr>
            <th>{t("usage.table.session")}</th>
            <th>{t("usage.table.project")}</th>
            <th>{t("usage.table.lastActive")}</th>
            <th>{t("usage.table.models")}</th>
            <th className="num">{t("usage.table.messages")}</th>
            <th className="num">{t("usage.table.totalTokens")}</th>
            <th className="num">{t("usage.table.cost")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const total =
              s.inputTokens + s.outputTokens + s.cacheCreationTokens + s.cacheReadTokens;
            const projectName = projectDisplayName(s.projectDir, s.projectPath);
            return (
              <tr
                key={s.sessionId}
                role="button"
                tabIndex={0}
                aria-label={`${s.sessionId} ${projectName} ${formatCost(s.cost)}`}
                className="usage-table-row-clickable"
                onClick={() => onOpen(s.sessionId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(s.sessionId);
                  }
                }}
              >
                <td className="mono" title={s.sessionId}>
                  {displaySessionId(s.sessionId)}
                </td>
                <td title={s.projectPath} className="ellipsis strong-cell">
                  {projectName}
                </td>
                <td>{formatShortDateTime(s.lastActiveMs)}</td>
                <td className="model-cell">{s.models.map(shortModelName).join(", ")}</td>
                <td className="num">{s.messages}</td>
                <td className="num">{formatTokens(total)}</td>
                <td className="num accent-green">{formatCost(s.cost)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ModelTable({ rows, t }: { rows: ModelUsageStat[]; t: ReturnType<typeof useI18n>["t"] }) {
  if (rows.length === 0) return <EmptyTable t={t} />;
  return (
    <div className="usage-table-wrap">
      <table className="usage-table">
        <thead>
          <tr>
            <th>{t("usage.table.model")}</th>
            <th className="num">{t("usage.table.messages")}</th>
            <th className="num">{t("usage.table.input")}</th>
            <th className="num">{t("usage.table.output")}</th>
            <th className="num">{t("usage.table.cacheCreate")}</th>
            <th className="num">{t("usage.table.cacheRead")}</th>
            <th className="num">{t("usage.table.cost")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.model}>
              <td className="mono strong-cell">{m.model}</td>
              <td className="num">{m.messages}</td>
              <td className="num">{formatTokens(m.inputTokens)}</td>
              <td className="num">{formatTokens(m.outputTokens)}</td>
              <td className="num">{formatTokens(m.cacheCreationTokens)}</td>
              <td className="num">{formatTokens(m.cacheReadTokens)}</td>
              <td className="num accent-green">{formatCost(m.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TokenBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="usage-token-row">
      <div className="usage-token-row-head">
        <span>{label}</span>
        <span>{formatDetailedTokens(value)}</span>
      </div>
      <div className="usage-token-track" aria-hidden="true">
        <span style={{ width: `${Math.max(percentage, value > 0 ? 3 : 0)}%`, background: color }} />
      </div>
      <span className="usage-token-percent">{percentage.toFixed(1)}%</span>
    </div>
  );
}

function UnknownModelsAlert({
  models,
  t,
}: {
  models: string[];
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div className="usage-warning">
      <div className="usage-warning-title">
        <WarningIcon />
        <strong>{t("usage.unknownModels")}</strong>
      </div>
      <span className="usage-warning-hint">{t("usage.unknownModelsHint")}</span>
      <div className="usage-warning-models">
        {models.map((m) => (
          <code key={m}>{m}</code>
        ))}
      </div>
    </div>
  );
}

function EmptyTable({ t }: { t: ReturnType<typeof useI18n>["t"] }) {
  return <div className="usage-no-data">{t("usage.empty")}</div>;
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="usage-empty">
      <p className="empty-text">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
    </div>
  );
}

function NoData() {
  return <p className="usage-no-data">-</p>;
}

function shortModelName(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("opus")) return modelTail("opus", model);
  if (m.includes("sonnet")) return modelTail("sonnet", model);
  if (m.includes("haiku")) return modelTail("haiku", model);
  return model;
}

function modelTail(family: string, model: string): string {
  const after = model.split(family)[1] ?? "";
  const tail = after.replace(/^[-_]/, "").split(/[-_]/).slice(0, 2).join("-");
  return tail ? `${family} ${tail}` : family;
}

function displaySessionId(id: string): string {
  if (id.length <= 22) return id;
  return `${id.slice(0, 20)}...`;
}

function formatTimeBucketLabel(
  point: UsageTimeSeriesPoint,
  granularity: UsageTimeGranularity,
  filter: UsageFilter,
): string {
  if (granularity === "day") {
    return point.bucket.slice(5);
  }

  const isSingleDay = filter.startDate && filter.endDate && filter.startDate === filter.endDate;
  if (isSingleDay) {
    return point.bucket.slice(11);
  }
  return point.bucket.slice(5);
}

function formatDetailedTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const formatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  if (n >= 1_000_000_000) return `${formatter.format(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${formatter.format(n / 1_000_000)}M`;
  if (n >= 1_000) return `${formatter.format(n / 1_000)}K`;
  return n.toLocaleString("en-US");
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function pricingSourceLabel(
  source: "builtin" | "cache" | "network",
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (source) {
    case "network":
      return t("usage.pricing.network");
    case "cache":
      return t("usage.pricing.cache");
    default:
      return t("usage.pricing.builtin");
  }
}

function RefreshIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export default UsagePage;
