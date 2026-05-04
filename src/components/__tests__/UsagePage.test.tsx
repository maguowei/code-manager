import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../hooks/useToast";
import { I18nProvider } from "../../i18n";
import type {
  DailyUsage,
  ModelUsageStat,
  ProjectUsage,
  SessionUsage,
  UsageFilter,
  UsageSummary,
  UsageTab,
} from "../../types";
import Sidebar from "../Sidebar";
import UsagePage from "../UsagePage";

const { invokeMock, useUsageMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
  useUsageMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock("../../hooks/useUsage", () => ({
  createTodayUsageFilter: () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const value = `${year}-${month}-${day}`;
    return { startDate: value, endDate: value };
  },
  default: useUsageMock,
}));

vi.mock("recharts", () => {
  const Chart = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Area: () => null,
    AreaChart: Chart,
    Bar: () => null,
    BarChart: Chart,
    CartesianGrid: () => null,
    Cell: () => null,
    Legend: () => null,
    Pie: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    PieChart: Chart,
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
      <div data-testid="responsive-chart">{children}</div>
    ),
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});

const summary: UsageSummary = {
  totalMessages: 3842,
  totalSessions: 236,
  totalProjects: 2,
  totalInput: 4_920_000,
  totalOutput: 3_210_000,
  totalCacheCreation: 1_300_000,
  totalCacheRead: 128_420_000,
  totalCost: 128.47,
  lastScanMs: Date.UTC(2026, 4, 24, 10, 32),
  pricing: {
    source: "network",
    fetchedAtMs: Date.UTC(2026, 4, 23, 9, 15),
    models: {
      "claude-3-7-sonnet": {
        input: 3,
        output: 15,
        cache_read: 0.3,
        cache_write: 3.75,
      },
    },
  },
  unknownModels: ["claude-future-1"],
  allProjects: [
    { projectPath: "/Users/me/work/AI/ai-manager", projectDir: "-Users-me-work-AI-ai-manager" },
    { projectPath: "/Users/me/work/web-studio", projectDir: "-Users-me-work-web-studio" },
  ],
  allModels: ["claude-3-7-sonnet", "claude-3-opus"],
};

const daily: DailyUsage[] = [
  {
    date: "2026-05-23",
    messages: 41,
    sessions: 8,
    inputTokens: 800_000,
    outputTokens: 420_000,
    cacheCreationTokens: 60_000,
    cacheReadTokens: 3_000_000,
    cost: 16.92,
    byModel: [
      {
        model: "claude-3-7-sonnet",
        messages: 41,
        inputTokens: 800_000,
        outputTokens: 420_000,
        cacheCreationTokens: 60_000,
        cacheReadTokens: 3_000_000,
        cost: 16.92,
      },
    ],
  },
];

const projects: ProjectUsage[] = [
  {
    projectPath: "/Users/me/work/AI/ai-manager",
    projectDir: "-Users-me-work-AI-ai-manager",
    sessions: 96,
    messages: 1200,
    lastActiveMs: Date.UTC(2026, 4, 24, 8, 11),
    inputTokens: 2_100_000,
    outputTokens: 1_100_000,
    cacheCreationTokens: 300_000,
    cacheReadTokens: 32_000_000,
    cost: 58.72,
    byModel: [],
  },
  {
    projectPath: "/Users/me/work/web-studio",
    projectDir: "-Users-me-work-web-studio",
    sessions: 44,
    messages: 780,
    lastActiveMs: Date.UTC(2026, 4, 23, 15, 30),
    inputTokens: 1_000_000,
    outputTokens: 700_000,
    cacheCreationTokens: 200_000,
    cacheReadTokens: 18_000_000,
    cost: 26.31,
    byModel: [],
  },
];

const sessions: SessionUsage[] = [
  {
    sessionId: "session-20260524-0932",
    projectPath: "/Users/me/work/AI/ai-manager",
    projectDir: "-Users-me-work-AI-ai-manager",
    startedAtMs: Date.UTC(2026, 4, 24, 8, 20),
    lastActiveMs: Date.UTC(2026, 4, 24, 9, 32),
    messages: 14,
    models: ["claude-3-7-sonnet"],
    inputTokens: 128_432,
    outputTokens: 64_213,
    cacheCreationTokens: 12_000,
    cacheReadTokens: 1_200_000,
    cost: 2.86,
  },
  {
    sessionId: "session-20260524-0831",
    projectPath: "/Users/me/work/web-studio",
    projectDir: "-Users-me-work-web-studio",
    startedAtMs: Date.UTC(2026, 4, 24, 8, 1),
    lastActiveMs: Date.UTC(2026, 4, 24, 8, 31),
    messages: 22,
    models: ["claude-3-opus"],
    inputTokens: 211_332,
    outputTokens: 88_771,
    cacheCreationTokens: 4_000,
    cacheReadTokens: 620_000,
    cost: 3.84,
  },
];

const models: ModelUsageStat[] = [
  {
    model: "claude-3-7-sonnet",
    messages: 2300,
    inputTokens: 3_200_000,
    outputTokens: 2_000_000,
    cacheCreationTokens: 800_000,
    cacheReadTokens: 90_000_000,
    cost: 79.73,
  },
  {
    model: "claude-3-opus",
    messages: 1200,
    inputTokens: 1_700_000,
    outputTokens: 1_200_000,
    cacheCreationTokens: 500_000,
    cacheReadTokens: 38_000_000,
    cost: 48.74,
  },
];

function makeUsage(
  overrides: Partial<{ tab: UsageTab; filter: UsageFilter; rescanning: boolean }> = {},
) {
  return {
    summary,
    daily,
    projects,
    sessions,
    models,
    tab: overrides.tab ?? "daily",
    setTab: vi.fn(),
    filter: overrides.filter ?? {},
    setFilter: vi.fn(),
    loading: false,
    refreshingPrice: false,
    rescanning: overrides.rescanning ?? false,
    reload: vi.fn(async () => undefined),
    refreshPricing: vi.fn(async () => undefined),
    rescan: vi.fn(async () => undefined),
    error: null,
  };
}

function renderUsage(
  overrides?: Partial<{ tab: UsageTab; filter: UsageFilter; rescanning: boolean }>,
) {
  const usage = makeUsage(overrides);
  useUsageMock.mockReturnValue(usage);
  render(
    <I18nProvider>
      <ToastProvider>
        <UsagePage />
      </ToastProvider>
    </I18nProvider>,
  );
  return usage;
}

describe("UsagePage cost cockpit", () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    invokeMock.mockReset();
    useUsageMock.mockReset();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the cost cockpit with primary cost, token KPI, compact filters, and alert rail", () => {
    renderUsage();

    expect(screen.getAllByText("$128.47").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("总 Token").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("137.85M").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("group", { name: "用量筛选" })).toHaveClass("usage-command-bar");
    expect(screen.getAllByText("模型成本占比").length).toBeGreaterThanOrEqual(1);
    const modelShareList = screen.getByRole("list", { name: "模型成本占比" });
    expect(within(modelShareList).getByText("sonnet")).toBeInTheDocument();
    expect(within(modelShareList).getByText("$79.73")).toBeInTheDocument();
    expect(within(modelShareList).getByText("62.1%")).toBeInTheDocument();
    expect(screen.getByText("每日 Token 趋势")).toBeInTheDocument();
    expect(screen.getByText("Token 构成")).toBeInTheDocument();
    expect(screen.getByText("claude-future-1")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ai-manager" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "work/ai-manager" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "-Users-me-work-AI-ai-manager" }),
    ).not.toBeInTheDocument();
  });

  it("shows segmented tab counts and sends tab changes through useUsage", () => {
    const usage = renderUsage();

    const projectTab = screen.getByRole("tab", { name: /按项目\s*2/ });
    expect(screen.getByRole("tab", { name: /按日期\s*1/ })).toHaveClass("active");
    fireEvent.click(projectTab);

    expect(usage.setTab).toHaveBeenCalledWith("project");
  });

  it("shows only the project directory name in the project table", () => {
    renderUsage({ tab: "project" });

    const table = screen.getByRole("table");
    expect(within(table).getByText("ai-manager")).toBeInTheDocument();
    expect(within(table).queryByText("work/ai-manager")).not.toBeInTheDocument();
    expect(within(table).queryByText("-Users-me-work-AI-ai-manager")).not.toBeInTheDocument();
  });

  it("updates date filters from manual inputs and quick ranges", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 4, 12, 0, 0));
    const usage = renderUsage();

    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-04-21" } });
    const startUpdater = usage.setFilter.mock.calls[usage.setFilter.mock.calls.length - 1]?.[0];
    expect(typeof startUpdater).toBe("function");
    expect(startUpdater({})).toEqual({ startDate: "2026-04-21" });

    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-04-25" } });
    const endUpdater = usage.setFilter.mock.calls[usage.setFilter.mock.calls.length - 1]?.[0];
    expect(typeof endUpdater).toBe("function");
    expect(endUpdater({ startDate: "2026-04-21" })).toEqual({
      startDate: "2026-04-21",
      endDate: "2026-04-25",
    });

    fireEvent.click(screen.getByRole("button", { name: "本周" }));
    const weekUpdater = usage.setFilter.mock.calls[usage.setFilter.mock.calls.length - 1]?.[0];
    expect(typeof weekUpdater).toBe("function");
    expect(weekUpdater({ model: "claude-3-opus" })).toEqual({
      model: "claude-3-opus",
      startDate: "2026-05-04",
      endDate: "2026-05-10",
    });

    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    const allUpdater = usage.setFilter.mock.calls[usage.setFilter.mock.calls.length - 1]?.[0];
    expect(typeof allUpdater).toBe("function");
    expect(
      allUpdater({ startDate: "2026-05-04", endDate: "2026-05-10", projectPath: "/p" }),
    ).toEqual({ projectPath: "/p" });
  });

  it("resets filters back to today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 4, 12, 0, 0));
    const usage = renderUsage({
      filter: {
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        projectPath: "/Users/me/work/ai-manager",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "重置" }));

    expect(usage.setFilter).toHaveBeenCalledWith({
      startDate: "2026-05-04",
      endDate: "2026-05-04",
    });
  });

  it("keeps the detail workspace tabs visible as a segmented control", () => {
    const css = readFileSync("src/components/UsagePage.css", "utf8");

    expect(css).toMatch(/\.usage-detail-workspace\s*\{[^}]*flex-shrink:\s*0;/s);
    expect(css).toMatch(/\.usage-detail-workspace\s*\{[^}]*overflow:\s*visible;/s);
    expect(css).toMatch(/\.usage-tabs\s*\{[^}]*background:\s*var\(--bg-secondary\);/s);
    expect(css).toMatch(/\.usage-tabs\s*\{[^}]*border:\s*1px solid var\(--border-default\);/s);
    expect(css).toMatch(/\.usage-tabs\s*\{[^}]*border-radius:\s*var\(--radius-md\);/s);
    expect(css).toMatch(/\.usage-tab-btn\s*\{[^}]*flex-shrink:\s*0;/s);
    expect(css).toMatch(/\.usage-tab-btn\.active\s*\{[^}]*background:\s*var\(--bg-primary\);/s);
  });

  it("keeps the subtitle on the same row as the title like the stats page", () => {
    renderUsage();
    const heading = screen.getByRole("heading", { name: "Token 用量统计" }).parentElement;
    const css = readFileSync("src/components/UsagePage.css", "utf8");

    expect(heading).toHaveClass("usage-page-heading");
    expect(css).toMatch(/\.usage-page-heading\s*\{[^}]*display:\s*flex;/s);
    expect(css).toMatch(/\.usage-page-heading\s*\{[^}]*align-items:\s*center;/s);
    expect(css).toMatch(/\.usage-page-heading \.page-title\s*\{[^}]*flex-shrink:\s*0;/s);
  });

  it("keeps the narrow header compact instead of wrapping actions into rows", () => {
    const css = readFileSync("src/components/UsagePage.css", "utf8");

    expect(css).toMatch(
      /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.usage-header\s*\{[^}]*display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.usage-header-actions\s*\{[^}]*display:\s*grid;[\s\S]*?grid-template-columns:\s*auto auto auto;/,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.usage-meta-text\s*\{[^}]*display:\s*none;/,
    );
  });

  it("shows animated feedback while rescanning usage data", () => {
    const css = readFileSync("src/components/UsagePage.css", "utf8");
    renderUsage({ rescanning: true });

    const rescanButton = screen.getByRole("button", { name: "扫描中..." });
    expect(rescanButton).toBeDisabled();
    expect(rescanButton).toHaveClass("usage-icon-btn-busy");
    expect(css).toMatch(/@keyframes usage-spin/);
    expect(css).toMatch(/\.usage-icon-btn-busy svg\s*\{[^}]*animation:\s*usage-spin/s);
  });

  it("opens session usage detail from the keyboard", async () => {
    invokeMock.mockResolvedValue({
      session: sessions[0],
      messages: [
        {
          messageId: "msg-1",
          sessionId: sessions[0].sessionId,
          projectPath: sessions[0].projectPath,
          projectDir: sessions[0].projectDir,
          timestampMs: sessions[0].lastActiveMs,
          model: "claude-3-7-sonnet",
          inputTokens: 1000,
          outputTokens: 2000,
          cacheCreation5m: 300,
          cacheCreation1h: 0,
          cacheRead: 4000,
          costUsd: 0.08,
        },
      ],
    });
    renderUsage({ tab: "session" });

    const row = screen.getByRole("button", { name: /session-20260524-0932/ });
    fireEvent.keyDown(row, { key: "Enter" });

    expect(await screen.findByText(/会话用量明细/)).toBeInTheDocument();
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_session_usage_detail", {
        sessionId: "session-20260524-0932",
      });
    });
  });

  it("uses a dollar symbol for the usage sidebar menu icon", () => {
    render(
      <I18nProvider>
        <Sidebar
          activeTab="usage"
          onTabChange={vi.fn()}
          onClaudeOverviewClick={vi.fn()}
          onSettingsClick={vi.fn()}
        />
      </I18nProvider>,
    );

    const usageButton = screen.getByRole("button", { name: "用量" });
    expect(screen.getAllByTestId("usage-dollar-icon")).toHaveLength(1);
    expect(within(usageButton).getByTestId("usage-dollar-icon")).toBeInTheDocument();
  });
});
