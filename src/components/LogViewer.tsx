import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import useEscapeKey from "../hooks/useEscapeKey";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type { LogLevel, LogView } from "../types";
import "./LogViewer.css";

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
    } catch {
      showToast(t("logs.loadError"), "error");
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
    } catch {
      showToast(t("logs.openDirError"), "error");
    }
  }

  return (
    <div className="log-viewer-overlay" onClick={onClose}>
      <section
        className="log-viewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-viewer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="log-viewer-header">
          <div className="log-viewer-title-group">
            <h2 id="log-viewer-title">{t("logs.title")}</h2>
            <p>{view?.logDir ?? t("logs.pathLoading")}</p>
          </div>
          <button
            type="button"
            className="log-viewer-icon-btn"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="log-viewer-toolbar">
          <label className="log-viewer-field">
            <span>{t("logs.level")}</span>
            <select value={level} onChange={(event) => setLevel(event.target.value as LevelFilter)}>
              {LEVEL_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? t("logs.levelAll") : option.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="log-viewer-search">
            <span>{t("logs.search")}</span>
            <input
              type="search"
              value={search}
              placeholder={t("logs.searchPlaceholder")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="log-viewer-actions">
            <button type="button" onClick={loadLogs}>
              {t("logs.refresh")}
            </button>
            <button type="button" onClick={handleOpenDirectory}>
              {t("logs.openDir")}
            </button>
          </div>
        </div>

        <div className="log-viewer-body">
          {loading ? (
            <div className="log-viewer-empty">{t("loading")}</div>
          ) : visibleEntries.length ? (
            <>
              {view?.truncated ? (
                <div className="log-viewer-hint">{t("logs.truncated")}</div>
              ) : null}
              <div className="log-entry-list">
                {visibleEntries.map(({ entry, key }) => (
                  <article className={`log-entry log-entry--${entry.level}`} key={key}>
                    <div className="log-entry-meta">
                      <span className="log-entry-level">{levelLabel(entry.level)}</span>
                      {entry.timestamp ? <span>{entry.timestamp}</span> : null}
                      {entry.target ? (
                        <span className="log-entry-target">{entry.target}</span>
                      ) : null}
                    </div>
                    <pre>{entry.message}</pre>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="log-viewer-empty">{t("logs.empty")}</div>
          )}
        </div>
      </section>
    </div>
  );
}

export default LogViewer;
