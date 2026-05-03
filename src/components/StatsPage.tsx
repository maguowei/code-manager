import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import { type ClaudeStats, isTauri } from "../types";
import { formatDuration } from "./project-detail-utils";
import "./StatsPage.css";

// recharts 不支持 CSS 变量，从 App.css 提取对应暗色 hex
const COLORS = {
  orange: "#f78166",
};

// recharts 图表共享样式常量
const TICK_STYLE = { fill: "#7d8590", fontSize: 11 };
const TOOLTIP_STYLE = {
  backgroundColor: "rgba(22, 27, 34, 0.8)",
  border: "1px solid #30363d",
  borderRadius: 12,
  color: "#e6edf3",
  backdropFilter: "blur(12px)",
  boxShadow: "0 8px 16px rgba(0, 0, 0, 0.15)",
};

/** 项目路径截取最后两级 */
function shortPath(fullPath: string): string {
  const parts = fullPath.split("/").filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join("/") : fullPath;
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
      const s = await invoke<ClaudeStats>("get_stats");
      setStats(s);
    } catch {
      showToast(t("stats.loadError"), "error");
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
    } catch {
      showToast(t("stats.refreshError"), "error");
    }
  }

  // ===== 派生数据 =====
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

  const sessionDurationData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.projects)
      .filter(([, p]) => p.lastDuration > 0)
      .sort(([, a], [, b]) => b.lastDuration - a.lastDuration);
  }, [stats]);

  const performanceData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.projects).filter(([, p]) => p.lastSessionMetrics);
  }, [stats]);

  // ===== 渲染 =====
  if (loading) {
    return (
      <div className="stats-page">
        <div className="page-header">
          <h1 className="page-title">{t("stats.title")}</h1>
        </div>
        <div className="stats-scroll">
          <div className="stats-empty">
            <p className="empty-text">{t("loading")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!stats || stats.numStartups === 0) {
    return (
      <div className="stats-page">
        <div className="page-header">
          <h1 className="page-title">{t("stats.title")}</h1>
        </div>
        <div className="stats-scroll">
          <div className="stats-empty">
            <div className="empty-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
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
        <button type="button" className="stats-refresh-btn" onClick={handleRefresh}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {t("stats.refresh")}
        </button>
      </div>

      <div className="stats-scroll">
        {/* 概览 */}
        <div className="stats-overview">
          <div className="stat-card" style={{ animationDelay: "0.1s" }}>
            <span className="stat-card-label">{t("stats.startups")}</span>
            <span className="stat-card-value accent-blue">{stats.numStartups}</span>
          </div>
          <div className="stat-card" style={{ animationDelay: "0.2s" }}>
            <span className="stat-card-label">{t("stats.firstUse")}</span>
            <span className="stat-card-value accent-purple">
              {stats.firstStartTime ? formatDate(stats.firstStartTime) : "-"}
            </span>
          </div>
          <div className="stat-card" style={{ animationDelay: "0.25s" }}>
            <span className="stat-card-label">{t("stats.totalProjects")}</span>
            <span className="stat-card-value accent-orange">{projectCount}</span>
          </div>
        </div>

        {/* 工具 & Skill 使用 */}
        <div className="stats-section" style={{ animationDelay: "0.4s" }}>
          <h2 className="stats-section-title">{t("stats.toolSection")}</h2>
          <div className="stats-chart-group">
            <div className="stats-chart-block">
              <div className="stats-chart-label">{t("stats.toolUsage")}</div>
              {toolUsageData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, toolUsageData.length * 36)}>
                  <BarChart
                    data={toolUsageData}
                    layout="vertical"
                    margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
                  >
                    <XAxis type="number" tick={TICK_STYLE} />
                    <YAxis type="category" dataKey="name" width={90} tick={TICK_STYLE} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill={COLORS.orange} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="stats-no-data">-</p>
              )}
            </div>
            <div className="stats-chart-block">
              <div className="stats-chart-label">{t("stats.skillUsage")}</div>
              {skillUsageData.length > 0 ? (
                <div className="stats-list">
                  {skillUsageData.map((item) => (
                    <div key={item.name} className="stats-list-item">
                      <span className="stats-list-item-name">{item.name}</span>
                      <span className="stats-list-item-value">
                        {item.count} {t("stats.calls")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="stats-no-data">-</p>
              )}
            </div>
          </div>
        </div>

        {/* 会话与性能 */}
        <div className="stats-section" style={{ animationDelay: "0.5s" }}>
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
              if (!p.lastSessionMetrics) return null;
              const m = p.lastSessionMetrics;
              return (
                <div key={path} className="stats-metric-item">
                  <div className="stats-metric-label">{shortPath(path)}</div>
                  <div className="stats-metric-inner-grid">
                    <div>
                      <div className="stats-metric-label">{t("stats.frameAvg")}</div>
                      <div className="stats-metric-value">
                        {m.frame_duration_ms_avg.toFixed(1)}ms
                      </div>
                    </div>
                    <div>
                      <div className="stats-metric-label">{t("stats.frameP95")}</div>
                      <div className="stats-metric-value">
                        {m.frame_duration_ms_p95.toFixed(1)}ms
                      </div>
                    </div>
                    {m.hook_duration_ms_avg != null && (
                      <div>
                        <div className="stats-metric-label">{t("stats.hookAvg")}</div>
                        <div className="stats-metric-value">
                          {m.hook_duration_ms_avg.toFixed(1)}ms
                        </div>
                      </div>
                    )}
                    {m.hook_duration_ms_p95 != null && (
                      <div>
                        <div className="stats-metric-label">{t("stats.hookP95")}</div>
                        <div className="stats-metric-value">
                          {m.hook_duration_ms_p95.toFixed(1)}ms
                        </div>
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
