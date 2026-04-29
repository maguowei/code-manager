import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log";
import { isTauri } from "../types";

type ClientLogLevel = "error" | "warn" | "info" | "debug" | "trace";
let globalLoggingInstalled = false;

const SECRET_PATTERNS: [RegExp, string][] = [
  [
    /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|AUTH_TOKEN)[A-Z0-9_]*)=([^\s,;]+)/gi,
    "$1=<redacted>",
  ],
  [/\b(token|api[_-]?key|secret|password)(["']?\s*[:=]\s*["']?)([^"',\s;}{]+)/gi, "$1$2<redacted>"],
  [/\b(authorization)\s*:\s*(?:bearer\s+)?([^\s,;]+)/gi, "$1: <redacted>"],
];

function redact(message: string): string {
  return SECRET_PATTERNS.reduce(
    (next, [pattern, replacement]) => next.replace(pattern, replacement),
    message,
  );
}

function stringifyError(errorValue: unknown): string {
  if (errorValue instanceof Error) {
    return `${errorValue.name}: ${errorValue.message}`;
  }
  if (typeof errorValue === "string") {
    return errorValue;
  }
  try {
    return JSON.stringify(errorValue);
  } catch {
    return String(errorValue);
  }
}

function write(level: ClientLogLevel, message: string) {
  if (!isTauri()) return;
  const safeMessage = redact(message);
  const writer = { error, warn, info, debug, trace }[level];
  void writer(safeMessage).catch(() => {
    // 日志写入失败时不能打断用户操作。
  });
}

export const logger = {
  error: (message: string) => write("error", message),
  warn: (message: string) => write("warn", message),
  info: (message: string) => write("info", message),
  debug: (message: string) => write("debug", message),
  trace: (message: string) => write("trace", message),
};

export function installGlobalErrorLogging() {
  if (!isTauri()) return;
  if (globalLoggingInstalled) return;
  globalLoggingInstalled = true;

  window.addEventListener("error", (event) => {
    logger.error(
      `event=frontend.error status=error message=${stringifyError(event.error ?? event.message)}`,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    logger.error(
      `event=frontend.unhandled_rejection status=error message=${stringifyError(event.reason)}`,
    );
  });
}
