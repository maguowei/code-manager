import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { useI18n } from "../i18n";
import useEditorTheme from "../hooks/useEditorTheme";

/** ConfigPreview 组件的属性定义 */
interface ConfigPreviewProps {
  /** 要展示的 JSON 字符串 */
  content: string;
}

/**
 * ConfigPreview —— 只读 JSON 配置预览组件
 *
 * 负责：
 * - 使用 CodeMirror 以语法高亮方式展示 JSON 内容（只读）
 * - 提供"复制到剪贴板"按钮
 * - 根据应用主题自动切换 CodeMirror 配色方案
 */
function ConfigPreview({ content }: ConfigPreviewProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const editorTheme = useEditorTheme();

  /** 将当前 JSON 内容复制到剪贴板，并短暂展示"已复制"反馈 */
  function handleCopy() {
    navigator.clipboard.writeText(content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // 剪贴板权限被拒绝或不在安全上下文中，静默处理
      });
  }

  return (
    <div className="json-preview">
      <div className="json-preview-header">
        <button
          type="button"
          className={`json-copy-btn ${copied ? "copied" : ""}`}
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {t("configModal.jsonCopied")}
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {t("configModal.jsonCopy")}
            </>
          )}
        </button>
      </div>
      {/* 只读 CodeMirror 编辑器，带行号与 JSON 语法高亮 */}
      <CodeMirror
        value={content}
        extensions={[json()]}
        theme={editorTheme}
        editable={false}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
        }}
      />
    </div>
  );
}

export default ConfigPreview;
