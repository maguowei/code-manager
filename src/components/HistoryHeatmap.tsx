import { type CSSProperties, memo, useEffect, useMemo, useRef, useState } from "react";
import { buildHeatmapWeeks, type HeatmapWeek } from "../history-utils";
import { type TranslationKey, useI18n } from "../i18n";
import type { HistoryEntry } from "../types";

interface Props {
  entries: HistoryEntry[];
}

const FULL_YEAR_WEEKS = 53;
const RESPONSIVE_WEEK_OPTIONS = [53, 39, 26, 13] as const;
const HEATMAP_WEEKDAY_WIDTH = 28;
const HEATMAP_MAIN_GAP = 4;
const HEATMAP_CELL_SIZE = 12;
const HEATMAP_CELL_GAP = 2;
const HEATMAP_GRID_HEIGHT = 7 * HEATMAP_CELL_SIZE + 6 * HEATMAP_CELL_GAP;
const HEATMAP_LEVEL_COLORS = [
  "var(--muted)",
  "color-mix(in oklch, var(--chart-2) 25%, var(--muted))",
  "color-mix(in oklch, var(--chart-2) 45%, var(--muted))",
  "color-mix(in oklch, var(--chart-2) 70%, var(--muted))",
  "var(--chart-2)",
] as const;

function getHeatmapMinWidth(weeks: number): number {
  return (
    HEATMAP_WEEKDAY_WIDTH +
    HEATMAP_MAIN_GAP +
    weeks * HEATMAP_CELL_SIZE +
    (weeks - 1) * HEATMAP_CELL_GAP
  );
}

export function getResponsiveHeatmapWeeks(containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return FULL_YEAR_WEEKS;
  for (const weeks of RESPONSIVE_WEEK_OPTIONS) {
    if (containerWidth >= getHeatmapMinWidth(weeks)) return weeks;
  }
  return 13;
}

/** 计算月份标签：每个月份首次出现的列索引（从第 1 列起，避免起始处错位） */
function computeMonthLabels(weeks: HeatmapWeek[]): Array<{ col: number; month: number }> {
  const labels: Array<{ col: number; month: number }> = [];
  let lastMonth = -1;
  for (let i = 0; i < weeks.length; i++) {
    const m = weeks[i].startMonth;
    if (m !== lastMonth) {
      // 跳过最后一个月（避免拥挤）；同月只在首次出现处加标签
      labels.push({ col: i, month: m });
      lastMonth = m;
    }
  }
  return labels;
}

function HistoryHeatmap({ entries }: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleWeeks, setVisibleWeeks] = useState(FULL_YEAR_WEEKS);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const updateWeeks = (width: number) => {
      const nextWeeks = getResponsiveHeatmapWeeks(width);
      setVisibleWeeks((currentWeeks) => (currentWeeks === nextWeeks ? currentWeeks : nextWeeks));
    };

    updateWeeks(element.clientWidth);
    const observer = new ResizeObserver((observerEntries) => {
      updateWeeks(observerEntries[0]?.contentRect.width ?? element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { weeks, totalCount } = useMemo(
    () => buildHeatmapWeeks(entries, visibleWeeks),
    [entries, visibleWeeks],
  );
  const monthLabels = useMemo(() => computeMonthLabels(weeks), [weeks]);
  const monthGridStyle = useMemo(
    () =>
      ({
        gridTemplateColumns: `28px repeat(${visibleWeeks}, 12px)`,
      }) satisfies CSSProperties,
    [visibleWeeks],
  );
  const gridWidth = useMemo(
    () => visibleWeeks * HEATMAP_CELL_SIZE + (visibleWeeks - 1) * HEATMAP_CELL_GAP,
    [visibleWeeks],
  );
  const totalLabel =
    visibleWeeks === FULL_YEAR_WEEKS
      ? t("history.heatmapTotal").replace("{count}", String(totalCount))
      : t("history.heatmapRecentTotal")
          .replace("{weeks}", String(visibleWeeks))
          .replace("{count}", String(totalCount));

  return (
    <div
      className="heatmap-container flex min-w-0 max-w-full flex-[1_1_360px] flex-col gap-1"
      ref={containerRef}
    >
      <div className="heatmap-total text-sm text-muted-foreground tabular-nums">{totalLabel}</div>

      <div className="heatmap-frame flex w-max max-w-full flex-col gap-1" data-slot="heatmap-frame">
        {/* 月份标签条 */}
        <div
          className="heatmap-months grid h-3.5 gap-x-0.5 text-[11px] text-muted-foreground"
          style={monthGridStyle}
        >
          {monthLabels.map(({ col, month }) => (
            <span
              key={`${col}-${month}`}
              className="heatmap-month-label whitespace-nowrap tabular-nums"
              style={{ gridColumn: col + 2 }}
            >
              {t(`history.heatmapMonth.${month}` as TranslationKey)}
            </span>
          ))}
        </div>

        {/* 主体：左侧星期标签 + 7×N 网格 */}
        <div className="heatmap-main grid grid-cols-[28px_auto] gap-1">
          <div
            className="heatmap-weekdays grid grid-rows-[repeat(7,12px)] items-center gap-y-0.5 pr-1 text-right text-[11px] text-muted-foreground"
            aria-hidden="true"
          >
            <span className="heatmap-weekday-label whitespace-nowrap leading-none tabular-nums">
              {t("history.heatmapWeekday.1" as TranslationKey)}
            </span>
            <span />
            <span className="heatmap-weekday-label whitespace-nowrap leading-none tabular-nums">
              {t("history.heatmapWeekday.3" as TranslationKey)}
            </span>
            <span />
            <span className="heatmap-weekday-label whitespace-nowrap leading-none tabular-nums">
              {t("history.heatmapWeekday.5" as TranslationKey)}
            </span>
            <span />
            <span />
          </div>

          <svg
            className="heatmap-grid block"
            width={gridWidth}
            height={HEATMAP_GRID_HEIGHT}
            viewBox={`0 0 ${gridWidth} ${HEATMAP_GRID_HEIGHT}`}
            role="img"
            aria-label={totalLabel}
          >
            {weeks.map((week, wi) => (
              <g
                // biome-ignore lint/suspicious/noArrayIndexKey: 列索引语义稳定
                key={wi}
                className="heatmap-week"
              >
                {week.days.map((day, di) => (
                  <rect
                    key={day.dateKey}
                    className={`heatmap-cell heatmap-level-${day.level}${day.placeholder ? " heatmap-placeholder" : ""}`}
                    x={wi * (HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP)}
                    y={di * (HEATMAP_CELL_SIZE + HEATMAP_CELL_GAP)}
                    width={HEATMAP_CELL_SIZE}
                    height={HEATMAP_CELL_SIZE}
                    rx={2}
                    fill={HEATMAP_LEVEL_COLORS[day.level]}
                    opacity={day.placeholder ? 0 : 1}
                  >
                    <title>
                      {day.placeholder
                        ? day.dateKey
                        : t("history.heatmapTooltip")
                            .replace("{day}", day.dateKey)
                            .replace("{count}", String(day.count))}
                    </title>
                  </rect>
                ))}
              </g>
            ))}
          </svg>
        </div>

        <div
          className="heatmap-legend flex items-center justify-end gap-1"
          data-slot="heatmap-legend"
        >
          <span className="heatmap-legend-label mx-0.5 text-[11px] text-muted-foreground">
            {t("history.heatmapLess")}
          </span>
          {[0, 1, 2, 3, 4].map((level) => (
            <svg
              key={level}
              className={`heatmap-cell heatmap-level-${level}`}
              width={11}
              height={11}
              viewBox="0 0 11 11"
              aria-hidden="true"
            >
              <rect width={11} height={11} rx={2} fill={HEATMAP_LEVEL_COLORS[level]} />
            </svg>
          ))}
          <span className="heatmap-legend-label mx-0.5 text-[11px] text-muted-foreground">
            {t("history.heatmapMore")}
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(HistoryHeatmap);
