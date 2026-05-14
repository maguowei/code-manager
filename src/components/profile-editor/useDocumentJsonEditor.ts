import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { prettyJson } from "../config-workspace-utils";
import { readObject } from "./editor-utils";

const EMPTY_OBJECT_JSON = prettyJson({});

interface UseDocumentJsonEditorOptions {
  value: unknown;
  onApply: (next: Record<string, unknown>) => void;
  validateMessage: string;
  normalize?: (next: Record<string, unknown>) => Record<string, unknown>;
}

export function useDocumentJsonEditor({
  value,
  onApply,
  validateMessage,
  normalize,
}: UseDocumentJsonEditorOptions) {
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState("");
  const [hasAppliedDraft, setHasAppliedDraft] = useState(true);
  const lastAppliedSourceJsonRef = useRef<string | null>(null);
  const lastSeenSourceJsonRef = useRef<string | null>(null);
  const pendingAppliedSourceJsonsRef = useRef<Set<string>>(new Set());

  const readNormalizedValue = useCallback(() => {
    const nextValue = readObject(value);
    return normalize ? normalize(nextValue) : nextValue;
  }, [normalize, value]);

  const buildSourceJson = useCallback(() => {
    return prettyJson(readNormalizedValue());
  }, [readNormalizedValue]);

  const sourceJson = useMemo(() => {
    if (lastAppliedSourceJsonRef.current === null && lastSeenSourceJsonRef.current === null) {
      return null;
    }

    return buildSourceJson();
  }, [buildSourceJson]);

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

    const nextSourceJson = buildSourceJson();
    lastAppliedSourceJsonRef.current ??= nextSourceJson;
    lastSeenSourceJsonRef.current ??= nextSourceJson;
    return nextSourceJson;
  }

  function buildParseableJson(nextValue: string) {
    return nextValue.trim() === "" ? EMPTY_OBJECT_JSON : nextValue;
  }

  function parseJsonObject(nextValue: string): Record<string, unknown> {
    const parsed = JSON.parse(buildParseableJson(nextValue)) as unknown;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error(validateMessage);
    }

    const nextObject = parsed as Record<string, unknown>;
    if (Object.keys(nextObject).length === 0) {
      return nextObject;
    }

    return normalize ? normalize(nextObject) : nextObject;
  }

  function applyNextObject(nextObject: Record<string, unknown>) {
    const nextSourceJson = prettyJson(nextObject);
    const currentSourceJson = buildSourceJson();

    lastAppliedSourceJsonRef.current = nextSourceJson;
    lastSeenSourceJsonRef.current ??= currentSourceJson;
    setJsonError("");
    setHasAppliedDraft(true);

    if (nextSourceJson !== currentSourceJson) {
      pendingAppliedSourceJsonsRef.current.add(nextSourceJson);
      onApply(nextObject);
    }
  }

  function handleJsonChange(nextValue: string) {
    setRawJson(nextValue);

    try {
      const nextObject = parseJsonObject(nextValue);
      applyNextObject(nextObject);
    } catch (error) {
      setHasAppliedDraft(false);
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  }

  function formatJson() {
    try {
      const nextObject = parseJsonObject(readRawJson());
      const formattedJson = prettyJson(nextObject);

      setRawJson(formattedJson);
      applyNextObject(nextObject);
    } catch (error) {
      setHasAppliedDraft(false);
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  }

  function clearJson() {
    setRawJson(EMPTY_OBJECT_JSON);
    applyNextObject({});
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
