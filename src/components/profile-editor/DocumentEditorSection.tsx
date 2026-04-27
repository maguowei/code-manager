import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import ConfigPreview from "../ConfigPreview";
import "./editor-shared.css";

type DocumentEditorMode = "preview" | "json";
const DOCUMENT_PREVIEW_ROOT_MARGIN = "240px 0px";

interface DocumentEditorSectionProps {
  title: string;
  previewContent: string;
  previewError?: string;
  getEditContent: () => string;
  editError: string;
  hasAppliedDraft: boolean;
  onEditChange: (nextValue: string) => void;
  onFormat: () => void;
  previewModeLabel: string;
  editModeLabel: string;
  editHint: string;
  supportedKeys: string[];
  supportedKeysLabel: string;
  onPreviewVisible?: () => void;
}

function DocumentEditorSection({
  title,
  previewContent,
  previewError,
  getEditContent,
  editError,
  hasAppliedDraft,
  onEditChange,
  onFormat,
  previewModeLabel,
  editModeLabel,
  editHint,
  supportedKeys,
  supportedKeysLabel,
  onPreviewVisible,
}: DocumentEditorSectionProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<DocumentEditorMode>("preview");
  const sectionRef = useRef<HTMLElement>(null);
  const previewVisibleNotifiedRef = useRef(false);

  useEffect(() => {
    if (!onPreviewVisible || previewVisibleNotifiedRef.current) {
      return;
    }

    function notifyPreviewVisible() {
      if (previewVisibleNotifiedRef.current) {
        return;
      }
      previewVisibleNotifiedRef.current = true;
      onPreviewVisible?.();
    }

    const sectionElement = sectionRef.current;
    if (!sectionElement || typeof IntersectionObserver === "undefined") {
      notifyPreviewVisible();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        notifyPreviewVisible();
        observer.disconnect();
      },
      { rootMargin: DOCUMENT_PREVIEW_ROOT_MARGIN },
    );

    observer.observe(sectionElement);
    return () => observer.disconnect();
  }, [onPreviewVisible]);

  return (
    <section ref={sectionRef} className="profile-editor-section">
      <div className="profile-section-heading">
        <div className="profile-section-heading-main">
          <h3>{title}</h3>
        </div>

        <div className="profile-subsection-actions">
          <div
            className="profile-mode-switch"
            role="tablist"
            aria-label={`${title} ${editModeLabel}`}
          >
            <button
              type="button"
              className={`profile-mode-switch-btn${mode === "preview" ? " active" : ""}`}
              aria-pressed={mode === "preview"}
              onClick={() => setMode("preview")}
            >
              {previewModeLabel}
            </button>
            <button
              type="button"
              className={`profile-mode-switch-btn${mode === "json" ? " active" : ""}`}
              aria-pressed={mode === "json"}
              onClick={() => setMode("json")}
            >
              {editModeLabel}
            </button>
          </div>
        </div>
      </div>

      {mode === "preview" ? (
        <div className="form-group">
          <ConfigPreview content={previewContent} jsonError={previewError} />
        </div>
      ) : (
        <div className="profile-json-mode-panel">
          <div className="profile-json-mode-toolbar">
            <p className="form-hint">{editHint}</p>
            <button type="button" className="profile-secondary-btn" onClick={onFormat}>
              {t("common.formatJson")}
            </button>
          </div>

          {supportedKeys.length > 0 ? (
            <div className="profile-supported-keys">
              <span>{supportedKeysLabel}</span>
              <div className="profile-chip-list">
                {supportedKeys.map((key) => (
                  <span key={key} className="profile-key-badge">
                    {key}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {!hasAppliedDraft ? (
            <p className="profile-json-mode-status form-hint">
              {t("common.sectionJsonDraftPending")}
            </p>
          ) : null}

          <ConfigPreview content={getEditContent()} onChange={onEditChange} jsonError={editError} />
        </div>
      )}
    </section>
  );
}

export default DocumentEditorSection;
