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
    <div className="flex flex-col gap-3.5" data-slot="profile-subsection">
      <div className="flex items-start justify-between gap-3" data-slot="profile-subsection-header">
        {collapseToggleVisible ? (
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-w-0 flex-1 justify-start bg-transparent p-0 text-left hover:bg-transparent"
            aria-expanded={bodyVisible}
            onClick={handleToggleExpanded}
          >
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <h4>{label}</h4>
              <Badge className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {rows.length}
              </Badge>
            </span>
          </Button>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h4>{label}</h4>
            </div>
          </div>
        )}
        {collapseToggleVisible ? (
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-expanded={bodyVisible}
              aria-label={`${bodyVisible ? t("common.collapse") : t("common.expand")} ${label}`}
              onClick={handleToggleExpanded}
            >
              <ChevronDown
                className={`size-4 transition-transform${bodyVisible ? " expanded rotate-180" : ""}`}
                aria-hidden="true"
              />
            </Button>
          </div>
        ) : null}
      </div>

      {bodyVisible ? (
        <div className="flex flex-col gap-3">
          {rows.length === 0 ? (
            <div
              className="flex min-h-[96px] items-center justify-center rounded-lg border border-border px-4 text-center"
              data-slot="profile-empty-state"
            >
              {emptyHint ?? t("profileEditor.common.emptyDefault")}
            </div>
          ) : (
            <>
              {clearButtonVisible ? (
                <div className="-mb-1 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-muted-foreground"
                    onClick={onClear}
                  >
                    {clearLabel}
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                {rows.map((row, index) => {
                  const itemLabel = buildItemLabel(index);

                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 max-[900px]:grid-cols-1"
                    >
                      <Input
                        className="form-input "
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
                      <div className="flex flex-wrap justify-end gap-2">
                        {onRowAction && rowActionLabel ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-primary hover:bg-accent hover:text-primary"
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
                          className=" danger text-destructive hover:bg-destructive/10 hover:text-destructive"
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

          <div className="flex flex-wrap items-center justify-start gap-3">
            <Button type="button" variant="outline" className="" onClick={onAdd}>
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
