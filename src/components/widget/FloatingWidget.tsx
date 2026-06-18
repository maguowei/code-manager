import { getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import useTauriEvent from "../../hooks/useTauriEvent";
import { useWidgetUsageKpi, type WidgetUsageKpi } from "../../hooks/useWidgetUsageKpi";
import { type TranslationKey, useI18n } from "../../i18n";
import { ipc } from "../../ipc";
import { isTauri, type WidgetMetric } from "../../types";
import { Button } from "../ui/button";
import { formatCost, formatPercent, formatTokens } from "../usage/format";
import { cacheHitRateColorClass, METRIC_COLOR } from "../usage/metric-colors";

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

// 数值指标的身份配色：与用量页共用 METRIC_COLOR，保证两处一致。
// cacheHitRate 走高低语义色、topModel 为文本，均不入表。
const METRIC_VALUE_COLOR: Partial<Record<WidgetMetric, string>> = {
  cost: METRIC_COLOR.cost, // 金
  totalTokens: METRIC_COLOR.tokens, // 蓝
  messages: METRIC_COLOR.messages, // 红橙
  sessions: METRIC_COLOR.sessions, // 紫
};

/** 指标数值配色：命中率按高低语义着色，其余取固定身份色，topModel 保持中性。 */
function metricValueColorClass(metric: WidgetMetric, kpi: WidgetUsageKpi): string | undefined {
  if (metric === "cacheHitRate") return cacheHitRateColorClass(kpi.cacheHitRate);
  return METRIC_VALUE_COLOR[metric];
}

function isWidgetMetric(value: string): value is WidgetMetric {
  return value in METRIC_LABEL_KEY;
}

/** 取指标的原始数值；topModel 为文本指标，返回 null。 */
function metricRawValue(metric: WidgetMetric, kpi: WidgetUsageKpi): number | null {
  switch (metric) {
    case "cost":
      return kpi.cost;
    case "totalTokens":
      return kpi.totalTokens;
    case "cacheHitRate":
      return kpi.cacheHitRate;
    case "messages":
      return kpi.messages;
    case "sessions":
      return kpi.sessions;
    case "topModel":
      return null;
  }
}

/** 把数值型指标格式化为展示字符串；整数型先取整避免动画中途出现小数。 */
function formatMetricNumber(metric: WidgetMetric, value: number): string {
  switch (metric) {
    case "cost":
      return formatCost(value);
    case "totalTokens":
      return formatTokens(value);
    case "cacheHitRate":
      return formatPercent(value);
    case "messages":
    case "sessions":
      return Math.round(value).toLocaleString("en-US");
    case "topModel":
      return "-";
  }
}

/**
 * 单行指标：标题文字 + 数值。数值型指标用 useAnimatedNumber 做平滑缓动，
 * topModel 为文本指标直接展示。hook 无条件调用，满足 Rules of Hooks。
 */
function MetricRow({ metric, kpi }: { metric: WidgetMetric; kpi: WidgetUsageKpi | null }) {
  const { t } = useI18n();
  const rawValue = kpi && metric !== "topModel" ? (metricRawValue(metric, kpi) ?? 0) : 0;
  const animated = useAnimatedNumber(rawValue);

  let display: string;
  if (!kpi) {
    display = "—";
  } else if (metric === "topModel") {
    display = kpi.topModel ?? "-";
  } else {
    display = formatMetricNumber(metric, animated);
  }

  // 各指标按身份配色着色：命中率走高低语义色，其余取固定 chart 色。
  // 颜色取真实 KPI 值，不随缓动跳变
  const valueColorClass = kpi ? metricValueColorClass(metric, kpi) : undefined;

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate text-xs text-muted-foreground">{t(METRIC_LABEL_KEY[metric])}</span>
      <span className={cn("shrink-0 text-sm font-semibold tabular-nums", valueColorClass)}>
        {display}
      </span>
    </div>
  );
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
        data-tauri-drag-region="deep"
        className={cn(
          "group flex h-full cursor-grab flex-col overflow-hidden rounded-lg border border-border/80 bg-background shadow-floating active:cursor-grabbing",
        )}
        style={panelStyle}
      >
        {/* 顶部标题条：拖拽由外层卡片的 deep 拖拽区接管，光标继承面板的抓手提示 */}
        <div className="flex shrink-0 select-none items-center justify-between gap-2 border-b border-border/60 px-2.5 py-1">
          <span className="text-xs font-medium text-muted-foreground">{t("widget.today")}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleClose}
            aria-label={t("widget.close")}
            // 关闭按钮默认隐藏，hover 卡片或键盘聚焦时淡入，避免常驻干扰
            className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
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
            <MetricRow key={metric} metric={metric} kpi={kpi} />
          ))}
        </div>
      </div>
    </div>
  );
}
