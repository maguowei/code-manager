import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ClaudeStats } from "../../types";
import StatsPage from "../StatsPage";

const { invokeMock, toastSuccessMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: toastSuccessMock,
  },
}));

vi.mock("recharts", () => {
  const Chart = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Bar: ({
      activeBar,
      dataKey,
      fill,
      fillOpacity,
      radius,
    }: {
      activeBar?: { fill?: string; fillOpacity?: number; stroke?: string; strokeWidth?: number };
      dataKey?: string;
      fill?: string;
      fillOpacity?: number;
      radius?: number[];
    }) => (
      <div
        data-testid="stats-chart-bar"
        data-active-fill={String(activeBar?.fill ?? "")}
        data-active-fill-opacity={String(activeBar?.fillOpacity ?? "")}
        data-active-stroke={String(activeBar?.stroke ?? "")}
        data-active-stroke-width={String(activeBar?.strokeWidth ?? "")}
        data-fill={String(fill ?? "")}
        data-fill-opacity={String(fillOpacity ?? "")}
        data-key={String(dataKey ?? "")}
        data-radius={String(radius?.join(",") ?? "")}
      />
    ),
    BarChart: Chart,
    Legend: () => null,
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
      <div data-testid="stats-responsive-chart">{children}</div>
    ),
    Tooltip: ({ cursor }: { cursor?: { fill?: string } }) => (
      <div data-testid="stats-chart-tooltip" data-cursor-fill={String(cursor?.fill ?? "")} />
    ),
    XAxis: () => null,
    YAxis: () => null,
  };
});

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };

const loadedStats: ClaudeStats = {
  btwUseCount: 3,
  firstStartTime: "2026-05-20T08:30:00.000Z",
  lastPlanModeUse: Date.UTC(2026, 4, 22, 9, 15),
  numStartups: 12,
  projects: {
    "/Users/dev/Work/AI/ai-manager": {
      lastCost: 1.23,
      lastDuration: 65_000,
      lastLinesAdded: 42,
      lastLinesRemoved: 7,
      lastModelUsage: {
        "claude-sonnet": {
          cacheCreationInputTokens: 100,
          cacheReadInputTokens: 200,
          costUsd: 0.88,
          inputTokens: 1200,
          outputTokens: 450,
          webSearchRequests: 2,
        },
      },
      lastSessionFirstPrompt: "帮我整理统计页面",
      lastSessionId: "session-123",
      lastSessionMetrics: {
        frame_duration_ms_avg: 12.4,
        frame_duration_ms_p95: 33.8,
        hook_duration_ms_avg: 4.5,
        hook_duration_ms_p95: 9.6,
      },
      lastSessionModified: Date.UTC(2026, 4, 23, 10, 0),
      lastTotalCacheCreationInputTokens: 100,
      lastTotalCacheReadInputTokens: 200,
      lastTotalInputTokens: 1200,
      lastTotalOutputTokens: 450,
      lastTotalWebSearchRequests: 2,
    },
  },
  skillUsage: {
    "review-skill": { lastUsedAt: Date.UTC(2026, 4, 22, 9, 0), usageCount: 4 },
  },
  toolUsage: {
    Bash: { lastUsedAt: Date.UTC(2026, 4, 22, 10, 0), usageCount: 8 },
    Read: { lastUsedAt: Date.UTC(2026, 4, 22, 10, 5), usageCount: 2 },
  },
};

function setTauriRuntime(enabled: boolean) {
  if (enabled) {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    return;
  }
  delete (window as TauriWindow).__TAURI_INTERNALS__;
}

function renderStatsPage() {
  return render(
    <I18nProvider>
      <StatsPage />
    </I18nProvider>,
  );
}

beforeEach(() => {
  setTauriRuntime(true);
  invokeMock.mockReset();
  toastSuccessMock.mockReset();
});

afterEach(() => {
  setTauriRuntime(false);
});

describe("StatsPage responsive header", () => {
  it("keeps title, note, and actions compact on narrow screens", () => {
    const source = readFileSync("src/components/StatsPage.tsx", "utf8");
    const headerSource = readFileSync("src/components/PageHeader.tsx", "utf8");

    expect(source).toContain("import PageHeader from");
    expect(source).toContain("<PageHeader");
    expect(source).toContain('description={t("stats.stalenessNotice")}');
    expect(source).toContain('mainClassName="stats-page-heading"');
    expect(source).toContain('descriptionClassName="stats-staleness-note"');
    expect(source).toContain(
      'actionsClassName="max-[900px]:grid max-[900px]:grid-cols-[repeat(2,2rem)]',
    );
    expect(headerSource).toContain("page-header sticky top-0 z-10 shrink-0 border-b");
    expect(headerSource).toContain("max-[900px]:grid-cols-[minmax(0,1fr)_auto]");
    expect(source).toContain(
      "stats-refresh-btn max-[900px]:size-8 max-[900px]:gap-0 max-[900px]:p-0",
    );
    expect(source).toContain('className="max-[900px]:sr-only"');
    expect(source).toContain("<Pencil");
    expect(source).toContain("<RefreshCw");
  });
});

describe("StatsPage runtime states", () => {
  it("renders loaded statistics and wires refresh/editor actions", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_stats") return loadedStats;
      return null;
    });

    renderStatsPage();

    expect(await screen.findByText("启动次数")).toBeInTheDocument();
    expect(screen.getByText("工具 & Skill 使用")).toBeInTheDocument();
    expect(screen.getByText("项目最近会话")).toBeInTheDocument();
    expect(screen.getByText("review-skill")).toBeInTheDocument();
    expect(screen.getByText("claude-sonnet")).toBeInTheDocument();
    expect(screen.getAllByText("帮我整理统计页面")).toHaveLength(2);
    expect(screen.getByText("12.4ms")).toBeInTheDocument();
    expect(screen.getByText("9.6ms")).toBeInTheDocument();
    expect(screen.getByTestId("stats-chart-bar")).toHaveAttribute("data-key", "count");

    fireEvent.click(screen.getByTitle("用编辑器打开"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("open_claude_json_in_editor"));

    fireEvent.click(screen.getByTitle("刷新"));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("已刷新统计数据"));
  });

  it("renders the empty state when Tauri stats are unavailable", async () => {
    invokeMock.mockResolvedValueOnce({
      numStartups: 0,
      projects: {},
      skillUsage: {},
      toolUsage: {},
    } satisfies ClaudeStats);

    renderStatsPage();

    expect(await screen.findByText("暂无统计数据")).toBeInTheDocument();
    expect(screen.getByText("使用 Claude Code 后，统计数据将自动显示在这里")).toBeInTheDocument();
  });

  it("renders the empty state outside Tauri without invoking the backend", async () => {
    setTauriRuntime(false);

    renderStatsPage();

    expect(await screen.findByText("暂无统计数据")).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
