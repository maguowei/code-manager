# tool_result 完整内容传递 + Markdown 渲染 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 tool_result 内容从截断的纯文本展示升级为完整内容的 Markdown 渲染。

**Architecture:** Rust 端删除 200 字符截断并重命名字段 `content_preview` → `content`；前端 `types.ts` 同步更新类型；`ToolCallCard` 的 result 区和独立 `tool_result` 块统一改用 `ReactMarkdown` 渲染；CSS 新增 `.msg-tool-card-result` 并修改 `.msg-tool-result`。

**Tech Stack:** Rust（serde_json）、React 19、TypeScript、ReactMarkdown + remark-gfm

---

### Task 1: Rust — 重命名字段并移除截断

**Files:**
- Modify: `src-tauri/src/history.rs:75,237-258`

**Step 1: 修改 `MessageBlock::ToolResult` 字段名**

在 `history.rs` 第 75 行找到：
```rust
ToolResult { content_preview: String },
```
改为：
```rust
ToolResult { content: String },
```

**Step 2: 修改 `parse_content_blocks` 中 `tool_result` 分支，移除截断**

找到（约第 237-258 行）：
```rust
"tool_result" => {
    let content_preview = item
        .get("content")
        .map(|v| {
            if let Some(s) = v.as_str() {
                // content 是字符串，直接使用
                truncate(s, 200)
            } else if let Some(arr) = v.as_array() {
                // content 是数组（如 [{"type":"text","text":"..."}]），提取所有 text 字段
                let text = arr
                    .iter()
                    .filter_map(|item| {
                        item.get("text").and_then(|t| t.as_str())
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                truncate(&text, 200)
            } else {
                // 其他类型忽略
                String::new()
            }
        })
        .unwrap_or_default();
    blocks.push(MessageBlock::ToolResult { content_preview });
}
```

改为（移除截断，字段名改为 `content`）：
```rust
"tool_result" => {
    let content = item
        .get("content")
        .map(|v| {
            if let Some(s) = v.as_str() {
                // content 是字符串，直接使用
                s.to_string()
            } else if let Some(arr) = v.as_array() {
                // content 是数组（如 [{"type":"text","text":"..."}]），提取所有 text 字段
                arr.iter()
                    .filter_map(|item| {
                        item.get("text").and_then(|t| t.as_str())
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            } else {
                // 其他类型忽略
                String::new()
            }
        })
        .unwrap_or_default();
    blocks.push(MessageBlock::ToolResult { content });
}
```

**Step 3: 验证 Rust 编译**

```bash
cd src-tauri && cargo check
```
预期：`Finished` 无错误。

**Step 4: Commit**

```bash
git add src-tauri/src/history.rs
git commit -m "refactor: tool_result 字段重命名为 content 并移除截断限制"
```

---

### Task 2: 前端类型更新

**Files:**
- Modify: `src/types.ts`（搜索 `tool_result`）

**Step 1: 更新 MessageBlock 类型**

在 `src/types.ts` 中找到：
```typescript
| { type: "tool_result"; content_preview: string }
```
改为：
```typescript
| { type: "tool_result"; content: string }
```

**Step 2: 验证 TypeScript 编译**

```bash
pnpm build
```
预期：编译报错，提示 `content_preview` 不存在（说明类型生效，需要继续修改 tsx 文件）。记录报错行号，进入 Task 3。

---

### Task 3: 前端渲染逻辑更新

**Files:**
- Modify: `src/components/SessionDetailDrawer.tsx`

**Step 1: 修改 `ToolCallCard` props**

找到（约第 76-88 行）：
```tsx
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
})
```
改为：
```tsx
function ToolCallCard({
  name,
  inputPreview,
  resultContent,
  inputLabel,
  resultLabel,
}: {
  name: string;
  inputPreview: string;
  resultContent?: string;
  inputLabel: string;
  resultLabel: string;
})
```

**Step 2: 修改 `ToolCallCard` result 区渲染**

找到（约第 105-110 行）：
```tsx
{resultPreview && (
  <div className="msg-tool-card-section">
    <span className="msg-tool-card-label">{resultLabel}</span>
    <pre className="msg-tool-card-code">{resultPreview}</pre>
  </div>
)}
```
改为：
```tsx
{resultContent && (
  <div className="msg-tool-card-section">
    <span className="msg-tool-card-label">{resultLabel}</span>
    <div className="msg-tool-card-result msg-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{resultContent}</ReactMarkdown>
    </div>
  </div>
)}
```

**Step 3: 修改 `renderBlocks` 中 `tool_use` 分支**

找到（约第 134-148 行）：
```tsx
case "tool_use": {
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
  if (resultPreview !== undefined) i++;
  break;
}
```
改为：
```tsx
case "tool_use": {
  const next = blocks[i + 1];
  const resultContent = next && next.type === "tool_result" ? next.content : undefined;
  elements.push(
    <ToolCallCard
      key={i}
      name={block.name}
      inputPreview={block.input_preview}
      resultContent={resultContent}
      inputLabel={t("history.toolInput")}
      resultLabel={t("history.toolResult")}
    />
  );
  if (resultContent !== undefined) i++;
  break;
}
```

**Step 4: 修改独立 `tool_result` 块渲染**

找到（约第 150-156 行）：
```tsx
case "tool_result":
  elements.push(
    <div key={i} className="msg-block msg-tool-result">
      \u2190 {block.content_preview || "..."}
    </div>
  );
  break;
```
改为（移除 ← 前缀，改用 Markdown 渲染）：
```tsx
case "tool_result":
  elements.push(
    <div key={i} className="msg-block msg-tool-result msg-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content || "..."}</ReactMarkdown>
    </div>
  );
  break;
```

**Step 5: 验证 TypeScript 编译**

```bash
pnpm build
```
预期：编译通过，无 `content_preview` 相关报错。

**Step 6: Commit**

```bash
git add src/types.ts src/components/SessionDetailDrawer.tsx
git commit -m "feat: tool_result 改用 ReactMarkdown 渲染完整内容"
```

---

### Task 4: CSS 样式更新

**Files:**
- Modify: `src/components/SessionDetailDrawer.css`（约第 326-337 行）

**Step 1: 新增 `.msg-tool-card-result` 样式**

在 `.msg-tool-card-code` 规则（约第 314-324 行）之后，`.msg-tool-result` 规则之前，插入：
```css
/* tool_result Markdown 渲染区（在工具调用卡片内） */
.msg-tool-card-result {
  font-size: var(--font-xs);
  max-height: 300px;
  overflow-y: auto;
}
```

**Step 2: 修改 `.msg-tool-result` 样式**

找到（约第 326-337 行）：
```css
.msg-tool-result {
  font-size: var(--font-xs);
  color: var(--text-tertiary);
  padding: 6px 10px;
  background-color: var(--bg-primary);
  border-radius: var(--radius-sm);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 150px;
  overflow-y: auto;
}
```
改为（`white-space` 改为 `normal`，支持 Markdown；`max-height` 放大到 300px）：
```css
.msg-tool-result {
  font-size: var(--font-xs);
  color: var(--text-tertiary);
  padding: 6px 10px;
  background-color: var(--bg-primary);
  border-radius: var(--radius-sm);
  white-space: normal;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}
```

**Step 3: 验证构建**

```bash
pnpm build
```
预期：构建成功。

**Step 4: Commit**

```bash
git add src/components/SessionDetailDrawer.css
git commit -m "style: tool_result 样式适配 Markdown 渲染，新增 msg-tool-card-result"
```

---

### Task 5: 端对端验证

**Step 1: 启动开发模式**

```bash
pnpm tauri dev
```

**Step 2: 验证清单**

- [ ] 打开历史 → 选择含工具调用的对话
- [ ] 展开工具调用卡片 → result 区正确渲染 Markdown（标题/列表/代码块）
- [ ] 长内容（> 200 字符）完整显示，超出 300px 出现垂直滚动条
- [ ] 纯文本内容（如 "Task #1 created successfully"）正常段落展示，无异常符号
- [ ] 独立 tool_result 块正确渲染 Markdown（之前显示 `\u2190` 的场景）
- [ ] 工具卡片折叠/展开动画正常
