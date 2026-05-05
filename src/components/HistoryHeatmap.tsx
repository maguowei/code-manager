import { memo, useMemo } from "react";
import { buildHeatmapWeeks, type HeatmapWeek } from "../history-utils";
import { type TranslationKey, useI18n } from "../i18n";
import type { HistoryEntry } from "../types";

interface Props {
  entries: HistoryEntry[];
}

const WEEKS = 53;

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

  const { weeks, totalCount } = useMemo(() => buildHeatmapWeeks(entries, WEEKS), [entries]);
  const monthLabels = useMemo(() => computeMonthLabels(weeks), [weeks]);

  return (
    <div className="heatmap-container">
      <div className="heatmap-total">
        {t("history.heatmapTotal").replace("{count}", String(totalCount))}
      </div>

      <div className="heatmap-frame">
        {/* 月份标签条 */}
        <div className="heatmap-months">
          {monthLabels.map(({ col, month }) => (
            <span
              key={`${col}-${month}`}
              className="heatmap-month-label"
              style={{ gridColumn: col + 2 }}
            >
              {t(`history.heatmapMonth.${month}` as TranslationKey)}
            </span>
          ))}
        </div>

        {/* 主体：左侧星期标签 + 7×N 网格 */}
        <div className="heatmap-main">
          <div className="heatmap-weekdays" aria-hidden="true">
            <span className="heatmap-weekday-label">
              {t("history.heatmapWeekday.1" as TranslationKey)}
            </span>
            <span />
            <span className="heatmap-weekday-label">
              {t("history.heatmapWeekday.3" as TranslationKey)}
            </span>
            <span />
            <span className="heatmap-weekday-label">
              {t("history.heatmapWeekday.5" as TranslationKey)}
            </span>
            <span />
            <span />
          </div>

          <div className="heatmap-grid">
            {weeks.map((week, wi) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 列索引语义稳定
              <div key={wi} className="heatmap-week">
                {week.days.map((day) => (
                  <div
                    key={day.dateKey}
                    className={`heatmap-cell heatmap-level-${day.level}${day.placeholder ? " heatmap-placeholder" : ""}`}
                    title={
                      day.placeholder
                        ? day.dateKey
                        : t("history.heatmapTooltip")
                            .replace("{day}", day.dateKey)
                            .replace("{count}", String(day.count))
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="heatmap-legend">
        <span className="heatmap-legend-label">{t("history.heatmapLess")}</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div key={level} className={`heatmap-cell heatmap-level-${level}`} />
        ))}
        <span className="heatmap-legend-label">{t("history.heatmapMore")}</span>
      </div>
    </div>
  );
}

export default memo(HistoryHeatmap);
