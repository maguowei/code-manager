import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import {
  buildKeyValueError,
  createRowId,
  keyValueRowsFromRecord,
  recordFromKeyValueRows,
} from "./editor-utils";
import KeyValueRowsEditor from "./KeyValueRowsEditor";

interface EnvEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
  showTitle?: boolean;
  hiddenKeys?: string[];
}

function EnvEditor({
  value,
  onChange,
  onError,
  showTitle = true,
  hiddenKeys = [],
}: EnvEditorProps) {
  const { language } = useI18n();
  const isZh = language === "zh";
  const hiddenKeySet = useMemo(() => new Set(hiddenKeys), [hiddenKeys]);
  const fullValue = useMemo(
    () => (typeof value === "object" && value ? (value as Record<string, unknown>) : {}),
    [value],
  );
  const visibleValue = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(fullValue).filter(([key]) => !hiddenKeySet.has(key)),
      ) as Record<string, unknown>,
    [fullValue, hiddenKeySet],
  );
  const structuredPreservedEntries = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(fullValue).filter(
          ([key, entry]) => hiddenKeySet.has(key) || typeof entry !== "string",
        ),
      ) as Record<string, unknown>,
    [fullValue, hiddenKeySet],
  );
  const initialRows = useMemo(() => keyValueRowsFromRecord(visibleValue), [visibleValue]);
  const [rows, setRows] = useState(initialRows);
  const [structuredError, setStructuredError] = useState("");
  const skipStructuredSyncRef = useRef(false);

  useEffect(() => {
    skipStructuredSyncRef.current = true;
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    if (skipStructuredSyncRef.current) {
      skipStructuredSyncRef.current = false;
      return;
    }
    const error = buildKeyValueError(rows, isZh ? "环境变量" : "Environment variables", isZh);
    setStructuredError(error);
    if (!error) {
      const nextValue = {
        ...structuredPreservedEntries,
        ...recordFromKeyValueRows(rows),
      };
      if (JSON.stringify(nextValue) !== JSON.stringify(fullValue)) {
        onChange(nextValue);
      }
    }
  }, [fullValue, isZh, onChange, rows, structuredPreservedEntries]);

  useEffect(() => {
    onError(structuredError);
  }, [onError, structuredError]);

  return (
    <KeyValueRowsEditor
      label={isZh ? "环境变量" : "Environment Variables"}
      showTitle={showTitle}
      rows={rows}
      onChange={setRows}
      onAdd={() =>
        setRows((current) => [
          ...current,
          {
            id: createRowId("env"),
            key: "",
            value: "",
          },
        ])
      }
      addLabel={isZh ? "新增环境变量" : "Add environment variable"}
      keyLabelPrefix={isZh ? "环境变量 Key" : "Environment Variable Key"}
      valueLabelPrefix={isZh ? "环境变量 Value" : "Environment Variable Value"}
      keyPlaceholder={isZh ? "例如：OPENAI_API_KEY" : "e.g. OPENAI_API_KEY"}
      valuePlaceholder={isZh ? "填写变量值" : "Enter value"}
      emptyHint={
        isZh
          ? "把没有官方 settings 键的能力放进 env，例如 API Key 或其它工具变量。"
          : "Use env for values without official settings keys, such as API keys or tool variables."
      }
      maskSensitiveValue
    />
  );
}

export default EnvEditor;
