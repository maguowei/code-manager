import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HistoryEntry, isTauri } from "../types";
import { useI18n } from "../i18n";
import { useToast } from "../hooks/useToast";
import HistoryHeatmap from "./HistoryHeatmap";
import HistoryProjectList from "./HistoryProjectList";
import HistorySessionList from "./HistorySessionList";
import "./HistoryPage.css";

// 后端返回结构
interface HistoryResult {
  content: string;
  mtime: number;
}

// 按 project 分组的结构
export interface ProjectGroup {
  project: string;
  shortName: string;
  entries: HistoryEntry[];
  sessionCount: number;
}

// 按 sessionId 分组的结构
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
function parseJsonl(content: string): HistoryEntry[] {
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

/** 按 project 分组 */
function groupByProject(entries: HistoryEntry[]): ProjectGroup[] {
  const map = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const arr = map.get(entry.project) || [];
    arr.push(entry);
    map.set(entry.project, arr);
  }
  return Array.from(map.entries())
    .map(([project, entries]) => ({
      project,
      shortName: shortProjectName(project),
      entries,
      sessionCount: new Set(entries.map(e => e.sessionId)).size,
    }))
    .sort((a, b) => b.entries.length - a.entries.length);
}

/** 按 sessionId 分组 */
export function groupBySession(entries: HistoryEntry[]): SessionGroup[] {
  const map = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const arr = map.get(entry.sessionId) || [];
    arr.push(entry);
    map.set(entry.sessionId, arr);
  }
  return Array.from(map.entries())
    .map(([sessionId, entries]) => {
      const sorted = entries.sort((a, b) => a.timestamp - b.timestamp);
      return {
        sessionId,
        entries: sorted,
        firstTimestamp: sorted[0].timestamp,
        lastTimestamp: sorted[sorted.length - 1].timestamp,
      };
    })
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp);
}

const POLL_INTERVAL = 5000;

function HistoryPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [allEntries, setAllEntries] = useState<HistoryEntry[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const mtimeRef = useRef<number>(0);

  // 首次加载
  const loadHistory = useCallback(async () => {
    if (!isTauri()) { setLoading(false); return; }
    try {
      const result = await invoke<HistoryResult>("get_history");
      mtimeRef.current = result.mtime;
      setAllEntries(parseJsonl(result.content));
    } catch {
      showToast(t("history.noData"), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  // 轮询增量检查
  const pollHistory = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const result = await invoke<HistoryResult | null>("get_history_if_changed", {
        lastMtime: mtimeRef.current,
      });
      if (result) {
        mtimeRef.current = result.mtime;
        setAllEntries(parseJsonl(result.content));
      }
    } catch {
      // 轮询失败静默忽略
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // 轮询定时器，仅在页面可见时运行
  useEffect(() => {
    const id = setInterval(pollHistory, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [pollHistory]);

  // 按项目分组
  const projectGroups = useMemo(() => groupByProject(allEntries), [allEntries]);

  // 当前显示的条目（受项目筛选和搜索影响）
  const filteredEntries = useMemo(() => {
    let entries = selectedProject
      ? allEntries.filter(e => e.project === selectedProject)
      : allEntries;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter(e => e.display.toLowerCase().includes(q));
    }
    return entries;
  }, [allEntries, selectedProject, searchQuery]);

  // 过滤后的会话分组
  const sessionGroups = useMemo(() => groupBySession(filteredEntries), [filteredEntries]);

  if (loading) {
    return <div className="history-page"><div className="loading">{t("loading")}</div></div>;
  }

  return (
    <div className="history-page">
      {/* 顶部区域：热力图 + 搜索 */}
      <div className="history-top">
        <HistoryHeatmap entries={allEntries} />
        <div className="history-search">
          <input
            type="text"
            className="history-search-input"
            placeholder={t("history.search")}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 主体区域：项目列表 + 会话列表 */}
      <div className="history-body">
        <HistoryProjectList
          groups={projectGroups}
          selectedProject={selectedProject}
          onSelect={setSelectedProject}
        />
        <HistorySessionList
          groups={sessionGroups}
          searchQuery={searchQuery}
        />
      </div>
    </div>
  );
}

export default HistoryPage;
