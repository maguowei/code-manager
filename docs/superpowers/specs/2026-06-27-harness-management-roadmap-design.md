# Harness 管理工具路线图与深度会话检查（合入历史）设计

- 日期：2026-06-27
- 状态：已确认，待生成实现计划
- 范围：①把 Code Manager 从「Claude Code 配置管理工具」演进为「专业 harness 管理工具」的路线图骨架；②第一个落地子项目「深度会话检查」的详细设计——以**升级现有「历史」会话详情**的方式实现，不新增顶级页或后端模块。

## 背景与现状

Code Manager 已是一个成熟的 Claude Code 本地管理应用，覆盖：`~/.claude` 总览、配置/内置供应商、记忆（CLAUDE.md/rules）、Skills、历史、统计、Token 用量与费用、项目管理、系统托盘+会话聚焦、桌面浮窗、设置诊断、Cheat Sheet。对 Codex 已有轻度触达（`~/.codex/skills` 软链、`AGENTS.md` 配对）。

目标是把它做成「专业 harness 管理工具」，分阶段推进：先把 Claude Code 这一个 harness 的工程能力做深，再以此为模板横向扩展到其它 harness。

### 已识别的关键事实

- **一等公民不均衡**：Memory 与 Skills 拿到了结构化管理；MCP servers、subagents、slash commands、output styles 目前只能在 `~/.claude` 文件树里当原始文件浏览/编辑。settings schema 已覆盖 hooks/permissions/statusline/sandbox，但 `mcpServers` 等仍是二等公民。
- **transcript 信号被严重低估**：`~/.claude/projects/**/*.jsonl` 每条记录包含大量未被利用的 harness 工程信号（见下表）。
- **「历史」页已经在读 transcript**：`history.jsonl`（每条带 `sessionId`+`project`）做会话列表；打开会话时 `history.rs::get_session_detail(project, session_id)` 已解析 `~/.claude/projects/<project>/<session_id>.jsonl`，`SessionDetailDrawer.tsx` 已渲染 text/thinking/tool_use/tool_result/command/system/image/plan。当前解析器**完全没抽取** `message.usage`、`durationMs`、hook 事件、`attributionSkill/Plugin`、`parentUuid`(侧链)、`type:mode`、`file-history-snapshot`。

| jsonl 字段 | 可还原的 harness 信号 | 现状 |
| --- | --- | --- |
| `parentUuid` / `uuid` / `isSidechain` | 消息 DAG 树 + subagent 侧链展开 | 未抽取（`isSidechain` 仅少量触及） |
| `attributionSkill` / `attributionPlugin` | 每个 assistant turn 由哪个 skill/plugin 触发 | 未抽取 |
| `toolUseResult` / `toolUseID` / `durationMs` | 每次 tool 调用的耗时与结果 | 未抽取 |
| `hookCount` / `hookInfos` / `hookErrors` / `preventedContinuation` / `stopReason` | hook 触发、失败、是否拦截 | 未抽取 |
| `message.usage` | 逐步 token / 成本 | 未抽取（仅 `usage.rs` 用于聚合） |
| `type: mode` | plan/normal 模式切换轨迹 | 未抽取 |
| `file-history-snapshot` / `snapshot` | 会话内文件编辑快照 | 未抽取 |
| `gitBranch` / `cwd` / `version` / `entrypoint` | 每条消息的仓库/版本上下文 | 部分可用 |

## 路线图骨架

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **Phase 0**（本次重点） | 深度会话检查：升级现有「历史」会话详情，把上表信号变成可下钻的回放/检查 | 本文详设，下一步出实现计划 |
| **Phase 1** | 聚合洞察/健康度：hook 可靠性、skill/tool 使用率、成本趋势、「某条 rule 从未命中」类洞察 | 复用 Phase 0 增强后的解析层，后续单独 spec |
| **Phase 2** | 完整原语覆盖：MCP servers / subagents / slash commands / output styles 升级为一等公民结构化管理 | 后续单独 spec |
| **Phase 3**（长期） | 多 harness 抽象：把配置/记忆/Skills/用量映射到 Codex CLI、Gemini CLI 等其它 harness，形成统一控制平面 | 长期愿景 |
| **暂缓** | 复用与分发（bundle/git/registry） | 明确 park，本轮不做 |

> 决策依据：用户优先级落在「可观测与评估」（重心=深度回放与检查，被动读已有数据，不主动跑 eval）；「复用与分发」暂缓；「完整原语覆盖」「多 harness」为后续阶段。集成方式定为合入现有「历史」，复用会话列表与详情解析，不另起入口。

## 子项目详设：深度会话检查（合入历史）

### 目标与成功标准

- 用户从现有「历史」打开任意会话，看到完整的、逐步可下钻的回放：每条消息、每次 tool 调用及结果与耗时、每次 hook 触发与失败、subagent 侧链展开、模式切换、文件编辑快照、逐步 token/成本。
- 成功标准：
  - 给定真实 `<sessionId>.jsonl`，升级后的 `get_session_detail` 能正确抽取上述信号，并按 `parentUuid` 把 subagent 侧链归到触发它的 Task tool 下（Rust 单测对 fixture 验证通过）。
  - 会话详情能渲染增强后的时间线：hook 错误与 tool 错误醒目标记，会话头部 KPI（成本/token/时长/tool 次数/hook 错误数）准确。
  - 从 Usage/Projects 可「在历史中打开此会话」并定位到对应会话详情。

### 实现方式：升级现有两处，不新增模块/页面

**1. 后端解析器 `src-tauri/src/history.rs`**

- 扩展 `SessionDetail` / `SessionMessage` / `MessageBlock`，补抽：
  - 每个 assistant turn 的 `message.usage` → token 与成本（成本计算复用现有价目表逻辑，不复制 `usage.rs`）。
  - `toolUseResult.durationMs` 与错误标记，挂到对应 `tool_use`/`tool_result`。
  - hook 事件：`hookInfos` / `hookErrors` / `preventedContinuation` / `stopReason`。
  - `attributionSkill` / `attributionPlugin`，挂到对应 assistant turn。
  - 用 `parentUuid`/`uuid` 还原 DAG，把 `isSidechain` 分支归到触发它的 Task tool 节点下，形成可折叠嵌套子时间线。
  - `type: mode` 模式切换、`file-history-snapshot` 文件编辑快照，作为时间线事件。
- 沿用现有 `session_file_path` 的路径校验（防 `../` 穿出 `projects`）；文件读写复用 `utils.rs`。
- 不改变现有 `get_session_detail` 命令签名/注册即可扩展返回结构；若结构体字段变更，同步 `make bindings` 与 `src/types.ts`。

**2. 前端会话详情 `src/components/SessionDetailDrawer.tsx`**

- 新增：
  - 会话头部 KPI 条：总成本/token、时长、消息数、用到的模型、tool 调用次数、**hook 错误数**（专业信号前置）。
  - tool 行展示 `durationMs`，错误高亮。
  - hook 事件行：hook 名 + 状态（ok / error / prevented），`hookErrors` 醒目。
  - assistant turn 的 skill/plugin 归因徽标。
  - subagent 侧链可折叠嵌套子时间线。
  - 逐步 token/成本 chip。
- **重构约束**：该文件已 1075 行，本就过大。作为本次工作的一部分，把各 block 渲染器拆成聚焦子组件（外科手术式，仅服务本需求，不顺手改无关代码）。
- 样式遵循「均衡管理台」风格；折叠/浮层用 shadcn 语义变量与原子组件，不硬编码 z-index/十六进制色值；文件快照 diff 可用 `@pierre/diffs`（已是依赖）。

**3. 跨页跳转**

- Usage/Projects 增加「在历史中打开此会话」动作，携带 `{ project, sessionId }`，复用 `App.tsx` 现有 `historyProjectRequest` + `requestId` ref 自增模式。History 已是宿主，无需新增 request 类型；如现有 request 仅定位到项目维度，则扩展其载荷到会话维度（沿用同一 ref 自增机制）。

### 范围边界（v1 / YAGNI）

- v1 = 只读、单会话深度回放与检查，长在现有「历史」里。
- 明确不做（归后续阶段）：跨会话对比、全局搜索、主动 eval/回归、导出/分享、聚合健康度看板、新顶级页。
- 复用现有依赖（react-virtual、react-markdown、@pierre/diffs、CodeMirror），不引入新库。

### 测试策略

- **Rust 单测**：解析器是纯逻辑，TDD 友好。用 fixture jsonl 覆盖：`message.usage`→成本、`durationMs`/tool 错误抽取、hook 抽取（含 `hookErrors`/`preventedContinuation`/`stopReason`）、`attributionSkill/Plugin`、`parentUuid` 侧链嵌套、`type:mode`、`file-history-snapshot`。
- **前端 vitest**：KPI 计算、各新事件类型渲染、hook/tool 错误高亮、侧链折叠、跳转 request 联动。
- **契约/验证**：结构体变更后跑 `make bindings-check`、`make build-frontend`、`make test-rust`；前端补范围内 vitest；Rust 行为再跑 `make check`、`make lint-rust`。

### 同步点清单（实现时不可遗漏）

- `SessionDetail` 结构体变更 → `make bindings`/`make bindings-check` → `src/types.ts`。
- 所有用户可见文本走 `useI18n()` 的 `t()`；通知走 `useToast()`。
- 跳转动作若涉及 Tauri 事件则用 `useTauriEvent`（本子项目主要为跨页 state request，通常不涉及）。
- capability：只读本地文件，沿用现有读取权限，无需新增插件 API（实现时复核 `capabilities/default.json`）。

## 后续

本文 Phase 0 子项目进入 `writing-plans` 生成实现计划；Phase 1+ 各自单独 spec。
