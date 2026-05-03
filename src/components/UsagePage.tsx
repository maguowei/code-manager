import { useCallback, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useToast } from "../hooks/useToast";
import useUsage from "../hooks/useUsage";
import { useI18n } from "../i18n";
import type {
  DailyUsage,
  ModelUsageStat,
  ProjectUsage,
  SessionUsage,
  UsageFilter,
  UsageTab,
} from "../types";
import { formatUSD } from "./project-detail-utils";
import "./UsagePage.css";
import {
  formatCost,
  formatShortDateTime,
  formatTokens,
  shortPath,
  shortSessionId,
} from "./usage/format";
import SessionUsageDrawer from "./usage/SessionUsageDrawer";

// 复用 StatsPage 的色板，避免每个图表色调不一致
const COLORS = {
  blue: "#58a6ff",
  green: "#3fb950",
  orange: "#f78166",
  purple: "#bc8cff",
  red: "#f85149",
  teal: "#39d2c0",
  pink: "#f778ba",
  yellow: "#d29922",
};
const PIE_COLORS = [
  COLORS.blue,
  COLORS.green,
  COLORS.orange,
  COLORS.purple,
  COLORS.teal,
  COLORS.pink,
  COLORS.yellow,
  COLORS.red,
];

const TICK_STYLE = { fill: "#7d8590", fontSize: 11 };
const TICK_STYLE_SM = { fill: "#7d8590", fontSize: 10 };
const TOOLTIP_STYLE = {
  backgroundColor: "rgba(22, 27, 34, 0.92)",
  border: "1px solid #30363d",
  borderRadius: 8,
  color: "#e6edf3",
  backdropFilter: "blur(12px)",
  boxShadow: "0 8px 16px rgba(0, 0, 0, 0.15)",
};

function UsagePage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const u = useUsage();
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

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
      u.setFilter((prev) => ({ ...prev, ...patch }));
    },
    [u],
  );

  const resetFilter = useCallback(() => {
    u.setFilter({});
  }, [u]);

  // ===== 派生数据：图表 =====

  // 每日花费按 model 堆叠：行 = date，列 = 各 model cost
  const dailyChartData = useMemo(() => {
    const allModels = new Set<string>();
    for (const d of u.daily) {
      for (const m of d.byModel) allModels.add(m.model);
    }
    const sortedModels = Array.from(allModels).sort();
    const rows = u.daily.map((d) => {
      const row: Record<string, string | number> = { date: d.date };
      for (const m of sortedModels) {
        const found = d.byModel.find((x) => x.model === m);
        row[m] = found ? +found.cost.toFixed(4) : 0;
      }
      return row;
    });
    return { rows, models: sortedModels };
  }, [u.daily]);

  // 模型成本占比饼图
  const modelPieData = useMemo(
    () =>
      u.models.filter((m) => m.cost > 0).map((m) => ({ name: m.model, value: +m.cost.toFixed(4) })),
    [u.models],
  );

  // Token 类型构成（横向条形图，按 model 分行）
  const tokenBreakdownData = useMemo(
    () =>
      u.models.slice(0, 8).map((m) => ({
        name: shortModelName(m.model),
        input: m.inputTokens,
        output: m.outputTokens,
        cacheCreate: m.cacheCreationTokens,
        cacheRead: m.cacheReadTokens,
      })),
    [u.models],
  );

  // 缓存节省额：cache_read 命中相对于直接 input 的差额
  const cacheSavings = useMemo(() => {
    if (!u.summary) return 0;
    const pricing = u.summary.pricing.models;
    let saved = 0;
    for (const m of u.models) {
      const price = pricing[m.model];
      if (!price) continue;
      saved += (m.cacheReadTokens * (price.input - price.cache_read)) / 1_000_000;
    }
    return saved;
  }, [u.summary, u.models]);

  // ===== 渲染 =====
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
        <div className="usage-header-left">
          <h1 className="page-title">{t("usage.title")}</h1>
          <p className="usage-subtitle">{t("usage.subtitle")}</p>
        </div>
        <div className="usage-header-actions">
          {u.summary && (
            <div className="usage-meta">
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
            className="usage-btn usage-btn-secondary"
            onClick={handleRefreshPrice}
            disabled={u.refreshingPrice}
          >
            {u.refreshingPrice ? t("usage.refreshing") : t("usage.refresh")}
          </button>
          <button
            type="button"
            className="usage-btn usage-btn-primary"
            onClick={handleRescan}
            disabled={u.rescanning}
          >
            {u.rescanning ? t("usage.rescanning") : t("usage.rescan")}
          </button>
        </div>
      </div>

      <div className="usage-scroll">
        {isInitialLoading ? (
          <div className="usage-empty">
            <p className="empty-text">{t("usage.scanning")}</p>
          </div>
        ) : isEmpty ? (
          <div className="usage-empty">
            <p className="empty-text">{t("usage.empty")}</p>
            <p className="empty-hint">{t("usage.emptyHint")}</p>
          </div>
        ) : (
          <>
            {u.error && <div className="usage-error">{u.error}</div>}

            {/* 筛选区 */}
            <Filters
              t={t}
              filter={u.filter}
              allProjects={u.summary?.allProjects ?? []}
              allModels={u.summary?.allModels ?? []}
              onChange={updateFilter}
              onReset={resetFilter}
            />

            {/* 概览卡片 */}
            <div className="usage-cards">
              <Card
                label={t("usage.cards.totalCost")}
                value={u.summary ? formatUSD(u.summary.totalCost) : "-"}
                accent="green"
              />
              <Card
                label={t("usage.cards.totalSessions")}
                value={u.summary ? String(u.summary.totalSessions) : "-"}
                accent="blue"
              />
              <Card
                label={t("usage.cards.totalMessages")}
                value={u.summary ? String(u.summary.totalMessages) : "-"}
                accent="purple"
              />
              <Card
                label={t("usage.cards.cacheSavings")}
                value={formatUSD(cacheSavings)}
                accent="orange"
                hint={t("usage.cards.cacheSavingsHint")}
              />
            </div>

            {/* 未识别模型警告 */}
            {u.summary && u.summary.unknownModels.length > 0 && (
              <div className="usage-warning">
                <strong>{t("usage.unknownModels")}</strong>
                <span className="usage-warning-hint">{t("usage.unknownModelsHint")}</span>
                <div className="usage-warning-models">
                  {u.summary.unknownModels.map((m) => (
                    <code key={m}>{m}</code>
                  ))}
                </div>
              </div>
            )}

            {/* 图表 */}
            <div className="usage-charts">
              <ChartCard title={t("usage.charts.dailyCost")}>
                {dailyChartData.rows.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart
                      data={dailyChartData.rows}
                      margin={{ left: 10, right: 16, top: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                      <XAxis dataKey="date" tick={TICK_STYLE_SM} />
                      <YAxis tick={TICK_STYLE} tickFormatter={(v) => `$${v}`} />
                      <Tooltip
                        formatter={(v: number | undefined) => formatUSD(v ?? 0)}
                        contentStyle={TOOLTIP_STYLE}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {dailyChartData.models.map((m, idx) => (
                        <Area
                          key={m}
                          type="monotone"
                          dataKey={m}
                          stackId="cost"
                          stroke={PIE_COLORS[idx % PIE_COLORS.length]}
                          fill={PIE_COLORS[idx % PIE_COLORS.length]}
                          fillOpacity={0.5}
                          strokeWidth={1.5}
                          name={shortModelName(m)}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="usage-no-data">-</p>
                )}
              </ChartCard>

              <ChartCard title={t("usage.charts.byModel")}>
                {modelPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={modelPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                        label={({ name, value }) =>
                          `${shortModelName(name as string)} ${formatUSD((value as number) ?? 0)}`
                        }
                        labelLine={false}
                      >
                        {modelPieData.map((entry, i) => (
                          <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number | undefined) => formatUSD(v ?? 0)}
                        contentStyle={TOOLTIP_STYLE}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="usage-no-data">-</p>
                )}
              </ChartCard>

              <ChartCard title={t("usage.charts.tokenBreakdown")}>
                {tokenBreakdownData.length > 0 ? (
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(220, tokenBreakdownData.length * 36)}
                  >
                    <BarChart
                      data={tokenBreakdownData}
                      layout="vertical"
                      margin={{ left: 20, right: 20, top: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#30363d" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={TICK_STYLE}
                        tickFormatter={(v) => formatTokens(v)}
                      />
                      <YAxis type="category" dataKey="name" width={140} tick={TICK_STYLE} />
                      <Tooltip
                        formatter={(v: number | undefined) => formatTokens(v ?? 0)}
                        contentStyle={TOOLTIP_STYLE}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="input"
                        stackId="t"
                        fill={COLORS.blue}
                        name={t("usage.charts.tokenInput")}
                      />
                      <Bar
                        dataKey="output"
                        stackId="t"
                        fill={COLORS.green}
                        name={t("usage.charts.tokenOutput")}
                      />
                      <Bar
                        dataKey="cacheCreate"
                        stackId="t"
                        fill={COLORS.orange}
                        name={t("usage.charts.tokenCacheCreate")}
                      />
                      <Bar
                        dataKey="cacheRead"
                        stackId="t"
                        fill={COLORS.purple}
                        name={t("usage.charts.tokenCacheRead")}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="usage-no-data">-</p>
                )}
              </ChartCard>
            </div>

            {/* Tab 切换 */}
            <div className="usage-tabs">
              {(["daily", "project", "session", "model"] as UsageTab[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`usage-tab-btn ${u.tab === key ? "active" : ""}`}
                  onClick={() => u.setTab(key)}
                >
                  {t(`usage.tabs.${key}`)}
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
          </>
        )}
      </div>

      {openSessionId && (
        <SessionUsageDrawer sessionId={openSessionId} onClose={() => setOpenSessionId(null)} />
      )}
    </div>
  );
}

// ============= 子组件 =============

interface CardProps {
  label: string;
  value: string;
  accent: "green" | "blue" | "purple" | "orange";
  hint?: string;
}

function Card({ label, value, accent, hint }: CardProps) {
  return (
    <div className="usage-card" title={hint}>
      <span className="usage-card-label">{label}</span>
      <span className={`usage-card-value accent-${accent}`}>{value}</span>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="usage-chart-card">
      <div className="usage-chart-title">{title}</div>
      {children}
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
  return (
    <div className="usage-filters">
      <div className="usage-filter-group">
        <label className="usage-filter-label">{t("usage.filter.dateRange")}</label>
        <div className="usage-date-range">
          <input
            type="date"
            value={filter.startDate ?? ""}
            onChange={(e) => onChange({ startDate: e.target.value || undefined })}
            aria-label={t("usage.filter.startDate")}
          />
          <span className="usage-date-sep">→</span>
          <input
            type="date"
            value={filter.endDate ?? ""}
            onChange={(e) => onChange({ endDate: e.target.value || undefined })}
            aria-label={t("usage.filter.endDate")}
          />
        </div>
      </div>
      <div className="usage-filter-group">
        <label className="usage-filter-label">{t("usage.filter.project")}</label>
        <select
          value={filter.projectPath ?? ""}
          onChange={(e) => onChange({ projectPath: e.target.value || undefined })}
        >
          <option value="">{t("usage.filter.allProjects")}</option>
          {allProjects.map((p) => (
            <option key={p.projectPath} value={p.projectPath}>
              {shortPath(p.projectPath)}
            </option>
          ))}
        </select>
      </div>
      <div className="usage-filter-group">
        <label className="usage-filter-label">{t("usage.filter.model")}</label>
        <select
          value={filter.model ?? ""}
          onChange={(e) => onChange({ model: e.target.value || undefined })}
        >
          <option value="">{t("usage.filter.allModels")}</option>
          {allModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="usage-btn usage-btn-text" onClick={onReset}>
        {t("usage.filter.reset")}
      </button>
    </div>
  );
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
              <td title={p.projectPath} className="ellipsis">
                {shortPath(p.projectPath)}
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
            return (
              <tr
                key={s.sessionId}
                className="usage-table-row-clickable"
                onClick={() => onOpen(s.sessionId)}
              >
                <td className="mono">{shortSessionId(s.sessionId)}</td>
                <td title={s.projectPath} className="ellipsis">
                  {shortPath(s.projectPath)}
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
              <td className="mono">{m.model}</td>
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

function EmptyTable({ t }: { t: ReturnType<typeof useI18n>["t"] }) {
  return <div className="usage-no-data">{t("usage.empty")}</div>;
}

// ============= 工具 =============

function shortModelName(model: string): string {
  // claude-opus-4-7 -> opus 4.7
  const m = model.toLowerCase();
  if (m.includes("opus")) return modelTail("opus", model);
  if (m.includes("sonnet")) return modelTail("sonnet", model);
  if (m.includes("haiku")) return modelTail("haiku", model);
  return model;
}

function modelTail(family: string, model: string): string {
  // 提取数字尾号，例如 claude-opus-4-7-20251010 -> opus 4-7
  const after = model.split(family)[1] ?? "";
  const tail = after.replace(/^[-_]/, "").split(/[-_]/).slice(0, 2).join("-");
  return tail ? `${family} ${tail}` : family;
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
