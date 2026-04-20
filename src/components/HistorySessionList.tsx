import { memo, useMemo, useState } from "react";
import type { SessionGroup } from "../history-utils";
import { useI18n } from "../i18n";

interface Props {
  groups: SessionGroup[];
  searchQuery: string;
  onViewDetail?: (sessionId: string) => void;
}

function groupByDate(sessions: SessionGroup[]): Map<string, SessionGroup[]> {
  const map = new Map<string, SessionGroup[]>();
  for (const s of sessions) {
    const date = new Date(s.lastTimestamp).toLocaleDateString();
    const arr = map.get(date) || [];
    arr.push(s);
    map.set(date, arr);
  }
  return map;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDateLabel(
  dateStr: string,
  todayStr: string,
  yesterdayStr: string,
  todayLabel: string,
  yesterdayLabel: string,
): string {
  if (dateStr === todayStr) return todayLabel;
  if (dateStr === yesterdayStr) return yesterdayLabel;
  return dateStr;
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

function HistorySessionList({ groups, searchQuery, onViewDetail }: Props) {
  const { t } = useI18n();
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const toggleSession = (sessionId: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const toggleDateGroup = (sessions: SessionGroup[]) => {
    setExpandedSessions((prev) => {
      const ids = sessions.map((s) => s.sessionId);
      const allExpanded = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allExpanded) {
        ids.forEach((id) => {
          next.delete(id);
        });
      } else {
        ids.forEach((id) => {
          next.add(id);
        });
      }
      return next;
    });
  };

  const dateGroups = useMemo(() => groupByDate(groups), [groups]);
  const todayStr = useMemo(() => new Date().toLocaleDateString(), []);
  const yesterdayStr = useMemo(() => new Date(Date.now() - 86400000).toLocaleDateString(), []);

  if (groups.length === 0) {
    return (
      <div className="history-sessions">
        <div className="empty-state">{t("history.noData")}</div>
      </div>
    );
  }

  return (
    <div className="history-sessions">
      {Array.from(dateGroups.entries()).map(([dateStr, sessions]) => {
        const allExpanded = sessions.every((s) => expandedSessions.has(s.sessionId));
        return (
          <div key={dateStr} className="history-date-group">
            <div className="history-date-label">
              <span>
                {formatDateLabel(
                  dateStr,
                  todayStr,
                  yesterdayStr,
                  t("history.today"),
                  t("history.yesterday"),
                )}
              </span>
              <button
                type="button"
                className="date-toggle-btn"
                onClick={() => toggleDateGroup(sessions)}
                title={allExpanded ? t("history.collapse") : t("history.expand")}
              >
                {allExpanded ? t("history.collapse") : t("history.expand")}
              </button>
            </div>
            {sessions.map((session) => {
              const isExpanded = expandedSessions.has(session.sessionId);
              const lastEntry =
                session.entries.length > 0 ? session.entries[session.entries.length - 1] : null;
              return (
                <div key={session.sessionId} className="history-session">
                  <div
                    className="history-session-header"
                    onClick={() => toggleSession(session.sessionId)}
                  >
                    <span className="session-toggle">{isExpanded ? "▼" : "▶"}</span>
                    <span className="session-id">{session.sessionId.slice(0, 8)}</span>
                    <span className="session-count">
                      {session.entries.length} {t("history.messages")}
                    </span>
                    {!isExpanded && lastEntry && (
                      <span className="session-preview" title={lastEntry.display}>
                        {highlightText(lastEntry.display, searchQuery)}
                      </span>
                    )}
                    <span className="session-time">{formatTime(session.lastTimestamp)}</span>
                    {onViewDetail && (
                      <button
                        type="button"
                        className="session-detail-btn"
                        title={t("history.viewConversation")}
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDetail(session.sessionId);
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 3h12v8H4l-2 2V3z" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="history-session-entries">
                      {session.entries.map((entry, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: entries 没有唯一标识符
                        <div key={i} className="history-entry">
                          <span className="entry-time">{formatTime(entry.timestamp)}</span>
                          <span className="entry-display" title={entry.display}>
                            {highlightText(entry.display, searchQuery)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default memo(HistorySessionList);
