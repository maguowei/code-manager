import { useI18n } from "../../i18n";
import type { StringRow } from "./editor-utils";
import "./StringListEditor.css";

interface StringListEditorProps {
  label: string;
  rows: StringRow[];
  onChange: (rows: StringRow[]) => void;
  onAdd: () => void;
  addLabel: string;
  itemLabelPrefix: string;
  placeholder: string;
  emptyHint?: string;
}

function StringListEditor({
  label,
  rows,
  onChange,
  onAdd,
  addLabel,
  itemLabelPrefix,
  placeholder,
  emptyHint,
}: StringListEditorProps) {
  const { t } = useI18n();

  function buildItemLabel(index: number) {
    return itemLabelPrefix.endsWith("-")
      ? `${itemLabelPrefix}${index + 1}`
      : `${itemLabelPrefix} ${index + 1}`;
  }

  return (
    <div className="profile-subsection">
      <div className="profile-subsection-header">
        <div>
          <h4>{label}</h4>
          {emptyHint && rows.length === 0 ? <p>{emptyHint}</p> : null}
        </div>
        <button type="button" className="profile-secondary-btn" onClick={onAdd}>
          {addLabel}
        </button>
      </div>

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
    </div>
  );
}

export default StringListEditor;
