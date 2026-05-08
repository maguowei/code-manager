import { CalendarIcon, RefreshCw, ScanLine, TriangleAlert } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { enUS, zhCN } from "react-day-picker/locale";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
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
import PageHeader from "./PageHeader";
import { formatUSD } from "./project-detail-utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Card, CardContent } from "./ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "./ui/chart";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { SegmentedControl } from "./ui/segmented-control";
import { formatCost, formatShortDateTime, formatTokens, projectDisplayName } from "./usage/format";
import SessionUsageDrawer from "./usage/SessionUsageDrawer";

const COLORS = {
  blue: "var(--chart-1)",
  green: "var(--chart-2)",
  orange: "var(--chart-3)",
  purple: "var(--chart-4)",
  red: "var(--destructive)",
  teal: "var(--chart-5)",
  pink: "color-mix(in oklch, var(--chart-4) 72%, var(--chart-5))",
  yellow: "color-mix(in oklch, var(--chart-3) 78%, var(--chart-1))",
  total: "var(--chart-1)",
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

const TICK_STYLE = { fill: "var(--muted-foreground)", fontSize: 11 };
const TICK_STYLE_SM = { fill: "var(--muted-foreground)", fontSize: 10 };
const CHART_GRID_STROKE = "var(--border)";
const CHART_CURSOR_FILL = "color-mix(in oklch, var(--chart-1) 15%, transparent)";
const CHART_CURSOR_STROKE = "var(--chart-1)";
const USAGE_CHART_CONFIG = {} satisfies ChartConfig;

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
  const { language, t } = useI18n();
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
    <div className="usage-page flex h-full w-full flex-col overflow-hidden bg-background">
      <PageHeader
        title={t("usage.title")}
        description={t("usage.subtitle")}
        className="usage-header gap-4"
        mainClassName="usage-page-heading"
        titleClassName="shrink-0"
        descriptionClassName="usage-subtitle"
        actionsClassName="usage-header-actions max-[900px]:grid max-[900px]:grid-cols-[auto_auto_auto]"
        actions={
          <>
            {u.summary && (
              <div
                className="usage-meta inline-flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
                role="group"
                aria-label={t("usage.metaLabel")}
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "usage-badge h-6 rounded-md px-2 text-xs font-bold whitespace-nowrap",
                    u.summary.pricing.source === "network" &&
                      "usage-badge-network border-chart-2/60 bg-chart-2/10 text-chart-2",
                    u.summary.pricing.source === "cache" &&
                      "usage-badge-cache border-chart-1/60 bg-chart-1/10 text-chart-1",
                    u.summary.pricing.source === "builtin" && "usage-badge-builtin",
                  )}
                  title={
                    u.summary.pricing.fetchedAtMs
                      ? `${t("usage.pricingFetched")}: ${formatShortDateTime(u.summary.pricing.fetchedAtMs)}`
                      : undefined
                  }
                >
                  {pricingSourceLabel(u.summary.pricing.source, t)}
                </Badge>
                {u.summary.lastScanMs && (
                  <span className="usage-meta-text truncate max-[900px]:hidden">
                    {t("usage.lastScan")}: {formatShortDateTime(u.summary.lastScanMs)}
                  </span>
                )}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="usage-icon-btn"
              onClick={handleRefreshPrice}
              disabled={u.refreshingPrice}
              title={u.refreshingPrice ? t("usage.refreshing") : t("usage.refresh")}
            >
              <RefreshCw className="size-4" />
              <span>{u.refreshingPrice ? t("usage.refreshing") : t("usage.refresh")}</span>
            </Button>
            <Button
              type="button"
              className={cn(
                "usage-icon-btn usage-icon-btn-primary",
                u.rescanning && "usage-icon-btn-busy [&_svg]:animate-spin",
              )}
              onClick={handleRescan}
              disabled={u.rescanning}
              title={u.rescanning ? t("usage.rescanning") : t("usage.rescan")}
            >
              <ScanLine className="size-4" />
              <span>{u.rescanning ? t("usage.rescanning") : t("usage.rescan")}</span>
            </Button>
          </>
        }
      />

      <div className="usage-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-4 pb-5">
        {isInitialLoading ? (
          <EmptyState title={t("usage.scanning")} />
        ) : isEmpty ? (
          <EmptyState title={t("usage.empty")} hint={t("usage.emptyHint")} />
        ) : (
          <>
            {u.error && (
              <div className="usage-error rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {u.error}
              </div>
            )}

            <Filters
              t={t}
              language={language}
              filter={u.filter}
              allProjects={u.summary?.allProjects ?? []}
              allModels={u.summary?.allModels ?? []}
              onChange={updateFilter}
              onReset={resetFilter}
            />

            <div className="usage-cockpit grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-[1180px]:grid-cols-1">
              <main className="usage-main-column flex min-w-0 flex-col gap-4">
                <section
                  className="usage-summary-grid grid grid-cols-[minmax(280px,0.9fr)_minmax(0,1.6fr)] gap-4 max-[900px]:grid-cols-1"
                  aria-label={t("usage.summaryLabel")}
                >
                  <Card className="usage-cost-panel overflow-hidden rounded-lg border-chart-1/30 bg-card">
                    <CardContent className="flex h-full min-h-[150px] flex-col justify-between gap-4 px-5">
                      <span className="usage-panel-label text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                        {t("usage.cards.totalCost")}
                      </span>
                      <strong className="usage-cost-value text-2xl font-extrabold tracking-tight text-chart-1">
                        {u.summary ? formatUSD(u.summary.totalCost) : "-"}
                      </strong>
                      <span className="usage-panel-subtle text-sm text-muted-foreground">
                        {t("usage.cards.totalCostHint")}
                      </span>
                    </CardContent>
                  </Card>
                  <div className="usage-kpi-grid grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
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

                <section
                  className="usage-trend-section rounded-xl border bg-card p-4 shadow-sm"
                  aria-label={t("usage.charts.trends")}
                >
                  <header className="usage-trend-toolbar mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="usage-trend-title text-base font-semibold">
                      {t("usage.charts.trends")}
                    </h3>
                    <div className="usage-trend-controls flex flex-wrap gap-2">
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
                        <ChartContainer
                          config={USAGE_CHART_CONFIG}
                          className="h-[300px] w-full aspect-auto"
                        >
                          {trendChartStyle === "curve" ? (
                            <AreaChart
                              data={activeCostTrendData}
                              margin={{ left: 8, right: 18, top: 10, bottom: 4 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke={CHART_GRID_STROKE}
                                vertical={false}
                              />
                              <XAxis dataKey="label" tick={TICK_STYLE_SM} />
                              <YAxis tick={TICK_STYLE} tickFormatter={(v) => `$${v}`} width={44} />
                              <ChartTooltip
                                itemSorter={sortTooltipItemsByValueDesc}
                                cursor={{ stroke: CHART_CURSOR_STROKE, strokeOpacity: 0.34 }}
                                content={
                                  <ChartTooltipContent
                                    formatter={(v) => formatUSD(tooltipNumber(v))}
                                    labelFormatter={(_, payload) =>
                                      payload?.[0]?.payload?.bucket ?? t("usage.charts.costTrend")
                                    }
                                  />
                                }
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
                                stroke={CHART_GRID_STROKE}
                                vertical={false}
                              />
                              <XAxis dataKey="label" tick={TICK_STYLE_SM} />
                              <YAxis tick={TICK_STYLE} tickFormatter={(v) => `$${v}`} width={44} />
                              <ChartTooltip
                                itemSorter={sortTooltipItemsByValueDesc}
                                cursor={{ fill: CHART_CURSOR_FILL }}
                                content={
                                  <ChartTooltipContent
                                    formatter={(v) => formatUSD(tooltipNumber(v))}
                                    labelFormatter={(_, payload) =>
                                      payload?.[0]?.payload?.bucket ?? t("usage.charts.costTrend")
                                    }
                                  />
                                }
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
                        </ChartContainer>
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
                        <ChartContainer
                          config={USAGE_CHART_CONFIG}
                          className="h-[240px] w-full aspect-auto"
                        >
                          {trendChartStyle === "curve" ? (
                            <AreaChart
                              data={activeTokenTrendData}
                              margin={{ left: 8, right: 18, top: 10, bottom: 4 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke={CHART_GRID_STROKE}
                                vertical={false}
                              />
                              <XAxis dataKey="label" tick={TICK_STYLE_SM} />
                              <YAxis
                                tick={TICK_STYLE}
                                tickFormatter={(v) => formatTokens(v)}
                                width={54}
                              />
                              <ChartTooltip
                                itemSorter={sortTooltipItemsByValueDesc}
                                cursor={{ stroke: CHART_CURSOR_STROKE, strokeOpacity: 0.34 }}
                                content={
                                  <ChartTooltipContent
                                    formatter={(v) => formatTokens(tooltipNumber(v))}
                                    labelFormatter={(_, payload) =>
                                      payload?.[0]?.payload?.bucket ?? t("usage.charts.tokenTrend")
                                    }
                                  />
                                }
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
                                stroke={CHART_GRID_STROKE}
                                vertical={false}
                              />
                              <XAxis dataKey="label" tick={TICK_STYLE_SM} />
                              <YAxis
                                tick={TICK_STYLE}
                                tickFormatter={(v) => formatTokens(v)}
                                width={54}
                              />
                              <ChartTooltip
                                itemSorter={sortTooltipItemsByValueDesc}
                                cursor={{ fill: CHART_CURSOR_FILL }}
                                content={
                                  <ChartTooltipContent
                                    formatter={(v) => formatTokens(tooltipNumber(v))}
                                    labelFormatter={(_, payload) =>
                                      payload?.[0]?.payload?.bucket ?? t("usage.charts.tokenTrend")
                                    }
                                  />
                                }
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
                        </ChartContainer>
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

              <aside
                className="usage-side-rail flex min-w-0 flex-col gap-4"
                aria-label={t("usage.sideRailLabel")}
              >
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
                  <div className="usage-token-stack flex flex-col gap-3">
                    <div className="usage-token-total rounded-md border bg-muted/30 p-3">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {t("usage.table.totalTokens")}
                      </span>
                      <strong className="mt-1 block font-mono text-lg">
                        {formatDetailedTokens(totalTokens)}
                      </strong>
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

            <section
              className="usage-detail-workspace shrink-0 overflow-visible rounded-xl border bg-card p-4 shadow-sm"
              aria-label={t("usage.details.title")}
            >
              <div className="usage-detail-header mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{t("usage.details.title")}</h2>
                  <p className="text-sm text-muted-foreground">{t("usage.details.hint")}</p>
                </div>
                <Badge variant="outline" className="usage-detail-count shrink-0 font-mono">
                  {u.summary ? `${u.summary.totalProjects} ${t("usage.table.project")}` : "-"}
                </Badge>
              </div>

              <div
                className="usage-tabs inline-flex max-w-full gap-1 overflow-x-auto rounded-md border bg-secondary p-1"
                role="tablist"
                aria-label={t("usage.details.title")}
              >
                {TAB_ORDER.map((key) => (
                  <Button
                    key={key}
                    type="button"
                    role="tab"
                    variant="ghost"
                    aria-selected={u.tab === key}
                    className={cn(
                      "usage-tab-btn h-auto shrink-0 gap-2 rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-transparent",
                      u.tab === key && "active bg-background text-foreground shadow-sm",
                    )}
                    onClick={() => u.setTab(key)}
                  >
                    <span>{t(`usage.tabs.${key}`)}</span>
                    <span className="usage-tab-count rounded-full bg-muted px-1.5 py-0.5 text-xs">
                      {tabCounts[key]}
                    </span>
                  </Button>
                ))}
              </div>

              <div className="usage-tab-body mt-4">
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
    <Card className={cn("usage-metric rounded-lg py-4", `usage-metric-${tone}`)} title={hint}>
      <CardContent className="flex flex-col gap-2 px-4">
        <span className="usage-metric-label text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <strong
          className={cn(
            "usage-metric-value font-mono text-xl font-bold",
            tone === "blue" && "text-chart-1",
            tone === "green" && "text-chart-2",
            tone === "orange" && "text-chart-3",
            tone === "purple" && "text-chart-4",
          )}
        >
          {value}
        </strong>
      </CardContent>
    </Card>
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
    <section className={cn("usage-panel rounded-lg border bg-card p-4 shadow-sm", className)}>
      <div className="usage-panel-header mb-3 flex items-center justify-between gap-3">
        <div className="usage-panel-title text-sm font-semibold">{title}</div>
        {actions && <div className="usage-panel-actions flex items-center gap-2">{actions}</div>}
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
    <SegmentedControl
      ariaLabel={t("usage.charts.style.ariaLabel")}
      value={value}
      onValueChange={onChange}
      className="usage-time-granularity usage-chart-style-switch"
      itemClassName="usage-time-granularity-btn"
      items={TREND_CHART_STYLE_ORDER.map((key) => ({
        value: key,
        label: t(`usage.charts.style.${key}`),
      }))}
    />
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
    <SegmentedControl
      ariaLabel={t("usage.charts.breakdown.ariaLabel")}
      value={value}
      onValueChange={onChange}
      className="usage-time-granularity usage-trend-mode-switch"
      itemClassName="usage-time-granularity-btn"
      items={TREND_BREAKDOWN_MODE_ORDER.map((key) => ({
        value: key,
        label: t(`usage.charts.breakdown.${key}`),
      }))}
    />
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
    <SegmentedControl
      ariaLabel={t("usage.granularity.ariaLabel")}
      value={value}
      onValueChange={onChange}
      className="usage-time-granularity"
      itemClassName="usage-time-granularity-btn"
      items={TIME_GRANULARITY_ORDER.map((key) => ({
        value: key,
        label: t(`usage.granularity.${key}`),
      }))}
    />
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
    <ul className="usage-legend-list mt-3 flex flex-wrap gap-2" aria-label={ariaLabel}>
      {items.map((item) => {
        const isHidden = hidden.has(item.key);
        const title = isHidden
          ? `${item.originalName} · ${hiddenLabel}`
          : `${item.originalName} · ${hint} · ${soloHint}`;
        return (
          <li key={item.key}>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className={cn(
                "usage-legend-chip h-auto gap-1.5 rounded-full px-2 py-1 text-xs",
                isHidden && "muted opacity-45",
              )}
              aria-pressed={!isHidden}
              title={title}
              onClick={() => onToggle(item.key)}
              onDoubleClick={() => onSolo?.(item.key)}
            >
              <span
                className="usage-legend-chip-swatch size-2.5 rounded-full border"
                style={{
                  background: isHidden ? "transparent" : item.color,
                  borderColor: item.color,
                }}
                aria-hidden="true"
              />
              <span className="usage-legend-chip-name max-w-40 truncate">{item.displayName}</span>
              {item.meta && (
                <span className="usage-legend-chip-meta font-mono text-muted-foreground">
                  {item.meta}
                </span>
              )}
            </Button>
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
      <div className="usage-model-donut relative">
        <ChartContainer config={USAGE_CHART_CONFIG} className="h-[150px] w-full aspect-auto">
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
              stroke="var(--background)"
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <ChartTooltip
              content={<ChartTooltipContent formatter={(v) => formatUSD(tooltipNumber(v))} />}
            />
          </PieChart>
        </ChartContainer>
        <div
          className="usage-model-donut-center pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
          aria-hidden="true"
        >
          <span className="text-xs text-muted-foreground">{label}</span>
          <strong className="font-mono text-base">{formatUSD(total)}</strong>
        </div>
      </div>

      <div
        className="usage-model-share-list mt-3 flex flex-col gap-3"
        role="list"
        aria-label={label}
      >
        {data.map((item) => (
          <div
            key={item.name}
            className="usage-model-share-item flex flex-col gap-1"
            role="listitem"
          >
            <div className="usage-model-share-row grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 text-sm">
              <span
                className="usage-model-swatch size-2.5 rounded-full"
                style={{ background: item.color }}
              />
              <span className="usage-model-name truncate" title={item.name}>
                {item.name}
              </span>
              <span className="usage-model-percent font-mono text-muted-foreground">
                {item.percent.toFixed(1)}%
              </span>
              <strong className="usage-model-cost font-mono">{formatUSD(item.value)}</strong>
            </div>
            <div
              className="usage-model-track h-1.5 overflow-hidden rounded-full bg-muted"
              aria-hidden="true"
            >
              <span
                className="block h-full rounded-full"
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
  language: ReturnType<typeof useI18n>["language"];
  filter: UsageFilter;
  allProjects: { projectPath: string; projectDir: string }[];
  allModels: string[];
  onChange: (patch: Partial<UsageFilter>) => void;
  onReset: () => void;
}

function Filters({ t, language, filter, allProjects, allModels, onChange, onReset }: FiltersProps) {
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
    <div
      className="usage-command-bar sticky top-0 z-10 flex flex-wrap items-end gap-3 rounded-lg border bg-card/95 p-3 shadow-sm backdrop-blur"
      role="group"
      aria-label={t("usage.filter.ariaLabel")}
    >
      <div className="usage-filter-cluster usage-filter-cluster-date flex min-w-[296px] flex-col gap-1">
        <span className="usage-filter-label text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
          {t("usage.filter.dateRange")}
        </span>
        <div className="usage-date-range flex items-center gap-2">
          <DatePickerField
            label={t("usage.filter.startDate")}
            language={language}
            value={filter.startDate}
            placeholder={t("usage.filter.noDate")}
            onChange={(value) => onChange({ startDate: value })}
          />
          <span className="usage-date-sep text-muted-foreground">-</span>
          <DatePickerField
            label={t("usage.filter.endDate")}
            language={language}
            value={filter.endDate}
            placeholder={t("usage.filter.noDate")}
            onChange={(value) => onChange({ endDate: value })}
          />
        </div>
      </div>
      <div
        className="usage-quick-ranges flex flex-wrap gap-1"
        role="group"
        aria-label={t("usage.filter.quick.ariaLabel")}
      >
        {DATE_RANGE_PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            variant={activePreset === preset ? "default" : "outline"}
            size="xs"
            className={cn(
              "usage-quick-range-btn h-auto rounded-md px-2.5 py-1 text-xs font-semibold",
              activePreset !== preset && "text-muted-foreground",
              activePreset === preset && "active",
            )}
            aria-pressed={activePreset === preset}
            onClick={() => onChange(getDateRangePresetPatch(preset))}
          >
            {t(`usage.filter.quick.${preset}`)}
          </Button>
        ))}
      </div>
      <label className="usage-filter-cluster flex min-w-38 flex-col gap-1">
        <span className="usage-filter-label text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
          {t("usage.filter.project")}
        </span>
        <select
          className="h-8 w-full rounded-md border bg-background px-2 text-sm"
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
      <label className="usage-filter-cluster flex min-w-38 flex-col gap-1">
        <span className="usage-filter-label text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
          {t("usage.filter.model")}
        </span>
        <select
          className="h-8 w-full rounded-md border bg-background px-2 text-sm"
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="usage-reset-btn"
        onClick={onReset}
        disabled={!hasActiveFilter}
      >
        {t("usage.filter.reset")}
      </Button>
    </div>
  );
}

interface DatePickerFieldProps {
  label: string;
  language: ReturnType<typeof useI18n>["language"];
  value?: string;
  placeholder: string;
  onChange: (value: string | undefined) => void;
}

function DatePickerField({ label, language, value, placeholder, onChange }: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateInputValue(value);
  const displayValue = value ? formatDateDisplayValue(value) : placeholder;
  const calendarLocale = language === "zh" ? zhCN : enUS;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 min-w-32 justify-start px-2 font-normal",
            !value && "text-muted-foreground",
          )}
          aria-label={`${label} ${displayValue}`}
        >
          <CalendarIcon data-icon="inline-start" />
          <span>{displayValue}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate}
          locale={calendarLocale}
          captionLayout="dropdown"
          onSelect={(date) => {
            onChange(date ? formatDateInputValue(date) : undefined);
            if (date) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
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

function formatDateDisplayValue(value: string): string {
  return value.replaceAll("-", "/");
}

function parseDateInputValue(value?: string): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
}

function DailyTable({ rows, t }: { rows: DailyUsage[]; t: ReturnType<typeof useI18n>["t"] }) {
  if (rows.length === 0) return <EmptyTable t={t} />;
  return (
    <div className="usage-table-wrap overflow-x-auto rounded-lg border">
      <table className="usage-table w-full min-w-[860px] border-collapse text-sm [&_.accent-green]:text-chart-2 [&_.ellipsis]:max-w-[260px] [&_.ellipsis]:truncate [&_.mono]:font-mono [&_.num]:text-right [&_.strong-cell]:font-medium [&_tbody_tr:last-child_td]:border-b-0 [&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-muted-foreground">
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
    <div className="usage-table-wrap overflow-x-auto rounded-lg border">
      <table className="usage-table w-full min-w-[920px] border-collapse text-sm [&_.accent-green]:text-chart-2 [&_.ellipsis]:max-w-[260px] [&_.ellipsis]:truncate [&_.mono]:font-mono [&_.num]:text-right [&_.strong-cell]:font-medium [&_tbody_tr:last-child_td]:border-b-0 [&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-muted-foreground">
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
    <div className="usage-table-wrap overflow-x-auto rounded-lg border">
      <table className="usage-table w-full min-w-[920px] border-collapse text-sm [&_.accent-green]:text-chart-2 [&_.ellipsis]:max-w-[260px] [&_.ellipsis]:truncate [&_.model-cell]:max-w-[220px] [&_.model-cell]:truncate [&_.mono]:font-mono [&_.num]:text-right [&_.strong-cell]:font-medium [&_tbody_tr:last-child_td]:border-b-0 [&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-muted-foreground">
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
                className="usage-table-row-clickable cursor-pointer hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary"
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
    <div className="usage-table-wrap overflow-x-auto rounded-lg border">
      <table className="usage-table w-full min-w-[760px] border-collapse text-sm [&_.accent-green]:text-chart-2 [&_.mono]:font-mono [&_.num]:text-right [&_.strong-cell]:font-medium [&_tbody_tr:last-child_td]:border-b-0 [&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-muted-foreground">
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
    <div className="usage-token-row flex flex-col gap-1">
      <div className="usage-token-row-head flex items-center justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="font-mono text-muted-foreground">{formatDetailedTokens(value)}</span>
      </div>
      <div
        className="usage-token-track h-2 overflow-hidden rounded-full bg-muted"
        aria-hidden="true"
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(percentage, value > 0 ? 3 : 0)}%`, background: color }}
        />
      </div>
      <span className="usage-token-percent text-right font-mono text-xs text-muted-foreground">
        {percentage.toFixed(1)}%
      </span>
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
    <div className="usage-warning rounded-lg border border-chart-3/40 bg-chart-3/10 p-4">
      <div className="usage-warning-title flex items-center gap-2 text-sm">
        <TriangleAlert className="size-4" />
        <strong>{t("usage.unknownModels")}</strong>
      </div>
      <span className="usage-warning-hint mt-1 block text-sm text-muted-foreground">
        {t("usage.unknownModelsHint")}
      </span>
      <div className="usage-warning-models mt-3 flex flex-wrap gap-2">
        {models.map((m) => (
          <code key={m} className="rounded-md border bg-background px-2 py-1 text-xs">
            {m}
          </code>
        ))}
      </div>
    </div>
  );
}

function EmptyTable({ t }: { t: ReturnType<typeof useI18n>["t"] }) {
  return (
    <div className="usage-no-data rounded-lg border bg-muted/30 p-6 text-center text-muted-foreground">
      {t("usage.empty")}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="usage-empty flex min-h-[320px] flex-1 flex-col items-center justify-center p-8 text-center">
      <p className="empty-text text-base font-bold text-foreground">{title}</p>
      {hint && <p className="empty-hint mt-2 max-w-md text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NoData() {
  return <p className="usage-no-data py-6 text-center text-muted-foreground">-</p>;
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

export default UsagePage;
