# 设计文档：记忆编辑器 Markdown 语法高亮

**日期**：2026-03-01
**状态**：已批准

## 背景

`MemoryEditor` 组件当前使用普通 `<textarea>` 编辑记忆内容。记忆内容最终写入 `~/.claude/CLAUDE.md`，本质为 Markdown 格式。为提升编辑体验，需引入 Markdown 语法高亮和常用格式快捷工具栏。

## 目标

- 将 `MemoryEditor` 的内容编辑区替换为 CodeMirror Markdown 高亮编辑器
- 新增工具栏，提供标题、加粗、列表、代码块 4 个快捷插入按钮
- 保持与项目现有 CodeMirror 用法（`DefaultsSection`）一致的风格和主题

## 技术选型

**方案 A：CodeMirror + `@codemirror/lang-markdown`**（已选）

项目已有完整 CodeMirror 基础（`@uiw/react-codemirror`、`useEditorTheme` hook），只需追加 Markdown 语言包，与现有代码完全一致。

## 文件改动范围

| 文件 | 改动说明 |
|---|---|
| `package.json` | 新增 `@codemirror/lang-markdown` 依赖 |
| `src/components/MemoryEditor.tsx` | 替换 `<textarea>` 为 `<CodeMirror>`，新增工具栏 |
| `src/components/MemoryEditor.css` | 新增编辑器容器和工具栏样式 |

不新建组件或 hook，复用 `useEditorTheme()`。

## 工具栏设计

工具栏位于 CodeMirror 编辑器上方，样式与 `DefaultsSection` 的 `defaults-toolbar` 保持一致。

| 按钮 | 插入内容 | 行为 |
|---|---|---|
| 标题（H） | `## 标题\n` | 插入到光标行首 |
| 加粗（B） | `**文本**` | 插入到光标位置，选中文字时包裹 |
| 列表 | `- 列表项\n` | 插入到光标行首 |
| 代码块（`</>`） | ` ```\n\n``` ` | 插入到光标位置 |

工具栏按钮通过 `EditorView.dispatch` 操作编辑器状态，操作完成后焦点自动回到编辑器。编辑器 ref 使用 `useRef<ReactCodeMirrorRef>` 获取。

## CodeMirror 编辑器配置

```tsx
<CodeMirror
  ref={editorRef}
  value={content}
  onChange={setContent}
  extensions={[
    markdown(),
    EditorView.lineWrapping,  // 启用视觉自动换行，不影响文件保存内容
  ]}
  theme={editorTheme}         // 复用 useEditorTheme()
  basicSetup={{
    lineNumbers: true,
    bracketMatching: false,
    indentOnInput: false,
    foldGutter: false,
  }}
/>
```

关键配置决策：
- **自动换行**：启用 `EditorView.lineWrapping`，长行视觉折叠，不插入换行符，文件保存内容不受影响
- **主题**：复用 `useEditorTheme()`，自动跟随应用亮/暗/系统主题
- **行号**：开启 `lineNumbers: true`
- **高度**：容器 CSS 固定约 `360px`，与原 `textarea rows={16}` 视觉接近
