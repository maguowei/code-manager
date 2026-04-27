import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState("");
  const [hasAppliedDraft, setHasAppliedDraft] = useState(true);
  const lastAppliedSourceJsonRef = useRef<string | null>(null);
  const lastSeenSourceJsonRef = useRef<string | null>(null);

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

  function readRawJson() {
    if (rawJson !== null) {
      return rawJson;
    }

    const nextSourceJson = buildSourceJson();
    lastAppliedSourceJsonRef.current ??= nextSourceJson;
    lastSeenSourceJsonRef.current ??= nextSourceJson;
    return nextSourceJson;
  }

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
    const currentSourceJson = buildSourceJson();

    lastAppliedSourceJsonRef.current = nextSourceJson;
    lastSeenSourceJsonRef.current ??= currentSourceJson;
    setJsonError("");
    setHasAppliedDraft(true);

    if (nextSourceJson !== currentSourceJson) {
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

  return {
    get rawJson() {
      return readRawJson();
    },
    jsonError,
    hasAppliedDraft,
    handleJsonChange,
    formatJson,
  };
}
