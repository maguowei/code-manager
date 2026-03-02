import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { ClaudeStats, Snapshot, isTauri } from "../types";
import { useI18n } from "../i18n";
import { useToast } from "../hooks/useToast";
import "./StatsPage.css";

// recharts 不支持 CSS 变量，从 App.css 提取对应暗色 hex
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
const PIE_COLORS = [COLORS.blue, COLORS.green, COLORS.orange, COLORS.purple, COLORS.red, COLORS.teal, COLORS.pink, COLORS.yellow];

// recharts 图表共享样式常量
const TICK_STYLE = { fill: "#7d8590", fontSize: 11 };
const TICK_STYLE_SM = { fill: "#7d8590", fontSize: 10 };
const TOOLTIP_STYLE = { backgroundColor: "#161b22", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" };

/** 项目路径截取最后两级 */
function shortPath(fullPath: string): string {
  const parts = fullPath.split("/").filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join("/") : fullPath;
}

/** 格式化美元金额 */
function formatUSD(val: number): string {
  return val < 0.01 && val > 0 ? "< $0.01" : `$${val.toFixed(2)}`;
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

/** 格式化毫秒为可读时长 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = sec / 60;
  if (min < 60) return `${min.toFixed(1)}m`;
  const hr = min / 60;
  return `${hr.toFixed(1)}h`;
}

function StatsPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [stats, setStats] = useState<ClaudeStats | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!isTauri()) { setLoading(false); return; }
    try {
      const [s, h] = await Promise.all([
        invoke<ClaudeStats>("get_stats"),
        invoke<Snapshot[]>("get_stats_history"),
      ]);
      setStats(s);
      setHistory(h);
    } catch {
      showToast(t("stats.loadError"), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleRefresh() {
    if (!isTauri()) return;
    try {
      await invoke("take_stats_snapshot");
      await loadData();
      showToast(t("stats.refreshed"));
    } catch {
      showToast(t("stats.refreshError"), "error");
    }
  }

  // ===== 派生数据 =====
  const totalCost = useMemo(() => {
    if (!stats) return 0;
    return Object.values(stats.projects).reduce((sum, p) => sum + p.lastCost, 0);
  }, [stats]);

  const projectCostData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.projects)
      .filter(([, p]) => p.lastCost > 0)
      .map(([path, p]) => ({ name: shortPath(path), cost: +p.lastCost.toFixed(2) }))
      .sort((a, b) => b.cost - a.cost);
  }, [stats]);

  const modelCostData = useMemo(() => {
    if (!stats) return [];
    const modelMap: Record<string, number> = {};
    Object.values(stats.projects).forEach((p) => {
      Object.entries(p.lastModelUsage).forEach(([model, usage]) => {
        modelMap[model] = (modelMap[model] || 0) + usage.costUsd;
      });
    });
    return Object.entries(modelMap)
      .filter(([, cost]) => cost > 0)
      .map(([name, value]) => ({ name, value: +value.toFixed(2) }))
      .sort((a, b) => b.value - a.value);
  }, [stats]);

  const toolUsageData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.toolUsage)
      .map(([name, entry]) => ({ name, count: entry.usageCount }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [stats]);

  const skillUsageData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.skillUsage)
      .map(([name, entry]) => ({ name, count: entry.usageCount }))
      .sort((a, b) => b.count - a.count);
  }, [stats]);

  const costTrendData = useMemo(() => {
    return history.map((snap) => {
      const total = Object.values(snap.data.projects).reduce((sum, p) => sum + p.lastCost, 0);
      const d = new Date(snap.timestamp * 1000);
      return {
        date: `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
        cost: +total.toFixed(2),
      };
    });
  }, [history]);

  const sessionDurationData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.projects)
      .filter(([, p]) => p.lastDuration > 0)
      .sort(([, a], [, b]) => b.lastDuration - a.lastDuration);
  }, [stats]);

  const performanceData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.projects)
      .filter(([, p]) => p.lastSessionMetrics);
  }, [stats]);

  // ===== 渲染 =====
  if (loading) {
    return (
      <div className="stats-page">
        <div className="page-header"><h1 className="page-title">{t("stats.title")}</h1></div>
        <div className="stats-scroll"><div className="stats-empty"><p className="empty-text">{t("loading")}</p></div></div>
      </div>
    );
  }

  if (!stats || stats.numStartups === 0) {
    return (
      <div className="stats-page">
        <div className="page-header"><h1 className="page-title">{t("stats.title")}</h1></div>
        <div className="stats-scroll">
          <div className="stats-empty">
            <div className="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <p className="empty-text">{t("stats.noData")}</p>
            <p className="empty-hint">{t("stats.noDataHint")}</p>
          </div>
        </div>
      </div>
    );
  }

  const projectCount = Object.keys(stats.projects).length;

  return (
    <div className="stats-page">
      <div className="page-header">
        <h1 className="page-title">{t("stats.title")}</h1>
        <button className="stats-refresh-btn" onClick={handleRefresh}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {t("stats.refresh")}
        </button>
      </div>

      <div className="stats-scroll">
        {/* 概览 */}
        <div className="stats-overview">
          <div className="stat-card">
            <span className="stat-card-label">{t("stats.startups")}</span>
            <span className="stat-card-value accent-blue">{stats.numStartups}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-label">{t("stats.totalCost")}</span>
            <span className="stat-card-value accent-green">{formatUSD(totalCost)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-label">{t("stats.firstUse")}</span>
            <span className="stat-card-value accent-purple">{stats.firstStartTime ? formatDate(stats.firstStartTime) : "-"}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-label">{t("stats.totalProjects")}</span>
            <span className="stat-card-value accent-orange">{projectCount}</span>
          </div>
        </div>

        {/* 费用统计 */}
        <div className="stats-section">
          <h2 className="stats-section-title">{t("stats.costSection")}</h2>
          <div className="stats-chart-group">
            <div className="stats-chart-block">
              <div className="stats-chart-label">{t("stats.costByProject")}</div>
              {projectCostData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, projectCostData.length * 40)}>
                  <BarChart data={projectCostData} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                    <XAxis type="number" tick={TICK_STYLE} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="name" width={120} tick={TICK_STYLE} />
                    <Tooltip formatter={(v: number | undefined) => formatUSD(v ?? 0)} contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="cost" fill={COLORS.blue} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="stats-no-data">-</p>}
            </div>
            <div className="stats-chart-block">
              <div className="stats-chart-label">{t("stats.costByModel")}</div>
              {modelCostData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={modelCostData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} label={({ name, value }) => `${(name ?? "").split("-").slice(0, 2).join("-")} $${value}`} labelLine={false}>
                      {modelCostData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number | undefined) => formatUSD(v ?? 0)} contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="stats-no-data">-</p>}
            </div>
          </div>

          {/* 费用趋势 */}
          {costTrendData.length > 1 && (
            <div className="stats-chart-block">
              <div className="stats-chart-label">{t("stats.costTrend")}</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={costTrendData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                  <XAxis dataKey="date" tick={TICK_STYLE_SM} />
                  <YAxis tick={TICK_STYLE} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number | undefined) => formatUSD(v ?? 0)} contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="cost" stroke={COLORS.green} fill={COLORS.green} fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* 工具 & Skill 使用 */}
        <div className="stats-section">
          <h2 className="stats-section-title">{t("stats.toolSection")}</h2>
          <div className="stats-chart-group">
            <div className="stats-chart-block">
              <div className="stats-chart-label">{t("stats.toolUsage")}</div>
              {toolUsageData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, toolUsageData.length * 36)}>
                  <BarChart data={toolUsageData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <XAxis type="number" tick={TICK_STYLE} />
                    <YAxis type="category" dataKey="name" width={90} tick={TICK_STYLE} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill={COLORS.orange} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="stats-no-data">-</p>}
            </div>
            <div className="stats-chart-block">
              <div className="stats-chart-label">{t("stats.skillUsage")}</div>
              {skillUsageData.length > 0 ? (
                <div className="stats-list">
                  {skillUsageData.map((item) => (
                    <div key={item.name} className="stats-list-item">
                      <span className="stats-list-item-name">{item.name}</span>
                      <span className="stats-list-item-value">{item.count} {t("stats.calls")}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="stats-no-data">-</p>}
            </div>
          </div>
        </div>

        {/* 会话与性能 */}
        <div className="stats-section">
          <h2 className="stats-section-title">{t("stats.sessionSection")}</h2>

          {/* 项目会话时长列表 */}
          <div className="stats-chart-label">{t("stats.sessionDuration")}</div>
          <div className="stats-list stats-list-spaced">
            {sessionDurationData.map(([path, p]) => (
              <div key={path} className="stats-list-item">
                <span className="stats-list-item-name">{shortPath(path)}</span>
                <span className="stats-list-item-value">{formatDuration(p.lastDuration)}</span>
              </div>
            ))}
          </div>

          {/* 性能指标 */}
          <div className="stats-chart-label">{t("stats.performance")}</div>
          <div className="stats-metrics-grid">
            {performanceData.map(([path, p]) => {
              const m = p.lastSessionMetrics!;
              return (
                <div key={path} className="stats-metric-item">
                  <div className="stats-metric-label">{shortPath(path)}</div>
                  <div className="stats-metric-inner-grid">
                    <div>
                      <div className="stats-metric-label">{t("stats.frameAvg")}</div>
                      <div className="stats-metric-value">{m.frame_duration_ms_avg.toFixed(1)}ms</div>
                    </div>
                    <div>
                      <div className="stats-metric-label">{t("stats.frameP95")}</div>
                      <div className="stats-metric-value">{m.frame_duration_ms_p95.toFixed(1)}ms</div>
                    </div>
                    {m.hook_duration_ms_avg != null && (
                      <div>
                        <div className="stats-metric-label">{t("stats.hookAvg")}</div>
                        <div className="stats-metric-value">{m.hook_duration_ms_avg.toFixed(1)}ms</div>
                      </div>
                    )}
                    {m.hook_duration_ms_p95 != null && (
                      <div>
                        <div className="stats-metric-label">{t("stats.hookP95")}</div>
                        <div className="stats-metric-value">{m.hook_duration_ms_p95.toFixed(1)}ms</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StatsPage;
