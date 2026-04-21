import type { TranslationKey } from "../../i18n";
import { readObject, readString } from "./editor-utils";

export const STATUS_LINE_JSON_ALLOWED_KEYS = [
  "type",
  "command",
  "padding",
  "refreshInterval",
] as const;

export interface StatusLineFormValue {
  command: string;
  padding: string;
  refreshInterval: string;
}

export type StatusLineValidationCode =
  | "typeMustBeCommand"
  | "commandRequired"
  | "paddingNumber"
  | "refreshIntervalInteger"
  | "refreshIntervalMin";

export function readStatusLineFormValue(value: unknown): StatusLineFormValue {
  const record = readObject(value);
  return {
    command: readString(record.command),
    padding:
      typeof record.padding === "number" && Number.isFinite(record.padding)
        ? String(record.padding)
        : "",
    refreshInterval:
      typeof record.refreshInterval === "number" && Number.isFinite(record.refreshInterval)
        ? String(record.refreshInterval)
        : "",
  };
}

function parseOptionalFiniteNumber(value: string): number | undefined | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalInteger(value: string): number | undefined | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

export function normalizeStatusLineFormValue(value: StatusLineFormValue): {
  normalized: Record<string, unknown>;
  errorCode: StatusLineValidationCode | null;
} {
  const command = value.command.trim();
  const paddingValue = value.padding.trim();
  const refreshIntervalValue = value.refreshInterval.trim();

  if (!command && !paddingValue && !refreshIntervalValue) {
    return {
      normalized: {},
      errorCode: null,
    };
  }

  if (!command) {
    return {
      normalized: {},
      errorCode: "commandRequired",
    };
  }

  const padding = parseOptionalFiniteNumber(paddingValue);
  if (padding === null) {
    return {
      normalized: {},
      errorCode: "paddingNumber",
    };
  }

  const refreshInterval = parseOptionalInteger(refreshIntervalValue);
  if (refreshInterval === null) {
    return {
      normalized: {},
      errorCode: "refreshIntervalInteger",
    };
  }

  if (typeof refreshInterval === "number" && refreshInterval < 1) {
    return {
      normalized: {},
      errorCode: "refreshIntervalMin",
    };
  }

  return {
    normalized: {
      type: "command",
      command,
      ...(typeof padding === "number" ? { padding } : {}),
      ...(typeof refreshInterval === "number" ? { refreshInterval } : {}),
    },
    errorCode: null,
  };
}

export function validateStatusLineObject(
  value: Record<string, unknown>,
): StatusLineValidationCode | null {
  if (Object.keys(value).length === 0) {
    return null;
  }

  if (value.type !== "command") {
    return "typeMustBeCommand";
  }

  if (!readString(value.command).trim()) {
    return "commandRequired";
  }

  if ("padding" in value) {
    if (typeof value.padding !== "number" || !Number.isFinite(value.padding)) {
      return "paddingNumber";
    }
  }

  if ("refreshInterval" in value) {
    if (typeof value.refreshInterval !== "number" || !Number.isInteger(value.refreshInterval)) {
      return "refreshIntervalInteger";
    }

    if (value.refreshInterval < 1) {
      return "refreshIntervalMin";
    }
  }

  return null;
}

export function getStatusLineErrorKey(
  code: StatusLineValidationCode,
  context: "controls" | "json",
): TranslationKey {
  if (context === "json") {
    switch (code) {
      case "typeMustBeCommand":
        return "profileEditor.statusLine.errorJsonType";
      case "commandRequired":
        return "profileEditor.statusLine.errorJsonCommandRequired";
      case "paddingNumber":
        return "profileEditor.statusLine.errorJsonPaddingNumber";
      case "refreshIntervalInteger":
        return "profileEditor.statusLine.errorJsonRefreshIntervalInteger";
      case "refreshIntervalMin":
        return "profileEditor.statusLine.errorJsonRefreshIntervalMin";
    }
  }

  switch (code) {
    case "typeMustBeCommand":
      return "profileEditor.statusLine.errorType";
    case "commandRequired":
      return "profileEditor.statusLine.errorCommandRequired";
    case "paddingNumber":
      return "profileEditor.statusLine.errorPaddingNumber";
    case "refreshIntervalInteger":
      return "profileEditor.statusLine.errorRefreshIntervalInteger";
    case "refreshIntervalMin":
      return "profileEditor.statusLine.errorRefreshIntervalMin";
  }
}
