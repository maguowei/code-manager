import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useToast } from "../hooks/useToast";
import { type TranslationKey, useI18n } from "../i18n";
import { type ClaudeStats, isTauri, type ProjectStats } from "../types";
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

/** 项目路径截取最后一级 */
function shortPath(fullPath: string): string {
  const parts = fullPath.split("/").filter(Boolean);
  return parts.length > 0 ? parts.at(-1) || fullPath : fullPath;
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

/** 格式化 Token 数量 */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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

  async function handleOpenInEditor() {
    if (!isTauri()) return;
    try {
      await invoke("open_claude_json_in_editor");
    } catch {
      showToast(t("stats.openEditorError"), "error");
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

  const projectEntries = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.projects).sort(
      ([, a], [, b]) => b.lastSessionModified - a.lastSessionModified,
    );
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
        <div className="stats-page-heading">
          <h1 className="page-title">{t("stats.title")}</h1>
          <div className="stats-staleness-note">{t("stats.stalenessNotice")}</div>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="stats-refresh-btn"
            onClick={handleOpenInEditor}
            title={t("stats.openInEditor")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            {t("stats.openInEditor")}
          </button>
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
          {stats.lastPlanModeUse != null && (
            <div className="stat-card" style={{ animationDelay: "0.3s" }}>
              <span className="stat-card-label">{t("stats.lastPlanModeUse")}</span>
              <span className="stat-card-value accent-purple">
                {formatTimestamp(stats.lastPlanModeUse)}
              </span>
            </div>
          )}
          {stats.btwUseCount != null && (
            <div className="stat-card" style={{ animationDelay: "0.35s" }}>
              <span className="stat-card-label">{t("stats.btwUseCount")}</span>
              <span className="stat-card-value accent-blue">{stats.btwUseCount}</span>
            </div>
          )}
        </div>

        {/* 工具 & Skill 使用 */}
        <details
          open
          className="stats-section stats-section-collapsible"
          style={{ animationDelay: "0.4s" }}
        >
          <summary className="stats-section-title stats-section-summary">
            {t("stats.toolSection")}
            <span className="stats-summary-count">
              {toolUsageData.length} {t("stats.toolUsage")} · {skillUsageData.length}{" "}
              {t("stats.skillUsage")}
            </span>
          </summary>
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
        </details>

        {/* 项目 */}
        <details
          open
          className="stats-section stats-section-collapsible stats-project-section"
          style={{ animationDelay: "0.5s" }}
        >
          <summary className="stats-section-title stats-section-summary">
            {t("stats.sessionSection")}
            <span className="stats-summary-count">
              {projectEntries.length} {t("stats.totalProjects")}
            </span>
          </summary>
          <p className="stats-project-section-hint">{t("stats.projectSectionHint")}</p>

          <div className="stats-project-list">
            {projectEntries.map(([path, p]) => (
              <ProjectCard key={path} path={path} project={p} t={t} />
            ))}
          </div>
        </details>
      </div>
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
    <details className="stats-project-card">
      <summary className="stats-project-header">
        <div className="stats-project-title">
          <span className="stats-project-name">{shortPath(path)}</span>
          <span className="stats-project-session-id" title={p.lastSessionId || "-"}>
            {p.lastSessionId || "-"}
          </span>
          {p.lastSessionFirstPrompt && (
            <span className="stats-project-prompt">
              {truncateText(p.lastSessionFirstPrompt, 60)}
            </span>
          )}
        </div>
        <div className="stats-project-summary">
          <span className="stats-project-badge">${p.lastCost.toFixed(2)}</span>
          <span className="stats-project-badge">{formatDuration(p.lastDuration)}</span>
        </div>
      </summary>

      <div className="stats-project-body">
        {/* 基础指标 */}
        <div className="stats-project-metrics">
          <div className="stats-project-metric">
            <span className="stats-project-metric-label">{t("stats.projectCost")}</span>
            <span className="stats-project-metric-value">${p.lastCost.toFixed(2)}</span>
          </div>
          <div className="stats-project-metric">
            <span className="stats-project-metric-label">{t("stats.sessionDuration")}</span>
            <span className="stats-project-metric-value">{formatDuration(p.lastDuration)}</span>
          </div>
          <div className="stats-project-metric">
            <span className="stats-project-metric-label">{t("stats.projectLinesAdded")}</span>
            <span className="stats-project-metric-value accent-green">+{p.lastLinesAdded}</span>
          </div>
          <div className="stats-project-metric">
            <span className="stats-project-metric-label">{t("stats.projectLinesRemoved")}</span>
            <span className="stats-project-metric-value accent-red">-{p.lastLinesRemoved}</span>
          </div>
          <div className="stats-project-metric">
            <span className="stats-project-metric-label">{t("stats.projectInputTokens")}</span>
            <span className="stats-project-metric-value">
              {formatTokens(p.lastTotalInputTokens)}
            </span>
          </div>
          <div className="stats-project-metric">
            <span className="stats-project-metric-label">{t("stats.projectOutputTokens")}</span>
            <span className="stats-project-metric-value">
              {formatTokens(p.lastTotalOutputTokens)}
            </span>
          </div>
          <div className="stats-project-metric">
            <span className="stats-project-metric-label">{t("stats.projectCacheCreation")}</span>
            <span className="stats-project-metric-value">
              {formatTokens(p.lastTotalCacheCreationInputTokens)}
            </span>
          </div>
          <div className="stats-project-metric">
            <span className="stats-project-metric-label">{t("stats.projectCacheRead")}</span>
            <span className="stats-project-metric-value">
              {formatTokens(p.lastTotalCacheReadInputTokens)}
            </span>
          </div>
          {p.lastTotalWebSearchRequests > 0 && (
            <div className="stats-project-metric">
              <span className="stats-project-metric-label">{t("stats.projectWebSearch")}</span>
              <span className="stats-project-metric-value">{p.lastTotalWebSearchRequests}</span>
            </div>
          )}
        </div>

        {/* 模型明细 */}
        {modelEntries.length > 0 && (
          <section className="stats-project-detail-section">
            <div className="stats-project-detail-title">{t("stats.projectModelBreakdown")}</div>
            <div className="stats-model-table-wrap">
              <div className="stats-model-table">
                <div className="stats-model-header">
                  <span>{t("stats.projectModel")}</span>
                  <span>{t("stats.projectInputTokens")}</span>
                  <span>{t("stats.projectOutputTokens")}</span>
                  <span>{t("stats.projectCostUsd")}</span>
                </div>
                {modelEntries.map(([model, usage]) => (
                  <div key={model} className="stats-model-row">
                    <span className="stats-model-name">{model}</span>
                    <span>{formatTokens(usage.inputTokens)}</span>
                    <span>{formatTokens(usage.outputTokens)}</span>
                    <span>${usage.costUsd.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 首条 Prompt */}
        {p.lastSessionFirstPrompt && (
          <section className="stats-project-detail-section stats-project-prompt-full">
            <div className="stats-project-detail-title">{t("stats.projectFirstPrompt")}</div>
            <p className="stats-project-prompt-text">{p.lastSessionFirstPrompt}</p>
          </section>
        )}

        {/* 性能指标 */}
        {p.lastSessionMetrics && (
          <section className="stats-project-detail-section">
            <div className="stats-project-detail-title">{t("stats.performance")}</div>
            <div className="stats-performance-grid">
              <div className="stats-performance-card">
                <div className="stats-metric-label">{t("stats.frameAvg")}</div>
                <div className="stats-metric-value">
                  {p.lastSessionMetrics.frame_duration_ms_avg.toFixed(1)}ms
                </div>
              </div>
              <div className="stats-performance-card">
                <div className="stats-metric-label">{t("stats.frameP95")}</div>
                <div className="stats-metric-value">
                  {p.lastSessionMetrics.frame_duration_ms_p95.toFixed(1)}ms
                </div>
              </div>
              {p.lastSessionMetrics.hook_duration_ms_avg != null && (
                <div className="stats-performance-card">
                  <div className="stats-metric-label">{t("stats.hookAvg")}</div>
                  <div className="stats-metric-value">
                    {p.lastSessionMetrics.hook_duration_ms_avg.toFixed(1)}ms
                  </div>
                </div>
              )}
              {p.lastSessionMetrics.hook_duration_ms_p95 != null && (
                <div className="stats-performance-card">
                  <div className="stats-metric-label">{t("stats.hookP95")}</div>
                  <div className="stats-metric-value">
                    {p.lastSessionMetrics.hook_duration_ms_p95.toFixed(1)}ms
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </details>
  );
}

export default StatsPage;
