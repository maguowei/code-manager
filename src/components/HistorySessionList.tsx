import { useVirtualizer } from "@tanstack/react-virtual";
import { type KeyboardEvent, memo, useCallback, useMemo, useRef, useState } from "react";
import {
  type FlatItem,
  flattenSessionsForVirtualizer,
  formatDateLabel,
  formatTime,
  groupSessionsByDate,
  type SessionGroup,
  toLocalDateKey,
} from "../history-utils";
import { useI18n } from "../i18n";

interface Props {
  groups: SessionGroup[];
  searchQuery: string;
  onViewDetail?: (sessionId: string) => void;
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const SIZE_DATE_HEADER = 36;
const SIZE_SESSION = 36;
const SIZE_ENTRY = 28;

function estimateRowSize(item: FlatItem): number {
  switch (item.kind) {
    case "date-header":
      return SIZE_DATE_HEADER;
    case "session":
      return SIZE_SESSION;
    case "entry":
      return SIZE_ENTRY;
  }
}

function HistorySessionList({ groups, searchQuery, onViewDetail }: Props) {
  const { t } = useI18n();
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const dateGroups = useMemo(() => groupSessionsByDate(groups), [groups]);
  // 今天/昨天键每次 render 重算（开销可忽略），保证跨天边界自动同步
  const now = Date.now();
  const todayKey = toLocalDateKey(now);
  const yesterdayKey = toLocalDateKey(now - 86_400_000);

  const flatItems = useMemo(
    () => flattenSessionsForVirtualizer(dateGroups, expandedSessions),
    [dateGroups, expandedSessions],
  );

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateRowSize(flatItems[index]),
    overscan: 8,
    getItemKey: (index) => {
      const item = flatItems[index];
      if (item.kind === "date-header") return `d:${item.dateKey}`;
      if (item.kind === "session") return `s:${item.session.sessionId}`;
      return `e:${item.sessionId}:${item.index}`;
    },
  });

  const toggleSession = useCallback((sessionId: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }, []);

  const toggleDateGroup = useCallback((sessionIds: string[]) => {
    setExpandedSessions((prev) => {
      const allExpanded = sessionIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allExpanded) {
        for (const id of sessionIds) next.delete(id);
      } else {
        for (const id of sessionIds) next.add(id);
      }
      return next;
    });
  }, []);

  const setExpanded = useCallback((sessionId: string, expanded: boolean) => {
    setExpandedSessions((prev) => {
      const has = prev.has(sessionId);
      if (has === expanded) return prev;
      const next = new Set(prev);
      if (expanded) next.add(sessionId);
      else next.delete(sessionId);
      return next;
    });
  }, []);

  const handleMainKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, sessionId: string, isExpanded: boolean) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (!isExpanded) setExpanded(sessionId, true);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (isExpanded) setExpanded(sessionId, false);
      }
    },
    [setExpanded],
  );

  if (groups.length === 0) {
    return (
      <div className="history-sessions">
        <div className="empty-state">{t("history.noData")}</div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div ref={scrollRef} className="history-sessions">
      <div className="history-sessions-spacer" style={{ height: totalSize }}>
        {virtualItems.map((vi) => {
          const item = flatItems[vi.index];
          const top = vi.start;

          if (item.kind === "date-header") {
            const isToday = item.dateKey === todayKey;
            const allExpanded = item.sessionIds.every((id) => expandedSessions.has(id));
            return (
              <div
                key={vi.key}
                className={`history-date-label${isToday ? " is-today" : ""}`}
                style={{ position: "absolute", top, left: 0, right: 0, height: vi.size }}
              >
                <span>
                  {formatDateLabel(
                    item.dateKey,
                    todayKey,
                    yesterdayKey,
                    t("history.today"),
                    t("history.yesterday"),
                  )}
                </span>
                <button
                  type="button"
                  className="date-toggle-btn"
                  onClick={() => toggleDateGroup(item.sessionIds)}
                  aria-pressed={allExpanded}
                >
                  {allExpanded ? t("history.collapse") : t("history.expand")}
                </button>
              </div>
            );
          }

          if (item.kind === "session") {
            const session = item.session;
            const isExpanded = item.expanded;
            const firstEntry = session.entries.length > 0 ? session.entries[0] : null;
            return (
              <div
                key={vi.key}
                className="history-session-row"
                style={{ position: "absolute", top, left: 0, right: 0, height: vi.size }}
              >
                <button
                  type="button"
                  className="session-toggle-btn"
                  onClick={() => toggleSession(session.sessionId)}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? t("history.collapse") : t("history.expand")}
                >
                  <span className="session-toggle-icon" aria-hidden="true">
                    {isExpanded ? "▼" : "▶"}
                  </span>
                </button>
                <button
                  type="button"
                  className="session-main-btn"
                  onClick={() => onViewDetail?.(session.sessionId)}
                  onKeyDown={(e) => handleMainKeyDown(e, session.sessionId, isExpanded)}
                  aria-label={t("history.viewConversation")}
                  title={t("history.viewConversation")}
                >
                  <span className="session-id">{session.sessionId.slice(0, 8)}</span>
                  <span className="session-count">
                    {session.entries.length} {t("history.messages")}
                  </span>
                  {!isExpanded && firstEntry && (
                    <span className="session-preview" title={firstEntry.display}>
                      {highlightText(firstEntry.display, searchQuery)}
                    </span>
                  )}
                  <span className="session-time">{formatTime(session.lastTimestamp)}</span>
                </button>
              </div>
            );
          }

          // entry 行
          return (
            <div
              key={vi.key}
              className="history-entry"
              style={{ position: "absolute", top, left: 0, right: 0, height: vi.size }}
            >
              <span className="entry-time">{formatTime(item.entry.timestamp)}</span>
              <span className="entry-display" title={item.entry.display}>
                {highlightText(item.entry.display, searchQuery)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(HistorySessionList);
