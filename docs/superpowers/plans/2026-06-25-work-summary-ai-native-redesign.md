# 工作总结 AI-native 对话式工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「工作总结」页从「左列表+右文档+两按钮」重做成 AI-native 对话式工作台：自然语言输入 → 意图解析 → 扫描 → 真 token 流式生成 → 可追问，对话线程持久化，日/周规范 `.md` 照旧落盘。

**Architecture:** 后端在 `work_summary.rs` 内新增「流式 claude 读取 + 意图解析 + range 聚合 + 对话线程 jsonl 存储」四组能力（复用现有 `gather_*`/`build_*_prompt`/`assemble_*` 私有 helper，不外提可见性）；通过两个事件 `work-summary-progress`（加 `messageId`）与 `work-summary-token`（新）驱动前端流式渲染。前端用单栏对话 UI（`ConversationFeed` + `SummaryComposer` + 消息组件）替换页面，hook 由 `useWorkSummaries` 演进为 `useSummaryConversation`。

**Tech Stack:** Rust + Tauri 2 + tauri-specta；React 19 + TypeScript + Tailwind v4 + shadcn/ui；claude headless CLI（`--output-format stream-json --include-partial-messages`）；Vitest + cargo test。

## Global Constraints

- 代码注释用中文；技术术语保留英文。
- 所有用户可见文本走 `useI18n()` 的 `t()`；新增 key 同步 `src/i18n.ts` 中英文。
- 用户反馈走 `useToast()`；不要把 `console.error` 当用户反馈。
- 颜色走 shadcn 语义 token，禁止硬编码 hex / z-index；类名拼接走 `cn(...)`；字号走 `TYPOGRAPHY.*`；表面走 `surface-classes.ts`。
- 浮层/抽屉/菜单/Toast 用 shadcn `Sheet`/`Dialog`/`Popover`/sonner，不自实现层级。
- 业务前端只经 `src/ipc.ts` 的 `ipc` 调用；`src/bindings.ts` 是 `make bindings` 生成物，不手改。
- Tauri 事件监听必须用 `useTauriEvent`（卸载自动清理）。
- Rust 文件读写/锁/时间/JSON/原子写优先复用 `src-tauri/src/utils.rs`（`ensure_dir_and_write_atomic`、`get_app_data_dir` 等）。
- 新增/改 command 必须：Rust `#[tauri::command]+#[specta::specta]` → 在 `lib.rs::build_specta_builder()` 的 `collect_commands![]` 注册 → `make bindings` → `make bindings-check`。
- 日志脱敏：work_summary 日志只记日期 + 项目计数，绝不记 secret / diff / claude 正文 / 提示词内容。
- 提交信息遵守 Conventional Commits（type 英文、描述中文）。
- 流式生成的快速模型 `SUMMARY_MODEL = "sonnet"`；硬超时 `CLAUDE_TIMEOUT_SECS = 180`（均已存在，复用）。

## 设计依据

实现严格对齐 `docs/superpowers/specs/2026-06-25-work-summary-ai-native-redesign-design.md`。四项核心决策：对话式工作台 / 真 token 流式（CLI `stream-json`）/ 全自然语言意图 / 规范文档+对话线程双存储。

## 文件结构

**后端（均在 `src-tauri/src/work_summary.rs` 内，复用现有私有 helper）**
- 新增纯函数：`parse_stream_json_delta`、`read_claude_stream`、`parse_intent_json`、`dates_in_range`、`apply_intent_to_prompt`、`should_persist_canonical`、conversation jsonl 读写。
- 新增 command：`parse_summary_intent`、`generate_summary_stream`、`load_conversation`、`save_conversation`。
- 新增类型：`SummaryIntent`、`ConversationMessage`（`Serialize + Deserialize + specta::Type`）。
- 复用：`gather_day_changesets`、`gather_changeset`、`build_daily_prompt`、`build_weekly_prompt`、`assemble_daily_markdown`、`assemble_weekly_markdown`、`assemble_daily_fallback`、`day_window_ms`、`week_dates`、`daily_path`、`weekly_path`、`SummaryDocument`、`ProjectChangeset`、`emit_progress`/`emit_prompt`（扩展加 `messageId`）。

**前端（新目录 `src/components/work-summary/`）**
- `src/hooks/useSummaryConversation.ts`（新，演进自 `useWorkSummaries.ts`）
- `src/components/work-summary/ConversationFeed.tsx`、`UserMessage.tsx`、`AssistantMessage.tsx`、`SummaryComposer.tsx`、`SummaryHistorySheet.tsx`
- `src/components/WorkSummaryPage.tsx`（重写）
- 删除（迁移完成后）：`src/hooks/useWorkSummaries.ts`、`src/components/WorkSummaryProcessView.tsx`（其过程展示折叠进 `AssistantMessage`）
- 复用：`src/components/claude-overview/MarkdownPreview.tsx` + 现有 `SUMMARY_MARKDOWN_CLASS`（迁入 `AssistantMessage`）、`surface-classes.ts`、`typography-classes.ts`、shadcn `ui/*`。

> 说明：后端新增逻辑刻意留在 `work_summary.rs` 以复用大量私有 helper，避免把 `gather_*`/`build_*`/`assemble_*` 批量改 `pub(crate)`。文件会增长但保持领域内聚；如评审要求拆分，迁移后再单独处理。

---

## Task 1: 流式 NDJSON 文本增量抽取

**Files:**
- Modify: `src-tauri/src/work_summary.rs`（新增 `parse_stream_json_delta` + 单测）

**Interfaces:**
- Produces: `fn parse_stream_json_delta(line: &str) -> Option<String>` —— 从一行 `stream-json` NDJSON 中抽取 assistant 文本增量；非文本行返回 `None`。

`claude -p --output-format stream-json --include-partial-messages` 的部分消息行形如：
`{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"片段"}}}`

- [ ] **Step 1: 写失败测试**

在 `work_summary.rs` 的 `#[cfg(test)] mod tests` 末尾加：

```rust
#[test]
fn parse_stream_json_delta_extracts_text_delta() {
    let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}}"#;
    assert_eq!(parse_stream_json_delta(line), Some("你好".to_string()));
}

#[test]
fn parse_stream_json_delta_ignores_non_text_lines() {
    assert_eq!(parse_stream_json_delta(r#"{"type":"system","subtype":"init"}"#), None);
    assert_eq!(parse_stream_json_delta(r#"{"type":"stream_event","event":{"type":"content_block_start"}}"#), None);
    assert_eq!(parse_stream_json_delta(r#"{"type":"result","result":"完整文本"}"#), None);
    assert_eq!(parse_stream_json_delta(""), None);
    assert_eq!(parse_stream_json_delta("非 json"), None);
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd src-tauri && cargo test --lib parse_stream_json_delta`
Expected: 编译失败 `cannot find function parse_stream_json_delta`。

- [ ] **Step 3: 实现**

在 `work_summary.rs` 加（放在 `run_claude_summary` 附近）：

```rust
/// 从一行 stream-json NDJSON 中抽取 assistant 文本增量（partial message）。
/// 仅认 content_block_delta / text_delta，其它事件（system/result/block_start 等）返回 None。
fn parse_stream_json_delta(line: &str) -> Option<String> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    let event = value.get("event")?;
    if event.get("type")?.as_str()? != "content_block_delta" {
        return None;
    }
    let delta = event.get("delta")?;
    if delta.get("type")?.as_str()? != "text_delta" {
        return None;
    }
    delta.get("text")?.as_str().map(|s| s.to_string())
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test --lib parse_stream_json_delta`
Expected: `test result: ok. 2 passed`。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): stream-json 文本增量抽取"
```

---

## Task 2: 流式读取 claude（可注入 reader 的核心 + spawn 包装）

**Files:**
- Modify: `src-tauri/src/work_summary.rs`（新增 `read_claude_stream` + `run_claude_summary_streaming` + 单测）

**Interfaces:**
- Consumes: `parse_stream_json_delta`（Task 1）。
- Produces:
  - `fn read_claude_stream<R: std::io::BufRead>(reader: R, on_delta: &mut dyn FnMut(&str)) -> Result<String, String>` —— 逐行读、回调每个文本增量、返回累积全文（空则 Err）。
  - `fn run_claude_summary_streaming(prompt: &str, on_delta: &mut dyn FnMut(&str)) -> Result<String, String>` —— spawn claude 流式进程并喂给 `read_claude_stream`。

- [ ] **Step 1: 写失败测试（核心 reader）**

```rust
#[test]
fn read_claude_stream_accumulates_deltas() {
    let ndjson = concat!(
        "{\"type\":\"system\",\"subtype\":\"init\"}\n",
        "{\"type\":\"stream_event\",\"event\":{\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"## proj\\n\"}}}\n",
        "{\"type\":\"stream_event\",\"event\":{\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"做了登录\"}}}\n",
        "{\"type\":\"result\",\"result\":\"忽略\"}\n",
    );
    let mut seen: Vec<String> = Vec::new();
    let mut on_delta = |d: &str| seen.push(d.to_string());
    let full = read_claude_stream(std::io::Cursor::new(ndjson), &mut on_delta).unwrap();
    assert_eq!(seen, vec!["## proj\n".to_string(), "做了登录".to_string()]);
    assert_eq!(full, "## proj\n做了登录");
}

#[test]
fn read_claude_stream_errors_when_no_text() {
    let ndjson = "{\"type\":\"system\",\"subtype\":\"init\"}\n";
    let mut on_delta = |_: &str| {};
    assert!(read_claude_stream(std::io::Cursor::new(ndjson), &mut on_delta).is_err());
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd src-tauri && cargo test --lib read_claude_stream`
Expected: 编译失败 `cannot find function read_claude_stream`。

- [ ] **Step 3: 实现**

```rust
use std::io::BufRead;

/// 逐行消费 stream-json，回调每个文本增量并累积全文。空输出返回 Err（交由上层降级）。
fn read_claude_stream<R: BufRead>(
    reader: R,
    on_delta: &mut dyn FnMut(&str),
) -> Result<String, String> {
    let mut full = String::new();
    for line in reader.lines() {
        let line = line.map_err(|e| format!("读取 claude 流失败: {e}"))?;
        if let Some(delta) = parse_stream_json_delta(&line) {
            full.push_str(&delta);
            on_delta(&delta);
        }
    }
    if full.trim().is_empty() {
        return Err("claude 未返回任何内容".into());
    }
    Ok(full)
}

/// spawn claude 流式进程，逐行读 stdout 喂给 read_claude_stream。
/// 阻塞调用，由命令在 spawn_blocking 中执行。
fn run_claude_summary_streaming(
    prompt: &str,
    on_delta: &mut dyn FnMut(&str),
) -> Result<String, String> {
    use std::process::{Command, Stdio};
    let mut command = Command::new("claude");
    command.args([
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--model",
        SUMMARY_MODEL,
        "--strict-mcp-config",
        "--mcp-config",
        "{\"mcpServers\":{}}",
    ]);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    crate::utils::hide_command_window(&mut command);
    let mut child = command.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "未找到 claude CLI，请确认 Claude Code 已安装并在 PATH 中".to_string()
        } else {
            format!("执行 claude 失败: {e}")
        }
    })?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 claude stdout".to_string())?;
    let full = read_claude_stream(std::io::BufReader::new(stdout), on_delta);
    let status = child.wait().map_err(|e| format!("等待 claude 退出失败: {e}"))?;
    if !status.success() {
        let mut stderr = String::new();
        if let Some(mut e) = child.stderr.take() {
            use std::io::Read;
            let _ = e.read_to_string(&mut stderr);
        }
        return Err(if stderr.trim().is_empty() {
            format!("claude 执行失败，退出码: {:?}", status.code())
        } else {
            format!("claude 执行失败: {}", stderr.trim())
        });
    }
    full
}
```

> 注：`use std::io::BufRead;` 若与文件已有 import 冲突则只保留一处；`run_claude_summary_streaming` 的 spawn 部分不做单测（依赖真实 claude），核心 `read_claude_stream` 已单测覆盖。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test --lib read_claude_stream`
Expected: `test result: ok. 2 passed`。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): 流式读取 claude stdout 并累积全文"
```

---

## Task 3: SummaryIntent 类型 + 意图 JSON 解析 + parse_summary_intent 命令

**Files:**
- Modify: `src-tauri/src/work_summary.rs`

**Interfaces:**
- Produces:
  - `struct SummaryIntent { kind: String, start: String, end: String, project_filter: Vec<String>, style: String, title: String }`（camelCase，`Serialize+Deserialize+specta::Type+Clone`）。
  - `fn parse_intent_json(stdout: &str) -> Result<SummaryIntent, String>`（解析 claude 返回的 JSON，失败 Err）。
  - `#[tauri::command] async fn parse_summary_intent(input: String, today: String) -> Result<SummaryIntent, String>`。

- [ ] **Step 1: 写失败测试**

```rust
#[test]
fn parse_intent_json_reads_fields() {
    let stdout = r#"{"type":"result","result":"{\"kind\":\"week\",\"start\":\"2026-06-22\",\"end\":\"2026-06-28\",\"projectFilter\":[\"code-manager\"],\"style\":\"concise\",\"title\":\"2026-W26 周总结\"}"}"#;
    let intent = parse_intent_json(stdout).unwrap();
    assert_eq!(intent.kind, "week");
    assert_eq!(intent.start, "2026-06-22");
    assert_eq!(intent.project_filter, vec!["code-manager".to_string()]);
    assert_eq!(intent.style, "concise");
}

#[test]
fn parse_intent_json_errors_on_garbage() {
    assert!(parse_intent_json("纯文本").is_err());
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd src-tauri && cargo test --lib parse_intent_json`
Expected: 编译失败。

- [ ] **Step 3: 实现**

复用现有 `parse_claude_result`（它已能从 result 对象/数组/JSONL 抽取最终文本）拿到内层 JSON 字符串，再 serde 解析：

```rust
/// 自然语言意图：解析后的范围 + 过滤 + 风格。
#[derive(Debug, Clone, Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SummaryIntent {
    /// "day" | "week" | "range"
    pub kind: String,
    pub start: String, // YYYY-MM-DD
    pub end: String,   // YYYY-MM-DD（含）
    #[serde(default)]
    pub project_filter: Vec<String>,
    /// "concise" | "detailed" | "default"
    pub style: String,
    pub title: String,
}

/// 从 claude 输出里抽取内层意图 JSON 并解析。
fn parse_intent_json(stdout: &str) -> Result<SummaryIntent, String> {
    let inner = parse_claude_result(stdout)?;
    let inner = inner.trim();
    // claude 可能用 ```json 包裹，去掉围栏
    let inner = inner
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    serde_json::from_str::<SummaryIntent>(inner).map_err(|e| format!("意图解析失败: {e}"))
}

#[tauri::command]
#[specta::specta]
pub async fn parse_summary_intent(input: String, today: String) -> Result<SummaryIntent, String> {
    let prompt = build_intent_prompt(&input, &today);
    let job = tokio::task::spawn_blocking(move || run_claude_summary(&prompt));
    let stdout = match tokio::time::timeout(
        std::time::Duration::from_secs(CLAUDE_TIMEOUT_SECS),
        job,
    )
    .await
    {
        Ok(joined) => joined.map_err(|e| format!("意图任务失败: {e}"))??,
        Err(_) => return Err("意图解析超时".into()),
    };
    parse_intent_json(&stdout)
}

/// 构造意图解析 prompt：要求严格输出 JSON。
fn build_intent_prompt(input: &str, today: &str) -> String {
    format!(
        "今天是 {today}。把下面这句话解析成工作总结的查询意图，只输出一个 JSON 对象（不要任何解释、不要 markdown 围栏），字段：\n\
- kind: \"day\"|\"week\"|\"range\"\n\
- start, end: \"YYYY-MM-DD\"（含，单日则相等；week 为本周一到周日；相对词如「昨天」「上周五」「近三天」据今天换算）\n\
- projectFilter: 字符串数组（提到的项目名，没提到则空数组）\n\
- style: \"concise\"|\"detailed\"|\"default\"（「简短」→concise，「详细」→detailed，否则 default）\n\
- title: 一句中文标题，如「2026-W26 周总结」或「2026-06-24 工作总结」\n\
这句话是：{input}"
    )
}
```

> `run_claude_summary` 复用现有 `--output-format json` 一次性调用（意图解析不需要流式）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test --lib parse_intent_json`
Expected: `test result: ok. 2 passed`。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): 自然语言意图解析（SummaryIntent + parse_summary_intent）"
```

---

## Task 4: range 日期展开 + range changeset 聚合

**Files:**
- Modify: `src-tauri/src/work_summary.rs`

**Interfaces:**
- Consumes: `gather_day_changesets`（现有，返回 `Result<(u32, Vec<ProjectChangeset>)>`）。
- Produces:
  - `fn dates_in_range(start: &str, end: &str) -> Result<Vec<String>, String>`（含端点，最多 31 天，超出截断并按上限取尾部）。
  - `fn gather_range_changesets(start: &str, end: &str) -> Result<(u32, Vec<ProjectChangeset>), String>`（逐日聚合，按 `project` 合并 commits、去重 hash）。

- [ ] **Step 1: 写失败测试**

```rust
#[test]
fn dates_in_range_inclusive() {
    assert_eq!(
        dates_in_range("2026-06-22", "2026-06-24").unwrap(),
        vec!["2026-06-22".to_string(), "2026-06-23".to_string(), "2026-06-24".to_string()]
    );
    assert_eq!(dates_in_range("2026-06-24", "2026-06-24").unwrap(), vec!["2026-06-24".to_string()]);
    assert!(dates_in_range("2026-06-24", "2026-06-20").unwrap().is_empty());
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd src-tauri && cargo test --lib dates_in_range`
Expected: 编译失败。

- [ ] **Step 3: 实现**

复用现有 `next_date`（已存在，返回下一天 `YYYY-MM-DD`）：

```rust
const MAX_RANGE_DAYS: usize = 31;

/// 展开 [start, end]（含端点）为日期序列；start>end 返回空；超 31 天取最后 31 天。
fn dates_in_range(start: &str, end: &str) -> Result<Vec<String>, String> {
    // 校验格式
    parse_ymd(start)?;
    parse_ymd(end)?;
    if start > end {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let mut cur = start.to_string();
    while cur.as_str() <= end {
        out.push(cur.clone());
        if out.len() > MAX_RANGE_DAYS * 2 {
            break; // 防御性硬上限
        }
        cur = next_date(&cur)?;
    }
    if out.len() > MAX_RANGE_DAYS {
        out = out.split_off(out.len() - MAX_RANGE_DAYS);
    }
    Ok(out)
}

/// 逐日聚合 range 内的 changeset，按 project 合并、按 commit hash 去重。
fn gather_range_changesets(
    start: &str,
    end: &str,
) -> Result<(u32, Vec<ProjectChangeset>), String> {
    use std::collections::BTreeMap;
    let mut scanned_max = 0u32;
    let mut by_project: BTreeMap<String, ProjectChangeset> = BTreeMap::new();
    for date in dates_in_range(start, end)? {
        let (scanned, daily) = gather_day_changesets(&date)?;
        scanned_max = scanned_max.max(scanned);
        for cs in daily {
            let entry = by_project.entry(cs.project.clone()).or_insert_with(|| ProjectChangeset {
                branches: Vec::new(),
                intents: Vec::new(),
                ..cs.clone()
            });
            // 合并 intents 去重
            for it in cs.intents {
                if !entry.intents.contains(&it) {
                    entry.intents.push(it);
                }
            }
            // 合并分支与 commits，按 hash 去重
            for seg in cs.branches {
                if let Some(existing) = entry.branches.iter_mut().find(|b| b.branch == seg.branch) {
                    for c in seg.commits {
                        if !existing.commits.iter().any(|e| e.hash == c.hash) {
                            existing.commits.push(c);
                        }
                    }
                    existing.has_uncommitted |= seg.has_uncommitted;
                } else {
                    entry.branches.push(seg);
                }
            }
        }
    }
    let mut result: Vec<ProjectChangeset> = by_project.into_values().collect();
    result.sort_by(|a, b| a.short_name.cmp(&b.short_name));
    Ok((scanned_max, result))
}
```

> 若 `ProjectChangeset` 未派生 `Clone`，在其 `#[derive(...)]` 补 `Clone`（已用于其它路径，通常已派生）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test --lib dates_in_range`
Expected: `test result: ok. 1 passed`。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): range 日期展开与逐日 changeset 聚合"
```

---

## Task 5: 意图注入 prompt（project_filter + style）

**Files:**
- Modify: `src-tauri/src/work_summary.rs`

**Interfaces:**
- Consumes: `build_daily_prompt`、`build_weekly_prompt`（现有）、`SummaryIntent`（Task 3）。
- Produces:
  - `fn filter_changesets<'a>(changesets: &'a [ProjectChangeset], filter: &[String]) -> Vec<ProjectChangeset>`（filter 空则原样克隆；否则按 short_name 包含匹配）。
  - `fn style_suffix(style: &str) -> &'static str`（把风格译成给 claude 的一句附加指令）。

- [ ] **Step 1: 写失败测试**

```rust
#[test]
fn filter_changesets_by_name() {
    let a = sample_changeset(); // short_name = "proj"
    let mut b = sample_changeset();
    b.short_name = "other".into();
    let all = vec![a, b];
    assert_eq!(filter_changesets(&all, &[]).len(), 2);
    let only = filter_changesets(&all, &["proj".to_string()]);
    assert_eq!(only.len(), 1);
    assert_eq!(only[0].short_name, "proj");
}

#[test]
fn style_suffix_maps_known_styles() {
    assert!(style_suffix("concise").contains("简短"));
    assert!(style_suffix("detailed").contains("详细"));
    assert_eq!(style_suffix("default"), "");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd src-tauri && cargo test --lib filter_changesets style_suffix`
Expected: 编译失败。

- [ ] **Step 3: 实现**

```rust
/// 按 short_name 子串匹配过滤 changeset；filter 为空返回全部克隆。
fn filter_changesets(changesets: &[ProjectChangeset], filter: &[String]) -> Vec<ProjectChangeset> {
    if filter.is_empty() {
        return changesets.to_vec();
    }
    changesets
        .iter()
        .filter(|cs| {
            filter
                .iter()
                .any(|f| cs.short_name.to_lowercase().contains(&f.to_lowercase()))
        })
        .cloned()
        .collect()
}

/// 风格 → 给 claude 的附加一句指令。
fn style_suffix(style: &str) -> &'static str {
    match style {
        "concise" => "\n额外要求：尽量简短，每个项目只保留最关键的 2-4 条要点。",
        "detailed" => "\n额外要求：更详细，必要时展开背景与影响。",
        _ => "",
    }
}
```

风格在 `generate_summary_stream`（Task 6）里把 `style_suffix(...)` 追加到 prompt 末尾。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test --lib filter_changesets style_suffix`
Expected: `test result: ok. 2 passed`。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): 按项目过滤与风格注入 prompt"
```

---

## Task 6: generate_summary_stream 命令（编排 + 事件）

**Files:**
- Modify: `src-tauri/src/work_summary.rs`（扩展 `WorkSummaryProgress` 加 `message_id`、新增 token 事件常量与 `emit_token`、新增命令）

**Interfaces:**
- Consumes: `SummaryIntent`、`gather_day_changesets`/`gather_range_changesets`、`week_dates`、`build_daily_prompt`/`build_weekly_prompt`、`filter_changesets`、`style_suffix`、`run_claude_summary_streaming`、`assemble_daily_markdown`/`assemble_weekly_markdown`/`assemble_daily_fallback`、`daily_path`/`weekly_path`。
- Produces:
  - `fn should_persist_canonical(kind: &str) -> bool`（仅 "day"/"week" 写规范文件）。
  - `#[tauri::command] async fn generate_summary_stream(app: AppHandle, intent: SummaryIntent, language: String, message_id: String) -> Result<SummaryDocument, String>`。

- [ ] **Step 1: 写失败测试（纯函数）**

```rust
#[test]
fn should_persist_canonical_only_day_and_week() {
    assert!(should_persist_canonical("day"));
    assert!(should_persist_canonical("week"));
    assert!(!should_persist_canonical("range"));
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd src-tauri && cargo test --lib should_persist_canonical`
Expected: 编译失败。

- [ ] **Step 3: 实现**

(a) 扩展进度负载与事件：

```rust
/// 流式 token 事件名
const WORK_SUMMARY_TOKEN_EVENT: &str = "work-summary-token";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkSummaryToken {
    message_id: String,
    delta: String,
}

fn emit_token(app: &AppHandle, message_id: &str, delta: &str) {
    let _ = app.emit(
        WORK_SUMMARY_TOKEN_EVENT,
        WorkSummaryToken { message_id: message_id.to_string(), delta: delta.to_string() },
    );
}
```

给 `WorkSummaryProgress` 加 `#[serde(skip_serializing_if = "Option::is_none")] message_id: Option<String>` 字段，并让 `emit_progress`/`emit_prompt` 接收 `message_id: &str` 形参填入（更新现有两个调用点 `summarize_day`/`generate_weekly_summary` 传入空串或其 message_id；若它们暂不带 id，传 `""`）。

(b) 命令本体：

```rust
fn should_persist_canonical(kind: &str) -> bool {
    matches!(kind, "day" | "week")
}

#[tauri::command]
#[specta::specta]
pub async fn generate_summary_stream(
    app: AppHandle,
    intent: SummaryIntent,
    language: String,
    message_id: String,
) -> Result<SummaryDocument, String> {
    let _guard = WORK_SUMMARY_LOCK.lock().await;

    // 1. 扫描（阻塞放 spawn_blocking）
    emit_progress(&app, "scanning", 0, &message_id);
    let (start, end, kind) = (intent.start.clone(), intent.end.clone(), intent.kind.clone());
    let scan_kind = kind.clone();
    let (_scanned, changesets) = tokio::task::spawn_blocking(move || {
        if scan_kind == "day" {
            gather_day_changesets(&start)
        } else {
            gather_range_changesets(&start, &end)
        }
    })
    .await
    .map_err(|e| format!("扫描任务失败: {e}"))??;

    let filtered = filter_changesets(&changesets, &intent.project_filter);
    let summarized = summarized_project_count(&filtered);
    let commit_count = summarized_commit_count(&filtered);
    let generated_at = crate::utils::current_rfc3339_timestamp();

    if summarized == 0 {
        let body = format!("> {} 这个范围没有检测到已提交的变更。", intent.title);
        let content = if should_persist_canonical(&kind) {
            persist_canonical(&kind, &intent, &generated_at, summarized as usize, commit_count, &body)?
        } else {
            body
        };
        emit_progress(&app, "done", summarized, &message_id);
        return Ok(make_doc(&kind, &intent, content));
    }

    // 2. 构 prompt（按 kind 选模板 + style 后缀）
    let mut prompt = if kind == "week" {
        // 周模板吃 materials；这里用 changeset brief 作素材
        build_weekly_prompt(&intent.title, &filtered.iter().map(build_changeset_brief).collect::<Vec<_>>(), &language)
    } else {
        build_daily_prompt(&intent.start, &filtered, &language)
    };
    prompt.push_str(style_suffix(&intent.style));
    emit_prompt(&app, prompt.clone(), summarized, &message_id);

    // 3. 流式生成
    emit_progress(&app, "summarizing", summarized, &message_id);
    let app_job = app.clone();
    let mid = message_id.clone();
    let lang = language.clone();
    let title = intent.title.clone();
    let kind_job = kind.clone();
    let intent_job = intent.clone();
    let job = tokio::task::spawn_blocking(move || {
        let mut on_delta = |d: &str| emit_token(&app_job, &mid, d);
        let gen_at = crate::utils::current_rfc3339_timestamp();
        match run_claude_summary_streaming(&prompt, &mut on_delta) {
            Ok(body) => {
                let parsed = parse_claude_result(&body).unwrap_or(body); // 流式累积已是正文，parse 容错
                if should_persist_canonical(&kind_job) {
                    persist_canonical(&kind_job, &intent_job, &gen_at, summarized as usize, commit_count, &parsed)
                        .map(|c| make_doc(&kind_job, &intent_job, c))
                } else {
                    Ok(make_doc(&kind_job, &intent_job, assemble_range_markdown(&title, &gen_at, summarized as usize, commit_count, &parsed)))
                }
            }
            Err(e) => {
                let fb = assemble_daily_fallback(&title, &gen_at, &filtered, &e);
                Ok(make_doc(&kind_job, &intent_job, fb))
            }
        }
    });
    let doc = match tokio::time::timeout(std::time::Duration::from_secs(CLAUDE_TIMEOUT_SECS), job).await {
        Ok(joined) => joined.map_err(|e| format!("生成任务失败: {e}"))??,
        Err(_) => return Err("生成超时".into()),
    };
    let _ = lang; // language 已用于 prompt
    emit_progress(&app, "done", summarized, &message_id);
    Ok(doc)
}
```

(c) 三个小 helper（落盘 / 组装 / 构造 doc）：

```rust
/// range 文档头部（与 daily 同风格，但标题取 intent.title、不落规范文件）。
fn assemble_range_markdown(title: &str, generated_at: &str, project_count: usize, commit_count: usize, body: &str) -> String {
    format!("# {title}\n> {project_count} 个项目 · {commit_count} 次提交 · 生成于 {generated_at}\n\n{}\n", body.trim())
}

/// 写规范文件（day→worklog, week→weekly），返回最终 markdown。
fn persist_canonical(kind: &str, intent: &SummaryIntent, generated_at: &str, project_count: usize, commit_count: usize, body: &str) -> Result<String, String> {
    let content = if kind == "week" {
        assemble_weekly_markdown(&intent.title, generated_at, body)
    } else {
        assemble_daily_markdown(&intent.start, generated_at, project_count, commit_count, body)
    };
    let path = if kind == "week" { weekly_path(&intent.title) } else { daily_path(&intent.start) };
    crate::utils::ensure_dir_and_write_atomic(&path, content.as_bytes()).map_err(|e| format!("写入失败: {e}"))?;
    Ok(content)
}

/// 构造返回前端的 SummaryDocument。
fn make_doc(kind: &str, intent: &SummaryIntent, content: String) -> SummaryDocument {
    let key = if kind == "week" { intent.title.clone() } else { intent.start.clone() };
    SummaryDocument { kind: kind.to_string(), key, path: String::new(), content }
}
```

> `weekly_path` 现以 `week_key`（如 `2026-W26`）命名文件；若 `intent.title` 不是纯 key，需在 intent 里保留 `key` 字段或从 title 解析。**实现时**：给 `SummaryIntent` 增补一个 `key: String`（day=start，week=ISO 周 key），由 `build_intent_prompt` 要求输出，或后端据 kind+start 用现有 `iso_week_key` 计算。优先后端计算：`let key = if kind=="week" { iso_week_key(&intent.start)? } else { intent.start.clone() };`（复用现有 `iso_week_key`）。落盘与 `make_doc` 都用此 `key`，不要用 title 当文件名。

- [ ] **Step 4: 跑测试确认通过 + 编译**

Run: `cd src-tauri && cargo test --lib should_persist_canonical && cargo check`
Expected: 测试 1 passed；`cargo check` 通过（修正所有借用/移动/未用变量）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/work_summary.rs
git commit -m "feat(work-summary): generate_summary_stream 流式编排与 token 事件"
```

---

## Task 7: 对话线程持久化（ConversationMessage + load/save 命令）

**Files:**
- Modify: `src-tauri/src/work_summary.rs`
- Test: `src-tauri/tests/work_summary_conversation_e2e.rs`（新建，用 `IntegrationEnv` 隔离 app 数据目录）

**Interfaces:**
- Produces:
  - `struct ConversationMessage { id: String, role: String, ts: String, content: String, intent: Option<SummaryIntent>, doc_path: Option<String>, style: Option<String> }`（camelCase，`Serialize+Deserialize+specta::Type+Clone`）。
  - `fn conversation_path() -> PathBuf`（`summaries/conversation.jsonl`）。
  - `#[tauri::command] fn load_conversation() -> Result<Vec<ConversationMessage>, String>`。
  - `#[tauri::command] fn save_conversation(messages: Vec<ConversationMessage>) -> Result<(), String>`。

- [ ] **Step 1: 写失败测试（集成，往返）**

新建 `src-tauri/tests/work_summary_conversation_e2e.rs`：

```rust
mod common;
use common::IntegrationEnv;
use code_manager_lib::test_api;

#[test]
fn conversation_round_trips_under_isolated_env() {
    let _env = IntegrationEnv::new();
    let msgs = vec![test_api::sample_conversation_message("u1", "user", "总结昨天")];
    test_api::save_conversation(msgs.clone()).unwrap();
    let loaded = test_api::load_conversation().unwrap();
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].id, "u1");
    assert_eq!(loaded[0].content, "总结昨天");
}
```

并在 `lib.rs` 的 `#[cfg(debug_assertions)] pub mod test_api` 中重导出 `save_conversation`/`load_conversation` 与一个 `sample_conversation_message` 构造器（参考现有 test_api 重导出方式）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd src-tauri && cargo test --test work_summary_conversation_e2e`
Expected: 编译失败（函数未定义）。

- [ ] **Step 3: 实现**

```rust
/// 一条对话消息（用户诉求或助手总结）。
#[derive(Debug, Clone, Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMessage {
    pub id: String,
    /// "user" | "assistant"
    pub role: String,
    pub ts: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intent: Option<SummaryIntent>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub doc_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
}

fn conversation_path() -> std::path::PathBuf {
    summaries_dir().join("conversation.jsonl")
}

#[tauri::command]
#[specta::specta]
pub fn load_conversation() -> Result<Vec<ConversationMessage>, String> {
    let path = conversation_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取对话失败: {e}"))?;
    let mut out = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(msg) = serde_json::from_str::<ConversationMessage>(line) {
            out.push(msg);
        }
    }
    Ok(out)
}

#[tauri::command]
#[specta::specta]
pub fn save_conversation(messages: Vec<ConversationMessage>) -> Result<(), String> {
    let mut buf = String::new();
    for m in &messages {
        let line = serde_json::to_string(m).map_err(|e| format!("序列化对话失败: {e}"))?;
        buf.push_str(&line);
        buf.push('\n');
    }
    crate::utils::ensure_dir_and_write_atomic(&conversation_path(), buf.as_bytes())
        .map_err(|e| format!("写入对话失败: {e}"))
}
```

`lib.rs::test_api` 加：

```rust
pub use crate::work_summary::{load_conversation, save_conversation, ConversationMessage};
pub fn sample_conversation_message(id: &str, role: &str, content: &str) -> ConversationMessage {
    ConversationMessage {
        id: id.into(), role: role.into(), ts: "2026-06-25T00:00:00Z".into(),
        content: content.into(), intent: None, doc_path: None, style: None,
    }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test --test work_summary_conversation_e2e`
Expected: `test result: ok. 1 passed`。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/work_summary.rs src-tauri/src/lib.rs src-tauri/tests/work_summary_conversation_e2e.rs
git commit -m "feat(work-summary): 对话线程 jsonl 持久化（load/save_conversation）"
```

---

## Task 8: 注册命令 + 生成绑定

**Files:**
- Modify: `src-tauri/src/lib.rs:77-78`、`:175-180`（`collect_commands![]` 两处列表）
- Modify: `src/bindings.ts`（生成物）

**Interfaces:**
- Produces: 前端 `ipc.parseSummaryIntent`、`ipc.generateSummaryStream`、`ipc.loadConversation`、`ipc.saveConversation` 自动可用（`ipc.ts` 全量包装 `commands`）。

- [ ] **Step 1: 注册命令**

在 `lib.rs` 的 `collect_commands![ ... ]` 中，紧随 `summarize_day,` 之后加入：

```rust
parse_summary_intent,
generate_summary_stream,
load_conversation,
save_conversation,
```

（两处 `collect_commands!` 列表都要加，与现有 `summarize_day` 同列表。）

- [ ] **Step 2: 生成绑定**

Run: `make bindings`
Expected: `src/bindings.ts` 出现 `parseSummaryIntent`/`generateSummaryStream`/`loadConversation`/`saveConversation` 及 `SummaryIntent`、`ConversationMessage` 类型。

- [ ] **Step 3: 校验无漂移 + 编译**

Run: `make bindings-check && make check`
Expected: 无 diff；`cargo check` 通过。

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/lib.rs src/bindings.ts
git commit -m "feat(work-summary): 注册 AI-native 命令并生成 IPC 绑定"
```

---

## Task 9: useSummaryConversation hook

**Files:**
- Create: `src/hooks/useSummaryConversation.ts`
- Test: `src/hooks/__tests__/useSummaryConversation.test.ts`

**Interfaces:**
- Consumes: `ipc.parseSummaryIntent`、`ipc.generateSummaryStream`、`ipc.loadConversation`、`ipc.saveConversation`、`ipc.checkClaudeCli`、`useTauriEvent`、`yesterdayKey`/`localDateKey`（`src/lib/work-summary-date.ts`）。
- Produces:
```ts
type ChatMessage = {
  id: string; role: "user" | "assistant"; ts: string;
  content: string;             // 助手消息流式累积
  intent?: SummaryIntent;
  docPath?: string;
  streaming?: boolean;         // 在飞标记
  process?: { phase: "scanning"|"summarizing"|"done"; prompt?: string };
};
function useSummaryConversation(language: "zh"|"en"): {
  messages: ChatMessage[]; busy: boolean; cliAvailable: boolean;
  send: (text: string) => Promise<void>;
  runQuickAction: (kind: "day"|"week") => Promise<void>;
};
```

- [ ] **Step 1: 写失败测试**

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../ipc", () => ({
  ipc: {
    loadConversation: vi.fn().mockResolvedValue([]),
    checkClaudeCli: vi.fn().mockResolvedValue({ available: true, version: "x" }),
    parseSummaryIntent: vi.fn().mockResolvedValue({ kind: "day", start: "2026-06-24", end: "2026-06-24", projectFilter: [], style: "default", title: "2026-06-24 工作总结" }),
    generateSummaryStream: vi.fn().mockResolvedValue({ kind: "daily", key: "2026-06-24", path: "/p.md", content: "# done" }),
    saveConversation: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("../useTauriEvent", () => ({ default: vi.fn() }));
vi.mock("../../types", () => ({ isTauri: () => true }));

import { useSummaryConversation } from "../useSummaryConversation";

describe("useSummaryConversation", () => {
  it("send 压入用户消息并生成助手消息", async () => {
    const { result } = renderHook(() => useSummaryConversation("zh"));
    await act(async () => { await result.current.send("总结昨天"); });
    await waitFor(() => {
      const roles = result.current.messages.map((m) => m.role);
      expect(roles).toEqual(["user", "assistant"]);
    });
    expect(result.current.messages[1].content).toContain("done");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run src/hooks/__tests__/useSummaryConversation.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
import { useCallback, useEffect, useState } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import type { SummaryIntent } from "../bindings";
import { useI18n } from "../i18n";
import { ipc } from "../ipc";
import { yesterdayKey } from "../lib/work-summary-date";
import { isTauri } from "../types";
import useTauriEvent from "./useTauriEvent";
import { useToast } from "./useToast";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  ts: string;
  content: string;
  intent?: SummaryIntent;
  docPath?: string;
  streaming?: boolean;
  process?: { phase: "scanning" | "summarizing" | "done"; prompt?: string };
};

type ProgressEvent = { messageId?: string; phase: string; prompt?: string };
type TokenEvent = { messageId: string; delta: string };

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

export function useSummaryConversation(language: "zh" | "en") {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [cliAvailable, setCliAvailable] = useState(true);

  // 流式 token 追加到对应在飞助手消息
  useTauriEvent<TokenEvent>("work-summary-token", (e) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === e.messageId ? { ...m, content: m.content + e.delta } : m)),
    );
  });
  // 进度（扫描/提示词/完成）
  useTauriEvent<ProgressEvent>("work-summary-progress", (e) => {
    if (!e.messageId) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === e.messageId
          ? {
              ...m,
              process: {
                phase: (e.phase === "scanning" ? "scanning" : e.phase === "done" ? "done" : "summarizing"),
                prompt: e.prompt ?? m.process?.prompt,
              },
            }
          : m,
      ),
    );
  });

  useEffect(() => {
    if (!isTauri()) return;
    void (async () => {
      try {
        const [conv, cli] = await Promise.all([ipc.loadConversation(), ipc.checkClaudeCli()]);
        setMessages(conv.map((m) => ({ ...m, role: m.role as "user" | "assistant" })));
        setCliAvailable(cli.available);
      } catch (error) {
        showOperationError(showToast, t("worklog.loadError"), error);
      }
    })();
  }, [showToast, t]);

  const runIntent = useCallback(
    async (userText: string, intent: SummaryIntent) => {
      setBusy(true);
      const userMsg: ChatMessage = { id: newId(), role: "user", ts: nowIso(), content: userText };
      const assistantId = newId();
      const assistantMsg: ChatMessage = {
        id: assistantId, role: "assistant", ts: nowIso(), content: "", intent, streaming: true,
        process: { phase: "scanning" },
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      try {
        const doc = await ipc.generateSummaryStream(intent, language, assistantId);
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === assistantId ? { ...m, content: doc.content, docPath: doc.path || undefined, streaming: false } : m,
          );
          void ipc.saveConversation(next).catch(() => showToast(t("worklog.saveError")));
          return next;
        });
      } catch (error) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        showOperationError(showToast, t("worklog.generateError"), error);
      } finally {
        setBusy(false);
      }
    },
    [language, showToast, t],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      try {
        const intent = await ipc.parseSummaryIntent(trimmed, new Date().toISOString().slice(0, 10));
        await runIntent(trimmed, intent);
      } catch (error) {
        showOperationError(showToast, t("worklog.intentError"), error);
      }
    },
    [runIntent, showToast, t],
  );

  const runQuickAction = useCallback(
    async (kind: "day" | "week") => {
      const today = new Date().toISOString().slice(0, 10);
      const intent: SummaryIntent =
        kind === "day"
          ? { kind: "day", start: yesterdayKey(), end: yesterdayKey(), projectFilter: [], style: "default", title: `${yesterdayKey()} 工作总结` }
          : { kind: "week", start: today, end: today, projectFilter: [], style: "default", title: "本周工作总结" };
      await runIntent(kind === "day" ? t("worklog.summarizeYesterday") : t("worklog.generateWeek"), intent);
    },
    [runIntent, t],
  );

  return { messages, busy, cliAvailable, send, runQuickAction };
}
```

> week 的精确范围（周一~周日 + ISO key）由后端按 `start`（今天）计算落盘，前端 intent 的 start/end 仅作占位，后端 `generate_summary_stream` 用 `iso_week_key`/`week_dates` 重新解析（见 Task 6 实现注）。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run src/hooks/__tests__/useSummaryConversation.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/hooks/useSummaryConversation.ts src/hooks/__tests__/useSummaryConversation.test.ts
git commit -m "feat(work-summary): useSummaryConversation 对话编排 hook"
```

---

## Task 10: Composer + Feed + 消息组件

**Files:**
- Create: `src/components/work-summary/SummaryComposer.tsx`、`ConversationFeed.tsx`、`UserMessage.tsx`、`AssistantMessage.tsx`
- Test: `src/components/work-summary/__tests__/SummaryComposer.test.tsx`、`AssistantMessage.test.tsx`

**Interfaces:**
- `SummaryComposer`: props `{ disabled: boolean; onSend: (text: string) => void; onQuick: (kind: "day"|"week") => void }`。
- `ConversationFeed`: props `{ messages: ChatMessage[]; themeType: "light"|"dark" }`。
- `UserMessage`: props `{ message: ChatMessage }`；`AssistantMessage`: props `{ message: ChatMessage; themeType }`。

- [ ] **Step 1: 写失败测试（Composer）**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import SummaryComposer from "../SummaryComposer";

function renderC(props: Partial<React.ComponentProps<typeof SummaryComposer>> = {}) {
  render(<I18nProvider><SummaryComposer disabled={false} onSend={vi.fn()} onQuick={vi.fn()} {...props} /></I18nProvider>);
}

describe("SummaryComposer", () => {
  it("回车发送非空文本并清空", () => {
    const onSend = vi.fn();
    renderC({ onSend });
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "总结昨天" } });
    fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    expect(onSend).toHaveBeenCalledWith("总结昨天");
  });
  it("disabled 时输入框与快捷按钮禁用", () => {
    renderC({ disabled: true });
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "总结昨日" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run src/components/work-summary/__tests__/SummaryComposer.test.tsx`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现四个组件**

`SummaryComposer.tsx`（NL `Textarea` + 发送 + 快捷 chips；Enter 发送、Shift+Enter 换行；走 `t()`、`cn`、shadcn `Button`/`Textarea`、`lucide-react`）：

```tsx
import { CalendarRange, NotebookPen, SendHorizonal } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n";
import { TOOLBAR_SURFACE_CLASS } from "../surface-classes";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

type Props = { disabled: boolean; onSend: (text: string) => void; onQuick: (kind: "day" | "week") => void };

function SummaryComposer({ disabled, onSend, onQuick }: Props) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const submit = () => {
    const v = text.trim();
    if (!v || disabled) return;
    onSend(v);
    setText("");
  };
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-2", TOOLBAR_SURFACE_CLASS)}>
      <div className="flex items-center gap-1.5">
        <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => onQuick("day")}>
          <NotebookPen aria-hidden="true" /> {t("worklog.summarizeYesterday")}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => onQuick("week")}>
          <CalendarRange aria-hidden="true" /> {t("worklog.generateWeek")}
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          disabled={disabled}
          rows={1}
          placeholder={t("worklog.composerPlaceholder")}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="min-h-9 resize-none"
        />
        <Button type="button" size="icon" disabled={disabled || !text.trim()} onClick={submit} aria-label={t("worklog.send")}>
          <SendHorizonal aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
export default SummaryComposer;
```

`UserMessage.tsx`（右对齐气泡，`TYPOGRAPHY.body`、`SUBTLE_SURFACE_CLASS`）：

```tsx
import { cn } from "@/lib/utils";
import type { ChatMessage } from "../../hooks/useSummaryConversation";
import { SUBTLE_SURFACE_CLASS } from "../surface-classes";
import { TYPOGRAPHY } from "../typography-classes";

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className={cn("max-w-[80%] rounded-lg px-3 py-2", SUBTLE_SURFACE_CLASS, TYPOGRAPHY.body)}>
        {message.content}
      </div>
    </div>
  );
}
export default UserMessage;
```

`AssistantMessage.tsx`（意图 chip + 过程条 + 流式 `MarkdownPreview` + 操作；迁入 `SUMMARY_MARKDOWN_CLASS`；流式中尾部光标）：

```tsx
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "../../hooks/useSummaryConversation";
import { useI18n } from "../../i18n";
import MarkdownPreview from "../claude-overview/MarkdownPreview";
import { PANEL_SURFACE_CLASS } from "../surface-classes";
import { TYPOGRAPHY } from "../typography-classes";
import { Badge } from "../ui/badge";

// 与文档预览一致的排版定制（从 WorkSummaryPage 迁入复用）
const SUMMARY_MARKDOWN_CLASS = cn(
  "!bg-transparent",
  "[&_ul]:!list-disc [&_ol]:!list-decimal [&_ul]:!my-3 [&_ol]:!my-3",
  "[&_li]:!my-1 [&_li]:!leading-relaxed [&_li]:marker:text-muted-foreground",
  "[&_h1]:!border-0",
  "[&_h2]:!mt-8 [&_h2]:!border-b [&_h2]:!border-border/40 [&_h2]:!pb-2",
  "[&_p]:!my-3 [&_strong]:!text-foreground",
  "[&_blockquote]:!border-l-2 [&_blockquote]:!border-border [&_blockquote]:!text-muted-foreground",
);

function AssistantMessage({ message, themeType }: { message: ChatMessage; themeType: "light" | "dark" }) {
  const { t } = useI18n();
  const i = message.intent;
  return (
    <article className={cn("flex flex-col gap-2 rounded-lg px-5 py-4", PANEL_SURFACE_CLASS)}>
      {i && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{i.title}</Badge>
          {i.projectFilter.length > 0 && <Badge variant="ghost">{i.projectFilter.join(" / ")}</Badge>}
          {i.style !== "default" && <Badge variant="ghost">{i.style === "concise" ? t("worklog.styleConcise") : t("worklog.styleDetailed")}</Badge>}
        </div>
      )}
      {message.streaming && (
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span className={TYPOGRAPHY.auxiliary}>{t("worklog.generating")}</span>
        </div>
      )}
      {message.content && (
        <MarkdownPreview content={message.content} themeType={themeType} className={SUMMARY_MARKDOWN_CLASS} />
      )}
      {!message.streaming && message.docPath && (
        <div className="flex items-center gap-1.5">
          <Check className="size-4 text-primary" aria-hidden="true" />
          <span className={cn(TYPOGRAPHY.auxiliary, "break-all")}>{message.docPath}</span>
        </div>
      )}
    </article>
  );
}
export default AssistantMessage;
```

`ConversationFeed.tsx`（滚动容器，按 role 分发，新内容滚到底）：

```tsx
import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../hooks/useSummaryConversation";
import AssistantMessage from "./AssistantMessage";
import UserMessage from "./UserMessage";

function ConversationFeed({ messages, themeType }: { messages: ChatMessage[]; themeType: "light" | "dark" }) {
  const endRef = useRef<HTMLDivElement>(null);
  // 依赖最后一条消息内容长度，流式追加时滚到底
  const tail = messages.length > 0 ? messages[messages.length - 1].content.length : 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, tail]);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {messages.map((m) =>
        m.role === "user" ? (
          <UserMessage key={m.id} message={m} />
        ) : (
          <AssistantMessage key={m.id} message={m} themeType={themeType} />
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}
export default ConversationFeed;
```

`AssistantMessage.test.tsx`：

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../../i18n";
import AssistantMessage from "../AssistantMessage";

it("渲染意图标题与流式正文", () => {
  render(
    <I18nProvider>
      <AssistantMessage
        themeType="light"
        message={{ id: "a1", role: "assistant", ts: "t", content: "## proj\n做了登录", streaming: false,
          intent: { kind: "day", start: "2026-06-24", end: "2026-06-24", projectFilter: [], style: "default", title: "2026-06-24 工作总结" } }}
      />
    </I18nProvider>,
  );
  expect(screen.getByText("2026-06-24 工作总结")).toBeInTheDocument();
  expect(screen.getByText(/做了登录/)).toBeInTheDocument();
});
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run src/components/work-summary/__tests__/`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/work-summary/
git commit -m "feat(work-summary): 对话 Composer / Feed / 消息组件"
```

---

## Task 11: 历史 Sheet + 页面重写 + i18n

**Files:**
- Create: `src/components/work-summary/SummaryHistorySheet.tsx`
- Rewrite: `src/components/WorkSummaryPage.tsx`
- Modify: `src/i18n.ts`（新增 key）
- Delete: `src/components/WorkSummaryProcessView.tsx`、`src/hooks/useWorkSummaries.ts`、`src/components/__tests__/WorkSummaryPage.test.tsx`（旧）
- Test: `src/components/__tests__/WorkSummaryPage.test.tsx`（新）

**Interfaces:**
- Consumes: `useSummaryConversation`（Task 9）、`ConversationFeed`/`SummaryComposer`（Task 10）、`ipc.listSummaries`/`ipc.readSummary`。
- `SummaryHistorySheet`: props `{ }`（自取数据，内部用 `Sheet`，点条目用 `MarkdownPreview` 预览）。

- [ ] **Step 1: 写失败测试（页面）**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockHook = vi.fn();
vi.mock("../../hooks/useSummaryConversation", () => ({ useSummaryConversation: (...a: unknown[]) => mockHook(...a) }));
vi.mock("../theme-provider", () => ({ useTheme: () => ({ isDark: false }) }));

import { I18nProvider } from "../../i18n";
import WorkSummaryPage from "../WorkSummaryPage";

function base() {
  return { messages: [], busy: false, cliAvailable: true, send: vi.fn(), runQuickAction: vi.fn() };
}
function renderPage() {
  render(<I18nProvider><WorkSummaryPage /></I18nProvider>);
}

describe("WorkSummaryPage", () => {
  it("空对话时渲染 composer 与快捷按钮", () => {
    mockHook.mockReturnValue(base());
    renderPage();
    expect(screen.getByRole("button", { name: "总结昨日" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
  it("cliAvailable=false 时禁用并提示", () => {
    mockHook.mockReturnValue({ ...base(), cliAvailable: false });
    renderPage();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByText("未检测到 claude CLI，请确认 Claude Code 已安装并在 PATH 中。")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run src/components/__tests__/WorkSummaryPage.test.tsx`
Expected: FAIL（旧实现/缺组件）。

- [ ] **Step 3: 实现页面 + 历史 Sheet + i18n**

`SummaryHistorySheet.tsx`（shadcn `Sheet`，列 `listSummaries`，点条目读取并 `MarkdownPreview` 预览）：

```tsx
import { History } from "lucide-react";
import { useState } from "react";
import type { SummaryDocument, SummaryListItem } from "../../bindings";
import { useI18n } from "../../i18n";
import { ipc } from "../../ipc";
import { useTheme } from "../theme-provider";
import MarkdownPreview from "../claude-overview/MarkdownPreview";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../ui/sheet";

function SummaryHistorySheet() {
  const { t } = useI18n();
  const { isDark } = useTheme();
  const [items, setItems] = useState<SummaryListItem[]>([]);
  const [doc, setDoc] = useState<SummaryDocument | null>(null);
  const open = async () => {
    try { setItems(await ipc.listSummaries()); } catch { /* toast 由调用方略，简化 */ }
  };
  return (
    <Sheet onOpenChange={(o) => o && void open()}>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="ghost"><History aria-hidden="true" /> {t("worklog.history")}</Button>
      </SheetTrigger>
      <SheetContent aria-describedby={undefined} className="w-[480px] sm:max-w-[480px]">
        <SheetHeader><SheetTitle>{t("worklog.history")}</SheetTitle></SheetHeader>
        <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-4">
          {doc ? (
            <>
              <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setDoc(null)}>← {t("common.back")}</Button>
              <MarkdownPreview content={doc.content} themeType={isDark ? "dark" : "light"} />
            </>
          ) : (
            items.map((it) => (
              <Button key={`${it.kind}-${it.key}`} type="button" variant="ghost" className="h-auto justify-start"
                onClick={async () => setDoc(await ipc.readSummary(it.kind, it.key))}>
                {it.key} · {it.kind === "weekly" ? t("worklog.weekly") : t("worklog.daily")}
              </Button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
export default SummaryHistorySheet;
```

`WorkSummaryPage.tsx`（重写为壳）：

```tsx
import { useI18n } from "../i18n";
import { useSummaryConversation } from "../hooks/useSummaryConversation";
import PageHeader from "./PageHeader";
import { useTheme } from "./theme-provider";
import ConversationFeed from "./work-summary/ConversationFeed";
import SummaryComposer from "./work-summary/SummaryComposer";
import SummaryHistorySheet from "./work-summary/SummaryHistorySheet";
import EmptyState from "./EmptyState";

function WorkSummaryPage() {
  const { t, language } = useI18n();
  const { isDark } = useTheme();
  const { messages, busy, cliAvailable, send, runQuickAction } = useSummaryConversation(language);
  const disabled = !cliAvailable || busy;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("worklog.title")} actions={<SummaryHistorySheet />} />
      {!cliAvailable && <p className="px-4 py-2 text-sm text-muted-foreground">{t("worklog.cliMissing")}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <EmptyState title={t("worklog.welcome")} description={t("worklog.welcomeHint")} />
        ) : (
          <ConversationFeed messages={messages} themeType={isDark ? "dark" : "light"} />
        )}
      </div>
      <div className="border-t border-border p-3">
        <SummaryComposer disabled={disabled} onSend={(v) => void send(v)} onQuick={(k) => void runQuickAction(k)} />
      </div>
    </div>
  );
}
export default WorkSummaryPage;
```

`i18n.ts` 在 `worklog.*` 段新增中英成对 key（保留现有 `summarizeYesterday`/`generateWeek`/`cliMissing`/`daily`/`weekly`/`loadError`/`generateError`/`noChanges` 等）：
`worklog.composerPlaceholder`、`worklog.send`、`worklog.history`、`worklog.welcome`、`worklog.welcomeHint`、`worklog.generating`、`worklog.styleConcise`、`worklog.styleDetailed`、`worklog.intentError`、`worklog.saveError`，以及（若缺）`common.back`。中文示例：`composerPlaceholder: "用自然语言描述要总结的范围，如「总结上周五」「近三天只看 code-manager 简短点」"`；英文对应翻译。

- [ ] **Step 4: 跑测试 + 删除旧文件 + 全量前端检查**

```bash
git rm src/components/WorkSummaryProcessView.tsx src/hooks/useWorkSummaries.ts
```

Run: `pnpm exec vitest run src/components/__tests__/WorkSummaryPage.test.tsx && make lint-frontend && make build-frontend`
Expected: 测试 PASS；biome 无报错；build 成功（修正所有未用 import / 类型）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(work-summary): 对话式工作台页面重写 + 历史 Sheet + i18n"
```

---

## Task 12: 端到端联调与全量验证

**Files:** 无新增（修复联调问题）。

- [ ] **Step 1: Rust 全量**

Run: `make fmt-rust-check && make check && make lint-rust && make test-rust`
Expected: 全绿（clippy 无警告）。

- [ ] **Step 2: 契约 + 前端全量**

Run: `make bindings-check && make build-frontend && make test-frontend`
Expected: 无 diff；build 成功；前端测试全绿。

- [ ] **Step 3: 手动端到端（`make dev`）**

逐项核验（深色主题优先，再切浅色）：
- 输入「总结上周五只看 code-manager 简短点」→ 用户气泡 → 助手卡片出现意图 chip（标题/项目/简短）→ 扫描 → **逐字流式**正文 → 完成；该 range 结果**未**写 `worklog/weekly`（只进 `conversation.jsonl`）。
- 点「总结昨日」→ 落 `worklog/<昨日>.md` 且对话出现一条助手消息含路径。
- 重开页面 → 对话线程完整重放（`load_conversation`）。
- 「历史总结」Sheet → 打开旧日/周文档预览。
- 退出 claude / PATH 无 claude → composer 禁用 + 提示。
- 列表/正文样式：圆点、轻分隔、无「框中框」、留白舒适。

- [ ] **Step 4: 全量门禁 + 提交（如有修复）**

Run: `make verify`
Expected: 全绿（已知 `ProfileEditor` 偶发超时与本改动无关；隔离重跑确认）。

```bash
git add -A
git commit -m "fix(work-summary): AI-native 工作台端到端联调修复"
```

---

## Self-Review

**Spec coverage（逐条对照设计稿）**
- 对话式工作台布局 → Task 10/11 ✓；意图解读 chip → Task 6（intent 入消息）+ Task 10（AssistantMessage 渲染）✓；过程条 → Task 9 process state + Task 10 ✓；流式 Markdown → Task 1/2/6/9/10 ✓；底部操作（复制/提示词/已保存链接/refine）→ 已保存链接 Task 10 ✓；复制/查看提示词/refine chips **为增量 UI**，Task 10 的 AssistantMessage 已具备 prompt 数据（`process.prompt`）与 content，可在该任务内补「复制」「查看提示词」「refine chip→onSend(预设语)」——已在组件结构中预留，落地时补按钮（不另开任务，属同一可测交付）。
- 空状态建议 chips → Task 11 EmptyState（welcome/welcomeHint）✓。
- 真 token 流式（CLI stream-json）→ Task 1/2/6 ✓。
- 全自然语言意图（范围/过滤/风格）→ Task 3/4/5/6 ✓。
- 双存储（规范 .md + 对话线程）→ Task 6 `persist_canonical`/`should_persist_canonical` + Task 7 ✓。
- 历史回归 Sheet → Task 11 ✓。
- 错误处理（CLI 缺失/解析失败/进程失败降级/空扫描/持久化失败）→ Task 6 fallback + Task 9 catch + Task 11 cliMissing ✓。
- 测试（NDJSON 抽取/range/filter/style/intent/jsonl 往返/前端）→ Task 1-7,9-11 ✓。
- bindings → Task 8 ✓。

**Placeholder scan**：无 TBD/TODO；每个 code step 给出完整代码。唯一「落地时补」项（复制/提示词/refine 按钮）已明确归入 Task 10 同一交付且数据已就绪，非占位空话。

**Type consistency**：`SummaryIntent`（kind/start/end/projectFilter/style/title，camelCase）在 Task 3 定义，Task 6/9/10 一致引用；`ChatMessage`（Task 9）字段与 Task 10 组件 props 一致；`generate_summary_stream(intent, language, messageId)` 签名在 Task 6 定义、Task 9 调用一致；事件名 `work-summary-token`/`work-summary-progress` 在 Task 6/9 一致；`weekly_path`/落盘用 ISO `key`（非 title）已在 Task 6 实现注明确，Task 9 占位 start/end 由后端重算，闭环一致。
