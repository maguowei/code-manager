# 工作总结 AI-native 重设计 · 设计稿

> 状态：设计已与用户确认（交互骨架 / 流式 / 意图 / 持久化四项决策 + 三节设计逐节通过）。下一步进入 writing-plans 生成实施计划。

## Context（为什么改）

当前「工作总结」页是经典管理台形态：左侧总结列表 + 右侧文档 + 顶部两个按钮（总结昨日 / 生成本周）。功能完整，但交互过于传统——「点按钮 → 看一份静态文档」，没有 AI 产品的「表达意图 → 看着它生成 → 追问改写」的质感。

目标：**保留全部现有能力**（日总结、周总结、历史回归、生成过程透明、提示词可见、CLI 检查、空状态、Markdown 渲染），把整体交互重做成 **AI-native 的对话式工作台**。

## 已确认的核心决策

1. **交互骨架**：对话式工作台（单栏消息流 + 底部 NL 输入 + 快捷 chips），取代左列表+右文档。
2. **生成感**：**真 token 流式**。已实测确认 Claude Code CLI `claude -p … --output-format stream-json --include-partial-messages` 能逐块推送文本增量，**无需 Agent SDK**。
3. **输入智能**：**全自然语言意图**——理解任意日期/范围 + 项目过滤 + 风格（如「总结上周五」「近三天只看 code-manager 简短点」）。
4. **数据模型**：**规范文档照旧 + 对话线程持久化**。日/周快捷动作仍写 `worklog/YYYY-MM-DD.md`、`weekly/YYYY-WNN.md`（可回归）；自由范围/追问结果只进对话线程，不写规范文件。

## 非目标（YAGNI / 边界）

- 不引入 Agent SDK / 不改 IPC 之外的统一错误处理边界。
- 不把日/周规范文件并入对话线程（保留「按日期回归一份正式文档」契约）。
- 自由范围 / 过滤 / 追问的结果**不**写规范 `.md`（仅存对话线程）。
- 不做多会话/多线程管理（单一对话线程即可，YAGNI）。

---

## 一、交互与信息架构

**布局（单栏对话）**
- 顶部 `PageHeader`：标题 +「历史总结」按钮 → 打开 `Sheet`，复用 `listSummaries` / `readSummary` 浏览已落盘的日/周 `.md`，保住「按日期回归」能力。
- 中部：**对话消息流**（持久化线程，可滚动，新 token 自动滚到底）。
- 底部：**Composer**——自然语言输入框 + 发送；上方一排**快捷 chips**：`总结昨日`、`生成本周` + 上下文建议 chip。

**消息类型**
- **用户气泡**：自然语言诉求（或 chip 文案）。
- **助手气泡（富卡片）**：
  1. **意图解读 chip**：「理解为：2026-W26 周总结 · 仅 code-manager · 简短」——把 NL 解析结果摆出来，透明可纠错；
  2. **过程条**（扫描 N · 变更 M → 生成中），完成后折叠成一行（演进现有 `WorkSummaryProcessView`，扫描详情 / 提示词收进 `Collapsible`）；
  3. **流式 Markdown 正文**（token 逐字进入，套用现有 `SUMMARY_MARKDOWN_CLASS`）；
  4. **底部操作**：复制、查看提示词、(日/周规范路径) 已保存为 `worklog/…` 链接、refine 快捷 chip（`简短点` / `更详细` / `换个角度`）。

**空状态**：生成式欢迎语 + 建议 prompt chips（`总结昨天`、`总结本周`、`上周五我做了什么`、`近三天只看 code-manager`）。

**流程**：输入/点 chip → 用户气泡 → 意图解析（chip 直构则跳过）→ 扫描（progress 事件）→ 流式生成（token 事件）→ 完成（日/周落盘 `.md` + 线程持久化）→ 可追问（带上一份文档作上下文重写）。

---

## 二、数据流、后端流式、持久化

文件：`src-tauri/src/work_summary.rs`（改造）+ 对话线程存储（新增于同模块或 `conversation` 子模块）。

### 1. 意图解析 `parse_summary_intent(input, today) -> SummaryIntent`

```rust
struct SummaryIntent {
  kind: "day" | "week" | "range",
  start: String,            // YYYY-MM-DD
  end: String,              // YYYY-MM-DD（含）
  project_filter: Vec<String>, // 空 = 不过滤
  style: "concise" | "detailed" | "default",
  title: String,           // 文档/消息标题，如「2026-W26 周总结」
}
```

- 自由文本 → 一次**快速 Claude 结构化调用**（`-p --output-format json`，严格 JSON 输出，精简 MCP 环境同现状）。
- 两个快捷 chip → **前端/后端直接构造确定性 intent，跳过解析**（零延迟、可靠）。

### 2. 流式生成 `generate_summary_stream(intent, language, message_id) -> SummaryDocument`

- 按 intent 解析时间窗：day 复用 `day_window_ms`；week 复用周逻辑；**range 新增**——按日聚合 changesets 并合并去重。
- 扫描 changesets（复用 `gather_day_changesets`），发 `work-summary-progress { messageId, phase, … }`。
- 构 prompt：把 `project_filter`（空则不过滤）与 `style` 注入规则文本。day/week 复用 `build_daily_prompt` / `build_weekly_prompt`；**range 复用 daily 框架**（changeset 结构与时间窗无关），标题取自 `intent.title`。
- **核心改造**：把现有 `run_claude_summary`（`--output-format json` 一次性返回）换成**流式读取** `run_claude_summary_streaming(prompt, on_delta)`：
  - spawn `claude -p <prompt> --output-format stream-json --include-partial-messages --model <SUMMARY_MODEL> --strict-mcp-config --mcp-config '{"mcpServers":{}}'`，stdout piped；
  - `BufReader` 逐行读 NDJSON，每行 `serde_json::from_str`，匹配 partial 文本增量（`content_block_delta` / `text_delta` 的 `delta.text`），回调 `on_delta(&str)`；累积全文；末尾 `result` 事件作兜底全文。
  - 上层把 `on_delta` 桥接为 `work-summary-token { messageId, delta }` 事件。
- 累积全文 → 组装 markdown → 仅 day/week 落盘 `.md`（复用 `assemble_daily_markdown` / `assemble_weekly_markdown`）→ 返回 `SummaryDocument`。
- 超时：`CLAUDE_TIMEOUT_SECS` 仍生效（总超时或读取空闲超时）。

### 3. 对话线程持久化

- 存储 `summaries/conversation.jsonl`，消息 `ConversationMessage { id, role: "user"|"assistant", ts, content, intent?: SummaryIntent, doc_path?: String, style? }`。
- 命令：`load_conversation() -> Vec<ConversationMessage>`；`save_conversation(messages)` 小数据整体原子重写（复用 `utils::ensure_dir_and_write_atomic`）。

### 4. 事件

- `work-summary-progress`（复用，**加 `messageId`**）——扫描阶段 + 提示词下发。
- `work-summary-token`（新）——流式文本增量。前端按 `messageId` 把 delta 追加到在飞的助手消息。

### 5. 规范文档 vs 探索记录

- 日/周快捷动作：写 `worklog/weekly .md`（`doc_path` 记入消息）。
- range / 过滤 / 追问：**只进对话线程**，不写规范文件。

### IPC 契约

- 新增 `parse_summary_intent`、`generate_summary_stream`、`load_conversation`、`save_conversation` 走 `#[tauri::command] + #[specta::specta]` → `make bindings`。
- 新类型 `SummaryIntent`、`ConversationMessage` 进 bindings；事件沿用手写类型（同现状，不进 bindings）。
- 现有 `summarize_day` / `generate_weekly_summary` / `scan_day_changes`：保留或在迁移完成后收敛（实施计划里决定是否复用其内部逻辑）。

---

## 三、组件分解、错误处理、测试

### 前端组件（替换 `WorkSummaryPage` 内部）

- `WorkSummaryPage.tsx` — 壳：`PageHeader`（标题 +「历史总结」）+ `ConversationFeed` + `SummaryComposer`。去掉左列表+右文档。
- `ConversationFeed.tsx` — 可滚动消息列表，新 token 自动滚到底。
- `UserMessage.tsx` / `AssistantMessage.tsx` — 用户气泡 / 助手富卡片（意图 chip + 过程条 `Collapsible` + 流式 `MarkdownPreview` + 底部操作）。
- `SummaryComposer.tsx` — NL 输入（`Textarea`）+ 发送 + 快捷 chips + 上下文建议；CLI 不可用时禁用 + hint。
- `SummaryHistorySheet.tsx` — shadcn `Sheet` 列已落盘日/周（`listSummaries`），点开预览，保住回归。
- **复用**：现有 `WorkSummaryProcessView` 演进为气泡内过程条；`MarkdownPreview` + `SUMMARY_MARKDOWN_CLASS` 渲流式正文；surface/typography classes；shadcn `Sheet`/`Textarea`/`Badge`/`ScrollArea`/`Collapsible`/`Button`；`lucide-react` 图标。

### Hook `useSummaryConversation`（演进自 `useWorkSummaries`）

- state：`messages`、`streaming`、`cliAvailable`；挂载 `load_conversation`。
- `send(text)` / `runQuickAction(kind)`：压用户消息 → 解析意图（或 chip 直构）→ 压占位助手消息（前端 `crypto.randomUUID` 的 `messageId`）→ `generate_summary_stream` → `work-summary-token` 按 id 追加 → done 定稿 + `save_conversation`。
- 监听 `work-summary-token`（按 id 追加）+ `work-summary-progress`（过程 / 提示词），统一走 `useTauriEvent`，卸载清理。

### 错误处理

- CLI 未装 → composer 禁用 + hint（复用 `check_claude_cli`）。
- 意图无法解析 / 超时 → toast 提示换种说法，不静默。
- 流式中进程失败 / 解析异常 → 该助手消息降级为基于 scan 的 git 清单（复用 `assemble_daily_fallback` 思路）并标注「AI 不可用」。
- 空扫描（无变更）→ 助手消息直接给「该范围无已提交变更」，不调 claude。
- 持久化失败 → toast，不丢内存中的消息。

### 测试

- **Rust 单测**：`parse_summary_intent` JSON 解析（mock 输出）、range 窗口计算、prompt 注入 `project_filter`/`style`、**流式 NDJSON delta 抽取 helper**（给定样例 stream-json 行抽 delta）、conversation jsonl 往返。
- **Rust 集成**：沿用 `IntegrationEnv`；规范文件写、range 不写。
- **前端 vitest**：composer 发送/禁用、feed 渲染用户+助手消息、token 事件 `act + emitTauriEvent` 追加、历史 Sheet、空状态建议 chips。
- **契约**：`make bindings-check`。
- **视觉**：`make dev` 双主题核验流式打字 + 对话布局。

### 建议分阶段落地（降风险）

1. 后端流式 helper `run_claude_summary_streaming` + `generate_summary_stream`（先不动 UI，单测覆盖 NDJSON 解析）。
2. 意图解析命令 + `SummaryIntent` 类型 + bindings。
3. 对话存储读写 + `ConversationMessage` 类型。
4. 前端对话 UI（composer / feed / messages）替换页面，接 token/progress 事件。
5. 历史 Sheet 保留回归。

---

## 验证（端到端）

- 范围匹配命令集见 `CLAUDE.md`「测试与验证」：Rust 走 `make fmt-rust-check`/`check`/`lint-rust`/`test-rust`；契约 `make bindings-check`；前端 `make lint-frontend`/`build-frontend`/`test-frontend`；全量 `make verify`。
- `make dev` 端到端：输入「总结上周五只看 code-manager 简短点」→ 看到意图解读 chip → 扫描详情 → **逐字流式**生成 → 完成（range 结果只进线程、不落规范文件）；点快捷「总结昨日」→ 落 `worklog/…md` 且线程出现消息；重开页面对话线程完整重放；「历史总结」Sheet 能打开旧日/周文档；CLI 缺失时 composer 禁用。
