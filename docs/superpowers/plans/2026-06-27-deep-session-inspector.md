# 深度会话检查（合入历史）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有「历史」会话详情升级为深度会话检查器，surface transcript 里被丢弃的 harness 信号（hook 事件、subagent 侧链、mode 切换），并复用现有 usage 命令补上会话级成本/Token KPI。

**Architecture:** 后端 `history.rs::get_session_detail` 解析器扩展，新增三类 transcript-only 信号到 `MessageBlock` 枚举与 `SessionDetail`；成本/KPI 不在 history.rs 重复抽取，前端复用已有 `get_session_usage_detail` 命令。前端新增事件渲染器文件，给 `SessionDetailDrawer` 加 KPI 头部与新块渲染，并打通 Usage/Projects → 历史会话 的跳转。

**Tech Stack:** Rust + Tauri command + specta（IPC）、serde_json（transcript 解析）、React 19 + TypeScript、@tanstack/react-virtual、react-markdown、shadcn/ui、Vitest、cargo test。

## Global Constraints

- 代码注释使用中文，技术术语保留英文。
- 所有用户可见文本必须走 `useI18n()` 的 `t()`，不硬编码中英文。
- 前端通知走 `useToast()` / `showOperationError`，不把 `console.error` 当用户反馈。
- 业务前端只经 `src/ipc.ts` 的 `ipc` 调用，不直接 `invoke`；`src/bindings.ts` 是 `make bindings` 生成物，不手改。
- Rust 公共边界返回 `Result`，可恢复错误不用 `unwrap()/expect()`；文件/JSON/路径优先复用 `src-tauri/src/utils.rs`。
- 会话详情解析逻辑留在后端，不复制到前端（history-stats-usage rule）。
- 浮层/折叠用 shadcn 语义变量与原子组件，不硬编码 z-index / 十六进制色值。
- transcript 数据源是 `~/.claude/projects/<encoded>/<sessionId>.jsonl`；成本数据源是 SQLite usage DB（经 `get_session_usage_detail`）。两者不混用、不重复实现成本逻辑。
- 解析必须沿用现有 `session_file_path` 路径校验，防 `../` 穿出 `projects`。
- 新增 `SessionDetail` / `MessageBlock` 字段后，必须 `make bindings` 重新生成并同步 `src/types.ts`。

## 真实 transcript 字段（已抽样核实，解析代码依据）

- **hook 记录**：`{ "type": <字符串>, "hookCount": int, "hookInfos": [{"command": str, "durationMs": int}], "hookErrors": [..], "preventedContinuation": bool, "stopReason": str, "toolUseID": str }`。
- **mode 记录**：`{ "type": "mode", "mode": <如 "plan"/"default">, "sessionId": str }`。
- **sidechain 消息**：`{ "isSidechain": true, "agentId": str, "slug": str, "message": {...}, "timestamp": str, "type": "user"|"assistant" }`，按 `agentId` 分组，`slug` 为 subagent 标识；与主线 tool_use 无可靠 inline 链接，故按会话级分组呈现。
- **assistant usage**：`message.usage.{input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens,cache_creation.ephemeral_5m/1h_input_tokens}` —— 已由 `usage.rs` 落入 SQLite，本计划不重复抽取。

---

### Task 1: 后端解析 hook 记录为 `MessageBlock::Hook`

**Files:**
- Modify: `src-tauri/src/history.rs:106-137`（`MessageBlock` 枚举）
- Modify: `src-tauri/src/history.rs:399-411`（`get_session_detail` 主循环类型过滤处）
- Test: `src-tauri/src/history.rs`（`#[cfg(test)] mod tests`，文件末尾）

**Interfaces:**
- Produces: `MessageBlock::Hook { hooks: Vec<HookCall>, errors: Vec<String>, prevented_continuation: bool, stop_reason: Option<String> }`，其中 `pub struct HookCall { pub command: String, pub duration_ms: Option<u64> }`。serde 序列化为 `{ type: "hook", hooks: [{command, duration_ms}], errors: string[], prevented_continuation: bool, stop_reason: string | null }`。
- Produces: `fn parse_hook_record(record: &serde_json::Value) -> Option<MessageBlock>`（模块私有）。

- [ ] **Step 1: 写失败测试**

在 `mod tests` 末尾（`parse_text_with_tags_drops_pure_noise_tags` 之后）追加：

```rust
    // ─── hook 记录解析 ───

    #[test]
    fn parse_hook_record_extracts_hooks_errors_and_flags() {
        let value: serde_json::Value = serde_json::from_str(
            r#"{
                "type":"system",
                "hookCount":2,
                "hookInfos":[
                    {"command":"lefthook pre-commit","durationMs":120},
                    {"command":"format","durationMs":null}
                ],
                "hookErrors":["gitleaks failed"],
                "preventedContinuation":true,
                "stopReason":"hook blocked"
            }"#,
        )
        .unwrap();

        let block = parse_hook_record(&value).expect("含 hookInfos 应解析为 Hook block");
        match block {
            MessageBlock::Hook {
                hooks,
                errors,
                prevented_continuation,
                stop_reason,
            } => {
                assert_eq!(hooks.len(), 2);
                assert_eq!(hooks[0].command, "lefthook pre-commit");
                assert_eq!(hooks[0].duration_ms, Some(120));
                assert_eq!(hooks[1].duration_ms, None);
                assert_eq!(errors, vec!["gitleaks failed".to_string()]);
                assert!(prevented_continuation);
                assert_eq!(stop_reason.as_deref(), Some("hook blocked"));
            }
            other => panic!("应为 Hook: {:?}", serde_json::to_string(&other).ok()),
        }
    }

    #[test]
    fn parse_hook_record_returns_none_without_hook_infos() {
        let value: serde_json::Value =
            serde_json::from_str(r#"{"type":"user","message":{"role":"user"}}"#).unwrap();
        assert!(parse_hook_record(&value).is_none(), "无 hookInfos 不应产出 Hook");
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p code-manager --lib history::tests::parse_hook_record_extracts_hooks_errors_and_flags`
Expected: 编译失败 `cannot find ... MessageBlock::Hook` / `parse_hook_record not found`。

- [ ] **Step 3: 写最小实现**

在 `MessageBlock` 枚举（`src-tauri/src/history.rs:136` `Plan` 变体之后、`}` 之前）追加变体，并在枚举上方新增 `HookCall` 结构：

```rust
    /// hook 触发记录（hookInfos / hookErrors / preventedContinuation / stopReason）
    #[serde(rename = "hook")]
    Hook {
        hooks: Vec<HookCall>,
        errors: Vec<String>,
        prevented_continuation: bool,
        stop_reason: Option<String>,
    },
```

在 `MessageBlock` 枚举定义之前（`/// 对话消息内容块` 注释上方）新增：

```rust
/// 单个 hook 调用：命令与耗时（耗时可能缺省）
#[derive(Debug, Serialize, specta::Type)]
pub struct HookCall {
    pub command: String,
    pub duration_ms: Option<u64>,
}
```

在 `extract_plan_path_from_record`（`src-tauri/src/history.rs:558` 上方）附近新增解析函数：

```rust
/// 把含 hookInfos 的记录解析为 Hook block；无 hookInfos 返回 None
fn parse_hook_record(record: &serde_json::Value) -> Option<MessageBlock> {
    let infos = record.get("hookInfos")?.as_array()?;
    let hooks = infos
        .iter()
        .filter_map(|i| {
            let command = i.get("command").and_then(|c| c.as_str())?.to_string();
            let duration_ms = i.get("durationMs").and_then(|d| d.as_u64());
            Some(HookCall {
                command,
                duration_ms,
            })
        })
        .collect();
    let errors = record
        .get("hookErrors")
        .and_then(|e| e.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let prevented_continuation = record
        .get("preventedContinuation")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let stop_reason = record
        .get("stopReason")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    Some(MessageBlock::Hook {
        hooks,
        errors,
        prevented_continuation,
        stop_reason,
    })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p code-manager --lib history::tests::parse_hook_record`
Expected: 2 个测试 PASS。

- [ ] **Step 5: 把 hook 记录接入主循环**

在 `get_session_detail` 主循环里，`只处理 user 和 assistant 类型` 过滤之前（`src-tauri/src/history.rs:398` `let msg_type = ...` 之后、`if msg_type != "user" ...` 之前）插入：

```rust
        // hook 记录独立成 message，按时间线插入（不属于 user/assistant 对话体）
        if let Some(hook_block) = parse_hook_record(&record) {
            let timestamp = record
                .get("timestamp")
                .and_then(|t| t.as_str())
                .map(|s| s.to_string());
            messages.push(SessionMessage {
                role: "system".to_string(),
                blocks: vec![hook_block],
                timestamp,
            });
            continue;
        }
```

- [ ] **Step 6: 写主循环集成测试**

在 `mod tests` 追加：

```rust
    #[test]
    fn get_session_detail_surfaces_hook_records() {
        let env = TestEnv::new("session-hook");
        let content = "{\"type\":\"system\",\"hookInfos\":[{\"command\":\"fmt\",\"durationMs\":5}],\
            \"hookErrors\":[],\"preventedContinuation\":false}\n\
            {\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"hi\"}}\n";
        env.write_session("/p", "s1", content);

        let detail = get_session_detail("/p", "s1").expect("解析应成功");

        assert_eq!(detail.messages.len(), 2, "hook + user 共两条");
        assert!(matches!(
            detail.messages[0].blocks[0],
            MessageBlock::Hook { .. }
        ));
    }
```

- [ ] **Step 7: 运行测试确认通过**

Run: `cargo test -p code-manager --lib history::`
Expected: 全部 PASS（含原有测试不回归）。

- [ ] **Step 8: 提交**

```bash
git add src-tauri/src/history.rs
git commit -m "feat(history): 解析 hook 记录为 Hook 消息块"
```

---

### Task 2: 后端解析 `type:mode` 为 `MessageBlock::ModeChange`

**Files:**
- Modify: `src-tauri/src/history.rs`（`MessageBlock` 枚举 + 主循环）
- Test: `src-tauri/src/history.rs`（`mod tests`）

**Interfaces:**
- Produces: `MessageBlock::ModeChange { mode: String }` → serde `{ type: "mode_change", mode: string }`。

- [ ] **Step 1: 写失败测试**

```rust
    #[test]
    fn get_session_detail_surfaces_mode_changes() {
        let env = TestEnv::new("session-mode");
        let content = "{\"type\":\"mode\",\"mode\":\"plan\",\"sessionId\":\"s1\"}\n\
            {\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"go\"}}\n";
        env.write_session("/p", "s1", content);

        let detail = get_session_detail("/p", "s1").expect("解析应成功");

        assert_eq!(detail.messages.len(), 2);
        match &detail.messages[0].blocks[0] {
            MessageBlock::ModeChange { mode } => assert_eq!(mode, "plan"),
            other => panic!("应为 ModeChange: {:?}", serde_json::to_string(other).ok()),
        }
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p code-manager --lib history::tests::get_session_detail_surfaces_mode_changes`
Expected: 编译失败 `MessageBlock::ModeChange not found`。

- [ ] **Step 3: 写实现**

在 `MessageBlock` 枚举追加变体（紧跟 Task 1 的 `Hook` 之后）：

```rust
    /// 模式切换（plan / default 等）
    #[serde(rename = "mode_change")]
    ModeChange { mode: String },
```

在 `get_session_detail` 主循环、Task 1 插入的 hook 块之后，插入 mode 处理：

```rust
        // mode 切换记录独立成 message
        if msg_type == "mode" {
            if let Some(mode) = record.get("mode").and_then(|m| m.as_str()) {
                let timestamp = record
                    .get("timestamp")
                    .and_then(|t| t.as_str())
                    .map(|s| s.to_string());
                messages.push(SessionMessage {
                    role: "system".to_string(),
                    blocks: vec![MessageBlock::ModeChange {
                        mode: mode.to_string(),
                    }],
                    timestamp,
                });
            }
            continue;
        }
```

> 注：`msg_type` 已在该处之前定义。确保 mode 处理放在 `if msg_type != "user" && msg_type != "assistant" { continue; }` 之前。

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p code-manager --lib history::`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/history.rs
git commit -m "feat(history): 解析 mode 切换为 ModeChange 消息块"
```

---

### Task 3: 后端按 agentId 收集 subagent 侧链

**Files:**
- Modify: `src-tauri/src/history.rs`（`SessionDetail` 结构 + 主循环 sidechain 分支 + 返回）
- Test: `src-tauri/src/history.rs`（`mod tests`）

**Interfaces:**
- Produces: `SessionDetail.subagents: Vec<SubagentChain>`，其中
  `pub struct SubagentChain { pub agent_id: String, pub slug: Option<String>, pub messages: Vec<SessionMessage> }`。
- 侧链消息仍**不进入主 `messages`**，改为按 `agentId` 聚合进 `subagents`。

- [ ] **Step 1: 写失败测试**

```rust
    #[test]
    fn get_session_detail_groups_sidechains_by_agent_id() {
        let env = TestEnv::new("session-subagent");
        let content = "{\"type\":\"user\",\"message\":{\"role\":\"user\",\"content\":\"main\"}}\n\
            {\"type\":\"user\",\"isSidechain\":true,\"agentId\":\"a1\",\"slug\":\"explore\",\
            \"message\":{\"role\":\"user\",\"content\":\"sub task\"}}\n\
            {\"type\":\"assistant\",\"isSidechain\":true,\"agentId\":\"a1\",\"slug\":\"explore\",\
            \"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"sub answer\"}]}}\n";
        env.write_session("/p", "s1", content);

        let detail = get_session_detail("/p", "s1").expect("解析应成功");

        assert_eq!(detail.messages.len(), 1, "主线只剩 1 条 user");
        assert_eq!(detail.subagents.len(), 1, "侧链按 agentId 聚合为 1 个 chain");
        assert_eq!(detail.subagents[0].agent_id, "a1");
        assert_eq!(detail.subagents[0].slug.as_deref(), Some("explore"));
        assert_eq!(detail.subagents[0].messages.len(), 2, "子时间线 2 条消息");
    }
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p code-manager --lib history::tests::get_session_detail_groups_sidechains_by_agent_id`
Expected: 编译失败 `no field subagents` / `SubagentChain not found`。

- [ ] **Step 3: 写实现**

在 `SessionMessage` 结构之后新增结构：

```rust
/// 一个 subagent 侧链（按 agentId 聚合的子时间线）
#[derive(Debug, Serialize, specta::Type)]
pub struct SubagentChain {
    pub agent_id: String,
    pub slug: Option<String>,
    pub messages: Vec<SessionMessage>,
}
```

在 `SessionDetail` 结构追加字段（`plan_file_path` 之后）：

```rust
    /// 按 agentId 聚合的 subagent 侧链子时间线
    pub subagents: Vec<SubagentChain>,
```

在 `get_session_detail` 函数体顶部、`messages` 声明附近，新增有序聚合容器：

```rust
    // 侧链按 agentId 聚合（保持首次出现顺序）
    let mut subagent_order: Vec<String> = Vec::new();
    let mut subagent_map: std::collections::HashMap<String, SubagentChain> =
        std::collections::HashMap::new();
```

把原有「跳过 sidechain 消息」分支（`src-tauri/src/history.rs:404-411`）整段替换为：

```rust
        // sidechain 消息按 agentId 聚合进 subagents，不进入主线
        if record
            .get("isSidechain")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            let agent_id = record
                .get("agentId")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let slug = record
                .get("slug")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let message = match record.get("message") {
                Some(m) => m,
                None => continue,
            };
            let role = message
                .get("role")
                .and_then(|r| r.as_str())
                .unwrap_or("user")
                .to_string();
            let content_val = message
                .get("content")
                .cloned()
                .unwrap_or(serde_json::Value::Null);
            let blocks = parse_content_blocks(&content_val);
            if blocks.is_empty() {
                continue;
            }
            let timestamp = record
                .get("timestamp")
                .and_then(|t| t.as_str())
                .map(|s| s.to_string());
            let chain = subagent_map.entry(agent_id.clone()).or_insert_with(|| {
                subagent_order.push(agent_id.clone());
                SubagentChain {
                    agent_id: agent_id.clone(),
                    slug: slug.clone(),
                    messages: Vec::new(),
                }
            });
            if chain.slug.is_none() {
                chain.slug = slug;
            }
            chain.messages.push(SessionMessage {
                role,
                blocks,
                timestamp,
            });
            continue;
        }
```

在函数返回处（`src-tauri/src/history.rs:524` `Ok(SessionDetail {`）按 `subagent_order` 组装并加入返回值：

```rust
    let subagents: Vec<SubagentChain> = subagent_order
        .into_iter()
        .filter_map(|id| subagent_map.remove(&id))
        .collect();

    Ok(SessionDetail {
        session_id: session_id.to_string(),
        project: project.to_string(),
        messages,
        plan_file_path,
        subagents,
    })
```

同步更新「文件不存在」早返回分支（`src-tauri/src/history.rs:362-367`）补 `subagents: Vec::new(),`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p code-manager --lib history::`
Expected: 全部 PASS（原 `get_session_detail_skips_sidechain_messages` 仍通过——该测试只断言主线为空，侧链进 subagents 不破坏它）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/history.rs
git commit -m "feat(history): 按 agentId 聚合 subagent 侧链子时间线"
```

---

### Task 4: 重新生成 bindings 并同步前端类型

**Files:**
- Generate: `src/bindings.ts`（`make bindings` 产物，不手改）
- Modify: `src/types.ts:558-582`（`MessageBlock` / `SessionDetail` 手维护类型）
- Verify: `make bindings-check`

**Interfaces:**
- Consumes: Task 1-3 的 Rust 结构。
- Produces: 前端可用的 `MessageBlock`（含 hook / mode_change 变体）、`SessionDetail.subagents`、`SubagentChain`、`HookCall` 类型。

- [ ] **Step 1: 生成 bindings**

Run: `make bindings`
Expected: `src/bindings.ts` 更新，新增 `Hook` / `ModeChange` 变体、`SubagentChain`、`HookCall` 类型，`SessionDetail` 含 `subagents`。

- [ ] **Step 2: 同步手维护的 `src/types.ts`**

把 `src/types.ts:558` 的 `MessageBlock` 联合追加两个变体（与 Rust serde 对齐）：

```typescript
  | { type: "plan"; summary: string; content: string }
  | {
      type: "hook";
      hooks: { command: string; duration_ms: number | null }[];
      errors: string[];
      prevented_continuation: boolean;
      stop_reason: string | null;
    }
  | { type: "mode_change"; mode: string };
```

在 `SessionMessage` 接口之后新增：

```typescript
// 一个 subagent 侧链子时间线
export interface SubagentChain {
  agent_id: string;
  slug: string | null;
  messages: SessionMessage[];
}
```

`SessionDetail` 接口追加字段：

```typescript
  plan_file_path: string | null;
  // 按 agentId 聚合的 subagent 侧链
  subagents: SubagentChain[];
}
```

- [ ] **Step 3: 校验契约与编译**

Run: `make bindings-check && make build-frontend`
Expected: bindings-check 无 diff（生成物已提交），前端 TS 编译通过。

- [ ] **Step 4: 提交**

```bash
git add src/bindings.ts src/types.ts
git commit -m "chore(bindings): 同步 hook/mode_change/subagent 会话详情类型"
```

---

### Task 5: 前端渲染 Hook 与 ModeChange 事件块

**Files:**
- Create: `src/components/SessionEventBlocks.tsx`
- Modify: `src/components/SessionDetailDrawer.tsx:609-660`（`MessageBlocks` 的 block switch 接入新渲染器）
- Modify: `src/i18n.ts`（新增文案 key）
- Test: `src/components/__tests__/SessionEventBlocks.test.tsx`

**Interfaces:**
- Consumes: `MessageBlock`（`type: "hook" | "mode_change"`）。
- Produces: `export function HookBlock(props: { block: Extract<MessageBlock, { type: "hook" }>; t: (k: TranslationKey) => string })`、`export function ModeChangeBlock(props: { block: Extract<MessageBlock, { type: "mode_change" }>; t: (k: TranslationKey) => string })`。

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TranslationKey } from "../../i18n";
import { HookBlock, ModeChangeBlock } from "../SessionEventBlocks";

const t = (k: TranslationKey) => k as string;

describe("SessionEventBlocks", () => {
  it("HookBlock 展示命令并高亮错误", () => {
    render(
      <HookBlock
        block={{
          type: "hook",
          hooks: [{ command: "lefthook pre-commit", duration_ms: 120 }],
          errors: ["gitleaks failed"],
          prevented_continuation: true,
          stop_reason: "blocked",
        }}
        t={t}
      />,
    );
    expect(screen.getByText(/lefthook pre-commit/)).toBeInTheDocument();
    expect(screen.getByText(/gitleaks failed/)).toBeInTheDocument();
  });

  it("ModeChangeBlock 展示模式名", () => {
    render(<ModeChangeBlock block={{ type: "mode_change", mode: "plan" }} t={t} />);
    expect(screen.getByText(/plan/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run src/components/__tests__/SessionEventBlocks.test.tsx`
Expected: FAIL（`Cannot find module '../SessionEventBlocks'`）。

- [ ] **Step 3: 写实现**

新增 `src/components/SessionEventBlocks.tsx`：

```tsx
import { AlertTriangle, GitBranch, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "../i18n";
import type { MessageBlock } from "../types";
import { Badge } from "./ui/badge";

/** 渲染 hook 触发块：命令列表 + 错误高亮 + 拦截标记 */
export function HookBlock({
  block,
  t,
}: {
  block: Extract<MessageBlock, { type: "hook" }>;
  t: (k: TranslationKey) => string;
}) {
  const hasError = block.errors.length > 0 || block.prevented_continuation;
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        hasError ? "border-destructive/50 bg-destructive/5" : "border-border bg-muted/40",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        <Webhook className="size-3.5" />
        <span>{t("history.hookEvent")}</span>
        {block.prevented_continuation && (
          <Badge variant="destructive" className="ml-1">
            {t("history.hookPrevented")}
          </Badge>
        )}
      </div>
      <ul className="space-y-0.5">
        {block.hooks.map((h, i) => (
          <li key={`${h.command}-${i}`} className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs">{h.command}</span>
            {h.duration_ms != null && (
              <span className="shrink-0 text-xs text-muted-foreground">{h.duration_ms} ms</span>
            )}
          </li>
        ))}
      </ul>
      {block.errors.map((e, i) => (
        <div key={`err-${i}`} className="mt-1 flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>{e}</span>
        </div>
      ))}
    </div>
  );
}

/** 渲染模式切换块 */
export function ModeChangeBlock({
  block,
  t,
}: {
  block: Extract<MessageBlock, { type: "mode_change" }>;
  t: (k: TranslationKey) => string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <GitBranch className="size-3.5" />
      <span>
        {t("history.modeChange")}: <span className="font-medium">{block.mode}</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 4: 加 i18n key**

在 `src/i18n.ts` 的 `zh` 与 `en` 文案表中各加（沿用现有 `history.*` 命名）：

```ts
// zh
"history.hookEvent": "Hook 触发",
"history.hookPrevented": "已拦截继续",
"history.modeChange": "模式切换",
// en
"history.hookEvent": "Hook fired",
"history.hookPrevented": "Continuation blocked",
"history.modeChange": "Mode change",
```

- [ ] **Step 5: 接入 `MessageBlocks` switch**

在 `src/components/SessionDetailDrawer.tsx` 顶部 import：

```tsx
import { HookBlock, ModeChangeBlock } from "./SessionEventBlocks";
```

在 `MessageBlocks`（`src-tauri` 无关，`SessionDetailDrawer.tsx:609` 起）的 block 渲染 switch 中，为新 `type` 增加分支（与现有 `case "plan"` 等并列）：

```tsx
        if (block.type === "hook") {
          return <HookBlock key={blockKey} block={block} t={t} />;
        }
        if (block.type === "mode_change") {
          return <ModeChangeBlock key={blockKey} block={block} t={t} />;
        }
```

> 实现时按该文件现有 block 分发写法（`block.type === ...` 或 `switch`）对齐；`blockKey` 沿用现有循环里的 key 变量名。

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm exec vitest run src/components/__tests__/SessionEventBlocks.test.tsx && make build-frontend`
Expected: 测试 PASS，前端编译通过。

- [ ] **Step 7: 提交**

```bash
git add src/components/SessionEventBlocks.tsx src/components/__tests__/SessionEventBlocks.test.tsx src/components/SessionDetailDrawer.tsx src/i18n.ts
git commit -m "feat(history): 渲染 hook 与 mode 切换事件块"
```

---

### Task 6: 前端会话 KPI 头部（复用 get_session_usage_detail）

**Files:**
- Create: `src/components/SessionKpiBar.tsx`
- Modify: `src/components/SessionDetailDrawer.tsx:843-852`（详情加载处并发拉取 usage detail）、`:910-1026`（SheetHeader 区渲染 KPI）
- Test: `src/components/__tests__/SessionKpiBar.test.tsx`

**Interfaces:**
- Consumes: `AppTypes.SessionUsageDetail`（经 `ipc.getSessionUsageDetail(sessionId)`）、`SessionDetail`（用于统计 hook 错误数）。
- Produces: `export function SessionKpiBar(props: { usage: SessionUsageDetail | null; hookErrorCount: number; t: (k: TranslationKey) => string })`。

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TranslationKey } from "../../i18n";
import type { SessionUsageDetail } from "../../types";
import { SessionKpiBar } from "../SessionKpiBar";

const t = (k: TranslationKey) => k as string;

const usage = {
  session: {
    session_id: "s1",
    project_path: "/p",
    project_dir: "p",
    started_at_ms: 1_000,
    last_active_ms: 61_000,
    messages: 4,
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    cost: 0.1234,
    models: ["claude-opus-4-8"],
  },
  messages: [],
} as unknown as SessionUsageDetail;

describe("SessionKpiBar", () => {
  it("展示成本、token、hook 错误数", () => {
    render(<SessionKpiBar usage={usage} hookErrorCount={2} t={t} />);
    expect(screen.getByText(/\$0\.12/)).toBeInTheDocument();
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it("usage 为 null 时不崩溃", () => {
    render(<SessionKpiBar usage={null} hookErrorCount={0} t={t} />);
    expect(screen.getByText(/history\.kpiCost/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run src/components/__tests__/SessionKpiBar.test.tsx`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现**

新增 `src/components/SessionKpiBar.tsx`（复用 `usage/format` 的 `formatCost` / `formatTokens`）：

```tsx
import { Clock3, Coins, Hash, ShieldAlert } from "lucide-react";
import type { TranslationKey } from "../i18n";
import type { SessionUsageDetail } from "../types";
import { formatCost, formatTokens } from "./usage/format";

/** 把毫秒时长格式化为 mm:ss / h m */
function formatElapsed(ms: number): string {
  if (ms <= 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

/** 会话级 KPI 条：成本 / Token / 时长 / hook 错误数。usage 来自 get_session_usage_detail */
export function SessionKpiBar({
  usage,
  hookErrorCount,
  t,
}: {
  usage: SessionUsageDetail | null;
  hookErrorCount: number;
  t: (k: TranslationKey) => string;
}) {
  const s = usage?.session;
  const tokens = s ? s.input_tokens + s.output_tokens : 0;
  const elapsed = s ? formatElapsed(s.last_active_ms - s.started_at_ms) : "—";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <Kpi icon={<Coins className="size-3.5" />} label={t("history.kpiCost")} value={s ? formatCost(s.cost) : "—"} />
      <Kpi icon={<Hash className="size-3.5" />} label={t("history.kpiTokens")} value={s ? formatTokens(tokens) : "—"} />
      <Kpi icon={<Clock3 className="size-3.5" />} label={t("history.kpiDuration")} value={elapsed} />
      <Kpi
        icon={<ShieldAlert className="size-3.5" />}
        label={t("history.kpiHookErrors")}
        value={String(hookErrorCount)}
      />
    </div>
  );
}
```

- [ ] **Step 4: 加 i18n key**

`src/i18n.ts` 加：

```ts
// zh
"history.kpiCost": "成本",
"history.kpiTokens": "Token",
"history.kpiDuration": "时长",
"history.kpiHookErrors": "Hook 错误",
// en
"history.kpiCost": "Cost",
"history.kpiTokens": "Tokens",
"history.kpiDuration": "Duration",
"history.kpiHookErrors": "Hook errors",
```

- [ ] **Step 5: 在抽屉里并发拉取 usage 并渲染**

在 `SessionDetailDrawer.tsx` 加载详情处（`src/components/SessionDetailDrawer.tsx:847` `.getSessionDetail(...)` 附近）增加并发拉取（usage 失败不阻断详情，置 null）：

```tsx
  const [usageDetail, setUsageDetail] = useState<SessionUsageDetail | null>(null);
  // ... 在拉取 getSessionDetail 的同一 effect 内追加：
  ipc
    .getSessionUsageDetail(sessionId)
    .then(setUsageDetail)
    .catch(() => setUsageDetail(null));
```

在 `SheetHeader`（`:910`）内、标题下方插入 KPI 条；`hookErrorCount` 由 `messages` 统计：

```tsx
const hookErrorCount = useMemo(
  () =>
    messages.reduce(
      (acc, m) =>
        acc +
        m.blocks.filter(
          (b) => b.type === "hook" && (b.errors.length > 0 || b.prevented_continuation),
        ).length,
      0,
    ),
  [messages],
);
// SheetHeader 内：
<SessionKpiBar usage={usageDetail} hookErrorCount={hookErrorCount} t={t} />
```

import 顶部补：`import { SessionKpiBar } from "./SessionKpiBar";` 与 `type SessionUsageDetail`（并入现有 `from "../types"` 的 import）。

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm exec vitest run src/components/__tests__/SessionKpiBar.test.tsx && make build-frontend`
Expected: 测试 PASS，编译通过。

- [ ] **Step 7: 提交**

```bash
git add src/components/SessionKpiBar.tsx src/components/__tests__/SessionKpiBar.test.tsx src/components/SessionDetailDrawer.tsx src/i18n.ts
git commit -m "feat(history): 会话详情头部展示成本/Token/时长/hook 错误 KPI"
```

---

### Task 7: 前端 subagent 侧链可折叠子时间线

**Files:**
- Create: `src/components/SessionSubagents.tsx`
- Modify: `src/components/SessionDetailDrawer.tsx`（详情区底部渲染 subagents）
- Modify: `src/i18n.ts`
- Test: `src/components/__tests__/SessionSubagents.test.tsx`

**Interfaces:**
- Consumes: `SubagentChain[]`、`MessageBlocks` 渲染（复用抽屉内的块渲染——通过 props 传入一个 `renderBlocks` 回调，避免循环依赖）。
- Produces: `export function SessionSubagents(props: { subagents: SubagentChain[]; renderBlocks: (blocks: MessageBlock[]) => ReactNode; t: (k: TranslationKey) => string })`。

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TranslationKey } from "../../i18n";
import type { SubagentChain } from "../../types";
import { SessionSubagents } from "../SessionSubagents";

const t = (k: TranslationKey) => k as string;

const chains: SubagentChain[] = [
  {
    agent_id: "a1",
    slug: "explore",
    messages: [{ role: "assistant", blocks: [{ type: "text", text: "sub answer" }] }],
  },
];

describe("SessionSubagents", () => {
  it("展示侧链 slug 与子消息", () => {
    render(
      <SessionSubagents
        subagents={chains}
        renderBlocks={(blocks) => <>{blocks.map((b, i) => (b.type === "text" ? <span key={i}>{b.text}</span> : null))}</>}
        t={t}
      />,
    );
    expect(screen.getByText(/explore/)).toBeInTheDocument();
    expect(screen.getByText(/sub answer/)).toBeInTheDocument();
  });

  it("空数组渲染为空", () => {
    const { container } = render(<SessionSubagents subagents={[]} renderBlocks={() => null} t={t} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run src/components/__tests__/SessionSubagents.test.tsx`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现**

新增 `src/components/SessionSubagents.tsx`：

```tsx
import { Bot } from "lucide-react";
import type { ReactNode } from "react";
import type { TranslationKey } from "../i18n";
import type { MessageBlock, SubagentChain } from "../types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

/** 渲染所有 subagent 侧链为可折叠子时间线 */
export function SessionSubagents({
  subagents,
  renderBlocks,
  t,
}: {
  subagents: SubagentChain[];
  renderBlocks: (blocks: MessageBlock[]) => ReactNode;
  t: (k: TranslationKey) => string;
}) {
  if (subagents.length === 0) return null;
  return (
    <div className="mt-4 space-y-2 border-t pt-3">
      <div className="text-xs font-medium text-muted-foreground">
        {t("history.subagents")} ({subagents.length})
      </div>
      {subagents.map((chain) => (
        <Collapsible key={chain.agent_id} className="rounded-md border bg-muted/30">
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-3 py-2 text-sm">
            <Bot className="size-3.5 text-muted-foreground" />
            <span className="font-medium">{chain.slug ?? t("history.subagentUnnamed")}</span>
            <span className="text-xs text-muted-foreground">
              · {chain.messages.length} {t("history.subagentMessages")}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 px-3 pb-3">
            {chain.messages.map((m, i) => (
              <div key={i} className="border-l-2 border-border pl-3">
                {renderBlocks(m.blocks)}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 加 i18n key**

```ts
// zh
"history.subagents": "Subagent 侧链",
"history.subagentUnnamed": "未命名 subagent",
"history.subagentMessages": "条消息",
// en
"history.subagents": "Subagent chains",
"history.subagentUnnamed": "Unnamed subagent",
"history.subagentMessages": "messages",
```

- [ ] **Step 5: 在抽屉详情区底部渲染**

在 `SessionDetailDrawer.tsx` 的消息列表渲染之后（`messages.map(...)` 闭合后），插入：

```tsx
<SessionSubagents
  subagents={detail?.subagents ?? []}
  renderBlocks={(blocks) => <MessageBlocks blocks={blocks} t={t} />}
  t={t}
/>
```

import 顶部补：`import { SessionSubagents } from "./SessionSubagents";`。`detail` 沿用抽屉里持有完整 `SessionDetail` 的 state 变量名（实现时对齐现有变量；若当前只存 `messages`，则同时保留 `subagents` state）。

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm exec vitest run src/components/__tests__/SessionSubagents.test.tsx && make build-frontend`
Expected: 测试 PASS，编译通过。

- [ ] **Step 7: 提交**

```bash
git add src/components/SessionSubagents.tsx src/components/__tests__/SessionSubagents.test.tsx src/components/SessionDetailDrawer.tsx src/i18n.ts
git commit -m "feat(history): subagent 侧链可折叠子时间线"
```

---

### Task 8: Usage / Projects 跳转到历史会话

**Files:**
- Modify: `src/App.tsx:84-93`（扩展 `historyProjectRequest` 载荷加可选 `sessionId`）、`:217-234`（设置 request 处）
- Modify: `src/components/HistoryPage.tsx`（消费 request 的 `sessionId`，打开对应会话详情）
- Modify: `src/components/usage/`（Usage 会话行加「在历史中打开」动作）、`src/components/ProjectDetailPanel.tsx`（同）
- Modify: `src/i18n.ts`
- Test: `src/components/__tests__/HistoryPage.openSession.test.ts`（纯逻辑：request → 选中 session 的映射 helper）

**Interfaces:**
- Consumes: 现有 `historyProjectRequest: { project: string; requestId: number }`。
- Produces: 扩展为 `{ project: string; sessionId?: string; requestId: number }`；`HistoryPage` 收到带 `sessionId` 的 request 时自动选中并打开该会话。

- [ ] **Step 1: 写失败测试**

把 request→选中 session 的纯逻辑抽成 helper 并测试。新建 `src/components/__tests__/HistoryPage.openSession.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { resolveRequestedSession } from "../history-utils";

describe("resolveRequestedSession", () => {
  it("带 sessionId 时返回该 session", () => {
    expect(
      resolveRequestedSession({ project: "/p", sessionId: "s9", requestId: 1 }),
    ).toEqual({ project: "/p", sessionId: "s9" });
  });

  it("无 sessionId 时只返回 project", () => {
    expect(resolveRequestedSession({ project: "/p", requestId: 1 })).toEqual({
      project: "/p",
      sessionId: null,
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run src/components/__tests__/HistoryPage.openSession.test.ts`
Expected: FAIL（`resolveRequestedSession` 不存在）。

- [ ] **Step 3: 写 helper**

在 `src/components/history-utils.ts`（历史页工具，history-stats-usage rule 已列其为先读文件）追加：

```ts
/** 历史页跨页请求载荷 */
export interface HistoryProjectRequest {
  project: string;
  sessionId?: string;
  requestId: number;
}

/** 从跨页请求解析要打开的项目与会话（无 sessionId 时 sessionId 为 null） */
export function resolveRequestedSession(
  req: HistoryProjectRequest,
): { project: string; sessionId: string | null } {
  return { project: req.project, sessionId: req.sessionId ?? null };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run src/components/__tests__/HistoryPage.openSession.test.ts`
Expected: PASS。

- [ ] **Step 5: 扩展 App.tsx 的 request 类型并接线**

`src/App.tsx:84` 把 `historyProjectRequest` 的 state 类型改为带可选 `sessionId`：

```tsx
  const [historyProjectRequest, setHistoryProjectRequest] = useState<{
    project: string;
    sessionId?: string;
    requestId: number;
  } | null>(null);
```

新增一个供子页调用的导航回调（与现有 `onOpenProjectHistory` 并列），携带 `sessionId`：

```tsx
  const openSessionInHistory = useCallback((project: string, sessionId: string) => {
    historyProjectRequestIdRef.current += 1;
    setHistoryProjectRequest({
      project,
      sessionId,
      requestId: historyProjectRequestIdRef.current,
    });
    setActiveTab("history");
  }, []);
```

把 `openSessionInHistory` 作为 prop 传给 `UsagePage` 与 `ProjectsPage`（沿用它们现有接收 `onOpenProjectHistory` 的方式）。

- [ ] **Step 6: HistoryPage 消费 sessionId**

`src/components/HistoryPage.tsx` 在处理 `projectRequest` 的 effect 里，用 `resolveRequestedSession` 取出 `sessionId`，非空时把它写入现有 `session` URL 查询参数（history-stats-usage rule：历史页用 `project/q/session` 同步状态），触发会话详情打开：

```tsx
import { resolveRequestedSession } from "./history-utils";
// effect 内：
const { project, sessionId } = resolveRequestedSession(projectRequest);
setProjectParam(project);
if (sessionId) setSessionParam(sessionId);
```

> `setProjectParam` / `setSessionParam` 对齐 `HistoryPage` 现有 URL 状态写入函数名（来自 `useUrlState`）。

- [ ] **Step 7: 源页加动作**

在 Usage 会话行（`src/components/usage/` 下展示 session 的组件）与 `ProjectDetailPanel.tsx` 最近会话处，增加按钮调用 `props.openSessionInHistory(projectPath, sessionId)`，文案 `t("history.openSession")`。`src/i18n.ts` 加：

```ts
// zh
"history.openSession": "在历史中打开",
// en
"history.openSession": "Open in history",
```

- [ ] **Step 8: 验证**

Run: `pnpm exec vitest run src/components/__tests__/HistoryPage.openSession.test.ts && make build-frontend && make lint-frontend`
Expected: 测试 PASS，编译与 lint 通过。

- [ ] **Step 9: 提交**

```bash
git add src/App.tsx src/components/HistoryPage.tsx src/components/history-utils.ts src/components/__tests__/HistoryPage.openSession.test.ts src/components/usage src/components/ProjectDetailPanel.tsx src/i18n.ts
git commit -m "feat(history): 支持从 Usage/Projects 跳转打开指定会话"
```

---

### Task 9: 全量验证与规则同步

**Files:**
- Modify: `.claude/rules/history-stats-usage.md`（补充会话详情新增 hook/mode/subagent 块与 KPI 的说明）

- [ ] **Step 1: 跑后端契约与测试**

Run: `make fmt-rust-check && make check && make lint-rust && make test-rust && make bindings-check`
Expected: 全部通过。

- [ ] **Step 2: 跑前端**

Run: `make lint-frontend && make build-frontend && make test-frontend`
Expected: 全部通过。

- [ ] **Step 3: 更新规则**

在 `.claude/rules/history-stats-usage.md` 的「历史页」小节，把「会话详情解析在后端，保留对 command、system、thinking、tool_use、tool_result、image、plan 等块类型的兼容」一行扩充 `hook`、`mode_change` 块类型，并新增一行说明：会话详情头部 KPI 复用 `get_session_usage_detail`（不在 `history.rs` 重复成本逻辑），subagent 侧链按 `agentId` 聚合进 `SessionDetail.subagents`。

- [ ] **Step 4: whitespace 检查并提交**

Run: `git diff --check`

```bash
git add .claude/rules/history-stats-usage.md
git commit -m "docs(rules): 补充会话详情 hook/mode/subagent 与 KPI 说明"
```

---

## Self-Review

**Spec coverage：**
- 深度回放（hook/mode/subagent/逐步成本）→ Task 1/2/3/6/7 ✅
- KPI 头部（成本/token/时长/hook 错误数）→ Task 6 ✅
- 跳转（Usage/Projects → 历史会话）→ Task 8 ✅
- 合入现有历史、不新增顶级页 → 全程在 `HistoryPage`/`SessionDetailDrawer` ✅
- 测试（Rust 解析单测 + 前端 vitest）→ 每个 Task 均含 ✅
- **对 spec 的两处实现级修正（已在计划开头声明）**：①成本/KPI 复用 `get_session_usage_detail` 而非在 history.rs 重抽（DRY）；②tool durationMs / 归因不可靠 → v1 聚焦 hook/mode/subagent + 复用成本，归因暂不做（YAGNI）。这两处缩小了后端面，不减损用户可见价值。

**Placeholder 扫描：** 无 TBD/TODO；每个改码步骤均含具体代码。少数前端集成步骤标注「对齐现有变量/函数名」是因为 `SessionDetailDrawer.tsx`（1075 行）内部循环变量名需以实际代码为准，已给出精确行锚点与插入位置，非占位。

**类型一致性：** `MessageBlock::Hook { hooks: Vec<HookCall>, errors, prevented_continuation, stop_reason }` 在 Task 1 定义、Task 4 同步 TS、Task 5/6 消费，字段名一致；`SubagentChain { agent_id, slug, messages }` 在 Task 3 定义、Task 4 同步、Task 7 消费一致；`HistoryProjectRequest { project, sessionId?, requestId }` 在 Task 8 内部自洽。
