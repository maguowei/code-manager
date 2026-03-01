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
                    title={t("memory.toolbar.heading")}
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
                    title={t("memory.toolbar.bold")}
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
                    title={t("memory.toolbar.list")}
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
                    title={t("memory.toolbar.code")}
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
