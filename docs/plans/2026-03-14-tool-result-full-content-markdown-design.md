# 设计：tool_result 完整内容传递 + Markdown 渲染

**日期**: 2026-03-14
**状态**: 已批准

## 背景

`SessionDetailDrawer` 展示 tool_result 时存在两个问题：

1. **内容截断**：Rust 中 `tool_result` content 被截断为 200 字符（`truncate(s, 200)`），导致工具返回内容（文件内容、命令输出等）不完整。
2. **渲染方式错误**：ToolCallCard 中 result 区使用 `<pre>` 纯文本渲染，独立 tool_result 块使用 `<div>` 纯文本渲染，均不支持 Markdown，导致结构化内容（标题、列表、代码块等）无法正常展示。

## 目标

- tool_result 内容完整传递，不截断
- tool_result 内容统一使用 ReactMarkdown 渲染
- 保留 max-height + overflow-y: auto 避免超长内容破坏布局

## 方案选择

选择**方案一：完整内容 + 统一 Markdown 渲染**。

理由：
- ReactMarkdown 渲染纯文本无副作用（直接段落展示）
- 统一处理，无需按内容类型分支判断
- 改动最小，覆盖所有场景

## 详细设计

### 1. Rust（`src-tauri/src/history.rs`）

**MessageBlock::ToolResult 字段重命名**：

```rust
// 改前
ToolResult { content_preview: String }

// 改后
ToolResult { content: String }
```

**parse_content_blocks 中移除截断**：

```rust
// 改前（字符串分支）
truncate(s, 200)

// 改后
s.to_string()

// 改前（数组分支）
truncate(&text, 200)

// 改后
text
```

### 2. 类型定义（`src/types.ts`）

```typescript
// 改前
| { type: "tool_result"; content_preview: string }

// 改后
| { type: "tool_result"; content: string }
```

### 3. 前端渲染（`src/components/SessionDetailDrawer.tsx`）

**ToolCallCard 组件**：

- props：`resultPreview?: string` → `resultContent?: string`
- result 区渲染：
  ```tsx
  // 改前
  <pre className="msg-tool-card-code">{resultPreview}</pre>

  // 改后
  <div className="msg-tool-card-result msg-markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{resultContent}</ReactMarkdown>
  </div>
  ```

**renderBlocks 函数**：

- `next.content_preview` → `next.content`
- `resultPreview={resultPreview}` → `resultContent={resultContent}`

**独立 tool_result 块**：

```tsx
// 改前
<div key={i} className="msg-block msg-tool-result">
  ← {block.content_preview || "..."}
</div>

// 改后
<div key={i} className="msg-block msg-tool-result msg-markdown">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content || "..."}</ReactMarkdown>
</div>
```

### 4. 样式（`src/components/SessionDetailDrawer.css`）

**新增 `.msg-tool-card-result`**（替代 result 区的 `<pre>`）：

```css
.msg-tool-card-result {
  font-size: var(--font-xs);
  max-height: 300px;
  overflow-y: auto;
}
```

**修改 `.msg-tool-result`**（独立块改为 Markdown 容器）：

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

## 验证标准

1. `cargo check` 编译通过
2. `pnpm build` 前端构建通过
3. 打开含 tool_result 的对话：
   - 工具调用卡片展开后，result 区 Markdown 正确渲染（标题、列表、代码块）
   - 独立 tool_result 块 Markdown 正确渲染
   - 长内容（> 200 字符）完整显示，超出 300px 时出现滚动条
   - 纯文本内容（如 "Task created successfully"）正常段落展示，无异常
