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

/** @deprecated 使用 sortProjectGroupsByRecency 代替 */
export function sortProjectGroupsByMessageCount(
  groups: HistoryProjectGroup[],
): HistoryProjectGroup[] {
  return sortProjectGroupsByRecency(groups);
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
