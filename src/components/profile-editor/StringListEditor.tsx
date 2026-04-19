import { useI18n } from "../../i18n";
import type { StringRow } from "./editor-utils";

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
  const { language } = useI18n();
  const isZh = language === "zh";

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
          {emptyHint ?? (isZh ? "暂无配置" : "No entries yet")}
        </div>
      ) : (
        <div className="profile-row-stack">
          {rows.map((row, index) => (
            <div key={row.id} className="profile-inline-row">
              <input
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
              <div className="profile-row-actions">
                <button
                  type="button"
                  className="profile-icon-btn"
                  aria-label={`${isZh ? "上移" : "Move up"} ${buildItemLabel(index)}`}
                  disabled={index === 0}
                  onClick={() => {
                    if (index === 0) {
                      return;
                    }
                    const next = [...rows];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    onChange(next);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="profile-icon-btn"
                  aria-label={`${isZh ? "下移" : "Move down"} ${buildItemLabel(index)}`}
                  disabled={index === rows.length - 1}
                  onClick={() => {
                    if (index === rows.length - 1) {
                      return;
                    }
                    const next = [...rows];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    onChange(next);
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="profile-icon-btn danger"
                  aria-label={`${isZh ? "删除" : "Remove"} ${buildItemLabel(index)}`}
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
