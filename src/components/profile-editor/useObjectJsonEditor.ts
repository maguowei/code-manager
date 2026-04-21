import { useEffect, useMemo, useState } from "react";
import { prettyJson } from "../config-workspace-utils";
import { readObject } from "./editor-utils";

interface UseObjectJsonEditorOptions {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  label: string;
  isZh: boolean;
  allowedKeys?: string[];
  validateObject?: (next: Record<string, unknown>) => string;
}

export function useObjectJsonEditor({
  value,
  onChange,
  label,
  isZh,
  allowedKeys,
  validateObject,
}: UseObjectJsonEditorOptions) {
  const objectValue = useMemo(() => readObject(value), [value]);
  const sourceJson = useMemo(() => prettyJson(objectValue), [objectValue]);
  const [rawJson, setRawJson] = useState(sourceJson);
  const [jsonError, setJsonError] = useState("");
  const [hasAppliedDraft, setHasAppliedDraft] = useState(true);

  useEffect(() => {
    setRawJson(sourceJson);
    setJsonError("");
    setHasAppliedDraft(true);
  }, [sourceJson]);

  function buildUnsupportedKeysError(keys: string[]): string {
    if (!allowedKeys || keys.length === 0) {
      return "";
    }
    return isZh
      ? `${label} JSON 包含不支持的字段: ${keys.join(", ")}`
      : `${label} JSON contains unsupported keys: ${keys.join(", ")}`;
  }

  function handleJsonChange(nextValue: string) {
    setRawJson(nextValue);

    try {
      const nextObject = parseJsonObject(nextValue);
      setJsonError("");
      setHasAppliedDraft(true);
      if (JSON.stringify(nextObject) !== JSON.stringify(objectValue)) {
        onChange(nextObject);
      }
    } catch (error) {
      setHasAppliedDraft(false);
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  }

  function parseJsonObject(nextValue: string): Record<string, unknown> {
    const parsed = JSON.parse(nextValue) as unknown;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error(
        isZh ? `${label} JSON 必须是 JSON 对象` : `${label} JSON must be a JSON object`,
      );
    }

    const nextObject = parsed as Record<string, unknown>;
    if (allowedKeys) {
      const unsupportedKeys = Object.keys(nextObject)
        .filter((key) => !allowedKeys.includes(key))
        .sort();
      const unsupportedKeysError = buildUnsupportedKeysError(unsupportedKeys);
      if (unsupportedKeysError) {
        throw new Error(unsupportedKeysError);
      }
    }

    const validationError = validateObject?.(nextObject) ?? "";
    if (validationError) {
      throw new Error(validationError);
    }

    return nextObject;
  }

  function formatJson() {
    try {
      const nextObject = parseJsonObject(rawJson);
      setJsonError("");
      setHasAppliedDraft(true);
      setRawJson(prettyJson(nextObject));
      if (JSON.stringify(nextObject) !== JSON.stringify(objectValue)) {
        onChange(nextObject);
      }
    } catch (error) {
      setHasAppliedDraft(false);
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    rawJson,
    jsonError,
    hasAppliedDraft,
    handleJsonChange,
    formatJson,
  };
}
