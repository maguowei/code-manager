import type { HistoryEntry } from "./types";

export interface HistoryResult {
  content: string;
  mtime: number;
}

export interface HistoryProjectGroup {
  project: string;
  shortName: string;
  messageCount: number;
  sessionCount: number;
  lastTimestamp: number;
  entries: HistoryEntry[];
}

export interface SessionGroup {
  sessionId: string;
  entries: HistoryEntry[];
  firstTimestamp: number;
  lastTimestamp: number;
}

/** 从完整路径提取项目短名 */
export function shortProjectName(fullPath: string): string {
  const parts = fullPath.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : fullPath;
}

/** 解析 JSONL 字符串为 HistoryEntry 数组 */
export function parseJsonl(content: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // 跳过解析失败的行
    }
  }
  return entries;
}

/** 聚合项目维度的历史数据 */
export function groupByProject(entries: HistoryEntry[]): HistoryProjectGroup[] {
  const map = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const group = map.get(entry.project) ?? [];
    group.push(entry);
    map.set(entry.project, group);
  }

  return Array.from(map.entries()).map(([project, projectEntries]) => ({
    project,
    shortName: shortProjectName(project),
    entries: projectEntries,
    messageCount: projectEntries.length,
    sessionCount: new Set(projectEntries.map((entry) => entry.sessionId)).size,
    lastTimestamp: Math.max(...projectEntries.map((entry) => entry.timestamp)),
  }));
}

/** 按最近活跃时间降序排序项目 */
export function sortProjectGroupsByRecency(groups: HistoryProjectGroup[]): HistoryProjectGroup[] {
  return [...groups].sort(
    (a, b) =>
      b.lastTimestamp - a.lastTimestamp ||
      b.messageCount - a.messageCount ||
      a.project.localeCompare(b.project),
  );
}

/** 按 sessionId 分组 */
export function groupBySession(entries: HistoryEntry[]): SessionGroup[] {
  const map = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const group = map.get(entry.sessionId) ?? [];
    group.push(entry);
    map.set(entry.sessionId, group);
  }

  return Array.from(map.entries())
    .map(([sessionId, sessionEntries]) => {
      const sortedEntries = [...sessionEntries].sort((a, b) => a.timestamp - b.timestamp);
      return {
        sessionId,
        entries: sortedEntries,
        firstTimestamp: sortedEntries[0].timestamp,
        lastTimestamp: sortedEntries[sortedEntries.length - 1].timestamp,
      };
    })
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp);
}

/** 把时间戳转为本机时区下的 YYYY-MM-DD 键，用于跨 locale 稳定比较 */
export function toLocalDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 把 Date 当天的 0:00:00 时间戳返回 */
function startOfLocalDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** 按本地日期把会话分组，键为 YYYY-MM-DD，按日期降序返回 */
export function groupSessionsByDate(sessions: SessionGroup[]): Array<[string, SessionGroup[]]> {
  const map = new Map<string, SessionGroup[]>();
  for (const s of sessions) {
    const key = toLocalDateKey(s.lastTimestamp);
    const arr = map.get(key) || [];
    arr.push(s);
    map.set(key, arr);
  }
  return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
}

/** 把时间戳格式化为 HH:MM */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 渲染日期分组标签：今天 / 昨天 / 原始日期键 */
export function formatDateLabel(
  dateKey: string,
  todayKey: string,
  yesterdayKey: string,
  todayLabel: string,
  yesterdayLabel: string,
): string {
  if (dateKey === todayKey) return todayLabel;
  if (dateKey === yesterdayKey) return yesterdayLabel;
  return dateKey;
}

/** ---------- 热力图：53 周 × 7 天 GitHub 风格 ---------- */

export interface HeatmapDay {
  /** YYYY-MM-DD */
  dateKey: string;
  /** 该日消息数 */
  count: number;
  /** 0 ~ 4 等级 */
  level: 0 | 1 | 2 | 3 | 4;
  /** 是否为占位（用于网格起止填充，超出真实日期范围） */
  placeholder: boolean;
}

export interface HeatmapWeek {
  /** 本列 7 天，按周一 → 周日 排列 */
  days: HeatmapDay[];
  /** 本列首天的月份（0-11），用于顶部月份标签布局 */
  startMonth: number;
}

export interface HeatmapMatrix {
  weeks: HeatmapWeek[];
  totalCount: number;
}

function getLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= 5) return 1;
  if (count <= 15) return 2;
  if (count <= 30) return 3;
  return 4;
}

/**
 * 构建周一起点的 N 周热力图矩阵。
 * - 最后一列总是包含"今天"
 * - 第一列是 N 周前那个周一
 * - 网格按列优先（每列 7 行），第 0 行为周一，第 6 行为周日
 */
export function buildHeatmapWeeks(
  entries: HistoryEntry[],
  weeks: number,
  now = new Date(),
): HeatmapMatrix {
  // 计算本周（含今天）的"周一"
  const today = startOfLocalDay(now);
  const dow = today.getDay(); // 0=周日, 1=周一, ..., 6=周六
  const offsetToMonday = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - offsetToMonday);

  // 起始周一 = 本周一往前推 (weeks - 1) 周
  const startMonday = new Date(thisMonday);
  startMonday.setDate(thisMonday.getDate() - (weeks - 1) * 7);

  // 统计每个日期的消息数
  const countMap = new Map<string, number>();
  let totalCount = 0;
  const startTs = startMonday.getTime();
  for (const entry of entries) {
    if (entry.timestamp < startTs) continue;
    const key = toLocalDateKey(entry.timestamp);
    countMap.set(key, (countMap.get(key) || 0) + 1);
    totalCount++;
  }

  const todayKey = toLocalDateKey(today.getTime());

  const weekList: HeatmapWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const days: HeatmapDay[] = [];
    let startMonth = 0;
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(startMonday);
      cellDate.setDate(startMonday.getDate() + w * 7 + d);
      if (d === 0) startMonth = cellDate.getMonth();
      const dateKey = toLocalDateKey(cellDate.getTime());
      const placeholder = dateKey > todayKey;
      const count = placeholder ? 0 : countMap.get(dateKey) || 0;
      days.push({
        dateKey,
        count,
        level: placeholder ? 0 : getLevel(count),
        placeholder,
      });
    }
    weekList.push({ days, startMonth });
  }

  return { weeks: weekList, totalCount };
}

/** ---------- 会话列表虚拟化平铺 ---------- */

export type FlatItem =
  | { kind: "date-header"; dateKey: string; sessionIds: string[] }
  | { kind: "session"; session: SessionGroup; expanded: boolean }
  | { kind: "entry"; sessionId: string; entry: HistoryEntry; index: number };

/** 把按日期分组的会话扁平为虚拟化数组，展开的会话其条目紧跟其后 */
export function flattenSessionsForVirtualizer(
  dateGroups: Array<[string, SessionGroup[]]>,
  expandedSessions: Set<string>,
): FlatItem[] {
  const items: FlatItem[] = [];
  for (const [dateKey, sessions] of dateGroups) {
    items.push({
      kind: "date-header",
      dateKey,
      sessionIds: sessions.map((s) => s.sessionId),
    });
    for (const session of sessions) {
      const expanded = expandedSessions.has(session.sessionId);
      items.push({ kind: "session", session, expanded });
      if (expanded) {
        session.entries.forEach((entry, i) => {
          items.push({ kind: "entry", sessionId: session.sessionId, entry, index: i });
        });
      }
    }
  }
  return items;
}
