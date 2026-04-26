import { useState } from "react";
import { useI18n } from "../../i18n";
import type { StringRow } from "./editor-utils";
import "./StringListEditor.css";

interface StringListEditorProps {
  label: string;
  rows: StringRow[];
  onChange: (rows: StringRow[]) => void;
  onAdd: () => void;
  onClear?: () => void;
  addLabel: string;
  clearLabel?: string;
  itemLabelPrefix: string;
  placeholder: string;
  emptyHint?: string;
  collapsible?: boolean;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onToggleExpanded?: () => void;
  showCollapseToggle?: boolean;
}

function StringListEditor({
  label,
  rows,
  onChange,
  onAdd,
  onClear,
  addLabel,
  clearLabel,
  itemLabelPrefix,
  placeholder,
  emptyHint,
  collapsible = false,
  expanded,
  defaultExpanded = true,
  onToggleExpanded,
  showCollapseToggle = false,
}: StringListEditorProps) {
  const { t } = useI18n();
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded);
  const collapseToggleVisible = collapsible && showCollapseToggle && rows.length > 0;
  const clearButtonVisible = rows.length > 0 && onClear !== undefined && clearLabel !== undefined;
  const actionsVisible = collapseToggleVisible || clearButtonVisible;
  const bodyVisible = collapseToggleVisible ? (expanded ?? uncontrolledExpanded) : true;

  function buildItemLabel(index: number) {
    return itemLabelPrefix.endsWith("-")
      ? `${itemLabelPrefix}${index + 1}`
      : `${itemLabelPrefix} ${index + 1}`;
  }

  function handleToggleExpanded() {
    if (expanded === undefined) {
      setUncontrolledExpanded((current) => !current);
    }
    onToggleExpanded?.();
  }

  return (
    <div className="profile-subsection">
      <div className="profile-subsection-header">
        {collapseToggleVisible ? (
          <button
            type="button"
            className="profile-accordion-trigger profile-string-list-trigger"
            aria-expanded={bodyVisible}
            onClick={handleToggleExpanded}
          >
            <span className="profile-accordion-header-main profile-string-list-title-row">
              <h4>{label}</h4>
              <span className="profile-accordion-badge">{rows.length}</span>
            </span>
          </button>
        ) : (
          <div className="profile-string-list-header-copy">
            <div className="profile-string-list-title-row">
              <h4>{label}</h4>
            </div>
          </div>
        )}
        {actionsVisible ? (
          <div className="profile-subsection-actions">
            {clearButtonVisible ? (
              <button
                type="button"
                className="profile-secondary-btn profile-string-list-clear-btn"
                onClick={onClear}
              >
                {clearLabel}
              </button>
            ) : null}

            {collapseToggleVisible ? (
              <button
                type="button"
                className="profile-accordion-chevron-btn profile-string-list-collapse-btn"
                aria-expanded={bodyVisible}
                aria-label={`${bodyVisible ? t("common.collapse") : t("common.expand")} ${label}`}
                onClick={handleToggleExpanded}
              >
                <svg
                  className={`profile-string-list-chevron${bodyVisible ? " expanded" : ""}`}
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
            ) : null}
          </div>
        ) : null}
      </div>

      {bodyVisible ? (
        <div className="profile-string-list-body">
          {rows.length === 0 ? (
            <div className="profile-empty-state">
              {emptyHint ?? t("profileEditor.common.emptyDefault")}
            </div>
          ) : (
            <div className="profile-row-stack">
              {rows.map((row, index) => (
                <div key={row.id} className="profile-inline-row profile-string-list-row">
                  <input
                    className="form-input profile-string-list-input"
                    aria-label={buildItemLabel(index)}
                    value={row.value}
                    placeholder={placeholder}
                    onChange={(event) =>
                      onChange(
                        rows.map((candidate) =>
                          candidate.id === row.id
                            ? {
                                ...candidate,
                                value: event.target.value,
                              }
                            : candidate,
                        ),
                      )
                    }
                  />
                  <div className="profile-row-actions profile-string-list-actions">
                    <button
                      type="button"
                      className="profile-icon-btn danger"
                      aria-label={`${t("profileEditor.common.remove")} ${buildItemLabel(index)}`}
                      onClick={() => onChange(rows.filter((candidate) => candidate.id !== row.id))}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="profile-subsection-actions profile-string-list-footer">
            <button type="button" className="profile-secondary-btn" onClick={onAdd}>
              {addLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default StringListEditor;
