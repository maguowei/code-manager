# Session 对话详情 UI 优化 — 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 优化对话详情抽屉的 UI 体验，解决原始 XML 标签暴露、视觉层次差、内容可读性差三大问题。

**Architecture:** Rust 后端扩展 MessageBlock 枚举并新增 XML 标签解析逻辑（parse_text_with_tags），前端新增 block 渲染组件（CommandBlock、SystemBlock、ToolCallCard），升级消息布局为 Chat UI 风格。

**Tech Stack:** Rust (regex crate) + React 19 + TypeScript + CSS

---

### Task 1: 添加 regex 依赖并扩展 MessageBlock 枚举

**Files:**
- Modify: `src-tauri/Cargo.toml:20-27` — 添加 regex 依赖
- Modify: `src-tauri/src/history.rs:53-69` — 扩展 MessageBlock 枚举

**Step 1: 在 Cargo.toml 添加 regex 依赖**

在 `[dependencies]` 末尾添加：

```toml
regex = "1"
```

**Step 2: 扩展 MessageBlock 枚举**

在 `src-tauri/src/history.rs` 中，将现有的 `MessageBlock` 枚举扩展，新增 `Command` 和 `System` 变体：

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
    /// 斜杠命令
    #[serde(rename = "command")]
    Command { name: String, args: Option<String> },
    /// 系统信息
    #[serde(rename = "system")]
    System { summary: String },
}
```

**Step 3: 验证编译通过**

Run: `cd /Users/maguowei/Work/AI/ai-manager/src-tauri && cargo check`
Expected: 编译成功，无错误

**Step 4: 提交**

```bash
git add src-tauri/Cargo.toml src-tauri/src/history.rs
git commit -m "feat: 扩展 MessageBlock 枚举，新增 command 和 system 类型"
```

---

### Task 2: 实现 XML 标签解析函数 parse_text_with_tags

**Files:**
- Modify: `src-tauri/src/history.rs` — 新增 `parse_text_with_tags` 函数

**Step 1: 编写 parse_text_with_tags 函数**

在 `truncate` 函数之后、`parse_content_blocks` 函数之前，添加新函数。

该函数接收一个文本字符串，解析其中的 XML 标签，返回 `Vec<MessageBlock>`：

```rust
use regex::Regex;
use once_cell::sync::Lazy;

/// 预编译的 XML 标签正则
static RE_COMMAND_NAME: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"<command-name>([\s\S]*?)</command-name>").unwrap()
});
static RE_COMMAND_ARGS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"<command-args>([\s\S]*?)</command-args>").unwrap()
});
static RE_SYSTEM_REMINDER: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"<system-reminder>([\s\S]*?)</system-reminder>").unwrap()
});
static RE_LOCAL_CAVEAT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"<local-command-caveat>[\s\S]*?</local-command-caveat>").unwrap()
});
static RE_COMMAND_MSG: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"<command-message>[\s\S]*?</command-message>").unwrap()
});
static RE_ANY_TAG: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"<[^>]+>").unwrap()
});

/// 解析文本中的 XML 标签，提取 command/system 信息，过滤噪音标签
fn parse_text_with_tags(text: &str) -> Vec<MessageBlock> {
    let mut blocks = Vec::new();

    // 1. 提取 command-name
    if let Some(cap) = RE_COMMAND_NAME.captures(text) {
        let name = cap[1].trim().to_string();
        let args = RE_COMMAND_ARGS.captures(text)
            .map(|c| c[1].trim().to_string())
            .filter(|s| !s.is_empty());
        blocks.push(MessageBlock::Command { name, args });
    }

    // 2. 提取 system-reminder（可能有多个）
    for cap in RE_SYSTEM_REMINDER.captures_iter(text) {
        let content = cap[1].trim();
        if !content.is_empty() {
            let summary = truncate(content, 80);
            blocks.push(MessageBlock::System { summary });
        }
    }

    // 3. 如果提取了 command 或 system，检查是否还有有意义的剩余文本
    if !blocks.is_empty() {
        let mut remaining = text.to_string();
        remaining = RE_COMMAND_NAME.replace_all(&remaining, "").to_string();
        remaining = RE_COMMAND_ARGS.replace_all(&remaining, "").to_string();
        remaining = RE_COMMAND_MSG.replace_all(&remaining, "").to_string();
        remaining = RE_SYSTEM_REMINDER.replace_all(&remaining, "").to_string();
        remaining = RE_LOCAL_CAVEAT.replace_all(&remaining, "").to_string();
        // 清除所有残留的未知标签
        remaining = RE_ANY_TAG.replace_all(&remaining, "").to_string();
        let remaining = remaining.trim();
        if !remaining.is_empty() {
            blocks.push(MessageBlock::Text { text: remaining.to_string() });
        }
        return blocks;
    }

    // 4. 没有匹配到结构化标签 — 检查是否只有噪音标签
    let mut cleaned = text.to_string();
    cleaned = RE_LOCAL_CAVEAT.replace_all(&cleaned, "").to_string();
    cleaned = RE_COMMAND_MSG.replace_all(&cleaned, "").to_string();
    let cleaned = cleaned.trim();

    if cleaned.is_empty() {
        // 全部是噪音，不生成 block
        return blocks;
    }

    // 5. 普通文本，无标签
    blocks.push(MessageBlock::Text { text: cleaned.to_string() });
    blocks
}
```

**Step 2: 在 parse_content_blocks 中集成**

修改 `parse_content_blocks` 函数中处理 `serde_json::Value::String` 和 `"text"` block 的分支，改为调用 `parse_text_with_tags`：

```rust
fn parse_content_blocks(content: &serde_json::Value) -> Vec<MessageBlock> {
    let mut blocks = Vec::new();
    match content {
        serde_json::Value::String(s) => {
            if !s.is_empty() {
                blocks.extend(parse_text_with_tags(s));
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                let block_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match block_type {
                    "text" => {
                        if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                blocks.extend(parse_text_with_tags(text));
                            }
                        }
                    }
                    // ... thinking / tool_use / tool_result 保持不变 ...
                    _ => {}
                }
            }
        }
        _ => {}
    }
    blocks
}
```

**Step 3: 验证编译通过**

Run: `cd /Users/maguowei/Work/AI/ai-manager/src-tauri && cargo check`
Expected: 编译成功

**Step 4: 运行 clippy 检查**

Run: `cd /Users/maguowei/Work/AI/ai-manager/src-tauri && cargo clippy`
Expected: 无 warning

**Step 5: 提交**

```bash
git add src-tauri/src/history.rs
git commit -m "feat: 实现 XML 标签解析函数 parse_text_with_tags"
```

---

### Task 3: 更新前端类型定义和 i18n

**Files:**
- Modify: `src/types.ts:142-146` — 扩展 MessageBlock 类型
- Modify: `src/i18n.ts` — 新增翻译条目

**Step 1: 扩展 TypeScript MessageBlock 类型**

在 `src/types.ts` 中，修改 `MessageBlock` 联合类型：

```typescript
// 对话消息内容块
export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; name: string; input_preview: string }
  | { type: "tool_result"; content_preview: string }
  | { type: "command"; name: string; args?: string }
  | { type: "system"; summary: string };
```

**Step 2: 添加 i18n 翻译**

在 `src/i18n.ts` 中文区块（zh）的 `history.toolResult` 之后添加：

```typescript
"history.command": "命令",
"history.system": "系统信息",
"history.toolInput": "输入参数",
```

在英文区块（en）对应位置添加：

```typescript
"history.command": "Command",
"history.system": "System",
"history.toolInput": "Input",
```

**Step 3: 验证 TypeScript 编译**

Run: `cd /Users/maguowei/Work/AI/ai-manager && npx tsc --noEmit`
Expected: 无类型错误

**Step 4: 提交**

```bash
git add src/types.ts src/i18n.ts
git commit -m "feat: 扩展前端 MessageBlock 类型，新增 command/system 翻译"
```

---

### Task 4: 重构 SessionDetailDrawer 组件 — 新 block 渲染

**Files:**
- Modify: `src/components/SessionDetailDrawer.tsx` — 新增 CommandBlock、SystemBlock、ToolCallCard 组件，重构 BlockRenderer

**Step 1: 新增 CommandBlock 组件**

在 `ThinkingBlock` 组件之后添加：

```tsx
/** 渲染斜杠命令块 */
function CommandBlock({ name, args }: { name: string; args?: string }) {
  return (
    <div className="msg-block msg-command">
      <span className="msg-command-prompt">&gt;</span>
      <span className="msg-command-name">{name}</span>
      {args && <span className="msg-command-args">{args}</span>}
    </div>
  );
}
```

**Step 2: 新增 SystemBlock 组件**

```tsx
/** 渲染系统信息块（可折叠） */
function SystemBlock({ summary, label }: { summary: string; label: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="msg-block msg-system">
      <button className="msg-system-toggle" onClick={() => setExpanded(!expanded)}>
        {expanded ? "▼" : "▶"} {label}
      </button>
      {expanded && <div className="msg-system-content">{summary}</div>}
    </div>
  );
}
```

**Step 3: 新增 ToolCallCard 组件（可折叠卡片）**

```tsx
/** 工具调用折叠卡片 — 合并 tool_use 和可选的 tool_result */
function ToolCallCard({
  name,
  inputPreview,
  resultPreview,
  inputLabel,
  resultLabel,
}: {
  name: string;
  inputPreview: string;
  resultPreview?: string;
  inputLabel: string;
  resultLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="msg-block msg-tool-card">
      <button className="msg-tool-card-header" onClick={() => setExpanded(!expanded)}>
        <span className="msg-tool-card-icon">&#x1f6e0;</span>
        <span className="msg-tool-card-name">{name}</span>
        <span className="msg-tool-card-arrow">{expanded ? "▼" : "▶"}</span>
      </button>
      {expanded && (
        <div className="msg-tool-card-body">
          {inputPreview && (
            <div className="msg-tool-card-section">
              <span className="msg-tool-card-label">{inputLabel}</span>
              <pre className="msg-tool-card-code">{inputPreview}</pre>
            </div>
          )}
          {resultPreview && (
            <div className="msg-tool-card-section">
              <span className="msg-tool-card-label">{resultLabel}</span>
              <pre className="msg-tool-card-code">{resultPreview}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 4: 重构 BlockRenderer 使用合并渲染逻辑**

将 `BlockRenderer` 删除，改为在消息渲染时对 blocks 数组做预处理：相邻的 `tool_use` + `tool_result` 合并为一个 `ToolCallCard`。

在 `SessionDetailDrawer` 组件内，替换消息渲染部分为：

```tsx
/** 将 blocks 列表中相邻的 tool_use + tool_result 合并 */
function renderBlocks(blocks: MessageBlock[], t: (key: string) => string) {
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    switch (block.type) {
      case "text":
        elements.push(<div key={i} className="msg-block">{block.text}</div>);
        break;
      case "thinking":
        elements.push(<ThinkingBlock key={i} thinking={block.thinking} label={t("history.thinking")} />);
        break;
      case "tool_use": {
        // 检查下一个 block 是否为对应的 tool_result
        const next = blocks[i + 1];
        const resultPreview = next && next.type === "tool_result" ? next.content_preview : undefined;
        elements.push(
          <ToolCallCard
            key={i}
            name={block.name}
            inputPreview={block.input_preview}
            resultPreview={resultPreview}
            inputLabel={t("history.toolInput")}
            resultLabel={t("history.toolResult")}
          />
        );
        if (resultPreview !== undefined) i++; // 跳过已合并的 tool_result
        break;
      }
      case "tool_result":
        // 未合并的独立 tool_result
        elements.push(
          <div key={i} className="msg-block msg-tool-result">
            ← {block.content_preview || "..."}
          </div>
        );
        break;
      case "command":
        elements.push(<CommandBlock key={i} name={block.name} args={block.args} />);
        break;
      case "system":
        elements.push(<SystemBlock key={i} summary={block.summary} label={t("history.system")} />);
        break;
    }
    i++;
  }
  return elements;
}
```

然后在 JSX 中替换 `msg.blocks.map(...)` 为 `renderBlocks(msg.blocks, t)`。

**Step 5: 验证 TypeScript 编译**

Run: `cd /Users/maguowei/Work/AI/ai-manager && npx tsc --noEmit`
Expected: 无类型错误

**Step 6: 提交**

```bash
git add src/components/SessionDetailDrawer.tsx
git commit -m "feat: 重构对话详情 block 渲染，新增命令/系统/工具卡片组件"
```

---

### Task 5: 升级消息布局 — 角色头像 + 呼吸感

**Files:**
- Modify: `src/components/SessionDetailDrawer.tsx` — 修改消息渲染 JSX，添加头像

**Step 1: 修改消息渲染结构**

将消息渲染部分改为带头像的布局：

```tsx
{detail.messages.map((msg, i) => (
  <div key={i} className={`session-msg ${msg.role}`}>
    <div className="session-msg-header">
      <span className={`session-msg-avatar ${msg.role}`}>
        {msg.role === "user" ? "U" : "A"}
      </span>
      <span className="session-msg-role">
        {msg.role === "user" ? "USER" : "ASSISTANT"}
      </span>
      {msg.timestamp && (
        <span className="session-msg-time">{msg.timestamp}</span>
      )}
    </div>
    <div className="session-msg-bubble">
      {renderBlocks(msg.blocks, t)}
    </div>
  </div>
))}
```

**Step 2: 验证编译**

Run: `cd /Users/maguowei/Work/AI/ai-manager && npx tsc --noEmit`
Expected: 无类型错误

**Step 3: 提交**

```bash
git add src/components/SessionDetailDrawer.tsx
git commit -m "feat: 消息布局添加角色头像和时间戳"
```

---

### Task 6: CSS 样式全面优化

**Files:**
- Modify: `src/components/SessionDetailDrawer.css` — 全面重写样式

**Step 1: 更新消息布局样式**

替换 `.session-msg`、`.session-msg-role`、`.session-msg-bubble` 相关样式，增加头像样式：

```css
/* 单条消息 */
.session-msg {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-width: 85%;
}

.session-msg.user {
  align-self: flex-end;
}

.session-msg.assistant {
  align-self: flex-start;
}

/* 消息头部：头像 + 角色 + 时间 */
.session-msg-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.session-msg-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.session-msg-avatar.user {
  background-color: var(--accent-blue);
  color: #fff;
}

.session-msg-avatar.assistant {
  background-color: var(--accent-purple);
  color: #fff;
}

/* 角色标签 */
.session-msg-role {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 时间戳 */
.session-msg-time {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: auto;
}
```

**Step 2: 更新消息列表间距**

```css
/* 消息列表 — 加大间距增加呼吸感 */
.session-detail-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
```

**Step 3: 新增 command block 样式**

```css
/* command 命令块 */
.msg-command {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background-color: var(--bg-primary);
  border-radius: var(--radius-sm);
  font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
  font-size: var(--font-xs);
}

.msg-command-prompt {
  color: var(--text-muted);
}

.msg-command-name {
  color: var(--accent-green);
  font-weight: 600;
}

.msg-command-args {
  color: var(--text-tertiary);
}
```

**Step 4: 新增 system block 样式**

```css
/* system 系统信息块 */
.msg-system {
  border-left: 2px solid var(--border-muted);
  padding-left: var(--space-2);
}

.msg-system-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 2px 6px;
  font-size: var(--font-xs);
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.msg-system-toggle:hover {
  background-color: var(--bg-hover);
  color: var(--text-secondary);
}

.msg-system-content {
  margin-top: var(--space-1);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-xs);
  color: var(--text-muted);
  background-color: var(--bg-primary);
  border-radius: var(--radius-sm);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}
```

**Step 5: 新增工具调用卡片样式**

```css
/* 工具调用折叠卡片 */
.msg-tool-card {
  border-radius: var(--radius-md);
  background-color: var(--bg-primary);
  border: 1px solid var(--border-muted);
  overflow: hidden;
}

.msg-tool-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--font-xs);
  color: var(--text-secondary);
  transition: background-color 0.15s ease;
}

.msg-tool-card-header:hover {
  background-color: var(--bg-hover);
}

.msg-tool-card-icon {
  font-size: 14px;
}

.msg-tool-card-name {
  font-weight: 600;
  color: var(--accent-purple);
}

.msg-tool-card-arrow {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-muted);
}

.msg-tool-card-body {
  border-top: 1px solid var(--border-muted);
  padding: var(--space-2) var(--space-3);
}

.msg-tool-card-section + .msg-tool-card-section {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border-muted);
}

.msg-tool-card-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-1);
}

.msg-tool-card-code {
  font-size: var(--font-xs);
  color: var(--text-tertiary);
  background: none;
  padding: 0;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 150px;
  overflow-y: auto;
}
```

**Step 6: 优化 thinking 块样式**

替换现有 thinking 样式：

```css
/* thinking 折叠区 — 虚线左边框 */
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
  border-left: 2px dashed var(--border-muted);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}
```

**Step 7: 删除旧的 tool_use / tool_result 样式**

移除以下旧样式（已被 `.msg-tool-card` 取代）：
- `.msg-tool-use`
- `.msg-tool-name`
- `.msg-tool-preview`
- `.msg-tool-result`

**Step 8: 验证视觉效果**

Run: `cd /Users/maguowei/Work/AI/ai-manager && pnpm tauri dev`
Expected: 打开对话详情抽屉，验证以下效果：
- 用户消息右对齐带蓝色 U 头像
- 助手消息左对齐带紫色 A 头像
- 命令显示为芯片样式
- 工具调用显示为可折叠卡片
- thinking 块有虚线左边框
- system 信息可折叠
- XML 标签不再直接暴露

**Step 9: 提交**

```bash
git add src/components/SessionDetailDrawer.css
git commit -m "feat: 全面优化对话详情抽屉样式"
```

---

### Task 7: 最终验证和格式化

**Files:**
- All modified files

**Step 1: Rust 格式化和检查**

Run: `cd /Users/maguowei/Work/AI/ai-manager/src-tauri && cargo fmt && cargo clippy`
Expected: 无格式问题，无 warning

**Step 2: 前端构建检查**

Run: `cd /Users/maguowei/Work/AI/ai-manager && pnpm build`
Expected: 构建成功

**Step 3: 端到端验证**

Run: `cd /Users/maguowei/Work/AI/ai-manager && pnpm tauri dev`
Expected: 应用正常启动，打开历史页面 → 点击任意会话的查看按钮 → 验证对话详情抽屉显示正确

**Step 4: 修复发现的问题并提交**

如有问题则修复后提交：

```bash
git add -u
git commit -m "fix: 修复对话详情 UI 优化中发现的问题"
```
