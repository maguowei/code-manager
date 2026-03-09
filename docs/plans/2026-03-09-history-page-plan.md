# History Page 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 AI Manager 新增「历史」页面，读取 `~/.claude/history.jsonl` 按 project/sessionId 可视化，支持轮询刷新、搜索和热力图。

**Architecture:** 后端只读文件 + 返回 mtime，前端负责 JSONL 解析、分组、搜索和渲染。三栏布局：顶部热力图+搜索，左栏项目列表，右栏会话列表。5 秒轮询间隔，mtime 判断是否有变化。

**Tech Stack:** Rust (Tauri commands) + React 19 + TypeScript + CSS Grid (热力图)

---

## Task 1: Rust 后端 - history.rs 模块

**Files:**
- Create: `src-tauri/src/history.rs`
- Modify: `src-tauri/src/lib.rs:1-77`

**Step 1: 创建 history.rs**

```rust
// src-tauri/src/history.rs
use serde::Serialize;
use std::fs;

/// 历史记录读取结果
#[derive(Serialize)]
pub struct HistoryResult {
    pub content: String,
    pub mtime: u64,
}

/// 获取 history.jsonl 文件路径
fn get_history_path() -> std::path::PathBuf {
    crate::utils::home_dir_or_fallback()
        .join(".claude")
        .join("history.jsonl")
}

/// 获取文件修改时间（Unix 秒）
fn file_mtime(path: &std::path::Path) -> Result<u64, String> {
    let metadata = fs::metadata(path).map_err(|e| format!("读取文件元数据失败: {}", e))?;
    let modified = metadata.modified().map_err(|e| format!("获取修改时间失败: {}", e))?;
    Ok(crate::utils::systime_to_secs(modified))
}

/// 读取历史记录文件，返回内容和 mtime
#[tauri::command]
pub fn get_history() -> Result<HistoryResult, String> {
    let path = get_history_path();
    let content = fs::read_to_string(&path).map_err(|e| format!("读取历史文件失败: {}", e))?;
    let mtime = file_mtime(&path)?;
    Ok(HistoryResult { content, mtime })
}

/// 仅当文件有变化时返回新内容，否则返回 None
#[tauri::command]
pub fn get_history_if_changed(last_mtime: u64) -> Result<Option<HistoryResult>, String> {
    let path = get_history_path();
    let mtime = file_mtime(&path)?;
    if mtime == last_mtime {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取历史文件失败: {}", e))?;
    Ok(Some(HistoryResult { content, mtime }))
}
```

**Step 2: 在 lib.rs 中注册模块和命令**

在 `src-tauri/src/lib.rs` 中：

1. 顶部添加 `mod history;`
2. 添加 `use history::{get_history, get_history_if_changed};`
3. 在 `invoke_handler(tauri::generate_handler![...])` 中添加 `get_history, get_history_if_changed,`

**Step 3: 验证编译**

运行: `cd src-tauri && cargo check`
预期: 编译通过无错误

**Step 4: 提交**

```
feat: 添加 history.rs 后端模块（读取 history.jsonl + mtime 轮询）
```

---

## Task 2: 前端类型和导航集成

**Files:**
- Modify: `src/types.ts:5`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx:254-283`
- Modify: `src/i18n.ts`

**Step 1: types.ts 增加类型**

在 `src/types.ts` 中：

1. `TabType` 增加 `"history"`：
```ts
export type TabType = "configs" | "memory" | "skills" | "stats" | "history";
```

2. 文件末尾添加 `HistoryEntry` 类型：
```ts
// 历史记录条目
export interface HistoryEntry {
  display: string;
  pastedContents: Record<string, string>;
  timestamp: number;
  project: string;
  sessionId: string;
}
```

**Step 2: i18n.ts 增加翻译文案**

在 zh 和 en 翻译对象中分别添加（位于 stats 部分之后）：

zh:
```
"nav.history": "历史",
"history.title": "使用历史",
"history.allProjects": "全部项目",
"history.messages": "条",
"history.sessions": "个会话",
"history.noData": "暂无历史记录",
"history.search": "搜索历史记录...",
"history.expand": "展开",
"history.collapse": "收起",
"history.lastActive": "最后活跃",
"history.today": "今天",
"history.yesterday": "昨天",
```

en:
```
"nav.history": "History",
"history.title": "Usage History",
"history.allProjects": "All Projects",
"history.messages": "msgs",
"history.sessions": "sessions",
"history.noData": "No history records",
"history.search": "Search history...",
"history.expand": "Expand",
"history.collapse": "Collapse",
"history.lastActive": "Last active",
"history.today": "Today",
"history.yesterday": "Yesterday",
```

**Step 3: Sidebar.tsx 增加历史 Tab**

在 stats 按钮之后（`</button>` 关闭标签后），添加历史按钮：

```tsx
<button
  className={`nav-item ${activeTab === "history" ? "active" : ""}`}
  onClick={() => onTabChange("history")}
  aria-label={t("nav.history")}
  aria-current={activeTab === "history" ? "page" : undefined}
>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
</button>
```

**Step 4: App.tsx 增加 HistoryPage 路由**

1. 顶部 import:
```ts
import HistoryPage from "./components/HistoryPage";
```

2. 在 `content-area` 区域中，将 `{activeTab === "stats" ? (` 条件改为同时处理 stats 和 history：
```tsx
{activeTab === "stats" ? (
  <StatsPage />
) : activeTab === "history" ? (
  <HistoryPage />
) : (
  <div className={`list-section ${isModalOpen || isDetailDrawerOpen ? "compressed" : ""}`}>
```

**Step 5: 创建空的 HistoryPage 占位组件**

创建 `src/components/HistoryPage.tsx`：
```tsx
import { useI18n } from "../i18n";
import "./HistoryPage.css";

function HistoryPage() {
  const { t } = useI18n();
  return (
    <div className="history-page">
      <div className="page-header">
        <h1 className="page-title">{t("history.title")}</h1>
      </div>
      <div className="empty-state">{t("history.noData")}</div>
    </div>
  );
}

export default HistoryPage;
```

创建 `src/components/HistoryPage.css`：
```css
.history-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

**Step 6: 验证**

运行: `pnpm build`
预期: 编译通过，侧边栏能显示历史 Tab 并能切换到占位页面

**Step 7: 提交**

```
feat: 添加历史页面导航和占位组件
```

---

## Task 3: HistoryPage 核心 - 数据加载与轮询

**Files:**
- Modify: `src/components/HistoryPage.tsx`

**Step 1: 实现数据加载、JSONL 解析、分组和轮询**

替换 `HistoryPage.tsx` 为完整实现：

```tsx
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
```

**Step 2: 创建子组件占位**

`src/components/HistoryHeatmap.tsx`：
```tsx
import { memo } from "react";
import { HistoryEntry } from "../types";

function HistoryHeatmap({ entries }: { entries: HistoryEntry[] }) {
  return <div className="history-heatmap">热力图占位（{entries.length} 条）</div>;
}

export default memo(HistoryHeatmap);
```

`src/components/HistoryProjectList.tsx`：
```tsx
import { memo } from "react";
import { ProjectGroup } from "./HistoryPage";
import { useI18n } from "../i18n";

interface Props {
  groups: ProjectGroup[];
  selectedProject: string | null;
  onSelect: (project: string | null) => void;
}

function HistoryProjectList({ groups, selectedProject, onSelect }: Props) {
  const { t } = useI18n();
  return (
    <div className="history-projects">
      <div
        className={`history-project-item${selectedProject === null ? " selected" : ""}`}
        onClick={() => onSelect(null)}
      >
        {t("history.allProjects")}
      </div>
      {groups.map(g => (
        <div
          key={g.project}
          className={`history-project-item${selectedProject === g.project ? " selected" : ""}`}
          onClick={() => onSelect(g.project)}
          title={g.project}
        >
          <span className="project-name">{g.shortName}</span>
          <span className="project-count">{g.entries.length}</span>
        </div>
      ))}
    </div>
  );
}

export default memo(HistoryProjectList);
```

`src/components/HistorySessionList.tsx`：
```tsx
import { memo, useState } from "react";
import { SessionGroup } from "./HistoryPage";
import { useI18n } from "../i18n";

interface Props {
  groups: SessionGroup[];
  searchQuery: string;
}

/** 按天分组会话 */
function groupByDate(sessions: SessionGroup[]): Map<string, SessionGroup[]> {
  const map = new Map<string, SessionGroup[]>();
  for (const s of sessions) {
    const date = new Date(s.lastTimestamp).toLocaleDateString();
    const arr = map.get(date) || [];
    arr.push(s);
    map.set(date, arr);
  }
  return map;
}

/** 格式化时间为 HH:mm */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 格式化日期标题 */
function formatDateLabel(dateStr: string, t: (key: string) => string): string {
  const today = new Date().toLocaleDateString();
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();
  if (dateStr === today) return t("history.today");
  if (dateStr === yesterday) return t("history.yesterday");
  return dateStr;
}

/** 高亮搜索关键词 */
function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function HistorySessionList({ groups, searchQuery }: Props) {
  const { t } = useI18n();
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const toggleSession = (sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const dateGroups = groupByDate(groups);

  if (groups.length === 0) {
    return <div className="history-sessions"><div className="empty-state">{t("history.noData")}</div></div>;
  }

  return (
    <div className="history-sessions">
      {Array.from(dateGroups.entries()).map(([dateStr, sessions]) => (
        <div key={dateStr} className="history-date-group">
          <div className="history-date-label">{formatDateLabel(dateStr, t)}</div>
          {sessions.map(session => {
            const isExpanded = expandedSessions.has(session.sessionId);
            return (
              <div key={session.sessionId} className="history-session">
                <div
                  className="history-session-header"
                  onClick={() => toggleSession(session.sessionId)}
                >
                  <span className="session-toggle">{isExpanded ? "▼" : "▶"}</span>
                  <span className="session-id">{session.sessionId.slice(0, 8)}</span>
                  <span className="session-count">{session.entries.length} {t("history.messages")}</span>
                  <span className="session-time">{formatTime(session.lastTimestamp)}</span>
                </div>
                {isExpanded && (
                  <div className="history-session-entries">
                    {session.entries.map((entry, i) => (
                      <div key={i} className="history-entry">
                        <span className="entry-time">{formatTime(entry.timestamp)}</span>
                        <span className="entry-display" title={entry.display}>
                          {highlightText(entry.display, searchQuery)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default memo(HistorySessionList);
```

**Step 3: 验证**

运行: `pnpm build`
预期: 编译通过

**Step 4: 提交**

```
feat: 实现历史页面核心数据加载、分组和轮询逻辑
```

---

## Task 4: HistoryHeatmap 热力图组件

**Files:**
- Modify: `src/components/HistoryHeatmap.tsx`

**Step 1: 实现热力图**

替换 `HistoryHeatmap.tsx`：

```tsx
import { useMemo, memo } from "react";
import { HistoryEntry } from "../types";

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
  const { days, countMap, maxCount } = useMemo(() => {
    const days = getLastNDays(DAYS);
    const countMap = new Map<string, number>();
    for (const entry of entries) {
      const dateStr = new Date(entry.timestamp).toISOString().slice(0, 10);
      countMap.set(dateStr, (countMap.get(dateStr) || 0) + 1);
    }
    let maxCount = 0;
    for (const c of countMap.values()) {
      if (c > maxCount) maxCount = c;
    }
    return { days, countMap, maxCount };
  }, [entries]);

  return (
    <div className="heatmap-container">
      <div className="heatmap-grid">
        {days.map(day => {
          const count = countMap.get(day) || 0;
          const level = getLevel(count);
          return (
            <div
              key={day}
              className={`heatmap-cell heatmap-level-${level}`}
              title={`${day}: ${count} 条消息`}
            />
          );
        })}
      </div>
      <div className="heatmap-legend">
        <span className="heatmap-legend-label">少</span>
        {[0, 1, 2, 3, 4].map(level => (
          <div key={level} className={`heatmap-cell heatmap-level-${level}`} />
        ))}
        <span className="heatmap-legend-label">多</span>
      </div>
    </div>
  );
}

export default memo(HistoryHeatmap);
```

**Step 2: 验证**

运行: `pnpm build`
预期: 编译通过

**Step 3: 提交**

```
feat: 实现历史页面热力图组件（CSS Grid）
```

---

## Task 5: HistoryPage.css 完整样式

**Files:**
- Modify: `src/components/HistoryPage.css`

**Step 1: 编写完整样式**

```css
/* 页面容器 */
.history-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶部区域：热力图 + 搜索 */
.history-top {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

/* 搜索框 */
.history-search {
  flex-shrink: 0;
}

.history-search-input {
  width: 220px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  font-size: var(--font-sm);
  outline: none;
  transition: border-color 0.2s ease;
}

.history-search-input:focus {
  border-color: var(--accent-blue);
}

.history-search-input::placeholder {
  color: var(--text-muted);
}

/* 热力图容器 */
.heatmap-container {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.heatmap-grid {
  display: grid;
  grid-template-columns: repeat(30, 1fr);
  gap: 3px;
}

.heatmap-cell {
  aspect-ratio: 1;
  border-radius: 3px;
  min-width: 0;
}

.heatmap-level-0 { background-color: var(--bg-tertiary); }
.heatmap-level-1 { background-color: rgba(58, 134, 255, 0.25); }
.heatmap-level-2 { background-color: rgba(58, 134, 255, 0.45); }
.heatmap-level-3 { background-color: rgba(58, 134, 255, 0.65); }
.heatmap-level-4 { background-color: rgba(58, 134, 255, 0.9); }

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 3px;
  justify-content: flex-end;
}

.heatmap-legend .heatmap-cell {
  width: 12px;
  height: 12px;
}

.heatmap-legend-label {
  font-size: 10px;
  color: var(--text-muted);
  margin: 0 2px;
}

/* 主体区域：左右分栏 */
.history-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 左栏：项目列表 */
.history-projects {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  padding: var(--space-3) 0;
  scrollbar-width: thin;
  scrollbar-color: var(--border-muted) transparent;
}

.history-project-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--font-sm);
  transition: all 0.15s ease;
}

.history-project-item:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.history-project-item.selected {
  background-color: var(--accent-blue-bg);
  color: var(--accent-blue);
  font-weight: 600;
}

.project-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.project-count {
  flex-shrink: 0;
  font-size: var(--font-xs, 11px);
  color: var(--text-muted);
  background-color: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 10px;
}

/* 右栏：会话列表 */
.history-sessions {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-3) var(--space-4);
  scrollbar-width: thin;
  scrollbar-color: var(--border-muted) transparent;
}

/* 日期分组 */
.history-date-group {
  margin-bottom: var(--space-4);
}

.history-date-label {
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-secondary);
  padding: 4px 0 8px 0;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: var(--space-2);
}

/* 会话项 */
.history-session {
  margin-bottom: 2px;
}

.history-session-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: var(--font-sm);
  color: var(--text-primary);
  transition: background-color 0.15s ease;
}

.history-session-header:hover {
  background-color: var(--bg-hover);
}

.session-toggle {
  font-size: 10px;
  color: var(--text-muted);
  width: 14px;
  flex-shrink: 0;
}

.session-id {
  font-family: var(--font-mono, monospace);
  font-size: var(--font-xs, 11px);
  color: var(--text-secondary);
}

.session-count {
  font-size: var(--font-xs, 11px);
  color: var(--text-muted);
}

.session-time {
  margin-left: auto;
  font-size: var(--font-xs, 11px);
  color: var(--text-muted);
}

/* 会话展开后的条目列表 */
.history-session-entries {
  padding-left: 32px;
  border-left: 2px solid var(--border-color);
  margin-left: 16px;
  margin-top: 2px;
  margin-bottom: 8px;
}

.history-entry {
  display: flex;
  gap: 10px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}

.history-entry:hover {
  background-color: var(--bg-hover);
}

.entry-time {
  flex-shrink: 0;
  font-size: var(--font-xs, 11px);
  font-family: var(--font-mono, monospace);
  color: var(--text-muted);
  line-height: 1.6;
}

.entry-display {
  font-size: var(--font-sm);
  color: var(--text-primary);
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 搜索高亮 */
.search-highlight {
  background-color: rgba(210, 153, 34, 0.35);
  color: var(--text-primary);
  border-radius: 2px;
  padding: 0 1px;
}
```

**Step 2: 验证**

运行: `pnpm dev`
预期: 历史页面完整渲染，三栏布局正确，热力图、项目列表、会话列表均可见

**Step 3: 提交**

```
feat: 添加历史页面完整样式
```

---

## Task 6: 集成验证与最终调整

**Files:**
- 可能微调上述所有文件

**Step 1: 端到端验证**

1. `pnpm tauri dev` 启动完整应用
2. 验证侧边栏「历史」Tab 可点击
3. 验证热力图显示 30 天活动
4. 验证项目列表显示正确的项目名和计数
5. 验证点击项目后右栏过滤
6. 验证点击会话展开/收起
7. 验证搜索功能高亮
8. 验证轮询：在另一个 Claude Code 会话中输入命令，5 秒内历史页面出现新条目

**Step 2: 修复问题**

根据验证结果修复发现的问题。

**Step 3: 提交**

```
feat: 历史页面集成验证与调整
```

---

## 任务依赖关系

```
Task 1 (Rust 后端) ──┐
                      ├── Task 3 (核心逻辑) ── Task 6 (集成验证)
Task 2 (导航集成) ───┘         │
                         Task 4 (热力图)
                         Task 5 (样式)
```

- Task 1 和 Task 2 可并行
- Task 3 依赖 Task 1 + Task 2
- Task 4 和 Task 5 可与 Task 3 并行（Task 3 中已创建占位）
- Task 6 依赖所有前置任务
