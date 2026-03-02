# 统计页面设计

## 概述

在侧边栏新增「统计」菜单，展示 `~/.claude.json` 的使用统计数据，并通过应用内定时快照持久化历史数据，支持趋势图表展示。

## 数据来源

- **实时数据**：读取 `~/.claude.json`
- **历史数据**：应用内定时快照，存储于 `~/.config/ai-manager/stats_history.json`

## 数据架构

### ClaudeStats（从 `~/.claude.json` 提取）

```rust
struct ClaudeStats {
    num_startups: u32,
    first_start_time: Option<String>,       // ISO 8601
    projects: HashMap<String, ProjectStats>,
    tool_usage: HashMap<String, UsageEntry>,
    skill_usage: HashMap<String, UsageEntry>,
}

struct ProjectStats {
    last_cost: f64,
    last_duration: u64,                      // ms
    last_model_usage: HashMap<String, ModelUsage>,
    last_session_metrics: Option<SessionMetrics>,
}

struct ModelUsage {
    input_tokens: u64,
    output_tokens: u64,
    cache_read_input_tokens: u64,
    cache_creation_input_tokens: u64,
    cost_usd: f64,
}

struct UsageEntry {
    usage_count: u32,
    last_used_at: u64,
}

struct SessionMetrics {
    frame_duration_ms_avg: f64,
    frame_duration_ms_p95: f64,
    hook_duration_ms_avg: Option<f64>,
    hook_duration_ms_p95: Option<f64>,
}
```

### 快照存储格式

```json
{
  "snapshots": [
    {
      "timestamp": 1772400000,
      "data": { ... ClaudeStats ... }
    }
  ]
}
```

### 快照策略

- **频率**：后端 setup 中启动定时线程，每 1 小时自动快照
- **去重**：数据与上一次快照相同则跳过
- **清理**：保留最近 90 天，超过的自动清理
- **并发保护**：`STATS_LOCK` 全局互斥锁

### Rust 命令

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `get_stats()` | 无 | `ClaudeStats` | 读取当前 ~/.claude.json |
| `get_stats_history()` | 无 | `Vec<Snapshot>` | 返回所有历史快照 |
| `take_stats_snapshot()` | 无 | `()` | 手动触发一次快照 |

## 前端页面设计

### 侧边栏

- `TabType` 扩展为 `"configs" | "memory" | "skills" | "stats"`
- 新增柱状图 icon 的导航按钮

### StatsPage 布局

单列滚动布局（全宽展示，不使用抽屉），分 4 个 Section Card：

```
┌─────────────────────────────────────┐
│ 页面标题：使用统计                     │
├─────────────────────────────────────┤
│                                     │
│  ┌─ 概览卡片 ─────────────────────┐ │
│  │ 启动次数  │ 总花费  │ 首次使用  │ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌─ 费用统计 ─────────────────────┐ │
│  │ 按项目费用柱状图                 │ │
│  │ 按模型占比饼图                  │ │
│  │ 历史费用趋势折线图               │ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌─ 工具 & Skill 使用 ───────────┐ │
│  │ 工具调用 TOP10 水平柱状图       │ │
│  │ Skill 使用频率列表              │ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌─ 会话与性能 ──────────────────┐ │
│  │ 各项目 Session 时长/指标        │ │
│  │ 帧渲染/Hook 性能摘要           │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 图表选型（recharts）

| 数据 | 图表类型 |
|------|---------|
| 费用趋势 | `<AreaChart>` / `<LineChart>` |
| 项目费用 | `<BarChart>`（水平） |
| 模型占比 | `<PieChart>` |
| 工具使用 | `<BarChart>`（水平排序） |

### 样式

- Card：`var(--bg-secondary)` 背景 + `var(--border-default)` 边框 + `var(--radius-xl)` 圆角
- 概览数字：大字号 + 语义色强调
- 响应式：窄窗口时概览卡片纵排

### i18n

新增 `stats.*` 系列翻译 key（zh + en）。

## 文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src-tauri/src/stats.rs` | 统计数据读取、快照管理 |
| `src/components/StatsPage.tsx` | 统计页面组件 |
| `src/components/StatsPage.css` | 统计页面样式 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src-tauri/src/lib.rs` | 新增 `mod stats`、注册命令、setup 定时器 |
| `src-tauri/Cargo.toml` | 无新依赖（serde_json 已有） |
| `src/components/Sidebar.tsx` | TabType 扩展、新增 stats 按钮 |
| `src/App.tsx` | TabType 扩展、渲染 StatsPage |
| `src/i18n.ts` | 新增 stats.* 翻译 |
| `package.json` | 新增 recharts 依赖 |

## 决策记录

- 选择方案 B（recharts + Rust 后端定时快照）
- 快照频率 1 小时，保留 90 天
- 统计页面全宽展示，不使用抽屉模式
