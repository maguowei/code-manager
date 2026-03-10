# Session 对话详情抽屉 — 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在历史页面的 session header 行内添加查看按钮，点击后在右侧抽屉中展示该 session 的完整对话记录（user + assistant + thinking + tool_use）。

**Architecture:** 后端（Rust）新增 `get_session_detail` 命令，读取 `~/.claude/projects/<encoded-path>/<sessionId>.jsonl` 文件，过滤并结构化解析 user/assistant 消息。前端新增 `SessionDetailDrawer` 组件，通过抽屉面板渲染对话流。

**Tech Stack:** Tauri 2.0 + Rust (serde_json) + React 19 + TypeScript + CSS

---

### Task 1: 后端数据结构与命令

**Files:**
- Modify: `src-tauri/src/history.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: 在 history.rs 中添加数据结构和 get_session_detail 命令**

在 `history.rs` 文件末尾追加以下代码：

```rust
/// 对话消息内容块
#[derive(Serialize)]
#[serde(tag = "type")]
pub enum MessageBlock {
    /// 文本内容
    #[serde(rename = "text")]
    Text { text: String },
    /// 思考过程
    #[serde(rename = "thinking")]
    Thinking { thinking: String },
    /// 工具调用
    #[serde(rename = "tool_use")]
    ToolUse { name: String, input_preview: String },
    /// 工具返回结果
    #[serde(rename = "tool_result")]
    ToolResult { content_preview: String },
}

/// 一条对话消息
#[derive(Serialize)]
pub struct SessionMessage {
    pub role: String,
    pub blocks: Vec<MessageBlock>,
    pub timestamp: Option<String>,
}

/// 会话详情返回结果
#[derive(Serialize)]
pub struct SessionDetail {
    pub session_id: String,
    pub project: String,
    pub messages: Vec<SessionMessage>,
}

/// 截取字符串前 max_len 个字符，超出时追加 "..."
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len { s.to_string() } else { format!("{}...", &s[..max_len]) }
}

/// 将 serde_json::Value 的 content 字段解析为 MessageBlock 列表
fn parse_content_blocks(content: &serde_json::Value) -> Vec<MessageBlock> {
    let mut blocks = Vec::new();
    match content {
        serde_json::Value::String(s) => {
            if !s.is_empty() {
                blocks.push(MessageBlock::Text { text: s.clone() });
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                let block_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match block_type {
                    "text" => {
                        if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                blocks.push(MessageBlock::Text { text: text.to_string() });
                            }
                        }
                    }
                    "thinking" => {
                        if let Some(text) = item.get("thinking").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                blocks.push(MessageBlock::Thinking { thinking: text.to_string() });
                            }
                        }
                    }
                    "tool_use" => {
                        let name = item.get("name").and_then(|n| n.as_str()).unwrap_or("unknown").to_string();
                        let input_preview = item.get("input")
                            .map(|v| truncate(&v.to_string(), 200))
                            .unwrap_or_default();
                        blocks.push(MessageBlock::ToolUse { name, input_preview });
                    }
                    "tool_result" => {
                        let content_preview = item.get("content")
                            .map(|v| {
                                if let Some(s) = v.as_str() {
                                    truncate(s, 200)
                                } else {
                                    truncate(&v.to_string(), 200)
                                }
                            })
                            .unwrap_or_default();
                        blocks.push(MessageBlock::ToolResult { content_preview });
                    }
                    _ => {
                        // 忽略未知类型
                    }
                }
            }
        }
        _ => {}
    }
    blocks
}

/// 获取指定 session 的完整对话记录
#[tauri::command]
pub fn get_session_detail(project: &str, session_id: &str) -> Result<SessionDetail, String> {
    // 编码项目路径：/ → -
    let encoded = project.replace('/', "-");
    let session_file = crate::utils::home_dir_or_fallback()
        .join(".claude")
        .join("projects")
        .join(&encoded)
        .join(format!("{}.jsonl", session_id));

    if !session_file.exists() {
        return Ok(SessionDetail {
            session_id: session_id.to_string(),
            project: project.to_string(),
            messages: Vec::new(),
        });
    }

    let content = fs::read_to_string(&session_file)
        .map_err(|e| format!("读取会话文件失败: {}", e))?;

    let mut messages = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }
        let record: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // 只处理 user 和 assistant 类型
        let msg_type = record.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if msg_type != "user" && msg_type != "assistant" { continue; }

        // 跳过 sidechain 消息
        if record.get("isSidechain").and_then(|v| v.as_bool()).unwrap_or(false) { continue; }

        let message = match record.get("message") {
            Some(m) => m,
            None => continue,
        };

        let role = message.get("role").and_then(|r| r.as_str()).unwrap_or(msg_type).to_string();
        let content_val = message.get("content").cloned().unwrap_or(serde_json::Value::Null);
        let blocks = parse_content_blocks(&content_val);

        // 跳过无内容的消息
        if blocks.is_empty() { continue; }

        let timestamp = record.get("timestamp").and_then(|t| t.as_str()).map(|s| s.to_string());

        messages.push(SessionMessage { role, blocks, timestamp });
    }

    Ok(SessionDetail {
        session_id: session_id.to_string(),
        project: project.to_string(),
        messages,
    })
}
```

**Step 2: 在 lib.rs 中注册新命令**

在 `src-tauri/src/lib.rs` 的 import 行添加 `get_session_detail`：

```rust
use history::{get_history, get_history_if_changed, get_session_detail};
```

在 `generate_handler![]` 宏中 `get_history_if_changed` 后面添加：

```rust
get_session_detail,
```

**Step 3: 验证编译**

Run: `cd src-tauri && cargo check`
Expected: 编译通过，无错误

**Step 4: 提交**

```bash
git add src-tauri/src/history.rs src-tauri/src/lib.rs
git commit -m "feat: 添加 get_session_detail 命令读取会话完整对话"
```

---

### Task 2: 前端类型定义

**Files:**
- Modify: `src/types.ts`

**Step 1: 在 types.ts 末尾添加新类型**

在文件末尾（`HistoryEntry` 接口之后）追加：

```typescript
// 对话消息内容块
export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; name: string; input_preview: string }
  | { type: "tool_result"; content_preview: string };

// 一条对话消息
export interface SessionMessage {
  role: "user" | "assistant";
  blocks: MessageBlock[];
  timestamp?: string;
}

// 会话详情
export interface SessionDetail {
  session_id: string;
  project: string;
  messages: SessionMessage[];
}
```

**Step 2: 提交**

```bash
git add src/types.ts
git commit -m "feat: 添加 SessionDetail 前端类型定义"
```

---

### Task 3: i18n 新增翻译 key

**Files:**
- Modify: `src/i18n.ts`

**Step 1: 在 zh 翻译字典的 history 区块末尾添加**

在 `"history.heatmapTooltip"` 行之后添加：

```typescript
"history.viewConversation": "查看对话",
"history.conversation": "对话详情",
"history.thinking": "思考过程",
"history.toolUse": "工具调用",
"history.toolResult": "返回结果",
```

**Step 2: 在 en 翻译字典的 history 区块末尾添加**

在 en 部分的 `"history.heatmapTooltip"` 行之后添加：

```typescript
"history.viewConversation": "View Conversation",
"history.conversation": "Conversation Detail",
"history.thinking": "Thinking",
"history.toolUse": "Tool Use",
"history.toolResult": "Result",
```

**Step 3: 提交**

```bash
git add src/i18n.ts
git commit -m "feat: 添加对话详情相关 i18n 翻译"
```

---

### Task 4: HistorySessionList 添加查看按钮

**Files:**
- Modify: `src/components/HistorySessionList.tsx`
- Modify: `src/components/HistoryPage.css`

**Step 1: 修改 HistorySessionList Props 接口**

在 `Props` 接口中添加回调：

```typescript
interface Props {
  groups: SessionGroup[];
  searchQuery: string;
  onViewDetail?: (sessionId: string) => void;
}
```

更新函数签名：

```typescript
function HistorySessionList({ groups, searchQuery, onViewDetail }: Props) {
```

**Step 2: 在 session header 行内添加查看按钮**

在 `<span className="session-time">` 之后，`</div>`（header 结束标签）之前添加按钮：

```tsx
{onViewDetail && (
  <button
    className="session-detail-btn"
    title={t("history.viewConversation")}
    onClick={(e) => {
      e.stopPropagation();
      onViewDetail(session.sessionId);
    }}
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h12v8H4l-2 2V3z" />
    </svg>
  </button>
)}
```

**Step 3: 在 HistoryPage.css 中添加按钮样式**

在文件末尾追加：

```css
/* 查看对话详情按钮 */
.session-detail-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.history-session-header:hover .session-detail-btn {
  opacity: 1;
}

.session-detail-btn:hover {
  background-color: var(--accent-blue-bg);
  color: var(--accent-blue);
}
```

**Step 4: 验证编译**

Run: `pnpm build`
Expected: 编译通过（此时 onViewDetail 为可选参数，不传也不报错）

**Step 5: 提交**

```bash
git add src/components/HistorySessionList.tsx src/components/HistoryPage.css
git commit -m "feat: 为 session header 添加查看对话详情按钮"
```

---

### Task 5: SessionDetailDrawer 组件

**Files:**
- Create: `src/components/SessionDetailDrawer.tsx`
- Create: `src/components/SessionDetailDrawer.css`

**Step 1: 创建 SessionDetailDrawer.css**

```css
/* 对话详情抽屉 */
.session-detail-drawer {
  position: fixed;
  top: 0;
  left: var(--sidebar-width);
  right: 0;
  bottom: 0;
  background-color: var(--bg-elevated);
  transform: translateX(100%);
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
  z-index: var(--z-index-drawer);
  display: flex;
  flex-direction: column;
}

.session-detail-drawer.open {
  transform: translateX(0);
}

/* 遮罩 */
.session-detail-overlay {
  position: fixed;
  top: 0;
  left: var(--sidebar-width);
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  opacity: 0;
  pointer-events: none;
  transition: opacity 300ms ease;
  z-index: var(--z-index-drawer-overlay);
}

.session-detail-overlay.visible {
  opacity: 1;
  pointer-events: auto;
}

/* 消息列表 */
.session-detail-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* 单条消息 */
.session-msg {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: 85%;
}

.session-msg.user {
  align-self: flex-end;
}

.session-msg.assistant {
  align-self: flex-start;
}

/* 角色标签 */
.session-msg-role {
  font-size: var(--font-xs);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
}

/* 消息气泡 */
.session-msg-bubble {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  font-size: var(--font-sm);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.session-msg.user .session-msg-bubble {
  background-color: var(--accent-blue);
  color: #fff;
}

.session-msg.assistant .session-msg-bubble {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
}

/* 内容块 */
.msg-block + .msg-block {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border-muted);
}

/* thinking 折叠区 */
.msg-thinking-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 2px 6px;
  font-size: var(--font-xs);
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
  font-style: italic;
}

.msg-thinking-toggle:hover {
  background-color: var(--bg-hover);
  color: var(--text-secondary);
}

.msg-thinking-content {
  margin-top: var(--space-1);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-xs);
  color: var(--text-tertiary);
  font-style: italic;
  background-color: var(--bg-primary);
  border-radius: var(--radius-sm);
  white-space: pre-wrap;
  word-break: break-word;
}

/* tool_use 块 */
.msg-tool-use {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-xs);
  color: var(--text-secondary);
  padding: 4px 8px;
  background-color: var(--bg-primary);
  border-radius: var(--radius-sm);
}

.msg-tool-name {
  font-weight: 600;
  color: var(--accent-purple);
}

.msg-tool-preview {
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
}

/* tool_result 块 */
.msg-tool-result {
  font-size: var(--font-xs);
  color: var(--text-tertiary);
  padding: 4px 8px;
  background-color: var(--bg-primary);
  border-radius: var(--radius-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 加载状态 */
.session-detail-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: var(--font-md);
}

/* 空状态 */
.session-detail-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: var(--font-md);
}

/* 最小窗口适配 */
@media (max-width: 700px) {
  .session-detail-drawer,
  .session-detail-overlay {
    left: var(--sidebar-width-small);
  }
}
```

**Step 2: 创建 SessionDetailDrawer.tsx**

```tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionDetail, MessageBlock, isTauri } from "../types";
import { useI18n } from "../i18n";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useToast } from "../hooks/useToast";
import "./SessionDetailDrawer.css";

interface Props {
  project: string;
  sessionId: string;
  onClose: () => void;
}

/** 渲染单个 thinking 块（可折叠） */
function ThinkingBlock({ thinking, label }: { thinking: string; label: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="msg-block">
      <button className="msg-thinking-toggle" onClick={() => setExpanded(!expanded)}>
        {expanded ? "▼" : "▶"} {label}
      </button>
      {expanded && <div className="msg-thinking-content">{thinking}</div>}
    </div>
  );
}

/** 渲染单个内容块 */
function BlockRenderer({ block, t }: { block: MessageBlock; t: (key: string) => string }) {
  switch (block.type) {
    case "text":
      return <div className="msg-block">{block.text}</div>;
    case "thinking":
      return <ThinkingBlock thinking={block.thinking} label={t("history.thinking")} />;
    case "tool_use":
      return (
        <div className="msg-block msg-tool-use">
          <span>🛠</span>
          <span className="msg-tool-name">{block.name}</span>
          {block.input_preview && (
            <span className="msg-tool-preview">{block.input_preview}</span>
          )}
        </div>
      );
    case "tool_result":
      return (
        <div className="msg-block msg-tool-result">
          ← {block.content_preview || "..."}
        </div>
      );
    default:
      return null;
  }
}

function SessionDetailDrawer({ project, sessionId, onClose }: Props) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const handleClose = useCallback(() => onClose(), [onClose]);
  useEscapeKey(handleClose);

  useEffect(() => {
    if (!isTauri()) { setLoading(false); return; }
    setLoading(true);
    invoke<SessionDetail>("get_session_detail", { project, sessionId })
      .then(setDetail)
      .catch(() => showToast(t("history.noData"), "error"))
      .finally(() => setLoading(false));
  }, [project, sessionId, showToast, t]);

  return (
    <>
      <div className="session-detail-overlay visible" onClick={handleClose} />
      <div className="session-detail-drawer open">
        {/* 顶部标题栏 - 复用 editor-header 样式 */}
        <div className="editor-header">
          <button className="editor-back-btn" onClick={handleClose} title={t("common.close")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 4L4 12M4 4l8 8" />
            </svg>
          </button>
          <h2>{t("history.conversation")} — {sessionId.slice(0, 8)}</h2>
        </div>

        {/* 内容区 */}
        {loading ? (
          <div className="session-detail-loading">{t("loading")}</div>
        ) : !detail || detail.messages.length === 0 ? (
          <div className="session-detail-empty">{t("history.noData")}</div>
        ) : (
          <div className="session-detail-messages">
            {detail.messages.map((msg, i) => (
              <div key={i} className={`session-msg ${msg.role}`}>
                <span className="session-msg-role">{msg.role}</span>
                <div className="session-msg-bubble">
                  {msg.blocks.map((block, j) => (
                    <BlockRenderer key={j} block={block} t={t} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default SessionDetailDrawer;
```

**Step 3: 验证编译**

Run: `pnpm build`
Expected: 编译通过（组件已创建，但尚未在任何地方引用，tree-shake 不会报错）

**Step 4: 提交**

```bash
git add src/components/SessionDetailDrawer.tsx src/components/SessionDetailDrawer.css
git commit -m "feat: 添加 SessionDetailDrawer 对话详情抽屉组件"
```

---

### Task 6: HistoryPage 集成抽屉

**Files:**
- Modify: `src/components/HistoryPage.tsx`

**Step 1: 添加 import 和状态**

在 HistoryPage.tsx 顶部 import 区添加：

```typescript
import SessionDetailDrawer from "./SessionDetailDrawer";
```

在 `HistoryPage` 函数内、`mtimeRef` 之后添加状态：

```typescript
const [viewingSession, setViewingSession] = useState<{ project: string; sessionId: string } | null>(null);
```

**Step 2: 添加回调函数**

在 `pollHistory` 之后添加：

```typescript
const handleViewDetail = useCallback((sessionId: string) => {
  const project = selectedProject || allEntries.find(e => e.sessionId === sessionId)?.project || "";
  setViewingSession({ project, sessionId });
}, [selectedProject, allEntries]);
```

**Step 3: 传递回调给 HistorySessionList**

将 `<HistorySessionList>` 的 props 更新为：

```tsx
<HistorySessionList
  groups={sessionGroups}
  searchQuery={searchQuery}
  onViewDetail={handleViewDetail}
/>
```

**Step 4: 渲染抽屉组件**

在 `return` 的最外层 `<div className="history-page">` 内末尾（`</div>` 之前）添加：

```tsx
{viewingSession && (
  <SessionDetailDrawer
    project={viewingSession.project}
    sessionId={viewingSession.sessionId}
    onClose={() => setViewingSession(null)}
  />
)}
```

**Step 5: 验证编译**

Run: `pnpm build`
Expected: 编译通过

**Step 6: 提交**

```bash
git add src/components/HistoryPage.tsx
git commit -m "feat: 集成对话详情抽屉到历史页面"
```

---

### Task 7: 端到端验证

**Step 1: 启动应用**

Run: `pnpm tauri dev`

**Step 2: 手动验证清单**

- [ ] 导航到历史页面，hover session 行时右侧出现聊天图标按钮
- [ ] 点击按钮后右侧抽屉滑出，显示完整对话（user 蓝色气泡 + assistant 深色气泡）
- [ ] thinking 块默认收起，点击可展开
- [ ] tool_use 显示工具名和参数摘要
- [ ] ESC 键或点击遮罩关闭抽屉
- [ ] 浅色模式下样式正常
- [ ] 暗色模式下文字可读
- [ ] 窗口小于 700px 时抽屉适配
- [ ] 不存在的 session 显示空状态

**Step 3: 最终提交（如有修复）**

```bash
git add -A
git commit -m "fix: 修复对话详情抽屉样式细节"
```
