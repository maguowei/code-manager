// 本地时区下把 Date 格式化为 YYYY-MM-DD
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 昨天的本地日期 key
export function yesterdayKey(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return localDateKey(d);
}
