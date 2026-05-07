import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useI18n } from "../../i18n";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { StringRow } from "./editor-utils";

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
  rowActionLabel?: string;
  rowActionIcon?: ReactNode;
  onRowAction?: (row: StringRow, index: number) => void;
  buildRowActionAriaLabel?: (itemLabel: string) => string;
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
  rowActionLabel,
  rowActionIcon,
  onRowAction,
  buildRowActionAriaLabel,
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
  const bodyVisible = collapseToggleVisible ? (expanded ?? uncontrolledExpanded) : true;
  const clearButtonVisible =
    bodyVisible && rows.length > 0 && onClear !== undefined && clearLabel !== undefined;

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

  function buildRowActionLabel(itemLabel: string) {
    return buildRowActionAriaLabel?.(itemLabel) ?? `${rowActionLabel} ${itemLabel}`;
  }

  return (
    <div className="profile-subsection">
      <div className="profile-subsection-header">
        {collapseToggleVisible ? (
          <button
            type="button"
            className="profile-accordion-trigger profile-string-list-trigger min-w-0 flex-1"
            aria-expanded={bodyVisible}
            onClick={handleToggleExpanded}
          >
            <span className="profile-accordion-header-main profile-string-list-title-row flex min-w-0 flex-wrap items-center gap-2">
              <h4>{label}</h4>
              <Badge className="profile-accordion-badge">{rows.length}</Badge>
            </span>
          </button>
        ) : (
          <div className="profile-string-list-header-copy min-w-0 flex-1">
            <div className="profile-string-list-title-row flex min-w-0 flex-wrap items-center gap-2">
              <h4>{label}</h4>
            </div>
          </div>
        )}
        {collapseToggleVisible ? (
          <div className="profile-subsection-actions">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="profile-accordion-chevron-btn profile-string-list-collapse-btn"
              aria-expanded={bodyVisible}
              aria-label={`${bodyVisible ? t("common.collapse") : t("common.expand")} ${label}`}
              onClick={handleToggleExpanded}
            >
              <ChevronDown
                className={`profile-string-list-chevron size-4 transition-transform${bodyVisible ? " expanded rotate-180" : ""}`}
                aria-hidden="true"
              />
            </Button>
          </div>
        ) : null}
      </div>

      {bodyVisible ? (
        <div className="profile-string-list-body flex flex-col gap-3">
          {rows.length === 0 ? (
            <div className="profile-empty-state flex min-h-[96px] items-center justify-center rounded-lg border border-[var(--border-default)] px-4 text-center">
              {emptyHint ?? t("profileEditor.common.emptyDefault")}
            </div>
          ) : (
            <>
              {clearButtonVisible ? (
                <div className="profile-string-list-prelude -mb-1 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="profile-string-list-clear-btn h-auto px-1.5 py-0.5 text-xs text-[var(--text-muted)] hover:bg-[var(--secondary)] hover:text-[var(--text-secondary)]"
                    onClick={onClear}
                  >
                    {clearLabel}
                  </Button>
                </div>
              ) : null}

              <div className="profile-row-stack flex flex-col gap-3">
                {rows.map((row, index) => {
                  const itemLabel = buildItemLabel(index);

                  return (
                    <div
                      key={row.id}
                      className="profile-inline-row profile-string-list-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 max-[900px]:grid-cols-1"
                    >
                      <Input
                        className="form-input profile-string-list-input"
                        aria-label={itemLabel}
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
                      <div className="profile-row-actions profile-string-list-actions flex flex-wrap justify-end gap-2">
                        {onRowAction && rowActionLabel ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="profile-icon-btn profile-string-list-row-action-btn text-[var(--primary)] hover:bg-[var(--accent)] hover:text-[var(--primary)]"
                            aria-label={buildRowActionLabel(itemLabel)}
                            title={rowActionLabel}
                            onClick={() => onRowAction(row, index)}
                          >
                            {rowActionIcon ?? rowActionLabel}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="profile-icon-btn danger text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`${t("profileEditor.common.remove")} ${itemLabel}`}
                          onClick={() =>
                            onChange(rows.filter((candidate) => candidate.id !== row.id))
                          }
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="profile-subsection-actions profile-string-list-footer flex flex-wrap items-center justify-start gap-3">
            <Button
              type="button"
              variant="outline"
              className="profile-secondary-btn"
              onClick={onAdd}
            >
              <Plus className="size-4" aria-hidden="true" />
              {addLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default StringListEditor;
