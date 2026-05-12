import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";
import useEscapeKey from "../hooks/useEscapeKey";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type { LogLevel, LogView } from "../types";
import {
  CONTROL_SURFACE_CLASS,
  FLOATING_SURFACE_CLASS,
  PANEL_SURFACE_CLASS,
  TOOLBAR_SURFACE_CLASS,
} from "./surface-classes";
import { TONE_TEXT_CLASS } from "./tone-classes";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";

type LevelFilter = "all" | Exclude<LogLevel, "unknown">;

interface LogViewerProps {
  onClose: () => void;
}

const LEVEL_OPTIONS: LevelFilter[] = ["all", "error", "warn", "info", "debug", "trace"];

function levelLabel(level: LogLevel): string {
  return level.toUpperCase();
}

function logEntryKey(entry: LogView["entries"][number]): string {
  return `${entry.timestamp ?? "unknown"}-${entry.level}-${entry.target ?? ""}-${entry.raw}`;
}

function levelTextClass(level: LogLevel): string {
  switch (level) {
    case "error":
      return TONE_TEXT_CLASS.danger;
    case "warn":
      return TONE_TEXT_CLASS.warning;
    case "info":
      return TONE_TEXT_CLASS.info;
    case "debug":
    case "trace":
    case "unknown":
      return TONE_TEXT_CLASS.muted;
  }
}

function LogViewer({ onClose }: LogViewerProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [view, setView] = useState<LogView | null>(null);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => {
    const next: { level?: LevelFilter; search?: string; limit: number } = { limit: 500 };
    if (level !== "all") {
      next.level = level;
    }
    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      next.search = trimmedSearch;
    }
    return next;
  }, [level, search]);
  const visibleEntries = useMemo(() => {
    const counts = new Map<string, number>();
    return (view?.entries ?? []).map((entry) => {
      const baseKey = logEntryKey(entry);
      const count = counts.get(baseKey) ?? 0;
      counts.set(baseKey, count + 1);
      return { entry, key: `${baseKey}-${count}` };
    });
  }, [view?.entries]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const nextView = await invoke<LogView>("get_app_logs", { query });
      setView(nextView);
    } catch (error) {
      showOperationError(showToast, t("logs.loadError"), error);
    } finally {
      setLoading(false);
    }
  }, [query, showToast, t]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEscapeKey(onClose);

  async function handleOpenDirectory() {
    try {
      await invoke("open_logs_dir");
    } catch (error) {
      showOperationError(showToast, t("logs.openDirError"), error);
    }
  }

  async function handleClearLogs() {
    setLoading(true);
    try {
      const nextView = await invoke<LogView>("clear_app_logs");
      setView(nextView);
      showToast(t("logs.clearSuccess"), "success");
    } catch (error) {
      showOperationError(showToast, t("logs.clearError"), error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="log-viewer-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5 max-md:p-3"
      onClick={onClose}
    >
      <section
        className={cn(
          "log-viewer flex h-[min(760px,calc(100vh-40px))] w-[min(980px,calc(100vw-40px))] flex-col overflow-hidden rounded-lg border text-foreground max-md:h-full max-md:w-full",
          FLOATING_SURFACE_CLASS,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-viewer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header
          className={cn(
            "log-viewer-header flex min-h-16 items-center justify-between gap-4 border-b px-5 py-4",
            TOOLBAR_SURFACE_CLASS,
          )}
        >
          <div className="log-viewer-title-group min-w-0">
            <h2 id="log-viewer-title" className="text-base font-semibold">
              {t("logs.title")}
            </h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {view?.logDir ?? t("logs.pathLoading")}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="log-viewer-icon-btn shrink-0"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="log-viewer-toolbar grid grid-cols-[150px_minmax(220px,1fr)_auto] items-end gap-3 border-b border-border/80 bg-card/70 px-5 py-4 max-md:grid-cols-1">
          <label className="log-viewer-field flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">{t("logs.level")}</span>
            <select
              className={cn(
                "h-9 rounded-md border border-input px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                CONTROL_SURFACE_CLASS,
              )}
              value={level}
              onChange={(event) => setLevel(event.target.value as LevelFilter)}
            >
              {LEVEL_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? t("logs.levelAll") : option.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="log-viewer-search flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">{t("logs.search")}</span>
            <Input
              type="search"
              value={search}
              placeholder={t("logs.searchPlaceholder")}
              className={CONTROL_SURFACE_CLASS}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="log-viewer-actions flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={loadLogs}>
              <RefreshCw className="size-4" />
              {t("logs.refresh")}
            </Button>
            <Button type="button" variant="outline" onClick={handleOpenDirectory}>
              <FolderOpen className="size-4" />
              {t("logs.openDir")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="log-viewer-danger-btn border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleClearLogs}
            >
              <Trash2 className="size-4" />
              {t("logs.clear")}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 p-5">
          <ScrollArea
            className={cn("log-viewer-body h-full rounded-md border", PANEL_SURFACE_CLASS)}
          >
            {loading ? (
              <div className="log-viewer-empty flex h-full min-h-[220px] items-center justify-center px-4 text-center text-muted-foreground">
                {t("loading")}
              </div>
            ) : visibleEntries.length ? (
              <>
                {view?.truncated ? (
                  <div className="log-viewer-hint border-b px-3 py-2 text-sm text-muted-foreground">
                    {t("logs.truncated")}
                  </div>
                ) : null}
                <div className="log-entry-list">
                  {visibleEntries.map(({ entry, key }) => (
                    <div
                      className={cn(
                        "log-line border-b px-3 py-1 font-mono text-xs leading-5 last:border-b-0",
                        levelTextClass(entry.level),
                      )}
                      key={key}
                    >
                      <div className="log-entry-meta flex flex-wrap gap-2">
                        <span className="log-entry-level font-bold">{levelLabel(entry.level)}</span>
                        {entry.timestamp ? (
                          <span className="text-muted-foreground">{entry.timestamp}</span>
                        ) : null}
                        {entry.target ? (
                          <span className="log-entry-target text-muted-foreground [overflow-wrap:anywhere]">
                            {entry.target}
                          </span>
                        ) : null}
                      </div>
                      <pre className="mt-1 whitespace-pre-wrap font-mono text-xs leading-5 [overflow-wrap:anywhere]">
                        {entry.message}
                      </pre>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="log-viewer-empty flex h-full min-h-[220px] items-center justify-center px-4 text-center text-muted-foreground">
                {t("logs.empty")}
              </div>
            )}
          </ScrollArea>
        </div>
      </section>
    </div>
  );
}

export default LogViewer;
