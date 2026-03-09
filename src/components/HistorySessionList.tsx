import { memo, useState } from "react";
import { SessionGroup } from "./HistoryPage";
import { useI18n } from "../i18n";

interface Props {
  groups: SessionGroup[];
  searchQuery: string;
}

/** 按天分组会话 */
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

/** 格式化时间为 HH:mm */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 格式化日期标题 */
function formatDateLabel(dateStr: string, today: string, yesterday: string, todayLabel: string, yesterdayLabel: string): string {
  if (dateStr === today) return todayLabel;
  if (dateStr === yesterday) return yesterdayLabel;
  return dateStr;
}

/** 高亮搜索关键词 */
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

function HistorySessionList({ groups, searchQuery }: Props) {
  const { t } = useI18n();
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const today = new Date().toLocaleDateString();
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();

  const toggleSession = (sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const dateGroups = groupByDate(groups);

  if (groups.length === 0) {
    return <div className="history-sessions"><div className="empty-state">{t("history.noData")}</div></div>;
  }

  return (
    <div className="history-sessions">
      {Array.from(dateGroups.entries()).map(([dateStr, sessions]) => (
        <div key={dateStr} className="history-date-group">
          <div className="history-date-label">{formatDateLabel(dateStr, today, yesterday, t("history.today"), t("history.yesterday"))}</div>
          {sessions.map(session => {
            const isExpanded = expandedSessions.has(session.sessionId);
            return (
              <div key={session.sessionId} className="history-session">
                <div
                  className="history-session-header"
                  onClick={() => toggleSession(session.sessionId)}
                >
                  <span className="session-toggle">{isExpanded ? "▼" : "▶"}</span>
                  <span className="session-id">{session.sessionId.slice(0, 8)}</span>
                  <span className="session-count">{session.entries.length} {t("history.messages")}</span>
                  <span className="session-time">{formatTime(session.lastTimestamp)}</span>
                </div>
                {isExpanded && (
                  <div className="history-session-entries">
                    {session.entries.map((entry, i) => (
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
      ))}
    </div>
  );
}

export default memo(HistorySessionList);
