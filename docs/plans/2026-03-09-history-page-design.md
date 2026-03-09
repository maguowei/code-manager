# History Page 设计文档

## 概述

为 AI Manager 新增「历史」页面，读取 `~/.claude/history.jsonl` 文件，按 project 和 sessionId 分组可视化展示 Claude Code 的使用历史，支持轮询自动刷新、搜索和活动热力图。

## 数据源

文件：`~/.claude/history.jsonl`（JSONL 格式，每行一个 JSON 对象）

字段：
- `display: string` — 用户输入内容
- `pastedContents: Record<string, string>` — 粘贴的内容
- `timestamp: number` — 毫秒级时间戳
- `project: string` — 项目绝对路径
- `sessionId: string` — UUID 格式的会话 ID

当前规模：~1100 条，264KB，12 个项目，115 个会话。

## 实现方案

**方案 A：纯前端处理**（已确认）

- 后端只负责读取文件和判断 mtime，前端负责 JSONL 解析、分组、搜索、渲染
- 轮询间隔 5 秒，使用 mtime 避免无效读取

## 后端设计

新增 `src-tauri/src/history.rs` 模块，两个命令：

### `get_history()`
- 读取 `~/.claude/history.jsonl` 全部内容
- 返回 `{ content: string, mtime: u64 }`
- `mtime` 为文件修改时间（Unix 秒）

### `get_history_if_changed(last_mtime: u64)`
- 读取文件元数据获取当前 mtime
- 若 `mtime == last_mtime`，返回 `null`（无变化）
- 若有变化，返回 `{ content: string, mtime: u64 }`

不使用全局锁（只读操作）。

## 前端设计

### 类型定义

```ts
// types.ts
interface HistoryEntry {
  display: string;
  pastedContents: Record<string, string>;
  timestamp: number;
  project: string;
  sessionId: string;
}

type TabType = "configs" | "memory" | "skills" | "stats" | "history";
```

### 页面布局

三栏布局：

```
┌──────────────────────────────────────────────────┐
│  [热力图 - 过去30天活动强度]          [🔍 搜索框] │
├──────────┬───────────────────────────────────────┤
│ 项目列表  │  会话列表                              │
│          │                                       │
│ ● ai-    │  📅 2026-03-09                        │
│   manager│  ├ Session abc..  12条  22:38          │
│   (418)  │  │  > /brainstorm @history...          │
│          │  │  > fix rust-analyzer...             │
│ ○ cloud  │                                       │
│   hub    │  📅 2026-03-08                        │
│   (360)  │  ├ Session ghi..  5条   18:30          │
└──────────┴───────────────────────────────────────┘
```

### 顶部区域
- **热力图**：过去 30 天活动强度（CSS Grid 实现，不引入新依赖），颜色深浅代表当天消息数量
- **搜索框**：全文搜索 display 内容，搜索结果高亮匹配文字，跨项目/会话展示

### 左栏 - 项目列表
- 显示项目短名（从路径提取最后一段），鼠标悬停显示完整路径
- 每个项目显示消息总数
- 点击选中项目，右栏切换为该项目的会话列表
- 支持「全部项目」选项

### 右栏 - 会话列表
- 按日期分组（天），每天一个标题
- 每个会话显示：会话 ID 缩写、消息条数、最后活动时间
- 点击会话展开/收起，显示该会话所有 display 条目（时间 + 内容）
- 长内容截断，悬停显示完整内容

### 轮询逻辑
- 页面可见时每 5 秒调用 `get_history_if_changed(lastMtime)`
- 返回 null 时不做任何处理
- 返回新数据时重新解析并更新状态
- 页面切走时停止轮询

## 组件结构

### 新增文件

| 文件 | 用途 |
|------|------|
| `src-tauri/src/history.rs` | Rust 后端：读取 history.jsonl + mtime 优化 |
| `src/components/HistoryPage.tsx` | 页面主容器：三栏布局、轮询、数据解析分组 |
| `src/components/HistoryPage.css` | 页面样式 |
| `src/components/HistoryHeatmap.tsx` | 热力图组件（纯 CSS Grid） |
| `src/components/HistoryProjectList.tsx` | 左栏项目列表 |
| `src/components/HistorySessionList.tsx` | 右栏会话列表（含日期分组 + 展开/收起） |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/types.ts` | 增加 `HistoryEntry` 类型，`TabType` 加 `"history"` |
| `src/components/Sidebar.tsx` | 增加「历史」Tab 导航 |
| `src/App.tsx` | 路由增加 history Tab 渲染 HistoryPage |
| `src-tauri/src/lib.rs` | 注册 history 命令 |
| `src/i18n/` | 增加历史页面相关国际化文案 |

## 设计决策

1. **纯前端解析**：当前数据量（264KB）完全适合前端处理，避免后端复杂度
2. **mtime 轮询**：简单可靠，避免引入 notify 依赖
3. **CSS Grid 热力图**：不引入新依赖（如 d3/recharts），保持项目轻量
4. **5 秒轮询间隔**：在实时性和性能之间取得平衡
