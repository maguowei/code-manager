import type { ReactNode } from "react";
import { useState } from "react";
import { useI18n } from "../../i18n";
import type { KeyValueRow } from "./editor-utils";

interface KeyValueRowsEditorProps {
  label: string;
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  onAdd: () => void;
  addLabel: string;
  keyLabelPrefix: string;
  valueLabelPrefix: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
  emptyHint?: string;
  maskSensitiveValue?: boolean;
  showTitle?: boolean;
  headerActions?: ReactNode;
  footer?: ReactNode;
}

function KeyValueRowsEditor({
  label,
  rows,
  onChange,
  onAdd,
  addLabel,
  keyLabelPrefix,
  valueLabelPrefix,
  keyPlaceholder,
  valuePlaceholder,
  emptyHint,
  maskSensitiveValue = false,
  showTitle = true,
  headerActions,
  footer,
}: KeyValueRowsEditorProps) {
  const { language } = useI18n();
  const isZh = language === "zh";
  const [visibleValueRowIds, setVisibleValueRowIds] = useState<string[]>([]);

  return (
    <div className="profile-subsection">
      <div className="profile-subsection-header">
        <div>
          {showTitle ? <h4>{label}</h4> : null}
          {emptyHint && rows.length === 0 ? <p>{emptyHint}</p> : null}
        </div>
        <div className="profile-subsection-actions">
          {headerActions}
          <button type="button" className="profile-secondary-btn" onClick={onAdd}>
            {addLabel}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="profile-empty-state">
          {emptyHint ?? (isZh ? "暂无配置" : "No entries yet")}
        </div>
      ) : (
        <div className="profile-row-stack">
          {rows.map((row, index) => {
            const shouldMaskValue =
              maskSensitiveValue &&
              /(key|token|secret|password|auth)/i.test(row.key) &&
              !visibleValueRowIds.includes(row.id);

            return (
              <div key={row.id} className="profile-key-value-grid">
                <input
                  aria-label={`${keyLabelPrefix} ${index + 1}`}
                  value={row.key}
                  placeholder={keyPlaceholder}
                  onChange={(event) =>
                    onChange(
                      rows.map((candidate) =>
                        candidate.id === row.id
                          ? {
                              ...candidate,
                              key: event.target.value,
                            }
                          : candidate,
                      ),
                    )
                  }
                />
                <div className="profile-value-input-wrap">
                  <input
                    aria-label={`${valueLabelPrefix} ${index + 1}`}
                    type={shouldMaskValue ? "password" : "text"}
                    value={row.value}
                    placeholder={valuePlaceholder}
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
                  {maskSensitiveValue && /(key|token|secret|password|auth)/i.test(row.key) ? (
                    <button
                      type="button"
                      className="profile-icon-btn"
                      aria-label={`${isZh ? "切换显示" : "Toggle visibility"} ${valueLabelPrefix} ${index + 1}`}
                      onClick={() =>
                        setVisibleValueRowIds((current) =>
                          current.includes(row.id)
                            ? current.filter((id) => id !== row.id)
                            : [...current, row.id],
                        )
                      }
                    >
                      {shouldMaskValue ? "显示" : "隐藏"}
                    </button>
                  ) : null}
                </div>
                <div className="profile-row-actions">
                  <button
                    type="button"
                    className="profile-icon-btn"
                    aria-label={`${isZh ? "上移" : "Move up"} ${label} ${index + 1}`}
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
                    aria-label={`${isZh ? "下移" : "Move down"} ${label} ${index + 1}`}
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
                    aria-label={`${isZh ? "删除" : "Remove"} ${label} ${index + 1}`}
                    onClick={() => onChange(rows.filter((candidate) => candidate.id !== row.id))}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {footer}
    </div>
  );
}

export default KeyValueRowsEditor;
