import { BarChart3, ChevronRight, Pencil, RefreshCw } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { showOperationError } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";
import { useToast } from "../hooks/useToast";
import { type TranslationKey, useI18n } from "../i18n";
import { ipc } from "../ipc";
import { type ClaudeStats, isTauri, type ProjectStats } from "../types";
import EmptyState from "./EmptyState";
import PageHeader from "./PageHeader";
import { formatDuration } from "./project-detail-utils";
import { CONTROL_SURFACE_CLASS, PANEL_SURFACE_CLASS } from "./surface-classes";
import { TYPOGRAPHY } from "./typography-classes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "./ui/chart";
import { formatTokens, shortPath } from "./usage/format";

const TOOL_USAGE_CURSOR_STYLE = {
  fill: "color-mix(in oklch, var(--chart-1) 15%, transparent)",
};
const TOOL_USAGE_ACTIVE_BAR_STYLE = {
  fill: "var(--color-count)",
  fillOpacity: 0.96,
  stroke: "var(--color-count)",
  strokeWidth: 1.2,
};

function chartHeightStyle(height: number): CSSProperties {
  return { "--tool-chart-height": `${height}px` } as CSSProperties;
}

/** 格式化日期 */
function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return isoStr;
  }
}

/** 格式化毫秒时间戳为日期 */
function formatTimestamp(ms: number): string {
  try {
    return formatDate(new Date(ms).toISOString());
  } catch {
    return "-";
  }
}

/** 截断文本 */
function truncateText(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

function StatsPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [stats, setStats] = useState<ClaudeStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    try {
      const s = await ipc.getStats();
      setStats(s);
    } catch (error) {
      showOperationError(showToast, t("stats.loadError"), error);
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleRefresh() {
    if (!isTauri()) return;
    try {
      await loadData();
      showToast(t("stats.refreshed"));
    } catch (error) {
      showOperationError(showToast, t("stats.refreshError"), error);
    }
  }

  async function handleOpenInEditor() {
    if (!isTauri()) return;
    try {
      await ipc.openClaudeJsonInEditor();
    } catch (error) {
      showOperationError(showToast, t("stats.openEditorError"), error);
    }
  }

  const toolUsageChartConfig = useMemo(
    () =>
      ({
        count: {
          label: t("stats.toolUsage"),
          color: "var(--chart-1)",
        },
      }) satisfies ChartConfig,
    [t],
  );

  const toolUsageData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.toolUsage)
      .map(([name, entry]) => ({ name, count: entry.usageCount }))
      .sort((a, b) => b.count - a.count);
  }, [stats]);

  const skillUsageData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.skillUsage)
      .map(([name, entry]) => ({ name, count: entry.usageCount }))
      .sort((a, b) => b.count - a.count);
  }, [stats]);

  const projectEntries = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.projects).sort(
      ([, a], [, b]) => b.lastSessionModified - a.lastSessionModified,
    );
  }, [stats]);

  if (loading) {
    return (
      <div className="stats-page flex h-full w-full flex-col overflow-hidden bg-secondary">
        <PageHeader title={t("stats.title")} surface="secondary" />
        <div className="stats-scroll min-h-0 flex-1 overflow-y-auto bg-secondary p-5">
          <EmptyState title={t("loading")} loading className="min-h-[320px]" />
        </div>
      </div>
    );
  }

  if (!stats || stats.numStartups === 0) {
    return (
      <div className="stats-page flex h-full w-full flex-col overflow-hidden bg-secondary">
        <PageHeader title={t("stats.title")} surface="secondary" />
        <div className="stats-scroll min-h-0 flex-1 overflow-y-auto bg-secondary p-5">
          <EmptyState
            title={t("stats.noData")}
            hint={t("stats.noDataHint")}
            icon={BarChart3}
            className="min-h-[320px]"
          />
        </div>
      </div>
    );
  }

  const projectCount = Object.keys(stats.projects).length;

  return (
    <div className="stats-page flex h-full w-full flex-col overflow-hidden bg-secondary">
      <PageHeader
        title={t("stats.title")}
        surface="secondary"
        description={t("stats.stalenessNotice")}
        mainClassName="stats-page-heading"
        titleClassName="shrink-0"
        descriptionClassName="stats-staleness-note"
        actionsClassName="max-[900px]:grid max-[900px]:grid-cols-[repeat(2,2rem)] max-[900px]:items-center max-[900px]:justify-end max-[900px]:justify-items-center"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="stats-refresh-btn max-[900px]:size-8 max-[900px]:gap-0 max-[900px]:p-0"
              onClick={handleOpenInEditor}
              title={t("stats.openInEditor")}
            >
              <Pencil className="size-4" />
              <span className="max-[900px]:sr-only">{t("stats.openInEditor")}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="stats-refresh-btn max-[900px]:size-8 max-[900px]:gap-0 max-[900px]:p-0"
              onClick={handleRefresh}
              title={t("stats.refresh")}
            >
              <RefreshCw className="size-4" />
              <span className="max-[900px]:sr-only">{t("stats.refresh")}</span>
            </Button>
          </>
        }
      />

      <div className="stats-scroll min-h-0 flex-1 overflow-y-auto bg-secondary p-5">
        <div className="stats-overview mb-5 grid grid-cols-1 gap-3 min-[601px]:grid-cols-2 min-[901px]:grid-cols-3">
          <StatCard
            label={t("stats.startups")}
            value={stats.numStartups}
            valueClassName="text-chart-1"
          />
          <StatCard
            label={t("stats.firstUse")}
            value={stats.firstStartTime ? formatDate(stats.firstStartTime) : "-"}
            valueClassName="text-chart-4"
          />
          <StatCard
            label={t("stats.totalProjects")}
            value={projectCount}
            valueClassName="text-chart-3"
          />
          {stats.lastPlanModeUse != null && (
            <StatCard
              label={t("stats.lastPlanModeUse")}
              value={formatTimestamp(stats.lastPlanModeUse)}
              valueClassName="text-chart-4"
            />
          )}
          {stats.btwUseCount != null && (
            <StatCard
              label={t("stats.btwUseCount")}
              value={stats.btwUseCount}
              valueClassName="text-chart-1"
            />
          )}
        </div>

        <details
          open
          className={cn(
            "stats-section stats-section-collapsible group mb-5 rounded-xl border",
            PANEL_SURFACE_CLASS,
          )}
        >
          <summary className="stats-section-title stats-section-summary flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-base font-semibold group-open:border-b [&::-webkit-details-marker]:hidden">
            {t("stats.toolSection")}
            <span className="stats-summary-count text-sm font-normal text-muted-foreground group-open:hidden">
              {toolUsageData.length} {t("stats.toolUsage")} · {skillUsageData.length}{" "}
              {t("stats.skillUsage")}
            </span>
            <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <div className="stats-chart-group grid gap-5 p-5 lg:grid-cols-2">
            <div className="stats-chart-block rounded-lg border bg-card p-3 shadow-xs">
              <div className="stats-chart-label mb-4 inline-flex rounded-md border bg-background px-2 py-0.5 text-sm font-semibold text-muted-foreground">
                {t("stats.toolUsage")}
              </div>
              {toolUsageData.length > 0 ? (
                <ChartContainer
                  config={toolUsageChartConfig}
                  className="h-[var(--tool-chart-height)] min-h-[200px] w-full aspect-auto"
                  style={chartHeightStyle(Math.max(200, toolUsageData.length * 36))}
                >
                  <BarChart
                    accessibilityLayer
                    data={toolUsageData}
                    layout="vertical"
                    margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
                  >
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={90}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <ChartTooltip
                      cursor={TOOL_USAGE_CURSOR_STYLE}
                      content={<ChartTooltipContent hideLabel />}
                    />
                    <Bar
                      dataKey="count"
                      fill="var(--color-count)"
                      fillOpacity={0.88}
                      radius={[0, 4, 4, 0]}
                      activeBar={TOOL_USAGE_ACTIVE_BAR_STYLE}
                    />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="stats-no-data py-4 text-center text-sm text-muted-foreground">-</p>
              )}
            </div>
            <div className="stats-chart-block rounded-lg border bg-card p-3 shadow-xs">
              <div className="stats-chart-label mb-4 inline-flex rounded-md border bg-background px-2 py-0.5 text-sm font-semibold text-muted-foreground">
                {t("stats.skillUsage")}
              </div>
              {skillUsageData.length > 0 ? (
                <div className="stats-list flex flex-col gap-2">
                  {skillUsageData.map((item) => (
                    <div
                      key={item.name}
                      className="stats-list-item flex items-center justify-between gap-3 rounded-md border bg-card px-4 py-3 shadow-xs"
                    >
                      <span className="stats-list-item-name min-w-0 truncate font-medium">
                        {item.name}
                      </span>
                      <Badge variant="outline" className="stats-list-item-value font-mono">
                        {item.count} {t("stats.calls")}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="stats-no-data py-4 text-center text-sm text-muted-foreground">-</p>
              )}
            </div>
          </div>
        </details>

        <details
          open
          className={cn(
            "stats-section stats-section-collapsible stats-project-section group rounded-xl border",
            PANEL_SURFACE_CLASS,
          )}
        >
          <summary className="stats-section-title stats-section-summary flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-base font-semibold group-open:border-b [&::-webkit-details-marker]:hidden">
            {t("stats.sessionSection")}
            <span className="stats-summary-count text-sm font-normal text-muted-foreground group-open:hidden">
              {projectEntries.length} {t("stats.totalProjects")}
            </span>
            <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <p className="stats-project-section-hint px-5 pt-4 pb-0 text-sm leading-relaxed text-muted-foreground">
            {t("stats.projectSectionHint")}
          </p>

          <div className="stats-project-list flex flex-col gap-5 p-5">
            {projectEntries.map(([path, p]) => (
              <ProjectCard key={path} path={path} project={p} t={t} />
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card className="stat-card rounded-lg py-3">
      <CardContent className="flex flex-col gap-1 px-4">
        <span className="stat-card-label text-sm font-medium text-muted-foreground">{label}</span>
        <span className={cn("stat-card-value", TYPOGRAPHY.metricValue, valueClassName)}>
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

function ProjectMetric({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        "stats-project-metric flex min-w-0 flex-col gap-1 rounded-md border p-3",
        PANEL_SURFACE_CLASS,
      )}
    >
      <span className="stats-project-metric-label text-xs font-bold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={cn(
          "stats-project-metric-value font-mono text-base font-bold [overflow-wrap:anywhere]",
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}

function PerformanceMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      className={cn("stats-performance-card min-w-0 rounded-md border p-3", PANEL_SURFACE_CLASS)}
    >
      <div className="stats-metric-label mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="stats-metric-value font-mono text-lg font-bold">{value}</div>
    </div>
  );
}

/** 单个项目的数据卡片 */
function ProjectCard({
  path,
  project: p,
  t,
}: {
  path: string;
  project: ProjectStats;
  t: (key: TranslationKey) => string;
}) {
  const modelEntries = p.lastModelUsage ? Object.entries(p.lastModelUsage) : [];

  return (
    <details
      className={cn(
        "stats-project-card group/project-card overflow-hidden rounded-lg border",
        PANEL_SURFACE_CLASS,
      )}
    >
      <summary className="stats-project-header flex min-h-[72px] cursor-pointer list-none items-center justify-between gap-4 border-l-[3px] border-l-transparent p-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary group-open/project-card:border-l-primary group-open/project-card:bg-muted/40 max-[600px]:flex-wrap max-[600px]:items-start max-[600px]:gap-3 [&::-webkit-details-marker]:hidden">
        <div className="stats-project-title flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="stats-project-name font-mono text-base font-bold leading-tight">
            {shortPath(path)}
          </span>
          <span
            className="stats-project-session-id block max-w-[min(48vw,560px)] truncate font-mono text-xs tabular-nums text-muted-foreground max-[600px]:w-full max-[600px]:max-w-none"
            title={p.lastSessionId || "-"}
          >
            {p.lastSessionId || "-"}
          </span>
          {p.lastSessionFirstPrompt && (
            <span className="stats-project-prompt truncate text-sm text-muted-foreground">
              {truncateText(p.lastSessionFirstPrompt, 60)}
            </span>
          )}
        </div>
        <div className="stats-project-summary flex shrink-0 items-center justify-end gap-2 max-[600px]:order-2 max-[600px]:w-full max-[600px]:justify-start">
          <Badge
            variant="outline"
            className="stats-project-badge min-w-[72px] justify-center rounded-md font-mono"
          >
            ${p.lastCost.toFixed(2)}
          </Badge>
          <Badge
            variant="outline"
            className="stats-project-badge min-w-[72px] justify-center rounded-md font-mono"
          >
            {formatDuration(p.lastDuration)}
          </Badge>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open/project-card:rotate-90" />
      </summary>

      <div className="stats-project-body flex flex-col gap-4 border-t bg-muted/20 p-4">
        <div className="stats-project-metrics grid grid-cols-1 gap-2 min-[601px]:grid-cols-2 min-[901px]:grid-cols-4">
          <ProjectMetric label={t("stats.projectCost")} value={`$${p.lastCost.toFixed(2)}`} />
          <ProjectMetric
            label={t("stats.sessionDuration")}
            value={formatDuration(p.lastDuration)}
          />
          <ProjectMetric
            label={t("stats.projectLinesAdded")}
            value={`+${p.lastLinesAdded}`}
            valueClassName="text-chart-2"
          />
          <ProjectMetric
            label={t("stats.projectLinesRemoved")}
            value={`-${p.lastLinesRemoved}`}
            valueClassName="text-chart-1"
          />
          <ProjectMetric
            label={t("stats.projectInputTokens")}
            value={formatTokens(p.lastTotalInputTokens)}
          />
          <ProjectMetric
            label={t("stats.projectOutputTokens")}
            value={formatTokens(p.lastTotalOutputTokens)}
          />
          <ProjectMetric
            label={t("stats.projectCacheCreation")}
            value={formatTokens(p.lastTotalCacheCreationInputTokens)}
          />
          <ProjectMetric
            label={t("stats.projectCacheRead")}
            value={formatTokens(p.lastTotalCacheReadInputTokens)}
          />
          {p.lastTotalWebSearchRequests > 0 && (
            <ProjectMetric
              label={t("stats.projectWebSearch")}
              value={p.lastTotalWebSearchRequests}
            />
          )}
        </div>

        {modelEntries.length > 0 && (
          <section className="stats-project-detail-section flex flex-col gap-2">
            <div className="stats-project-detail-title text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
              {t("stats.projectModelBreakdown")}
            </div>
            <div
              className={cn(
                "stats-model-table-wrap overflow-x-auto rounded-md border",
                CONTROL_SURFACE_CLASS,
              )}
            >
              <div className="stats-model-table min-w-[640px]">
                <div className="stats-model-header grid grid-cols-[minmax(220px,1fr)_repeat(3,minmax(96px,auto))] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-extrabold tracking-wide text-muted-foreground uppercase [&>span:not(:first-child)]:text-right">
                  <span>{t("stats.projectModel")}</span>
                  <span>{t("stats.projectInputTokens")}</span>
                  <span>{t("stats.projectOutputTokens")}</span>
                  <span>{t("stats.projectCostUsd")}</span>
                </div>
                {modelEntries.map(([model, usage]) => (
                  <div
                    key={model}
                    className="stats-model-row grid grid-cols-[minmax(220px,1fr)_repeat(3,minmax(96px,auto))] gap-3 border-b px-3 py-2 font-mono text-sm last:border-b-0 hover:bg-muted/40 [&>span:not(:first-child)]:text-right"
                  >
                    <span className="stats-model-name truncate">{model}</span>
                    <span>{formatTokens(usage.inputTokens)}</span>
                    <span>{formatTokens(usage.outputTokens)}</span>
                    <span>${usage.costUsd.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {p.lastSessionFirstPrompt && (
          <section className="stats-project-detail-section stats-project-prompt-full flex flex-col gap-2">
            <div className="stats-project-detail-title text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
              {t("stats.projectFirstPrompt")}
            </div>
            <p
              className={cn(
                "stats-project-prompt-text m-0 whitespace-pre-wrap rounded-md border p-3 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]",
                CONTROL_SURFACE_CLASS,
              )}
            >
              {p.lastSessionFirstPrompt}
            </p>
          </section>
        )}

        {p.lastSessionMetrics && (
          <section className="stats-project-detail-section flex flex-col gap-2">
            <div className="stats-project-detail-title text-xs font-extrabold tracking-widest text-muted-foreground uppercase">
              {t("stats.performance")}
            </div>
            <div className="stats-performance-grid grid grid-cols-1 gap-2 min-[601px]:grid-cols-2 min-[901px]:grid-cols-4">
              <PerformanceMetric
                label={t("stats.frameAvg")}
                value={`${p.lastSessionMetrics.frame_duration_ms_avg.toFixed(1)}ms`}
              />
              <PerformanceMetric
                label={t("stats.frameP95")}
                value={`${p.lastSessionMetrics.frame_duration_ms_p95.toFixed(1)}ms`}
              />
              {p.lastSessionMetrics.hook_duration_ms_avg != null && (
                <PerformanceMetric
                  label={t("stats.hookAvg")}
                  value={`${p.lastSessionMetrics.hook_duration_ms_avg.toFixed(1)}ms`}
                />
              )}
              {p.lastSessionMetrics.hook_duration_ms_p95 != null && (
                <PerformanceMetric
                  label={t("stats.hookP95")}
                  value={`${p.lastSessionMetrics.hook_duration_ms_p95.toFixed(1)}ms`}
                />
              )}
            </div>
          </section>
        )}
      </div>
    </details>
  );
}

export default StatsPage;
