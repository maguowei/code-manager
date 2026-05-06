import { Plus, X } from "lucide-react";
import { type ReactNode, useRef } from "react";
import {
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
  useController,
} from "react-hook-form";
import { type TranslationKey, useI18n } from "@/i18n";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface StringListFieldProps<
  TFieldValues extends FieldValues,
  TName extends Path<TFieldValues> = Path<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  labelKey: TranslationKey;
  placeholderKey?: TranslationKey;
  addLabelKey?: TranslationKey;
  removeLabelKey?: TranslationKey;
  resolveAddValue?: () => Promise<string | null> | string | null;
  resolveRowActionValue?: (
    currentValue: string,
    index: number,
  ) => Promise<string | null> | string | null;
  rowActionLabelKey?: TranslationKey;
  rowActionIcon?: ReactNode;
  buildRowActionAriaLabel?: (itemLabel: string, index: number) => string;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => (typeof item === "string" ? item : String(item ?? "")));
}

function useStableRowIds(prefix: string, length: number) {
  const nextIdRef = useRef(0);
  const rowIdsRef = useRef<string[]>([]);

  while (rowIdsRef.current.length < length) {
    rowIdsRef.current.push(`${prefix}-${nextIdRef.current}`);
    nextIdRef.current += 1;
  }

  if (rowIdsRef.current.length > length) {
    rowIdsRef.current.length = length;
  }

  function removeRowId(index: number) {
    rowIdsRef.current.splice(index, 1);
  }

  return { rowIds: rowIdsRef.current, removeRowId };
}

export function StringListField<
  TFieldValues extends FieldValues,
  TName extends Path<TFieldValues> = Path<TFieldValues>,
>({
  control,
  name,
  labelKey,
  placeholderKey,
  addLabelKey,
  removeLabelKey = "profileEditor.common.remove",
  resolveAddValue,
  resolveRowActionValue,
  rowActionLabelKey,
  rowActionIcon,
  buildRowActionAriaLabel,
}: StringListFieldProps<TFieldValues, TName>) {
  const { t } = useI18n();
  const { field } = useController<TFieldValues, TName>({ control, name });
  const values = normalizeStringList(field.value);
  const { rowIds, removeRowId } = useStableRowIds(field.name, values.length);
  const label = t(labelKey);
  const removeLabel = t(removeLabelKey);

  function commit(nextValues: string[]) {
    field.onChange(nextValues as PathValue<TFieldValues, TName>);
  }

  async function handleAdd() {
    const nextValue = resolveAddValue ? await resolveAddValue() : "";
    if (nextValue === null) {
      return;
    }

    commit([...values, nextValue]);
  }

  function handleValueChange(index: number, value: string) {
    commit(values.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function handleRemove(index: number) {
    removeRowId(index);
    commit(values.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleRowAction(index: number) {
    if (!resolveRowActionValue) {
      return;
    }

    const nextValue = await resolveRowActionValue(values[index] ?? "", index);
    if (nextValue === null) {
      return;
    }

    handleValueChange(index, nextValue);
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="space-y-2">
        {values.map((value, index) => {
          const itemLabel = `${label} ${index + 1}`;
          const rowId = rowIds[index];
          const rowActionLabel =
            rowActionLabelKey && resolveRowActionValue
              ? (buildRowActionAriaLabel?.(itemLabel, index) ??
                `${t(rowActionLabelKey)} ${index + 1}`)
              : "";

          return (
            <div key={rowId} className="flex items-center gap-2">
              <Input
                name={`${field.name}.${index}`}
                aria-label={itemLabel}
                value={value}
                placeholder={placeholderKey ? t(placeholderKey) : ""}
                onBlur={field.onBlur}
                onChange={(event) => handleValueChange(index, event.target.value)}
              />
              {resolveRowActionValue && rowActionLabelKey ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={rowActionLabel}
                  title={rowActionLabel}
                  onClick={() => void handleRowAction(index)}
                >
                  {rowActionIcon ?? t(rowActionLabelKey)}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${removeLabel} ${index + 1}`}
                title={`${removeLabel} ${index + 1}`}
                onClick={() => handleRemove(index)}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          );
        })}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void handleAdd()}>
        <Plus className="size-4" aria-hidden="true" />
        {t(addLabelKey ?? "common.add")}
      </Button>
    </div>
  );
}
