import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import useTauriEvent from "../../hooks/useTauriEvent";
import { useWidgetUsageKpi, type WidgetUsageKpi } from "../../hooks/useWidgetUsageKpi";
import { type TranslationKey, useI18n } from "../../i18n";
import { ipc } from "../../ipc";
import { isTauri, type WidgetMetric } from "../../types";
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

// 鼠标按下后移动超过该距离（px）视为拖动，否则松开时按点击处理
const DRAG_THRESHOLD = 4;

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
 * 单个指标数值。数值型指标用 useAnimatedNumber 做平滑缓动，topModel 为文本指标直接展示。
 * hook 无条件调用，满足 Rules of Hooks。状态条只显示数值，靠身份配色区分，
 * 完整标签放在 title（悬停提示）与 sr-only 文本（读屏）上。
 */
function MetricValue({ metric, kpi }: { metric: WidgetMetric; kpi: WidgetUsageKpi | null }) {
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

  // 颜色取真实 KPI 值，不随缓动跳变
  const valueColorClass = kpi ? metricValueColorClass(metric, kpi) : undefined;
  const label = t(METRIC_LABEL_KEY[metric]);

  return (
    <span
      title={label}
      className={cn(
        // 与 src-tauri/src/widget.rs 的 widget_size 对应：数值格等宽，topModel 占双倍宽度
        "min-w-0 basis-0 truncate text-center text-base font-semibold leading-none tabular-nums",
        metric === "topModel" ? "flex-[2]" : "flex-1",
        valueColorClass,
      )}
    >
      <span className="sr-only">{label} </span>
      <span>{display}</span>
    </span>
  );
}

/**
 * 桌面用量浮窗：置顶半透明的单行状态条，只显示今日用量数值。
 * 尺寸固定（由后端按指标数量计算）；整条可拖动，未拖动的单击跳转用量页。
 * 指标列表与不透明度来自偏好，订阅 config-workspace-changed 即时跟随设置变化。
 */
export default function FloatingWidget() {
  const { t } = useI18n();
  const { kpi } = useWidgetUsageKpi();
  const [metrics, setMetrics] = useState<WidgetMetric[]>(DEFAULT_METRICS);
  const [opacity, setOpacity] = useState(92);
  // 鼠标按下位置；拖动开始或松开后清空
  const pressRef = useRef<{ x: number; y: number } | null>(null);

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

  const handleOpenUsage = useCallback(() => {
    void ipc.openUsagePage();
  }, []);

  // 拖动与点击区分：按下后移动超过阈值才交给原生拖动；未移动即松开按点击处理。
  // 不用 data-tauri-drag-region，因为它在 mousedown 即接管拖动，会吞掉点击。
  const handleMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pressRef.current = { x: event.screenX, y: event.screenY };
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press) return;
    if (Math.hypot(event.screenX - press.x, event.screenY - press.y) < DRAG_THRESHOLD) return;
    pressRef.current = null;
    void getCurrentWindow().startDragging();
  }, []);

  const handleMouseUp = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !pressRef.current) return;
      pressRef.current = null;
      handleOpenUsage();
    },
    [handleOpenUsage],
  );

  const handleMouseLeave = useCallback(() => {
    pressRef.current = null;
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleOpenUsage();
      }
    },
    [handleOpenUsage],
  );

  const panelStyle = useMemo(() => ({ opacity: opacity / 100 }), [opacity]);

  return (
    <div className="flex h-screen w-screen items-center overflow-hidden p-1.5">
      <div
        role="button"
        tabIndex={0}
        aria-label={t("widget.openUsage")}
        title={t("widget.hint")}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleKeyDown}
        // 尺寸与 src-tauri/src/widget.rs 对应：h-9 含边框，px-3 + gap-3
        className="flex h-9 w-full cursor-grab select-none items-center gap-3 rounded-lg border border-border/80 bg-background px-3 shadow-floating outline-none transition-colors hover:border-border focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        style={panelStyle}
      >
        {metrics.map((metric) => (
          <MetricValue key={metric} metric={metric} kpi={kpi} />
        ))}
      </div>
    </div>
  );
}
