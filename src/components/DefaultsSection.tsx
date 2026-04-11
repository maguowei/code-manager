import { json } from "@codemirror/lang-json";
import CodeMirror from "@uiw/react-codemirror";
import { useState } from "react";
import useEditorTheme from "../hooks/useEditorTheme";
import { useI18n } from "../i18n";

interface DefaultsSectionProps {
  /** 是否启用通用配置 */
  useDefaults: boolean;
  /** 切换启用状态的回调 */
  onUseDefaultsChange: (value: boolean) => void;
  /** 通用配置 JSON 文本内容 */
  defaults: string;
  /** 编辑内容变更的回调 */
  onDefaultsChange: (value: string) => void;
}

/**
 * 通用配置编辑区组件
 *
 * 包含：
 * - 启用/禁用通用配置的内联 Toggle
 * - CodeMirror JSON 编辑器
 * - 格式化按钮
 * - JSON 格式错误提示
 */
function DefaultsSection({
  useDefaults,
  onUseDefaultsChange,
  defaults,
  onDefaultsChange,
}: DefaultsSectionProps) {
  const { t } = useI18n();

  /** 控制折叠面板展开状态 */
  const [showDefaults, setShowDefaults] = useState(false);
  /** JSON 格式校验错误信息 */
  const [defaultsError, setDefaultsError] = useState("");
  const editorTheme = useEditorTheme();

  /** 格式化 JSON 内容 */
  function handleFormatDefaults() {
    if (!defaults.trim()) return;
    try {
      const obj = JSON.parse(defaults.trim());
      onDefaultsChange(JSON.stringify(obj, null, 2));
      setDefaultsError("");
    } catch {
      setDefaultsError(t("configModal.defaultsError"));
    }
  }

  return (
    <div className={`collapsible-section ${showDefaults ? "expanded" : ""}`}>
      <div className="collapsible-header" onClick={() => setShowDefaults(!showDefaults)}>
        <div className="collapsible-header-left">
          <span className="collapsible-title">{t("configModal.defaults")}</span>
          <button
            type="button"
            className={`inline-toggle ${useDefaults ? "enabled" : "disabled"}`}
            onClick={(e) => {
              e.stopPropagation();
              onUseDefaultsChange(!useDefaults);
            }}
            title={
              useDefaults ? t("configModal.defaultsEnabled") : t("configModal.defaultsDisabled")
            }
          >
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
            <span className="toggle-label">
              {useDefaults ? t("configModal.defaultsEnabled") : t("configModal.defaultsDisabled")}
            </span>
          </button>
        </div>
        <svg
          className="collapsible-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      <div className="collapsible-content">
        <div className="collapsible-body">
          <p className="form-hint info" style={{ marginTop: 0, marginBottom: "12px" }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            {t("configModal.defaultsHint")}
          </p>
          <div className={`defaults-editor${defaultsError ? " error" : ""}`}>
            <div className="defaults-toolbar">
              <button type="button" className="defaults-format-btn" onClick={handleFormatDefaults}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="21" y1="10" x2="3" y2="10" />
                  <line x1="21" y1="6" x2="3" y2="6" />
                  <line x1="21" y1="14" x2="3" y2="14" />
                  <line x1="21" y1="18" x2="3" y2="18" />
                </svg>
                {t("configModal.defaultsFormat")}
              </button>
            </div>
            <CodeMirror
              value={defaults}
              onChange={(val) => {
                onDefaultsChange(val);
                setDefaultsError("");
              }}
              extensions={[json()]}
              theme={editorTheme}
              placeholder={t("configModal.defaultsPlaceholder")}
              basicSetup={{
                lineNumbers: true,
                bracketMatching: true,
                indentOnInput: true,
                foldGutter: false,
              }}
            />
          </div>
          {defaultsError && <p className="defaults-error">{defaultsError}</p>}
        </div>
      </div>
    </div>
  );
}

export default DefaultsSection;
