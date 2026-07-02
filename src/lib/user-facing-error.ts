import type { CommandErrorCode } from "../bindings";
import type { ShowToast } from "../hooks/useToast";
import { type TranslationKey, type TranslationValues, translate } from "../i18n";

const MAX_REASON_LENGTH = 180;
const ELLIPSIS = "…";

const LOW_LEVEL_ERROR_NAMES = new Set([
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
]);

const COMMAND_ERROR_KEYS: Record<CommandErrorCode, TranslationKey> = {
  invalidInput: "errors.invalidInput",
  notFound: "errors.notFound",
  alreadyExists: "errors.alreadyExists",
  conflict: "errors.conflict",
  unsupported: "errors.unsupported",
  permissionDenied: "errors.permissionDenied",
  authenticationFailed: "errors.authenticationFailed",
  networkFailed: "errors.networkFailed",
  timeout: "errors.timeout",
  externalCommandFailed: "errors.externalCommandFailed",
  ioFailed: "errors.ioFailed",
  invalidData: "errors.invalidData",
  internal: "errors.internal",
};

function structuredCommandErrorReason(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error) || !("args" in error)) {
    return null;
  }
  if (typeof error.code !== "string" || typeof error.args !== "object" || error.args === null) {
    return null;
  }

  const key = COMMAND_ERROR_KEYS[error.code as CommandErrorCode] ?? "errors.internal";
  const values = Object.fromEntries(
    Object.entries(error.args).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  ) as TranslationValues;
  return translate(key, values);
}

function isBlankOrPlaceholder(value: string) {
  return value === "" || /^(undefined|null|\[object Object\])$/i.test(value);
}

function looksLikeStackTrace(value: string) {
  return /\n\s*at\s+\S+/.test(value) || /^\s*at\s+\S+/m.test(value);
}

function looksLikeMarkupPayload(value: string) {
  const trimmed = value.trimStart();
  return (
    /^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed) || /<\/html>/i.test(value)
  );
}

function looksLikeLargeStructuredPayload(value: string) {
  const trimmed = value.trimStart();
  return (trimmed.startsWith("{") || trimmed.startsWith("[")) && value.length > 120;
}

function stripGenericErrorPrefix(value: string) {
  return value.replace(/^Error:\s*/i, "").trim();
}

function sanitizeAbsolutePaths(value: string) {
  return value
    .replace(/\/Users\/[^/"'`),\]}:]+/g, "~")
    .replace(/\/home\/[^/"'`),\]}:]+/g, "~")
    .replace(/[A-Za-z]:\\Users\\[^\\"'`),\]}:]+/g, "~");
}

function shortenNonHomeAbsolutePaths(value: string) {
  const shortenedPosix = value.replace(
    /(^|[\s"'`(])\/(?!Users\/|home\/)([^\s"'`),\]}:]+(?:\/[^\s"'`),\]}:]+)+)/g,
    (_match, prefix: string, path: string) => {
      const basename = path.split("/").filter(Boolean).at(-1);
      return `${prefix}…/${basename ?? "path"}`;
    },
  );
  const shortenedQuotedWindows = shortenedPosix.replace(
    /(^|[\s(])(["'`])([A-Za-z]:\\[^"'`\r\n]*\\[^"'`\r\n]*?)\2/g,
    (_match, prefix: string, quote: string, path: string) => {
      const basename = path.split("\\").filter(Boolean).at(-1);
      return `${prefix}${quote}…\\${basename ?? "path"}${quote}`;
    },
  );
  return shortenedQuotedWindows.replace(
    /(^|[\s"'`(])[A-Za-z]:\\(?!Users\\)([^\\\s"'`),\]}:]+(?:\\[^\\\s"'`),\]}:]+)+)/g,
    (_match, prefix: string, path: string) => {
      const basename = path.split("\\").filter(Boolean).at(-1);
      return `${prefix}…\\${basename ?? "path"}`;
    },
  );
}

function truncateReason(value: string) {
  if (value.length <= MAX_REASON_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_REASON_LENGTH)}${ELLIPSIS}`;
}

function errorMessageFromUnknown(error: unknown): string | null {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    if (LOW_LEVEL_ERROR_NAMES.has(error.name)) {
      return null;
    }
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return String(error);
}

export function getUserFacingErrorReason(error: unknown): string | null {
  const structuredReason = structuredCommandErrorReason(error);
  if (structuredReason) {
    return structuredReason;
  }

  const rawMessage = errorMessageFromUnknown(error);
  if (rawMessage === null) {
    return null;
  }

  const trimmed = rawMessage.trim();
  if (isBlankOrPlaceholder(trimmed)) {
    return null;
  }
  if (looksLikeStackTrace(trimmed) || looksLikeMarkupPayload(trimmed)) {
    return null;
  }
  if (looksLikeLargeStructuredPayload(trimmed)) {
    return null;
  }
  const withoutGenericPrefix = stripGenericErrorPrefix(trimmed);
  if (/^(TypeError|SyntaxError|ReferenceError|RangeError)(:|$)/.test(withoutGenericPrefix)) {
    return null;
  }

  const friendlyReason = truncateReason(
    shortenNonHomeAbsolutePaths(sanitizeAbsolutePaths(withoutGenericPrefix)),
  );
  return isBlankOrPlaceholder(friendlyReason) ? null : friendlyReason;
}

export function showOperationError(showToast: ShowToast, title: string, error: unknown) {
  const description = getUserFacingErrorReason(error);
  if (description && description !== title) {
    showToast(title, "error", { description });
    return;
  }
  showToast(title, "error");
}
