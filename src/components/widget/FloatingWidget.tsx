import { getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import useTauriEvent from "../../hooks/useTauriEvent";
import { useWidgetUsageKpi, type WidgetUsageKpi } from "../../hooks/useWidgetUsageKpi";
import { type TranslationKey, useI18n } from "../../i18n";
import { ipc } from "../../ipc";
import { isTauri, type WidgetMetric } from "../../types";
import { Button } from "../ui/button";
import { formatCost, formatPercent, formatTokens } from "../usage/format";

// 指标 key → i18n 标签 key 映射（同时充当合法 WidgetMetric 白名单）
const METRIC_LABEL_KEY: Record<WidgetMetric, TranslationKey> = {
  cost: "widget.metric.cost",
  totalTokens: "widget.metric.totalTokens",
  cacheHitRate: "widget.metric.cacheHitRate",
  messages: "widget.metric.messages",
  sessions: "widget.metric.sessions",
  topModel: "widget.metric.topModel",
};

const DEFAULT_METRICS: WidgetMetric[] = ["cost", "totalTokens", "cacheHitRate"];

function isWidgetMetric(value: string): value is WidgetMetric {
  return value in METRIC_LABEL_KEY;
}

/** 把单个指标 KPI 格式化为展示字符串。 */
function formatMetricValue(metric: WidgetMetric, kpi: WidgetUsageKpi): string {
  switch (metric) {
    case "cost":
      return formatCost(kpi.cost);
    case "totalTokens":
      return formatTokens(kpi.totalTokens);
    case "cacheHitRate":
      return formatPercent(kpi.cacheHitRate);
    case "messages":
      return kpi.messages.toLocaleString("en-US");
    case "sessions":
      return kpi.sessions.toLocaleString("en-US");
    case "topModel":
      return kpi.topModel ?? "-";
  }
}

/**
 * 桌面用量浮窗：置顶半透明小窗，展示今日用量 KPI。
 * 指标列表与不透明度来自偏好，订阅 config-workspace-changed 即时跟随设置变化。
 */
export default function FloatingWidget() {
  const { t } = useI18n();
  const { kpi } = useWidgetUsageKpi();
  const [metrics, setMetrics] = useState<WidgetMetric[]>(DEFAULT_METRICS);
  const [opacity, setOpacity] = useState(92);

  const loadPreferences = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const workspace = await ipc.getConfigWorkspace();
      const selected = workspace.app.floatingWidgetMetrics.filter(isWidgetMetric);
      setMetrics(selected.length > 0 ? selected : DEFAULT_METRICS);
      setOpacity(workspace.app.floatingWidgetOpacity);
    } catch {
      // 读取失败时保持默认指标，浮窗仍可展示数据
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  // 设置抽屉改了指标/不透明度后即时跟随
  useTauriEvent<unknown>("config-workspace-changed", loadPreferences);

  // 浮窗根背景透明，由后端 transparent 窗口托底显示桌面
  useEffect(() => {
    const root = document.documentElement;
    const { body } = document;
    root.classList.add("bg-transparent");
    body.classList.add("bg-transparent");
    return () => {
      root.classList.remove("bg-transparent");
      body.classList.remove("bg-transparent");
    };
  }, []);

  const handleClose = useCallback(() => {
    void getCurrentWindow().hide();
  }, []);

  const handleOpenUsage = useCallback(() => {
    void ipc.openUsagePage();
  }, []);

  const panelStyle = useMemo(() => ({ opacity: opacity / 100 }), [opacity]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden p-1.5">
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden rounded-lg border border-border/80 bg-background shadow-floating",
        )}
        style={panelStyle}
      >
        {/* 顶部拖拽条：可拖动窗口；右侧关闭按钮不参与拖拽 */}
        <div
          data-tauri-drag-region
          className="flex shrink-0 cursor-default select-none items-center justify-between gap-2 border-b border-border/60 px-2.5 py-1"
        >
          <span className="text-xs font-medium text-muted-foreground">{t("widget.today")}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleClose}
            aria-label={t("widget.close")}
            className="text-muted-foreground"
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        {/* 指标主体：整体可点击跳转到用量页 */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleOpenUsage}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleOpenUsage();
            }
          }}
          title={t("widget.openUsage")}
          className="flex flex-1 cursor-pointer flex-col gap-1 px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
        >
          {metrics.map((metric) => (
            <div key={metric} className="flex items-center justify-between gap-3">
              <span className="truncate text-xs text-muted-foreground">
                {t(METRIC_LABEL_KEY[metric])}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {kpi ? formatMetricValue(metric, kpi) : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
