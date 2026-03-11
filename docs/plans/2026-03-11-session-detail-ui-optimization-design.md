# Session 对话详情 UI 优化设计

## 问题描述

当前对话详情页面存在三个核心问题：
1. **原始标签暴露** — XML 标签如 `<local-command-caveat>`、`<command-name>`、`<system-reminder>` 直接显示为纯文本
2. **视觉层次差** — 消息气泡样式单一，USER/ASSISTANT 区分不够明显，布局缺乏呼吸感
3. **内容可读性差** — 工具调用展示生硬，长文本无折叠，整体信息密度过高

## 方案选择

选择 **方案 B: 后端结构化解析 + 前端渲染**。Rust 后端对消息做更深层的结构化解析，前端根据新的 block 类型做对应渲染。

## 设计详情

### Part 1: 后端结构化解析

#### 1.1 扩展 MessageBlock 枚举

在 `src-tauri/src/history.rs` 中，扩展 `MessageBlock`：

```rust
pub enum MessageBlock {
    // 现有类型
    Text { text: String },
    Thinking { thinking: String },
    ToolUse { name: String, input_preview: String },
    ToolResult { content_preview: String },
    // 新增类型
    Command { name: String, args: Option<String> },
    System { summary: String },
}
```

对应前端 TypeScript 类型：

```typescript
export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; name: string; input_preview: string }
  | { type: "tool_result"; content_preview: string }
  | { type: "command"; name: string; args?: string }
  | { type: "system"; summary: string };
```

#### 1.2 XML 标签解析逻辑

在 `parse_content_blocks` 中，当 block type 为 `text` 时，对文本内容做 XML 标签扫描：

1. **`<command-name>...</command-name>`** → `Command { name, args }`
   - 同时提取 `<command-args>...</command-args>` 作为 args
2. **`<system-reminder>...</system-reminder>`** → `System { summary }`
   - summary 取前 80 个字符作为摘要
3. **`<local-command-caveat>...</local-command-caveat>`** → 直接丢弃，不生成 block
4. **`<command-message>...</command-message>`** → 丢弃（已被 command block 覆盖）
5. **剩余纯文本** → 保留为 `Text` block（去除空白后为空则跳过）

解析策略：使用正则表达式逐个匹配和剥离标签，对剩余文本做 trim 后判断是否保留。

#### 1.3 工具调用合并（ToolCall）

目前 `tool_use` 和 `tool_result` 分别作为独立 block，前端需逐个渲染。

改进：保持后端数据结构不变（tool_use 和 tool_result 仍分开），由前端负责在渲染时将相邻的 tool_use + tool_result 合并展示。这样避免破坏后端数据的真实性。

### Part 2: 前端 UI 渲染优化

#### 2.1 消息布局优化

- 用户消息右对齐 + 蓝色气泡（保持）
- 助手消息左对齐 + 深色气泡（保持）
- 新增角色图标：`U`（用户）/ `A`（助手）圆形头像
- 加大气泡间距，增加视觉呼吸感
- 角色标签字体缩小，移到头像旁边

#### 2.2 新 block 类型渲染

- **command**：芯片样式，灰色背景 + 等宽字体，如 `> /clear`
- **system**：可折叠灰色区块，默认折叠只显示 "System" 标签 + 摘要，点击展开
- 被丢弃的标签：不渲染

#### 2.3 工具调用折叠卡片

- 默认折叠：显示工具图标 + 工具名 + 关键参数摘要
- 点击展开：显示完整输入预览 + 结果预览
- 相邻的 tool_use + tool_result 在前端合并为一个卡片

#### 2.4 Thinking 块优化

- 虚线左边框 + 淡色背景的折叠区块
- 标签："思考过程" + 折叠箭头
- 默认折叠

#### 2.5 文本内容

- 保持 pre-wrap 白空处理
- 不引入 Markdown 渲染库

## 涉及文件

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src-tauri/src/history.rs` | 修改 | 扩展 MessageBlock、新增 XML 解析逻辑 |
| `src/types.ts` | 修改 | 新增 command/system block 类型 |
| `src/components/SessionDetailDrawer.tsx` | 修改 | 新 block 渲染 + 布局优化 + 工具卡片 |
| `src/components/SessionDetailDrawer.css` | 修改 | 样式全面优化 |
| `src/i18n.ts` | 修改 | 新增相关翻译 |
