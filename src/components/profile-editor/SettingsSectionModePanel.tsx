import type { ReactNode } from "react";
import { useI18n } from "../../i18n";
import ConfigPreview from "../ConfigPreview";

export type SectionEditorMode = "controls" | "json";
export type SettingsSectionVariant = "default" | "accordion";

export interface SectionJsonEditorState {
  rawJson: string;
  jsonError: string;
  hasAppliedDraft: boolean;
  handleJsonChange: (nextValue: string) => void;
  formatJson: () => void;
}

interface SettingsSectionModePanelProps {
  title: string;
  mode: SectionEditorMode;
  onModeChange: (mode: SectionEditorMode) => void;
  controls: ReactNode;
  jsonEditor: SectionJsonEditorState;
  jsonHint: string;
  error?: string;
  variant?: SettingsSectionVariant;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  badgeCount?: number;
}

function SettingsSectionModePanel({
  title,
  mode,
  onModeChange,
  controls,
  jsonEditor,
  jsonHint,
  error,
  variant = "default",
  expanded = true,
  onToggleExpanded,
  badgeCount,
}: SettingsSectionModePanelProps) {
  const { t } = useI18n();
  const bodyVisible = variant === "accordion" ? expanded : true;

  function renderModeSwitch() {
    return (
      <div
        className="profile-mode-switch"
        role="tablist"
        aria-label={`${title} ${t("common.jsonMode")}`}
      >
        <button
          type="button"
          className={`profile-mode-switch-btn${mode === "controls" ? " active" : ""}`}
          aria-pressed={mode === "controls"}
          onClick={() => onModeChange("controls")}
        >
          {t("common.controlMode")}
        </button>
        <button
          type="button"
          className={`profile-mode-switch-btn${mode === "json" ? " active" : ""}`}
          aria-pressed={mode === "json"}
          onClick={() => onModeChange("json")}
        >
          {t("common.jsonMode")}
        </button>
      </div>
    );
  }

  function renderSectionContent() {
    if (mode === "controls") {
      return <div className="profile-section-body">{controls}</div>;
    }

    return (
      <div className="profile-section-body">
        <div className="profile-json-mode-panel">
          <div className="profile-json-mode-toolbar">
            <p className="form-hint">{jsonHint}</p>
            <button type="button" className="profile-secondary-btn" onClick={jsonEditor.formatJson}>
              {t("common.formatJson")}
            </button>
          </div>

          {!jsonEditor.hasAppliedDraft ? (
            <p className="profile-json-mode-status form-hint">
              {t("common.sectionJsonDraftPending")}
            </p>
          ) : null}

          <ConfigPreview
            content={jsonEditor.rawJson}
            onChange={jsonEditor.handleJsonChange}
            jsonError={jsonEditor.jsonError}
          />
        </div>
      </div>
    );
  }

  if (variant === "accordion") {
    return (
      <section
        className={`profile-editor-section profile-editor-section-accordion${expanded ? " expanded" : ""}`}
      >
        <button
          type="button"
          className="profile-accordion-header"
          aria-expanded={expanded}
          aria-label={`${expanded ? t("common.collapse") : t("common.expand")} ${title}`}
          onClick={onToggleExpanded}
        >
          <span className="profile-accordion-header-main">
            <h3>{title}</h3>
            {typeof badgeCount === "number" ? (
              <span className="profile-accordion-badge">{badgeCount}</span>
            ) : null}
          </span>
          <svg
            className={`profile-accordion-chevron${expanded ? " expanded" : ""}`}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {bodyVisible ? (
          <div className="profile-accordion-content">
            <div className="profile-accordion-mode-row">{renderModeSwitch()}</div>
            {renderSectionContent()}
          </div>
        ) : null}

        {error ? <span className="field-error">{error}</span> : null}
      </section>
    );
  }

  return (
    <section className="profile-editor-section">
      <div className="profile-section-heading">
        <div className="profile-section-heading-main">
          <h3>{title}</h3>
        </div>

        <div className="profile-subsection-actions">{renderModeSwitch()}</div>
      </div>

      {renderSectionContent()}

      {error ? <span className="field-error">{error}</span> : null}
    </section>
  );
}

export default SettingsSectionModePanel;
