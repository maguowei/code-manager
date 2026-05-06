import { Plus, X } from "lucide-react";
import { useRef } from "react";
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

interface KeyValueEntry {
  key: string;
  value: string;
}

interface KeyValueFieldProps<
  TFieldValues extends FieldValues,
  TName extends Path<TFieldValues> = Path<TFieldValues>,
> {
  control: Control<TFieldValues>;
  name: TName;
  labelKey: TranslationKey;
  keyPlaceholderKey?: TranslationKey;
  valuePlaceholderKey?: TranslationKey;
  addLabelKey?: TranslationKey;
  removeLabelKey?: TranslationKey;
}

function normalizeKeyValueList(value: unknown): KeyValueEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      return { key: "", value: "" };
    }

    const record = item as Partial<Record<keyof KeyValueEntry, unknown>>;
    return {
      key: typeof record.key === "string" ? record.key : String(record.key ?? ""),
      value: typeof record.value === "string" ? record.value : String(record.value ?? ""),
    };
  });
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

export function KeyValueField<
  TFieldValues extends FieldValues,
  TName extends Path<TFieldValues> = Path<TFieldValues>,
>({
  control,
  name,
  labelKey,
  keyPlaceholderKey,
  valuePlaceholderKey,
  addLabelKey,
  removeLabelKey = "profileEditor.common.remove",
}: KeyValueFieldProps<TFieldValues, TName>) {
  const { t } = useI18n();
  const { field } = useController<TFieldValues, TName>({ control, name });
  const values = normalizeKeyValueList(field.value);
  const { rowIds, removeRowId } = useStableRowIds(field.name, values.length);
  const label = t(labelKey);
  const keyPlaceholder = keyPlaceholderKey ? t(keyPlaceholderKey) : "";
  const valuePlaceholder = valuePlaceholderKey ? t(valuePlaceholderKey) : "";
  const removeLabel = t(removeLabelKey);

  function commit(nextValues: KeyValueEntry[]) {
    field.onChange(nextValues as PathValue<TFieldValues, TName>);
  }

  function handleValueChange(index: number, patch: Partial<KeyValueEntry>) {
    commit(values.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function handleRemove(index: number) {
    removeRowId(index);
    commit(values.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="space-y-2">
        {values.map((item, index) => (
          <div key={rowIds[index]} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <Input
              name={`${field.name}.${index}.key`}
              aria-label={`${keyPlaceholder || label} ${index + 1}`}
              value={item.key}
              placeholder={keyPlaceholder}
              onBlur={field.onBlur}
              onChange={(event) => handleValueChange(index, { key: event.target.value })}
            />
            <Input
              name={`${field.name}.${index}.value`}
              aria-label={`${valuePlaceholder || label} ${index + 1}`}
              value={item.value}
              placeholder={valuePlaceholder}
              onBlur={field.onBlur}
              onChange={(event) => handleValueChange(index, { value: event.target.value })}
            />
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
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => commit([...values, { key: "", value: "" }])}
      >
        <Plus className="size-4" aria-hidden="true" />
        {t(addLabelKey ?? "common.add")}
      </Button>
    </div>
  );
}
