import { describe, expect, it } from "vitest";
import {
  buildHeatmapWeeks,
  buildProjectSummariesFromHistory,
  flattenSessionsForVirtualizer,
  formatDateLabel,
  formatTime,
  groupSessionsByDate,
  type SessionGroup,
  toLocalDateKey,
} from "./history-utils";
import type { HistoryEntry } from "./types";

function makeEntry(
  partial: Partial<HistoryEntry> & { timestamp: number; sessionId: string },
): HistoryEntry {
  return {
    display: partial.display ?? "msg",
    pastedContents: partial.pastedContents ?? {},
    timestamp: partial.timestamp,
    project: partial.project ?? "/proj",
    sessionId: partial.sessionId,
  };
}

function makeSession(
  sessionId: string,
  lastTs: number,
  entries: HistoryEntry[] = [],
): SessionGroup {
  return {
    sessionId,
    entries,
    firstTimestamp: entries[0]?.timestamp ?? lastTs,
    lastTimestamp: lastTs,
  };
}

describe("toLocalDateKey", () => {
  it("returns YYYY-MM-DD in local timezone", () => {
    const ts = new Date(2026, 4, 5, 23, 59, 59).getTime();
    expect(toLocalDateKey(ts)).toBe("2026-05-05");
  });

  it("pads month and day to 2 digits", () => {
    const ts = new Date(2026, 0, 1, 0, 0, 0).getTime();
    expect(toLocalDateKey(ts)).toBe("2026-01-01");
  });
});

describe("formatTime", () => {
  it("formats timestamp to HH:MM with leading zeros", () => {
    const ts = new Date(2026, 4, 5, 9, 7).getTime();
    expect(formatTime(ts)).toBe("09:07");
  });
});

describe("formatDateLabel", () => {
  it("returns today label when keys match today", () => {
    expect(formatDateLabel("2026-05-05", "2026-05-05", "2026-05-04", "今天", "昨天")).toBe("今天");
  });

  it("returns yesterday label when keys match yesterday", () => {
    expect(formatDateLabel("2026-05-04", "2026-05-05", "2026-05-04", "今天", "昨天")).toBe("昨天");
  });

  it("returns raw date key otherwise", () => {
    expect(formatDateLabel("2026-05-03", "2026-05-05", "2026-05-04", "今天", "昨天")).toBe(
      "2026-05-03",
    );
  });
});

describe("buildProjectSummariesFromHistory", () => {
  it("groups history entries into recent project summaries", () => {
    const projectAlpha = "/Users/test-user/work/alpha";
    const projectBravo = "/Users/test-user/work/bravo";
    const alphaSessions = Array.from({ length: 6 }, (_, index) =>
      makeEntry({
        display: `alpha session ${index + 1}`,
        project: projectAlpha,
        sessionId: `alpha-session-${index + 1}`,
        timestamp: 1_000 + index * 100,
      }),
    );
    const entries = [
      ...alphaSessions,
      makeEntry({
        display: "alpha newest follow-up",
        project: projectAlpha,
        sessionId: "alpha-session-6",
        timestamp: 1_650,
      }),
      makeEntry({
        display: "bravo latest",
        project: projectBravo,
        sessionId: "bravo-session-1",
        timestamp: 1_800,
      }),
    ];

    const summaries = buildProjectSummariesFromHistory(entries);

    expect(summaries.map((summary) => summary.project)).toEqual([projectBravo, projectAlpha]);
    const alpha = summaries.find((summary) => summary.project === projectAlpha);
    expect(alpha).toMatchObject({
      shortName: "alpha",
      messageCount: 7,
      sessionCount: 6,
      lastActiveAt: 1_650,
      lastSessionId: "alpha-session-6",
    });
    expect(alpha?.recentSessions.map((session) => session.sessionId)).toEqual([
      "alpha-session-6",
      "alpha-session-5",
      "alpha-session-4",
      "alpha-session-3",
      "alpha-session-2",
    ]);
    expect(alpha?.recentSessions[0]).toMatchObject({
      firstPrompt: "alpha session 6",
      lastPrompt: "alpha newest follow-up",
      messageCount: 2,
      firstTimestamp: 1_500,
      lastTimestamp: 1_650,
    });
  });
});

describe("groupSessionsByDate", () => {
  it("groups sessions by local date key and sorts groups descending", () => {
    const today = new Date(2026, 4, 5, 12).getTime();
    const yesterday = new Date(2026, 4, 4, 8).getTime();
    const dayBefore = new Date(2026, 4, 3, 22).getTime();

    const sessions = [
      makeSession("s1", today),
      makeSession("s2", yesterday),
      makeSession("s3", dayBefore),
      makeSession("s4", today + 60_000),
    ];

    const groups = groupSessionsByDate(sessions);
    expect(groups.map(([k]) => k)).toEqual(["2026-05-05", "2026-05-04", "2026-05-03"]);
    expect(groups[0][1].map((s) => s.sessionId).sort()).toEqual(["s1", "s4"]);
    expect(groups[1][1].map((s) => s.sessionId)).toEqual(["s2"]);
    expect(groups[2][1].map((s) => s.sessionId)).toEqual(["s3"]);
  });
});

describe("buildHeatmapWeeks", () => {
  it("produces 53 weeks × 7 days with Monday as first row when weeks=53", () => {
    // 2026-05-05 是周二
    const now = new Date(2026, 4, 5, 12, 0, 0);
    const matrix = buildHeatmapWeeks([], 53, now);
    expect(matrix.weeks).toHaveLength(53);
    for (const week of matrix.weeks) {
      expect(week.days).toHaveLength(7);
    }

    // 最后一列首日（周一）应该是本周一即 2026-05-04
    const lastWeek = matrix.weeks[52];
    expect(lastWeek.days[0].dateKey).toBe("2026-05-04");
    // 最后一列周二应包含今天 2026-05-05
    expect(lastWeek.days[1].dateKey).toBe("2026-05-05");
    // 周三 ~ 周日为 placeholder（晚于今天）
    expect(lastWeek.days[2].placeholder).toBe(true);
    expect(lastWeek.days[6].placeholder).toBe(true);

    // 第一列首日应该是 52 周之前的那个周一
    const firstMonday = new Date(2026, 4, 4);
    firstMonday.setDate(firstMonday.getDate() - 52 * 7);
    expect(matrix.weeks[0].days[0].dateKey).toBe(toLocalDateKey(firstMonday.getTime()));
  });

  it("counts entries into the right cell and computes level", () => {
    const now = new Date(2026, 4, 5, 12, 0, 0);
    const target = new Date(2026, 4, 4, 10).getTime();
    // 6 条消息 → level 2
    const entries = Array.from({ length: 6 }, (_, i) =>
      makeEntry({ timestamp: target + i * 1000, sessionId: "x" }),
    );
    const matrix = buildHeatmapWeeks(entries, 53, now);
    const lastWeek = matrix.weeks[52];
    expect(lastWeek.days[0].dateKey).toBe("2026-05-04");
    expect(lastWeek.days[0].count).toBe(6);
    expect(lastWeek.days[0].level).toBe(2);
    expect(matrix.totalCount).toBe(6);
  });

  it("ignores entries earlier than the start Monday", () => {
    const now = new Date(2026, 4, 5, 12, 0, 0);
    const tooEarly = new Date(2024, 0, 1).getTime();
    const matrix = buildHeatmapWeeks([makeEntry({ timestamp: tooEarly, sessionId: "x" })], 53, now);
    expect(matrix.totalCount).toBe(0);
  });
});

describe("flattenSessionsForVirtualizer", () => {
  it("emits date-header + session items when nothing is expanded", () => {
    const ts = new Date(2026, 4, 5, 10).getTime();
    const session = makeSession("s1", ts, [
      makeEntry({ timestamp: ts, sessionId: "s1" }),
      makeEntry({ timestamp: ts + 1000, sessionId: "s1" }),
    ]);
    const flat = flattenSessionsForVirtualizer([["2026-05-05", [session]]], new Set());
    expect(flat).toHaveLength(2);
    expect(flat[0].kind).toBe("date-header");
    expect(flat[1].kind).toBe("session");
  });

  it("inlines entries after an expanded session", () => {
    const ts = new Date(2026, 4, 5, 10).getTime();
    const entries = [
      makeEntry({ timestamp: ts, sessionId: "s1" }),
      makeEntry({ timestamp: ts + 1000, sessionId: "s1" }),
    ];
    const session = makeSession("s1", ts + 1000, entries);
    const flat = flattenSessionsForVirtualizer([["2026-05-05", [session]]], new Set(["s1"]));
    expect(flat).toHaveLength(2 + entries.length);
    expect(flat[2].kind).toBe("entry");
    expect(flat[3].kind).toBe("entry");
  });
});
