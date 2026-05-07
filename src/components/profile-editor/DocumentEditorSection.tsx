import { useState } from "react";
import { useI18n } from "../../i18n";
import ConfigPreview from "../ConfigPreview";
import { Button } from "../ui/button";

type DocumentEditorMode = "preview" | "json";

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
}: DocumentEditorSectionProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<DocumentEditorMode>("preview");

  return (
    <section className="profile-editor-section flex flex-col gap-4 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5">
      <div className="profile-section-heading flex flex-wrap items-center justify-between gap-3">
        <div className="profile-section-heading-main min-w-0 flex-1">
          <h3>{title}</h3>
        </div>

        <div className="profile-subsection-actions flex flex-wrap items-center gap-2">
          <div
            className="profile-mode-switch inline-flex items-center rounded-full border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--card)_90%,var(--primary)_10%)] p-1"
            role="tablist"
            aria-label={`${title} ${editModeLabel}`}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`profile-mode-switch-btn min-w-16 rounded-full px-3 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--foreground)]${mode === "preview" ? " active bg-[var(--card)] text-[var(--foreground)]" : ""}`}
              aria-pressed={mode === "preview"}
              onClick={() => setMode("preview")}
            >
              {previewModeLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`profile-mode-switch-btn min-w-16 rounded-full px-3 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--foreground)]${mode === "json" ? " active bg-[var(--card)] text-[var(--foreground)]" : ""}`}
              aria-pressed={mode === "json"}
              onClick={() => setMode("json")}
            >
              {editModeLabel}
            </Button>
          </div>
        </div>
      </div>

      {mode === "preview" ? (
        <div className="form-group grid gap-2">
          <ConfigPreview content={previewContent} jsonError={previewError} />
        </div>
      ) : (
        <div className="profile-json-mode-panel flex flex-col gap-3 rounded-lg border border-dashed border-[var(--border-default)] bg-[color-mix(in_srgb,var(--card)_92%,var(--accent-orange-bg,#fff7ed)_8%)] p-4">
          <div className="profile-json-mode-toolbar flex flex-wrap items-center justify-between gap-3">
            <p className="form-hint m-0 min-w-[220px] flex-1 text-sm text-[var(--text-secondary)]">
              {editHint}
            </p>
            <Button
              type="button"
              variant="outline"
              className="profile-secondary-btn"
              onClick={onFormat}
            >
              {t("common.formatJson")}
            </Button>
          </div>

          {supportedKeys.length > 0 ? (
            <div className="profile-supported-keys flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
              <span>{supportedKeysLabel}</span>
              <div className="profile-chip-list flex flex-wrap gap-1.5">
                {supportedKeys.map((key) => (
                  <span
                    key={key}
                    className="profile-key-badge rounded-md border border-[var(--border-default)] bg-[var(--secondary)] px-2 py-1 font-mono text-xs text-[var(--foreground)]"
                  >
                    {key}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {!hasAppliedDraft ? (
            <p className="profile-json-mode-status form-hint m-0 text-sm text-[var(--text-secondary)]">
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
