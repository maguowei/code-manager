# Memory Editor Markdown Highlight Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 MemoryEditor 的内容 textarea 替换为支持 Markdown 语法高亮的 CodeMirror 编辑器，并添加标题/加粗/列表/代码块工具栏。

**Architecture:** 安装 `@codemirror/lang-markdown`，在 `MemoryEditor.tsx` 中用 `<CodeMirror>` 替换 `<textarea>`，通过 `useRef<ReactCodeMirrorRef>` 获取编辑器实例来实现工具栏按钮的文本插入。复用现有的 `useEditorTheme()` hook 实现主题跟随。

**Tech Stack:** `@uiw/react-codemirror`（已有），`@codemirror/lang-markdown`（新增），`EditorView`（来自 `@codemirror/view`，已有）

---

### Task 1: 安装 Markdown 语言包

**Files:**
- Modify: `package.json`（pnpm 自动更新）

**Step 1: 安装依赖**

```bash
cd /path/to/ai-manager
pnpm add @codemirror/lang-markdown
```

Expected output: 包含 `@codemirror/lang-markdown` 的安装成功信息

**Step 2: 验证安装**

```bash
grep "@codemirror/lang-markdown" package.json
```

Expected: `"@codemirror/lang-markdown": "^6.x.x"`

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: 添加 @codemirror/lang-markdown 依赖"
```

---

### Task 2: 更新 MemoryEditor.tsx

**Files:**
- Modify: `src/components/MemoryEditor.tsx`

**Step 1: 替换完整文件内容**

将 `src/components/MemoryEditor.tsx` 替换为以下内容：

```tsx
import { useState, useRef } from "react";
import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { Memory } from "../types";
import { useI18n } from "../i18n";
import useEditorTheme from "../hooks/useEditorTheme";
import "./MemoryEditor.css";

interface MemoryEditorProps {
  memory: Memory | null;
  onSave: (data: { name: string; content: string }) => void;
  onClose: () => void;
}

function MemoryEditor({ memory, onSave, onClose }: MemoryEditorProps) {
  const { t } = useI18n();
  const [name, setName] = useState(memory?.name || "");
  const [content, setContent] = useState(memory?.content || "");
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const editorTheme = useEditorTheme();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), content });
  }

  // 在光标位置插入文本（选中文字时替换）
  function insertAtCursor(text: string) {
    const view = editorRef.current?.view;
    if (!view) return;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
  }

  // 在当前行行首插入前缀
  function insertAtLineStart(prefix: string) {
    const view = editorRef.current?.view;
    if (!view) return;
    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    view.dispatch({ changes: { from: line.from, insert: prefix } });
    view.focus();
  }

  // 加粗：选中文字时包裹，否则插入占位符
  function insertBold() {
    const view = editorRef.current?.view;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    view.dispatch(view.state.replaceSelection(selected ? `**${selected}**` : "**文本**"));
    view.focus();
  }

  return (
    <div className="memory-drawer-container">
      <div
        className="memory-modal"
        role="dialog"
        aria-labelledby="memory-modal-title"
        aria-modal="true"
      >
        <form id="memory-form" onSubmit={handleSubmit}>
          <div className="memory-modal-header">
            <button
              type="button"
              className="memory-back-btn"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2 id="memory-modal-title">{memory ? t("memory.editTitle") : t("memory.addTitle")}</h2>
            <button type="submit" className="memory-save-btn" disabled={!name.trim()}>
              {t("memory.save")}
            </button>
          </div>

          <div className="memory-modal-body">
            <div className="memory-badge-large">
              <span>{name ? name.charAt(0).toUpperCase() : "M"}</span>
            </div>

            <div className="form-group">
              <label htmlFor="memory-name" className="label-required">
                <span>{t("memory.name")}</span>
                <span className="required-badge">{t("form.required")}</span>
              </label>
              <input
                id="memory-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("memory.namePlaceholder")}
                required
              />
            </div>

            <div className="form-group">
              <label>{t("memory.content")}</label>
              <div className="memory-editor">
                <div className="memory-editor-toolbar">
                  {/* 标题 */}
                  <button
                    type="button"
                    className="memory-toolbar-btn"
                    title="插入标题"
                    onClick={() => insertAtLineStart("## 标题\n")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M4 6h16M4 12h8M4 18h16" />
                    </svg>
                    H
                  </button>
                  {/* 加粗 */}
                  <button
                    type="button"
                    className="memory-toolbar-btn"
                    title="加粗"
                    onClick={insertBold}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
                      <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
                    </svg>
                    B
                  </button>
                  {/* 列表 */}
                  <button
                    type="button"
                    className="memory-toolbar-btn"
                    title="插入列表"
                    onClick={() => insertAtLineStart("- 列表项\n")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                  </button>
                  {/* 代码块 */}
                  <button
                    type="button"
                    className="memory-toolbar-btn"
                    title="插入代码块"
                    onClick={() => insertAtCursor("```\n\n```")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="16 18 22 12 16 6" />
                      <polyline points="8 6 2 12 8 18" />
                    </svg>
                  </button>
                </div>
                <CodeMirror
                  ref={editorRef}
                  value={content}
                  onChange={setContent}
                  extensions={[markdown(), EditorView.lineWrapping]}
                  theme={editorTheme}
                  placeholder={t("memory.contentPlaceholder")}
                  basicSetup={{
                    lineNumbers: true,
                    bracketMatching: false,
                    indentOnInput: false,
                    foldGutter: false,
                  }}
                />
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MemoryEditor;
```

**Step 2: 验证 TypeScript 无错误**

```bash
pnpm build 2>&1 | grep -E "error TS|Build failed|✓"
```

Expected: 包含构建成功信息，无 TS 错误

---

### Task 3: 更新 MemoryEditor.css

**Files:**
- Modify: `src/components/MemoryEditor.css`

**Step 1: 删除旧的 textarea 样式，追加编辑器容器和工具栏样式**

在 `src/components/MemoryEditor.css` 文件末尾，将 `.memory-content-textarea` 整块样式替换为以下内容：

```css
/* 删除此块（旧 textarea 样式）：
.memory-content-textarea {
  min-height: 320px;
  resize: vertical;
  line-height: 1.6;
  font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace;
}
*/

/* Markdown 编辑器容器 */
.memory-editor {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.memory-editor:focus-within {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px var(--accent-blue-bg);
}

/* 工具栏 */
.memory-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background-color: #f5f5f7;
  border-bottom: 1px solid #e0e0e0;
}

.memory-toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  background-color: transparent;
  color: #555;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 100ms ease;
  line-height: 1;
}

.memory-toolbar-btn:hover {
  background-color: rgba(0, 0, 0, 0.08);
  color: #000;
}

/* CodeMirror 覆盖 */
.memory-editor .cm-editor {
  font-size: 13px;
  line-height: 1.6;
  min-height: 300px;
}

.memory-editor .cm-editor.cm-focused {
  outline: none;
}

.memory-editor .cm-scroller {
  font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace;
  overflow: auto !important;
}

/* 深色主题适配 */
[data-theme="dark"] .memory-editor {
  border-color: var(--border-default);
}

[data-theme="dark"] .memory-editor-toolbar {
  background-color: #21252b;
  border-bottom-color: #3e4452;
}

[data-theme="dark"] .memory-toolbar-btn {
  color: #abb2bf;
  border-color: rgba(255, 255, 255, 0.12);
}

[data-theme="dark"] .memory-toolbar-btn:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: #e6e6e6;
}
```

**Step 2: 验证构建**

```bash
pnpm build 2>&1 | grep -E "error|✓|Built in"
```

Expected: 构建成功，无错误

**Step 3: Commit**

```bash
git add src/components/MemoryEditor.tsx src/components/MemoryEditor.css
git commit -m "feat: MemoryEditor 添加 Markdown 语法高亮和工具栏"
```

---

### Task 4: 验证并收尾

**Step 1: 完整构建验证**

```bash
pnpm build
```

Expected: 无错误，`dist/` 目录生成成功

**Step 2: 手动测试清单**

启动 `pnpm tauri dev` 后验证：
- [ ] 打开记忆编辑器，内容区显示 CodeMirror 编辑器（有行号）
- [ ] 输入 `## 标题` 后标题文字高亮显示
- [ ] 输入 `**加粗**` 后文字有高亮
- [ ] 点击 H 按钮，在光标行首插入 `## 标题\n`
- [ ] 选中文字后点击 B 按钮，文字被 `**` 包裹
- [ ] 点击列表按钮，插入 `- 列表项\n`
- [ ] 点击代码块按钮，插入 ` ``` ` 包裹块
- [ ] 切换深色主题，编辑器主题随之切换
- [ ] 保存记忆后，文件内容与输入完全一致（换行不影响文件）
