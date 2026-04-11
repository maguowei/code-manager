import { memo, useMemo } from "react";
import { useI18n } from "../i18n";
import type { HistoryEntry } from "../types";

interface Props {
  entries: HistoryEntry[];
}

/** 生成过去 N 天的日期字符串数组（YYYY-MM-DD） */
function getLastNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/** 根据消息数量返回热力等级 0-4 */
function getLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 5) return 1;
  if (count <= 15) return 2;
  if (count <= 30) return 3;
  return 4;
}

const DAYS = 30;

function HistoryHeatmap({ entries }: Props) {
  const { t } = useI18n();
  const { days, countMap } = useMemo(() => {
    const days = getLastNDays(DAYS);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - DAYS);
    const cutoff = thirtyDaysAgo.getTime();
    const countMap = new Map<string, number>();
    for (const entry of entries) {
      if (entry.timestamp < cutoff) continue;
      const dateStr = new Date(entry.timestamp).toISOString().slice(0, 10);
      countMap.set(dateStr, (countMap.get(dateStr) || 0) + 1);
    }
    return { days, countMap };
  }, [entries]);

  return (
    <div className="heatmap-container">
      <div className="heatmap-grid">
        {days.map((day) => {
          const count = countMap.get(day) || 0;
          const level = getLevel(count);
          return (
            <div
              key={day}
              className={`heatmap-cell heatmap-level-${level}`}
              title={t("history.heatmapTooltip")
                .replace("{day}", day)
                .replace("{count}", String(count))}
            />
          );
        })}
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
