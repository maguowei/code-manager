import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { type KeyboardEvent, memo, useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
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
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

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
      <mark className="search-highlight rounded-sm bg-[var(--highlight-bg)] px-px text-[var(--highlight-fg)]">
        {text.slice(idx, idx + query.length)}
      </mark>
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
      <div className="history-sessions relative flex-1 overflow-y-auto bg-card px-3 py-2">
        <div className="empty-state flex min-h-[240px] flex-col items-center justify-center gap-3 px-5 text-center text-sm text-muted-foreground">
          <MessageSquare className="size-10" strokeWidth={1.5} aria-hidden="true" />
          <span>{t("history.noData")}</span>
        </div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div
      ref={scrollRef}
      className="history-sessions relative flex-1 overflow-y-auto bg-card px-3 py-2 max-sm:px-2"
    >
      <div className="history-sessions-spacer relative w-full" style={{ height: totalSize }}>
        {virtualItems.map((vi) => {
          const item = flatItems[vi.index];
          const top = vi.start;

          if (item.kind === "date-header") {
            const isToday = item.dateKey === todayKey;
            const allExpanded = item.sessionIds.every((id) => expandedSessions.has(id));
            return (
              <div
                key={vi.key}
                className={cn(
                  "history-date-label flex items-center justify-between border-b px-2.5 pt-1 pb-1.5 text-sm font-semibold text-muted-foreground tabular-nums max-sm:px-2",
                  isToday && "is-today border-primary text-foreground",
                )}
                style={{ position: "absolute", top, left: 0, right: 0, height: vi.size }}
              >
                <span
                  className={cn(
                    isToday &&
                      "before:mr-1.5 before:inline-block before:h-3 before:w-[3px] before:rounded-full before:bg-primary before:align-middle before:content-['']",
                  )}
                >
                  {formatDateLabel(
                    item.dateKey,
                    todayKey,
                    yesterdayKey,
                    t("history.today"),
                    t("history.yesterday"),
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="date-toggle-btn"
                  onClick={() => toggleDateGroup(item.sessionIds)}
                  aria-pressed={allExpanded}
                >
                  {allExpanded ? t("history.collapse") : t("history.expand")}
                </Button>
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
                className="history-session-row flex items-center gap-0.5 [--count-width:44px] [--id-width:64px] [--session-gap:8px] [--session-padding:8px] [--time-width:42px] [--toggle-width:22px] max-sm:[--id-width:56px] max-sm:[--session-gap:6px] max-sm:[--session-padding:6px] max-sm:[--time-width:38px]"
                style={{ position: "absolute", top, left: 0, right: 0, height: vi.size }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="session-toggle-btn h-full w-[var(--toggle-width)] shrink-0 rounded-sm p-0 text-muted-foreground"
                  onClick={() => toggleSession(session.sessionId)}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? t("history.collapse") : t("history.expand")}
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="size-3" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="session-main-btn h-full min-w-0 flex-1 justify-start gap-[var(--session-gap)] rounded-md px-[var(--session-padding)] text-left font-normal"
                  onClick={() => onViewDetail?.(session.sessionId)}
                  onKeyDown={(e) => handleMainKeyDown(e, session.sessionId, isExpanded)}
                  aria-label={t("history.viewConversation")}
                  title={t("history.viewConversation")}
                >
                  <span className="session-id w-[var(--id-width)] shrink-0 font-mono text-xs text-muted-foreground">
                    {session.sessionId.slice(0, 8)}
                  </span>
                  <Badge
                    variant="secondary"
                    className="session-count w-[var(--count-width)] shrink-0 justify-center px-1.5 py-0 text-xs font-normal max-sm:hidden"
                  >
                    {session.entries.length} {t("history.messages")}
                  </Badge>
                  {!isExpanded && firstEntry && (
                    <span
                      className="session-preview min-w-0 flex-1 truncate text-sm text-muted-foreground"
                      title={firstEntry.display}
                    >
                      {highlightText(firstEntry.display, searchQuery)}
                    </span>
                  )}
                  <span className="session-time ml-auto w-[var(--time-width)] shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatTime(session.lastTimestamp)}
                  </span>
                </Button>
              </div>
            );
          }

          // entry 行
          return (
            <div
              key={vi.key}
              className="history-entry flex gap-2.5 rounded-sm py-1 pr-2 pl-8 transition-colors hover:bg-accent max-sm:pl-7"
              style={{ position: "absolute", top, left: 0, right: 0, height: vi.size }}
            >
              <span className="entry-time w-[42px] shrink-0 font-mono text-xs leading-5 text-muted-foreground tabular-nums">
                {formatTime(item.entry.timestamp)}
              </span>
              <span
                className="entry-display truncate text-sm leading-5 text-foreground"
                title={item.entry.display}
              >
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
