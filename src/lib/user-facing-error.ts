import type { ShowToast } from "../hooks/useToast";

const MAX_REASON_LENGTH = 180;
const ELLIPSIS = "…";

const LOW_LEVEL_ERROR_NAMES = new Set([
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
]);

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
  return value.replace(/\/Users\/[^/\s"'`),\]}:]+/g, "~").replace(/\/home\/[^/\s"'`),\]}:]+/g, "~");
}

function shortenNonHomeAbsolutePaths(value: string) {
  return value.replace(
    /(^|[\s"'`(])\/(?!Users\/|home\/)([^\s"'`),\]}:]+(?:\/[^\s"'`),\]}:]+)+)/g,
    (_match, prefix: string, path: string) => {
      const basename = path.split("/").filter(Boolean).at(-1);
      return `${prefix}…/${basename ?? "path"}`;
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
