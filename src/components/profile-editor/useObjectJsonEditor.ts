import { useEffect, useMemo, useRef, useState } from "react";
import { prettyJson } from "../config-workspace-utils";
import { readObject } from "./editor-utils";

const EMPTY_OBJECT_JSON = prettyJson({});

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
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState("");
  const [hasAppliedDraft, setHasAppliedDraft] = useState(true);
  const lastAppliedSourceJsonRef = useRef<string | null>(null);
  const lastSeenSourceJsonRef = useRef<string | null>(null);
  const pendingAppliedSourceJsonsRef = useRef<Set<string>>(new Set());

  const sourceJson = useMemo(() => {
    if (lastAppliedSourceJsonRef.current === null && lastSeenSourceJsonRef.current === null) {
      return null;
    }

    return prettyJson(objectValue);
  }, [objectValue]);

  useEffect(() => {
    if (sourceJson === null || sourceJson === lastSeenSourceJsonRef.current) {
      return;
    }

    lastSeenSourceJsonRef.current = sourceJson;

    if (
      pendingAppliedSourceJsonsRef.current.delete(sourceJson) ||
      sourceJson === lastAppliedSourceJsonRef.current
    ) {
      setJsonError("");
      setHasAppliedDraft(true);
      return;
    }

    setRawJson(sourceJson);
    setJsonError("");
    setHasAppliedDraft(true);
    lastAppliedSourceJsonRef.current = sourceJson;
  }, [sourceJson]);

  function readRawJson() {
    if (rawJson !== null) {
      return rawJson;
    }

    const nextSourceJson = prettyJson(objectValue);
    lastAppliedSourceJsonRef.current ??= nextSourceJson;
    lastSeenSourceJsonRef.current ??= nextSourceJson;
    return nextSourceJson;
  }

  function buildParseableJson(nextValue: string) {
    return nextValue.trim() === "" ? EMPTY_OBJECT_JSON : nextValue;
  }

  function buildUnsupportedKeysError(keys: string[]): string {
    if (!allowedKeys || keys.length === 0) {
      return "";
    }
    return isZh
      ? `${label} JSON 包含不支持的字段: ${keys.join(", ")}`
      : `${label} JSON contains unsupported keys: ${keys.join(", ")}`;
  }

  function applyNextObject(nextObject: Record<string, unknown>, nextRawJson: string) {
    const nextSourceJson = prettyJson(nextObject);
    const currentSourceJson = prettyJson(objectValue);

    lastAppliedSourceJsonRef.current = nextSourceJson;
    lastSeenSourceJsonRef.current ??= currentSourceJson;
    setRawJson(nextRawJson);
    setJsonError("");
    setHasAppliedDraft(true);

    if (JSON.stringify(nextObject) !== JSON.stringify(objectValue)) {
      pendingAppliedSourceJsonsRef.current.add(nextSourceJson);
      onChange(nextObject);
    }
  }

  function handleJsonChange(nextValue: string) {
    try {
      const nextObject = parseJsonObject(nextValue);
      applyNextObject(nextObject, nextValue);
    } catch (error) {
      setRawJson(nextValue);
      setHasAppliedDraft(false);
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  }

  function parseJsonObject(nextValue: string): Record<string, unknown> {
    const parsed = JSON.parse(buildParseableJson(nextValue)) as unknown;
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
      const nextObject = parseJsonObject(readRawJson());
      applyNextObject(nextObject, prettyJson(nextObject));
    } catch (error) {
      setHasAppliedDraft(false);
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  }

  function clearJson() {
    applyNextObject({}, EMPTY_OBJECT_JSON);
  }

  return {
    get rawJson() {
      return readRawJson();
    },
    jsonError,
    hasAppliedDraft,
    handleJsonChange,
    formatJson,
    clearJson,
  };
}
