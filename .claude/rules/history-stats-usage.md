---
paths:
  - "src/components/HistoryPage.tsx"
  - "src/components/HistoryProjectList.tsx"
  - "src/components/HistorySessionList.tsx"
  - "src/components/SessionDetailDrawer.tsx"
  - "src/components/HistoryHeatmap.tsx"
  - "src/components/StatsPage.tsx"
  - "src/components/UsagePage.tsx"
  - "src/components/usage/**/*"
  - "src/hooks/useHistoryEntries.ts"
  - "src/hooks/useUrlState.ts"
  - "src/hooks/useUsage.ts"
  - "src/history-utils.ts"
  - "src-tauri/src/history.rs"
  - "src-tauri/src/stats.rs"
  - "src-tauri/src/usage.rs"
  - "src-tauri/resources/model-pricing.json"
  - "src/types.ts"
---

# History Stats Usage Rules

## 先读文件

- 历史：`HistoryPage.tsx`、`HistoryProjectList.tsx`、`HistorySessionList.tsx`、`SessionDetailDrawer.tsx`、`useHistoryEntries.ts`、`history-utils.ts`、`history.rs`
- 统计：`StatsPage.tsx`、`stats.rs`
- 用量：`UsagePage.tsx`、`src/components/usage/`、`useUsage.ts`、`usage.rs`、`model-pricing.json`

## 历史页

- 历史页数据来源是 `~/.claude/history.jsonl`，前端轮询逻辑封装在 `useHistoryEntries.ts`。
- 历史页用 `project`、`q`、`session` 三个 URL 查询参数同步状态；不要引入路由级重构来做同一件事。
- 历史热力图按本地日期聚合，响应式显示 53 / 39 / 26 / 13 周，星期标签列宽要能容纳中文。
- 会话列表使用 `@tanstack/react-virtual` 的扁平列表结构，展开/折叠时保持日期分组与会话条目的顺序稳定。
- 会话详情解析在后端，保留对 command、system、thinking、tool_use、tool_result、image、plan 等块类型的兼容。
- `SessionDetailDrawer` 负责会话详情展示、复制路径/会话 ID、跳转原始 jsonl 和消息块渲染；不要把解析逻辑复制到前端。

## 统计页

- `StatsPage` 是 Claude Code 汇总统计视图，数据源是 `~/.claude.json`。
- 统计页需要明确提示统计数据来自本地历史快照，不是实时流式更新；刷新按钮重新读取最新本地数据。
- 项目区域展示每个项目最近一次会话的会话 ID、首条 Prompt 摘要、费用、时长、Token、模型明细和性能指标。
- 项目最近会话区域默认展开，单个项目卡片默认折叠；折叠交互继续使用原生 `details/summary`，并保持整行可点击和键盘可访问性。
- 项目卡片标题只显示项目路径最后一级；会话 ID 放在项目名下方，不额外加“会话 ID”标签。
- `stats.rs` 当前只提供 `get_stats` 和 `open_claude_json_in_editor`，不要假设存在历史快照 command。

## Token 用量页

- `UsagePage` 数据来源是 `~/.claude/projects/**/*.jsonl` 中 assistant 消息的 `message.usage`，包括主会话 jsonl 与 `<session>/subagents/*.jsonl`。
- 不要把 `UsagePage` 和 `StatsPage` 的数据源、刷新机制或聚合逻辑混用。
- `usage.rs` 会在 `lib.rs` setup 中通过 `usage::start_usage_runtime(app)` 启动：加载价格表、首次扫描、监听 `claude-directory-changed` 做增量扫描，并向前端发出 `usage-records-changed` / `usage-pricing-updated`。
- 用量页通过单次 `get_usage_snapshot` command 一次性拉取所有维度（daily / project / session / model / time series + unknownModels），不要回退到拆成多次并发 invoke 的旧模式。
- 项目下拉、项目聚合统一按 `project_path` 维度做 `GROUP BY`，`project_dir` 取 `MIN(project_dir)` 以保证每个项目只出一行。
- 用量页首次加载使用 `src/components/usage/UsagePageSkeleton.tsx`，切换筛选时复用骨架而不是清空表格。
- `src/components/usage/format.ts` 承载用量展示格式化逻辑；新增展示格式时优先复用它。
- `SessionUsageDrawer.tsx` 负责消息级用量明细，数据来自 `get_session_usage_detail`。
- 用量聚合维度包括 daily、project、session、model 和 time series；新增趋势图字段要同步 `UsageTimeSeriesPoint`、`UsageTimeGranularity`、`useUsage.ts` 和 `usage.rs`。
- 筛选字段来自 `UsageFilter`，包括 `includeUnknownModels` 与 `claude-*` 模型快捷筛选；新增筛选条件要同步 `src/types.ts`、`useUsage.ts`、`usage.rs` 和 i18n。
- 日期筛选使用 shadcn `Calendar` 浮层，不要回退到原生 `<input type="date">`。
- Usage 趋势图支持按模型或 Token 类型拆分、曲线/柱状切换、图例点击隐藏和双击 solo；这些交互是前端状态，不应写入后端。

## 价格与 SQLite

- 费用公式是 input、output、cache write、cache read 各自乘价格后统一除以 1_000_000；价格单位是 USD / 1M tokens。
- 价格表加载顺序是本地缓存 `~/.config/ai-manager/model-pricing.json` -> 内置 `src-tauri/resources/model-pricing.json` -> 启动后尝试从 models.dev 刷新。
- 网络刷新成功后要保存缓存、重算所有 `usage_records.cost_usd` 并发出 `usage-pricing-updated`。
- 内置价格表只做 Anthropic/Claude 兜底；Kimi、MiMo、GLM、MiniMax、DeepSeek 的价格只来自 models.dev 官方 provider。
- models.dev 导入范围由 `is_supported_models_dev_provider()` 控制：Anthropic、Moonshot / MoonshotAI、Z.ai / Zhipu / BigModel、MiniMax、Xiaomi / MiMo、DeepSeek。
- 缺失 cache 字段时只按 input 推导 `cache_write = input * 1.25`、`cache_read = input * 0.1`，不要凭空补 input / output。
- `thirdPartyProviderPricingEnabled` 默认开启；关闭后 Kimi / MiMo / GLM / MiniMax / DeepSeek 费用按 0 计入，且不作为未知模型提示。
- 用量 records、扫描索引和 last scan metadata 写入 `usage.db`，实际文件位于 Tauri `app_config_dir()` 下，索引表为 `usage_file_index`。新增列必须同步 `USAGE_DB_SCHEMA`、初始化/迁移逻辑、`UsageRecord` struct、相关 command 与前端类型。
- `message.id` 是 usage 记录去重锚点；处理增量扫描、重扫和未知模型时不要破坏 SQLite 中的 `usage_records`、`usage_file_index` 与内存中的 `unknown_models` 一致性。
