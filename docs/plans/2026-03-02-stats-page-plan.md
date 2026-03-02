# 统计页面实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在侧边栏新增「统计」菜单，展示 `~/.claude.json` 的使用统计数据，通过定时快照持久化历史数据，使用 recharts 渲染趋势图表。

**Architecture:** Rust 后端新增 `stats.rs` 模块负责读取 `~/.claude.json`、管理快照持久化和定时线程。前端新增 `StatsPage.tsx` 页面使用 recharts 渲染四大 Section（概览、费用、工具使用、会话性能）。侧边栏 `TabType` 扩展为包含 `"stats"`。

**Tech Stack:** Rust (serde_json, std::thread), React 19, TypeScript, recharts, Tauri 2.0

---

## Task 1: 安装 recharts 依赖

**Files:**
- Modify: `package.json`

**Step 1: 安装 recharts**

```bash
cd /Users/maguowei/Work/AI/ai-manager && pnpm add recharts
```

**Step 2: 验证安装**

```bash
cd /Users/maguowei/Work/AI/ai-manager && pnpm list recharts
```

Expected: recharts 版本号出现在输出中

**Step 3: 提交**

```bash
cd /Users/maguowei/Work/AI/ai-manager
git add package.json pnpm-lock.yaml
git commit -m "chore: 添加 recharts 图表库依赖"
```

---

## Task 2: 创建 stats.rs - 数据结构与读取命令

**Files:**
- Create: `src-tauri/src/stats.rs`
- Modify: `src-tauri/src/utils.rs` (添加 STATS_LOCK)
- Modify: `src-tauri/src/lib.rs` (添加 mod stats)

**Context:**
- 参考 `memory.rs` 的模块结构模式：structs 使用 `#[serde(rename_all = "camelCase")]`
- 参考 `utils.rs` 的 `CONFIG_LOCK` / `MEMORY_LOCK` 模式定义 `STATS_LOCK`
- `~/.claude.json` 的字段名是 camelCase（如 `numStartups`、`firstStartTime`、`toolUsage`）
- 使用 `serde(default)` 处理可选字段，因为 `~/.claude.json` 不是我们控制的文件

**Step 1: 在 utils.rs 中添加 STATS_LOCK**

在 `src-tauri/src/utils.rs` 的 `MEMORY_LOCK` 之后添加：

```rust
/// 统计快照文件操作互斥锁
pub static STATS_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
```

**Step 2: 创建 stats.rs 数据结构和读取命令**

创建 `src-tauri/src/stats.rs`，内容如下：

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// ~/.claude.json 中的模型使用统计
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    #[serde(default)]
    pub input_tokens: u64,
    #[serde(default)]
    pub output_tokens: u64,
    #[serde(default)]
    pub cache_read_input_tokens: u64,
    #[serde(default)]
    pub cache_creation_input_tokens: u64,
    #[serde(default)]
    pub web_search_requests: u64,
    #[serde(default)]
    pub cost_usd: f64,
}

/// 会话性能指标
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct SessionMetrics {
    #[serde(default)]
    pub frame_duration_ms_avg: f64,
    #[serde(default)]
    pub frame_duration_ms_p95: f64,
    #[serde(default)]
    pub hook_duration_ms_avg: Option<f64>,
    #[serde(default)]
    pub hook_duration_ms_p95: Option<f64>,
    #[serde(default)]
    pub hook_duration_ms_count: Option<u64>,
    #[serde(default)]
    pub pre_tool_hook_duration_ms_avg: Option<f64>,
    #[serde(default)]
    pub pre_tool_hook_duration_ms_p95: Option<f64>,
}

/// 使用条目（工具和 Skill 通用）
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageEntry {
    #[serde(default)]
    pub usage_count: u32,
    #[serde(default)]
    pub last_used_at: u64,
}

/// 项目级统计
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStats {
    #[serde(default)]
    pub last_cost: f64,
    #[serde(default)]
    pub last_duration: u64,
    #[serde(default)]
    pub last_model_usage: HashMap<String, ModelUsage>,
    #[serde(default)]
    pub last_session_metrics: Option<SessionMetrics>,
    #[serde(default)]
    pub last_total_input_tokens: u64,
    #[serde(default)]
    pub last_total_output_tokens: u64,
    #[serde(default)]
    pub last_total_cache_creation_input_tokens: u64,
    #[serde(default)]
    pub last_total_cache_read_input_tokens: u64,
}

/// 从 ~/.claude.json 解析的完整统计数据
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeStats {
    #[serde(default)]
    pub num_startups: u32,
    #[serde(default)]
    pub first_start_time: Option<String>,
    #[serde(default)]
    pub projects: HashMap<String, ProjectStats>,
    #[serde(default)]
    pub tool_usage: HashMap<String, UsageEntry>,
    #[serde(default)]
    pub skill_usage: HashMap<String, UsageEntry>,
}

/// 快照条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub timestamp: u64,
    pub data: ClaudeStats,
}

/// 快照历史存储结构
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StatsHistory {
    #[serde(default)]
    pub snapshots: Vec<Snapshot>,
}

/// 获取 ~/.claude.json 路径
fn get_claude_json_path() -> PathBuf {
    crate::utils::get_home_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".claude.json")
}

/// 获取快照存储路径
fn get_stats_history_path() -> PathBuf {
    crate::utils::get_app_data_dir().join("stats_history.json")
}

/// 从 ~/.claude.json 读取统计数据
fn read_claude_stats() -> ClaudeStats {
    let path = get_claude_json_path();
    crate::utils::read_json_file(&path)
}

/// 加载快照历史
fn load_stats_history() -> StatsHistory {
    let path = get_stats_history_path();
    crate::utils::read_json_file(&path)
}

/// 保存快照历史
fn save_stats_history(history: &StatsHistory) -> Result<(), String> {
    let path = get_stats_history_path();
    let content = serde_json::to_string_pretty(history).map_err(|e| e.to_string())?;
    crate::utils::ensure_dir_and_write(&path, &content)
}

/// 90 天（秒）
const RETENTION_SECONDS: u64 = 90 * 24 * 60 * 60;

/// 执行快照（内部逻辑，加锁前调用）
fn take_snapshot_inner() -> Result<(), String> {
    let stats = read_claude_stats();
    let now = crate::utils::current_timestamp();
    let mut history = load_stats_history();

    // 去重：与最后一次快照数据相同则跳过
    if let Some(last) = history.snapshots.last() {
        if last.data == stats {
            return Ok(());
        }
    }

    // 清理超过 90 天的快照
    let cutoff = now.saturating_sub(RETENTION_SECONDS);
    history.snapshots.retain(|s| s.timestamp >= cutoff);

    // 新增快照
    history.snapshots.push(Snapshot {
        timestamp: now,
        data: stats,
    });

    save_stats_history(&history)
}

/// 获取当前统计数据
#[tauri::command]
pub fn get_stats() -> Result<ClaudeStats, String> {
    Ok(read_claude_stats())
}

/// 获取历史快照
#[tauri::command]
pub fn get_stats_history() -> Result<Vec<Snapshot>, String> {
    Ok(load_stats_history().snapshots)
}

/// 手动触发快照
#[tauri::command]
pub fn take_stats_snapshot() -> Result<(), String> {
    let _lock = crate::utils::STATS_LOCK
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;
    take_snapshot_inner()
}

/// 启动定时快照线程（每 1 小时执行一次）
pub fn start_snapshot_timer() {
    std::thread::spawn(|| {
        // 启动时立即执行一次快照
        {
            if let Ok(_lock) = crate::utils::STATS_LOCK.lock() {
                let _ = take_snapshot_inner();
            }
        }
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3600));
            if let Ok(_lock) = crate::utils::STATS_LOCK.lock() {
                let _ = take_snapshot_inner();
            }
        }
    });
}
```

**Step 3: 在 lib.rs 注册模块、命令和定时器**

在 `src-tauri/src/lib.rs` 顶部添加 `mod stats;`，在 use 语句区域添加：

```rust
use stats::{get_stats, get_stats_history, take_stats_snapshot};
```

在 `.setup()` 闭包内，`tray::setup_tray(app)?;` 之后添加：

```rust
stats::start_snapshot_timer();
```

在 `generate_handler![]` 宏中追加 3 个命令：

```rust
get_stats,
get_stats_history,
take_stats_snapshot
```

**Step 4: 验证编译**

```bash
cd /Users/maguowei/Work/AI/ai-manager/src-tauri && cargo check
```

Expected: 编译无错误

**Step 5: 提交**

```bash
cd /Users/maguowei/Work/AI/ai-manager
git add src-tauri/src/stats.rs src-tauri/src/utils.rs src-tauri/src/lib.rs
git commit -m "feat: 添加统计数据读取和快照持久化后端模块"
```

---

## Task 3: 添加 i18n 翻译

**Files:**
- Modify: `src/i18n.ts`

**Context:**
- 翻译字典分 `zh` 和 `en` 两个对象
- key 格式为 `"section.key"`
- 需要覆盖页面标题、各 Section 标题、概览卡片标签、图表标签等

**Step 1: 在 i18n.ts 的 zh 对象中添加 stats 翻译**

在 `zh` 对象的 `"skills.description"` 之后、`// 确认对话框` 注释之前添加：

```typescript
    // 统计页面
    "nav.stats": "统计",
    "stats.title": "使用统计",
    "stats.refresh": "刷新",
    "stats.overview": "概览",
    "stats.startups": "启动次数",
    "stats.totalCost": "总花费",
    "stats.firstUse": "首次使用",
    "stats.totalProjects": "项目数",
    "stats.costSection": "费用统计",
    "stats.costByProject": "按项目",
    "stats.costByModel": "按模型",
    "stats.costTrend": "费用趋势",
    "stats.toolSection": "工具 & Skill 使用",
    "stats.toolUsage": "工具调用 TOP10",
    "stats.skillUsage": "Skill 使用频率",
    "stats.sessionSection": "会话与性能",
    "stats.sessionDuration": "最近会话时长",
    "stats.performance": "性能指标",
    "stats.frameAvg": "帧渲染均值",
    "stats.frameP95": "帧渲染 P95",
    "stats.hookAvg": "Hook 均值",
    "stats.hookP95": "Hook P95",
    "stats.calls": "次调用",
    "stats.noData": "暂无统计数据",
    "stats.noDataHint": "使用 Claude Code 后，统计数据将自动显示在这里",
```

**Step 2: 在 en 对象中添加对应翻译**

在 `en` 对象的 `"skills.description"` 之后、`// 确认对话框` 注释之前添加：

```typescript
    // 统计页面
    "nav.stats": "Stats",
    "stats.title": "Usage Statistics",
    "stats.refresh": "Refresh",
    "stats.overview": "Overview",
    "stats.startups": "Startups",
    "stats.totalCost": "Total Cost",
    "stats.firstUse": "First Use",
    "stats.totalProjects": "Projects",
    "stats.costSection": "Cost Statistics",
    "stats.costByProject": "By Project",
    "stats.costByModel": "By Model",
    "stats.costTrend": "Cost Trend",
    "stats.toolSection": "Tool & Skill Usage",
    "stats.toolUsage": "Tool Calls TOP10",
    "stats.skillUsage": "Skill Usage",
    "stats.sessionSection": "Sessions & Performance",
    "stats.sessionDuration": "Last Session Duration",
    "stats.performance": "Performance Metrics",
    "stats.frameAvg": "Frame Avg",
    "stats.frameP95": "Frame P95",
    "stats.hookAvg": "Hook Avg",
    "stats.hookP95": "Hook P95",
    "stats.calls": "calls",
    "stats.noData": "No statistics yet",
    "stats.noDataHint": "Statistics will appear here after using Claude Code",
```

**Step 3: 验证 TypeScript 编译**

```bash
cd /Users/maguowei/Work/AI/ai-manager && npx tsc --noEmit
```

Expected: 无错误

**Step 4: 提交**

```bash
cd /Users/maguowei/Work/AI/ai-manager
git add src/i18n.ts
git commit -m "feat: 添加统计页面 i18n 翻译"
```

---

## Task 4: 更新侧边栏和 App 路由

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`

**Context:**
- `Sidebar.tsx` 使用 inline SVG icon，TabType 通过 props 传入
- `App.tsx` 中 `TabType` 为联合字符串类型，条件渲染不同页面
- StatsPage 不需要抽屉（全宽展示），所以不需要 `isModalOpen` 相关逻辑

**Step 1: 修改 Sidebar.tsx**

将 `SidebarProps` 的 `activeTab` 和 `onTabChange` 的类型从 `"configs" | "memory" | "skills"` 改为 `"configs" | "memory" | "skills" | "stats"`。

在 skills 按钮之后、`</div>` (`sidebar-nav` 闭合) 之前添加 stats 按钮：

```tsx
        <button
          className={`nav-item ${activeTab === "stats" ? "active" : ""}`}
          onClick={() => onTabChange("stats")}
          aria-label="使用统计"
          aria-current={activeTab === "stats" ? "page" : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </button>
```

**Step 2: 修改 App.tsx**

2a. 将 `TabType` 改为：
```typescript
type TabType = "configs" | "memory" | "skills" | "stats";
```

2b. 在文件顶部 import 区域添加：
```typescript
import StatsPage from "./components/StatsPage";
```

2c. 在 `{activeTab === "skills" && <SkillsPage />}` 之后添加：
```tsx
          {activeTab === "stats" && <StatsPage />}
```

**Step 3: 创建占位 StatsPage.tsx**

创建 `src/components/StatsPage.tsx`，先用占位内容确保路由正常工作：

```tsx
import { useI18n } from "../i18n";

function StatsPage() {
  const { t } = useI18n();

  return (
    <div className="stats-page">
      <div className="page-header">
        <h1 className="page-title">{t("stats.title")}</h1>
      </div>
      <div className="stats-loading">
        {t("loading")}
      </div>
    </div>
  );
}

export default StatsPage;
```

**Step 4: 验证编译和侧边栏**

```bash
cd /Users/maguowei/Work/AI/ai-manager && npx tsc --noEmit
```

Expected: 无错误

**Step 5: 提交**

```bash
cd /Users/maguowei/Work/AI/ai-manager
git add src/components/Sidebar.tsx src/App.tsx src/components/StatsPage.tsx
git commit -m "feat: 侧边栏新增统计菜单并注册路由"
```

---

## Task 5: 添加前端类型定义

**Files:**
- Modify: `src/types.ts`

**Context:**
- 类型定义需要与 Rust 后端 `stats.rs` 中的结构体完全对应（camelCase）
- 现有类型 `ClaudeConfig`、`Memory` 都定义在 `types.ts` 中

**Step 1: 在 types.ts 末尾添加统计相关类型**

在 `deepMerge` 函数之前添加：

```typescript
// ===== 统计页面类型 =====

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUsd: number;
}

export interface SessionMetrics {
  frameDurationMsAvg: number;
  frameDurationMsP95: number;
  hookDurationMsAvg?: number;
  hookDurationMsP95?: number;
  hookDurationMsCount?: number;
  preToolHookDurationMsAvg?: number;
  preToolHookDurationMsP95?: number;
}

export interface UsageEntry {
  usageCount: number;
  lastUsedAt: number;
}

export interface ProjectStats {
  lastCost: number;
  lastDuration: number;
  lastModelUsage: Record<string, ModelUsage>;
  lastSessionMetrics?: SessionMetrics;
  lastTotalInputTokens: number;
  lastTotalOutputTokens: number;
  lastTotalCacheCreationInputTokens: number;
  lastTotalCacheReadInputTokens: number;
}

export interface ClaudeStats {
  numStartups: number;
  firstStartTime?: string;
  projects: Record<string, ProjectStats>;
  toolUsage: Record<string, UsageEntry>;
  skillUsage: Record<string, UsageEntry>;
}

export interface Snapshot {
  timestamp: number;
  data: ClaudeStats;
}
```

**Step 2: 验证**

```bash
cd /Users/maguowei/Work/AI/ai-manager && npx tsc --noEmit
```

**Step 3: 提交**

```bash
cd /Users/maguowei/Work/AI/ai-manager
git add src/types.ts
git commit -m "feat: 添加统计页面前端类型定义"
```

---

## Task 6: 实现 StatsPage 完整页面

**Files:**
- Modify: `src/components/StatsPage.tsx` (替换占位内容)
- Create: `src/components/StatsPage.css`

**Context:**
- 页面 mount 时并行调用 `get_stats()` 和 `get_stats_history()`
- 顶部刷新按钮调用 `take_stats_snapshot()` 后重新加载
- recharts 不支持 CSS 变量，需要用 hex 色值常量（从 App.css 提取）
- 页面分 4 个 Section Card 渲染
- 使用 `useI18n()` 获取翻译，`useToast()` 获取通知
- 数据为空时展示空状态
- 项目路径显示时只取最后两级目录名（如 `/Users/xxx/Work/AI/ai-manager` → `AI/ai-manager`）

**Step 1: 创建 StatsPage.css**

创建 `src/components/StatsPage.css`：

```css
.stats-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stats-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5);
  scrollbar-width: none;
}

.stats-scroll::-webkit-scrollbar {
  display: none;
}

/* 概览卡片区 */
.stats-overview {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.stat-card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.stat-card-label {
  font-size: var(--font-sm);
  color: var(--text-secondary);
  font-weight: 500;
}

.stat-card-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.stat-card-value.accent-blue {
  color: var(--accent-blue);
}

.stat-card-value.accent-green {
  color: var(--accent-green);
}

.stat-card-value.accent-purple {
  color: var(--accent-purple);
}

.stat-card-value.accent-orange {
  color: var(--accent-orange);
}

/* Section Card */
.stats-section {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  margin-bottom: var(--space-5);
}

.stats-section-title {
  font-size: var(--font-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-muted);
}

/* 图表子区域 */
.stats-chart-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-5);
  margin-bottom: var(--space-4);
}

.stats-chart-group.single {
  grid-template-columns: 1fr;
}

.stats-chart-block {
  min-height: 0;
}

.stats-chart-label {
  font-size: var(--font-sm);
  color: var(--text-secondary);
  font-weight: 500;
  margin-bottom: var(--space-3);
}

/* 列表样式 */
.stats-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.stats-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background-color: var(--bg-tertiary);
}

.stats-list-item-name {
  font-size: var(--font-base);
  color: var(--text-primary);
  font-weight: 500;
}

.stats-list-item-value {
  font-size: var(--font-base);
  color: var(--text-secondary);
  font-family: "SF Mono", "Cascadia Code", "Fira Code", monospace;
}

/* 性能指标网格 */
.stats-metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

.stats-metric-item {
  background-color: var(--bg-tertiary);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
}

.stats-metric-label {
  font-size: var(--font-xs);
  color: var(--text-secondary);
  margin-bottom: var(--space-1);
}

.stats-metric-value {
  font-size: var(--font-xl);
  font-weight: 600;
  color: var(--text-primary);
}

/* 刷新按钮 */
.stats-refresh-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background-color: transparent;
  color: var(--text-secondary);
  font-size: var(--font-sm);
  cursor: pointer;
  transition: all 150ms ease;
}

.stats-refresh-btn:hover {
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
}

/* 空状态 */
.stats-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px var(--space-5);
  text-align: center;
}

/* 响应式 */
@media (max-width: 900px) {
  .stats-overview {
    grid-template-columns: repeat(2, 1fr);
  }

  .stats-chart-group {
    grid-template-columns: 1fr;
  }

  .stats-metrics-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .stats-overview {
    grid-template-columns: 1fr;
  }
}
```

**Step 2: 实现 StatsPage.tsx**

用以下完整内容替换 `src/components/StatsPage.tsx`：

```tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { ClaudeStats, Snapshot } from "../types";
import { useI18n } from "../i18n";
import { useToast } from "../hooks/useToast";
import "./StatsPage.css";

// recharts 不支持 CSS 变量，从 App.css 提取对应暗色 hex
const COLORS = {
  blue: "#58a6ff",
  green: "#3fb950",
  orange: "#f78166",
  purple: "#bc8cff",
  red: "#f85149",
  teal: "#39d2c0",
  pink: "#f778ba",
  yellow: "#d29922",
};
const PIE_COLORS = [COLORS.blue, COLORS.green, COLORS.orange, COLORS.purple, COLORS.red, COLORS.teal, COLORS.pink, COLORS.yellow];

// 检测是否在 Tauri 环境中运行
const isTauri = () => typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;

/** 项目路径截取最后两级 */
function shortPath(fullPath: string): string {
  const parts = fullPath.split("/").filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join("/") : fullPath;
}

/** 格式化美元金额 */
function formatUSD(val: number): string {
  return val < 0.01 && val > 0 ? "< $0.01" : `$${val.toFixed(2)}`;
}

/** 格式化日期 */
function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return isoStr;
  }
}

/** 格式化毫秒为可读时长 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = sec / 60;
  if (min < 60) return `${min.toFixed(1)}m`;
  const hr = min / 60;
  return `${hr.toFixed(1)}h`;
}

function StatsPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [stats, setStats] = useState<ClaudeStats | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!isTauri()) { setLoading(false); return; }
    try {
      const [s, h] = await Promise.all([
        invoke<ClaudeStats>("get_stats"),
        invoke<Snapshot[]>("get_stats_history"),
      ]);
      setStats(s);
      setHistory(h);
    } catch {
      showToast("加载统计数据失败", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleRefresh() {
    if (!isTauri()) return;
    try {
      await invoke("take_stats_snapshot");
      await loadData();
      showToast("已刷新统计数据");
    } catch {
      showToast("刷新失败", "error");
    }
  }

  // ===== 派生数据 =====
  const totalCost = useMemo(() => {
    if (!stats) return 0;
    return Object.values(stats.projects).reduce((sum, p) => sum + p.lastCost, 0);
  }, [stats]);

  const projectCostData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.projects)
      .filter(([, p]) => p.lastCost > 0)
      .map(([path, p]) => ({ name: shortPath(path), cost: +p.lastCost.toFixed(2) }))
      .sort((a, b) => b.cost - a.cost);
  }, [stats]);

  const modelCostData = useMemo(() => {
    if (!stats) return [];
    const modelMap: Record<string, number> = {};
    Object.values(stats.projects).forEach((p) => {
      Object.entries(p.lastModelUsage).forEach(([model, usage]) => {
        modelMap[model] = (modelMap[model] || 0) + usage.costUsd;
      });
    });
    return Object.entries(modelMap)
      .filter(([, cost]) => cost > 0)
      .map(([name, value]) => ({ name, value: +value.toFixed(2) }))
      .sort((a, b) => b.value - a.value);
  }, [stats]);

  const toolUsageData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.toolUsage)
      .map(([name, entry]) => ({ name, count: entry.usageCount }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [stats]);

  const skillUsageData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.skillUsage)
      .map(([name, entry]) => ({ name, count: entry.usageCount }))
      .sort((a, b) => b.count - a.count);
  }, [stats]);

  const costTrendData = useMemo(() => {
    return history.map((snap) => {
      const total = Object.values(snap.data.projects).reduce((sum, p) => sum + p.lastCost, 0);
      const d = new Date(snap.timestamp * 1000);
      return {
        date: `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
        cost: +total.toFixed(2),
      };
    });
  }, [history]);

  // ===== 渲染 =====
  if (loading) {
    return (
      <div className="stats-page">
        <div className="page-header"><h1 className="page-title">{t("stats.title")}</h1></div>
        <div className="stats-scroll"><div className="stats-empty"><p className="empty-text">{t("loading")}</p></div></div>
      </div>
    );
  }

  if (!stats || stats.numStartups === 0) {
    return (
      <div className="stats-page">
        <div className="page-header"><h1 className="page-title">{t("stats.title")}</h1></div>
        <div className="stats-scroll">
          <div className="stats-empty">
            <div className="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <p className="empty-text">{t("stats.noData")}</p>
            <p className="empty-hint">{t("stats.noDataHint")}</p>
          </div>
        </div>
      </div>
    );
  }

  const projectCount = Object.keys(stats.projects).length;

  return (
    <div className="stats-page">
      <div className="page-header">
        <h1 className="page-title">{t("stats.title")}</h1>
        <button className="stats-refresh-btn" onClick={handleRefresh}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {t("stats.refresh")}
        </button>
      </div>

      <div className="stats-scroll">
        {/* 概览 */}
        <div className="stats-overview">
          <div className="stat-card">
            <span className="stat-card-label">{t("stats.startups")}</span>
            <span className="stat-card-value accent-blue">{stats.numStartups}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-label">{t("stats.totalCost")}</span>
            <span className="stat-card-value accent-green">{formatUSD(totalCost)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-label">{t("stats.firstUse")}</span>
            <span className="stat-card-value accent-purple">{stats.firstStartTime ? formatDate(stats.firstStartTime) : "-"}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-label">{t("stats.totalProjects")}</span>
            <span className="stat-card-value accent-orange">{projectCount}</span>
          </div>
        </div>

        {/* 费用统计 */}
        <div className="stats-section">
          <h2 className="stats-section-title">{t("stats.costSection")}</h2>
          <div className="stats-chart-group">
            <div className="stats-chart-block">
              <div className="stats-chart-label">{t("stats.costByProject")}</div>
              {projectCostData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, projectCostData.length * 40)}>
                  <BarChart data={projectCostData} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                    <XAxis type="number" tick={{ fill: "#7d8590", fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: "#7d8590", fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatUSD(v)} contentStyle={{ backgroundColor: "#161b22", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" }} />
                    <Bar dataKey="cost" fill={COLORS.blue} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p style={{ color: "var(--text-muted)", fontSize: "var(--font-sm)" }}>-</p>}
            </div>
            <div className="stats-chart-block">
              <div className="stats-chart-label">{t("stats.costByModel")}</div>
              {modelCostData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={modelCostData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} label={({ name, value }) => `${name.split("-").slice(0, 2).join("-")} $${value}`} labelLine={false}>
                      {modelCostData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatUSD(v)} contentStyle={{ backgroundColor: "#161b22", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p style={{ color: "var(--text-muted)", fontSize: "var(--font-sm)" }}>-</p>}
            </div>
          </div>

          {/* 费用趋势 */}
          {costTrendData.length > 1 && (
            <div className="stats-chart-block">
              <div className="stats-chart-label">{t("stats.costTrend")}</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={costTrendData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                  <XAxis dataKey="date" tick={{ fill: "#7d8590", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#7d8590", fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => formatUSD(v)} contentStyle={{ backgroundColor: "#161b22", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" }} />
                  <Area type="monotone" dataKey="cost" stroke={COLORS.green} fill={COLORS.green} fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* 工具 & Skill 使用 */}
        <div className="stats-section">
          <h2 className="stats-section-title">{t("stats.toolSection")}</h2>
          <div className="stats-chart-group">
            <div className="stats-chart-block">
              <div className="stats-chart-label">{t("stats.toolUsage")}</div>
              {toolUsageData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, toolUsageData.length * 36)}>
                  <BarChart data={toolUsageData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <XAxis type="number" tick={{ fill: "#7d8590", fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fill: "#7d8590", fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: "#161b22", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" }} />
                    <Bar dataKey="count" fill={COLORS.orange} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p style={{ color: "var(--text-muted)", fontSize: "var(--font-sm)" }}>-</p>}
            </div>
            <div className="stats-chart-block">
              <div className="stats-chart-label">{t("stats.skillUsage")}</div>
              {skillUsageData.length > 0 ? (
                <div className="stats-list">
                  {skillUsageData.map((item) => (
                    <div key={item.name} className="stats-list-item">
                      <span className="stats-list-item-name">{item.name}</span>
                      <span className="stats-list-item-value">{item.count} {t("stats.calls")}</span>
                    </div>
                  ))}
                </div>
              ) : <p style={{ color: "var(--text-muted)", fontSize: "var(--font-sm)" }}>-</p>}
            </div>
          </div>
        </div>

        {/* 会话与性能 */}
        <div className="stats-section">
          <h2 className="stats-section-title">{t("stats.sessionSection")}</h2>

          {/* 项目会话时长列表 */}
          <div className="stats-chart-label">{t("stats.sessionDuration")}</div>
          <div className="stats-list" style={{ marginBottom: "var(--space-4)" }}>
            {Object.entries(stats.projects)
              .filter(([, p]) => p.lastDuration > 0)
              .sort(([, a], [, b]) => b.lastDuration - a.lastDuration)
              .map(([path, p]) => (
                <div key={path} className="stats-list-item">
                  <span className="stats-list-item-name">{shortPath(path)}</span>
                  <span className="stats-list-item-value">{formatDuration(p.lastDuration)}</span>
                </div>
              ))
            }
          </div>

          {/* 性能指标 */}
          <div className="stats-chart-label">{t("stats.performance")}</div>
          <div className="stats-metrics-grid">
            {Object.entries(stats.projects)
              .filter(([, p]) => p.lastSessionMetrics)
              .map(([path, p]) => {
                const m = p.lastSessionMetrics!;
                return (
                  <div key={path} className="stats-metric-item">
                    <div className="stats-metric-label">{shortPath(path)}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                      <div>
                        <div className="stats-metric-label">{t("stats.frameAvg")}</div>
                        <div className="stats-metric-value">{m.frameDurationMsAvg.toFixed(1)}ms</div>
                      </div>
                      <div>
                        <div className="stats-metric-label">{t("stats.frameP95")}</div>
                        <div className="stats-metric-value">{m.frameDurationMsP95.toFixed(1)}ms</div>
                      </div>
                      {m.hookDurationMsAvg != null && (
                        <div>
                          <div className="stats-metric-label">{t("stats.hookAvg")}</div>
                          <div className="stats-metric-value">{m.hookDurationMsAvg.toFixed(1)}ms</div>
                        </div>
                      )}
                      {m.hookDurationMsP95 != null && (
                        <div>
                          <div className="stats-metric-label">{t("stats.hookP95")}</div>
                          <div className="stats-metric-value">{m.hookDurationMsP95.toFixed(1)}ms</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            }
          </div>
        </div>
      </div>
    </div>
  );
}

export default StatsPage;
```

**Step 3: 验证 TypeScript 编译**

```bash
cd /Users/maguowei/Work/AI/ai-manager && npx tsc --noEmit
```

Expected: 无错误

**Step 4: 提交**

```bash
cd /Users/maguowei/Work/AI/ai-manager
git add src/components/StatsPage.tsx src/components/StatsPage.css
git commit -m "feat: 实现统计页面完整 UI（概览、费用、工具使用、会话性能）"
```

---

## Task 7: 端到端验证

**Files:** 无新增

**Step 1: 验证 Rust 编译**

```bash
cd /Users/maguowei/Work/AI/ai-manager/src-tauri && cargo check
```

Expected: 编译无错误

**Step 2: 验证前端编译**

```bash
cd /Users/maguowei/Work/AI/ai-manager && npx tsc --noEmit
```

Expected: 无错误

**Step 3: 启动应用验证**

```bash
cd /Users/maguowei/Work/AI/ai-manager && pnpm tauri dev
```

验证清单：
- [ ] 侧边栏第 4 个按钮（柱状图 icon）可点击
- [ ] 点击后切换到统计页面
- [ ] 概览卡片显示启动次数、总花费、首次使用、项目数
- [ ] 费用按项目柱状图正确渲染
- [ ] 费用按模型饼图正确渲染
- [ ] 工具调用 TOP10 柱状图正确渲染
- [ ] Skill 使用列表正确渲染
- [ ] 会话时长和性能指标正常显示
- [ ] 刷新按钮可用
- [ ] 快照文件 `~/.config/ai-manager/stats_history.json` 已创建

**Step 4: 修复发现的问题（如有）**

根据实际验证结果修复 bug。

**Step 5: 最终提交（如有修复）**

```bash
cd /Users/maguowei/Work/AI/ai-manager
git add -A
git commit -m "fix: 修复统计页面集成问题"
```
