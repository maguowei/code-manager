import { useEffect, useMemo, useRef, useState } from "react";
import { prettyJson } from "../config-workspace-utils";
import { readObject } from "./editor-utils";

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
  const normalizedValue = useMemo(() => {
    const nextValue = readObject(value);
    return normalize ? normalize(nextValue) : nextValue;
  }, [normalize, value]);
  const sourceJson = useMemo(() => prettyJson(normalizedValue), [normalizedValue]);
  const [rawJson, setRawJson] = useState(sourceJson);
  const [jsonError, setJsonError] = useState("");
  const [hasAppliedDraft, setHasAppliedDraft] = useState(true);
  const lastAppliedSourceJsonRef = useRef(sourceJson);

  useEffect(() => {
    if (sourceJson === lastAppliedSourceJsonRef.current) {
      setJsonError("");
      setHasAppliedDraft(true);
      return;
    }

    setRawJson(sourceJson);
    setJsonError("");
    setHasAppliedDraft(true);
    lastAppliedSourceJsonRef.current = sourceJson;
  }, [sourceJson]);

  function parseJsonObject(nextValue: string): Record<string, unknown> {
    const parsed = JSON.parse(nextValue) as unknown;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error(validateMessage);
    }

    const nextObject = parsed as Record<string, unknown>;
    return normalize ? normalize(nextObject) : nextObject;
  }

  function applyNextObject(nextObject: Record<string, unknown>) {
    const nextSourceJson = prettyJson(nextObject);

    lastAppliedSourceJsonRef.current = nextSourceJson;
    setJsonError("");
    setHasAppliedDraft(true);

    if (nextSourceJson !== sourceJson) {
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
      const nextObject = parseJsonObject(rawJson);
      const formattedJson = prettyJson(nextObject);

      setRawJson(formattedJson);
      applyNextObject(nextObject);
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
