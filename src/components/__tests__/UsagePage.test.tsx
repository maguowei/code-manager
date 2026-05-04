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
  UsageTimeGranularity,
  UsageTimeSeriesPoint,
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
  const AreaChart = ({ children }: { children?: ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  );
  const BarChart = ({ children }: { children?: ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  );
  return {
    Area: ({
      activeDot,
      dataKey,
      dot,
      fill,
      fillOpacity,
      name,
      stackId,
      stroke,
    }: {
      activeDot?: unknown;
      dataKey?: string;
      dot?: unknown;
      fill?: string;
      fillOpacity?: number;
      name?: string;
      stackId?: string;
      stroke?: string;
    }) => (
      <div
        data-testid="chart-area"
        data-active-dot={String(Boolean(activeDot))}
        data-dot={String(Boolean(dot))}
        data-fill={String(fill ?? "")}
        data-fill-opacity={String(fillOpacity ?? "")}
        data-key={String(dataKey ?? "")}
        data-name={String(name ?? "")}
        data-stack-id={String(stackId ?? "")}
        data-stroke={String(stroke ?? "")}
      />
    ),
    AreaChart,
    Bar: ({
      activeBar,
      dataKey,
      fill,
      fillOpacity,
      name,
    }: {
      activeBar?: { fill?: string; fillOpacity?: number; stroke?: string };
      dataKey?: string;
      fill?: string;
      fillOpacity?: number;
      name?: string;
    }) => (
      <div
        data-testid="chart-bar"
        data-active-fill={String(activeBar?.fill ?? "")}
        data-active-fill-opacity={String(activeBar?.fillOpacity ?? "")}
        data-active-stroke={String(activeBar?.stroke ?? "")}
        data-fill={String(fill ?? "")}
        data-fill-opacity={String(fillOpacity ?? "")}
        data-key={String(dataKey ?? "")}
        data-name={String(name ?? "")}
      />
    ),
    BarChart,
    CartesianGrid: () => null,
    Cell: () => null,
    Pie: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    PieChart: Chart,
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
      <div data-testid="responsive-chart">{children}</div>
    ),
    Tooltip: ({ cursor }: { cursor?: { fill?: string } }) => (
      <div data-testid="chart-tooltip" data-cursor-fill={String(cursor?.fill ?? "")} />
    ),
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
  allModels: ["mimo-v2-pro", "claude-3-opus", "claude-3-7-sonnet"],
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

const timeSeries: UsageTimeSeriesPoint[] = [
  {
    bucket: "2026-05-23 09:00",
    bucketStartMs: Date.UTC(2026, 4, 23, 9, 0),
    messages: 21,
    sessions: 4,
    inputTokens: 420_000,
    outputTokens: 200_000,
    cacheCreationTokens: 20_000,
    cacheReadTokens: 1_400_000,
    cost: 8.11,
    inputCost: 1.26,
    outputCost: 3,
    cacheCreationCost: 0.08,
    cacheReadCost: 3.77,
    byModel: [
      {
        model: "claude-3-7-sonnet",
        messages: 21,
        inputTokens: 420_000,
        outputTokens: 200_000,
        cacheCreationTokens: 20_000,
        cacheReadTokens: 1_400_000,
        cost: 8.11,
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

// 多模型时间序列：用于验证图例按合计花费降序、可见性切换等
const multiModelTimeSeries: UsageTimeSeriesPoint[] = [
  {
    bucket: "2026-05-23 09:00",
    bucketStartMs: Date.UTC(2026, 4, 23, 9, 0),
    messages: 30,
    sessions: 5,
    inputTokens: 600_000,
    outputTokens: 300_000,
    cacheCreationTokens: 30_000,
    cacheReadTokens: 1_500_000,
    cost: 12.34,
    inputCost: 3,
    outputCost: 6,
    cacheCreationCost: 1,
    cacheReadCost: 2.34,
    byModel: [
      {
        model: "claude-3-opus",
        messages: 9,
        inputTokens: 200_000,
        outputTokens: 80_000,
        cacheCreationTokens: 5_000,
        cacheReadTokens: 100_000,
        cost: 10,
      },
      {
        model: "claude-3-7-sonnet",
        messages: 21,
        inputTokens: 400_000,
        outputTokens: 220_000,
        cacheCreationTokens: 25_000,
        cacheReadTokens: 1_400_000,
        cost: 2.34,
      },
    ],
  },
];

function makeUsage(
  overrides: Partial<{
    tab: UsageTab;
    filter: UsageFilter;
    rescanning: boolean;
    timeGranularity: UsageTimeGranularity;
    timeSeries: UsageTimeSeriesPoint[];
  }> = {},
) {
  return {
    summary,
    daily,
    timeSeries: overrides.timeSeries ?? timeSeries,
    timeGranularity: overrides.timeGranularity ?? "hour",
    setTimeGranularity: vi.fn(),
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
  overrides?: Partial<{
    tab: UsageTab;
    filter: UsageFilter;
    rescanning: boolean;
    timeGranularity: UsageTimeGranularity;
    timeSeries: UsageTimeSeriesPoint[];
  }>,
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
    expect(within(modelShareList).getByText("claude-3-7-sonnet")).toBeInTheDocument();
    expect(within(modelShareList).getByText("$79.73")).toBeInTheDocument();
    expect(within(modelShareList).getByText("62.1%")).toBeInTheDocument();
    expect(screen.getByText("Token 趋势")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "图表时间维度" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "小时" })).toHaveClass("active");
    expect(screen.getByText("Token 构成")).toBeInTheDocument();
    expect(screen.getByText("claude-future-1")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ai-manager" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "work/ai-manager" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "-Users-me-work-AI-ai-manager" }),
    ).not.toBeInTheDocument();
  });

  it("shows claude-* model filter and sorts model options alphabetically", () => {
    const usage = renderUsage();

    const modelSelect = screen.getByLabelText("模型") as HTMLSelectElement;
    const options = within(modelSelect).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "全部模型",
      "claude-*",
      "claude-3-7-sonnet",
      "claude-3-opus",
      "mimo-v2-pro",
    ]);

    fireEvent.change(modelSelect, { target: { value: "claude-*" } });
    const modelUpdater = usage.setFilter.mock.calls[usage.setFilter.mock.calls.length - 1]?.[0];
    expect(typeof modelUpdater).toBe("function");
    expect(modelUpdater({ startDate: "2026-05-04" })).toEqual({
      startDate: "2026-05-04",
      model: "claude-*",
    });
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

  it("allows switching trend charts to day, hour, or five-minute buckets", () => {
    const usage = renderUsage();

    fireEvent.click(screen.getByRole("button", { name: "5 分钟" }));
    expect(usage.setTimeGranularity).toHaveBeenCalledWith("fiveMinute");

    fireEvent.click(screen.getByRole("button", { name: "天" }));
    expect(usage.setTimeGranularity).toHaveBeenCalledWith("day");
  });

  it("groups both trend charts into a single trend section that owns the granularity switch", () => {
    renderUsage();

    const trendSection = screen.getByRole("region", { name: "趋势分析" });
    expect(trendSection).toHaveClass("usage-trend-section");
    expect(within(trendSection).getByText("趋势分析")).toBeInTheDocument();
    expect(within(trendSection).getByRole("group", { name: "趋势分类" })).toBeInTheDocument();
    expect(within(trendSection).getByRole("group", { name: "图表时间维度" })).toBeInTheDocument();
    expect(within(trendSection).getByRole("group", { name: "图表样式" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "费用分类" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Token 分类" })).not.toBeInTheDocument();
    // 两个图表都在同一个 section 内
    expect(within(trendSection).getByText("花费趋势")).toBeInTheDocument();
    expect(within(trendSection).getByText("Token 趋势")).toBeInTheDocument();
  });

  it("shows visible data points on both trend charts in curve mode", () => {
    renderUsage({ timeSeries: multiModelTimeSeries });

    expect(screen.getByRole("button", { name: "曲线" })).toHaveClass("active");
    expect(screen.getAllByTestId("area-chart")).toHaveLength(2);
    const chartAreas = screen.getAllByTestId("chart-area");
    expect(chartAreas.length).toBeGreaterThan(0);
    for (const area of chartAreas) {
      expect(area).toHaveAttribute("data-dot", "true");
      expect(area).toHaveAttribute("data-active-dot", "true");
    }
  });

  it("defaults both trend charts to total-only visibility", () => {
    renderUsage({ timeSeries: multiModelTimeSeries });

    const chartAreas = screen.getAllByTestId("chart-area");
    expect(chartAreas.map((el) => el.getAttribute("data-key"))).toEqual([
      "__totalCost",
      "totalTokens",
    ]);

    const costLegend = screen.getByRole("list", { name: "花费趋势" });
    expect(within(costLegend).getByRole("button", { name: /总费用/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(costLegend).getByRole("button", { name: /claude-3-opus/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    const tokenLegend = screen.getByRole("list", { name: "Token 趋势" });
    expect(within(tokenLegend).getByRole("button", { name: /总 Token/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(tokenLegend).getByRole("button", { name: /claude-3-opus/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("uses a distinct non-white total series color and subtle bar focus styling", () => {
    renderUsage({ timeSeries: multiModelTimeSeries });

    const totalAreas = screen
      .getAllByTestId("chart-area")
      .filter((el) => ["__totalCost", "totalTokens"].includes(el.getAttribute("data-key") ?? ""));
    for (const area of totalAreas) {
      expect(area).not.toHaveAttribute("data-stroke", "#e6edf3");
      expect(area).not.toHaveAttribute("data-fill", "#e6edf3");
    }

    fireEvent.click(screen.getByRole("button", { name: "柱状图" }));

    const totalBars = screen
      .getAllByTestId("chart-bar")
      .filter((el) => ["__totalCost", "totalTokens"].includes(el.getAttribute("data-key") ?? ""));
    for (const bar of totalBars) {
      expect(bar).not.toHaveAttribute("data-fill", "#e6edf3");
      expect(bar).toHaveAttribute("data-active-fill", bar.getAttribute("data-fill") ?? "");
      expect(bar).toHaveAttribute("data-active-stroke", bar.getAttribute("data-fill") ?? "");
    }
    const cursorFills = screen
      .getAllByTestId("chart-tooltip")
      .map((tooltip) => tooltip.getAttribute("data-cursor-fill") ?? "")
      .filter(Boolean);
    expect(cursorFills.length).toBeGreaterThan(0);
    for (const cursorFill of cursorFills) {
      expect(cursorFill).toContain("rgba");
      expect(cursorFill).not.toContain("255, 255, 255");
    }
  });

  it("switches both trend charts to bar mode", () => {
    renderUsage({ timeSeries: multiModelTimeSeries });

    fireEvent.click(screen.getByRole("button", { name: "柱状图" }));

    expect(screen.getByRole("button", { name: "柱状图" })).toHaveClass("active");
    expect(screen.queryAllByTestId("area-chart")).toHaveLength(0);
    expect(screen.getAllByTestId("bar-chart")).toHaveLength(2);
    const chartBars = screen.getAllByTestId("chart-bar");
    expect(chartBars.map((el) => el.getAttribute("data-key"))).toEqual([
      "__totalCost",
      "totalTokens",
    ]);
  });

  it("does not stack cost series when switching from bar back to curve mode", () => {
    renderUsage({ timeSeries: multiModelTimeSeries });

    const costLegend = screen.getByRole("list", { name: "花费趋势" });
    fireEvent.click(within(costLegend).getByRole("button", { name: /claude-3-opus/ }));
    fireEvent.click(screen.getByRole("button", { name: "柱状图" }));
    fireEvent.click(screen.getByRole("button", { name: "曲线" }));

    const costAreas = screen
      .getAllByTestId("chart-area")
      .filter((el) => ["__totalCost", "claude-3-opus"].includes(el.getAttribute("data-key") ?? ""));
    expect(costAreas).toHaveLength(2);
    for (const area of costAreas) {
      expect(area).toHaveAttribute("data-stack-id", "");
    }
  });

  it("uses one trend classification switch for both cost and token charts", () => {
    renderUsage({ timeSeries: multiModelTimeSeries });

    const trendMode = screen.getByRole("group", { name: "趋势分类" });
    expect(within(trendMode).getByRole("button", { name: "模型" })).toHaveClass("active");
    expect(within(trendMode).getByRole("button", { name: "模型" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: "按模型" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "按类型" })).not.toBeInTheDocument();

    const costLegendByModel = screen.getByRole("list", { name: "花费趋势" });
    const tokenLegendByModel = screen.getByRole("list", { name: "Token 趋势" });
    expect(costLegendByModel).toHaveTextContent("claude-3-opus");
    expect(tokenLegendByModel).toHaveTextContent("claude-3-opus");
    expect(tokenLegendByModel).toHaveTextContent("claude-3-7-sonnet");

    fireEvent.click(within(trendMode).getByRole("button", { name: "类型" }));

    expect(within(trendMode).getByRole("button", { name: "类型" })).toHaveClass("active");
    const costLegend = screen.getByRole("list", { name: "花费趋势" });
    const tokenLegend = screen.getByRole("list", { name: "Token 趋势" });
    expect(costLegend).toHaveTextContent("输入");
    expect(costLegend).toHaveTextContent("输出");
    expect(costLegend).toHaveTextContent("缓存创建");
    expect(costLegend).toHaveTextContent("缓存读取");
    expect(tokenLegend).toHaveTextContent("输入");
    expect(tokenLegend).toHaveTextContent("输出");
    expect(tokenLegend).toHaveTextContent("缓存创建");
    expect(tokenLegend).toHaveTextContent("缓存读取");
    expect(within(costLegend).getByRole("button", { name: /总费用/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(costLegend).getByRole("button", { name: /输入/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(tokenLegend).getByRole("button", { name: /总 Token/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(tokenLegend).getByRole("button", { name: "输入" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders a clickable cost legend with total cost and full model names sorted by spend", () => {
    renderUsage({ timeSeries: multiModelTimeSeries });

    const costLegend = screen.getByRole("list", { name: "花费趋势" });
    const chips = within(costLegend).getAllByRole("button");
    expect(chips[0]).toHaveTextContent("总费用");
    expect(chips[0]).toHaveTextContent("$12.34");
    // opus 总花费 $10 > sonnet 总花费 $2.34，应排在前；图例显示完整模型名
    expect(chips[1]).toHaveTextContent("claude-3-opus");
    expect(chips[1]).toHaveTextContent("$10.00");
    expect(chips[2]).toHaveTextContent("claude-3-7-sonnet");
    expect(chips[2]).toHaveTextContent("$2.34");
    // 默认只显示总量，细分模型等待用户手动打开
    expect(chips[0]).toHaveAttribute("aria-pressed", "true");
    expect(chips[0]).not.toHaveClass("muted");
    expect(chips[1]).toHaveAttribute("aria-pressed", "false");
    expect(chips[1]).toHaveClass("muted");
    expect(chips[2]).toHaveAttribute("aria-pressed", "false");
    expect(chips[2]).toHaveClass("muted");
  });

  it("adds total cost and total token trend curves", () => {
    renderUsage({ timeSeries: multiModelTimeSeries });

    const chartAreas = screen.getAllByTestId("chart-area");
    expect(chartAreas.some((el) => el.getAttribute("data-key") === "__totalCost")).toBe(true);
    expect(chartAreas.some((el) => el.getAttribute("data-key") === "totalTokens")).toBe(true);

    const costLegend = screen.getByRole("list", { name: "花费趋势" });
    expect(within(costLegend).getByRole("button", { name: /总费用/ })).toBeInTheDocument();
    const tokenLegend = screen.getByRole("list", { name: "Token 趋势" });
    expect(within(tokenLegend).getByRole("button", { name: /总 Token/ })).toBeInTheDocument();
  });

  it("toggles a hidden cost legend series on and off", () => {
    renderUsage({ timeSeries: multiModelTimeSeries });

    const costLegend = screen.getByRole("list", { name: "花费趋势" });
    const opusChip = within(costLegend).getByRole("button", { name: /claude-3-opus/ });

    // 初始：默认只显示总量，opus area 不存在
    const opusAreasBefore = screen
      .getAllByTestId("chart-area")
      .filter((el) => el.getAttribute("data-key") === "claude-3-opus");
    expect(opusAreasBefore).toHaveLength(0);

    // 点击显示：chip 退出 muted 态、area 出现
    fireEvent.click(opusChip);
    expect(opusChip).toHaveAttribute("aria-pressed", "true");
    expect(opusChip).not.toHaveClass("muted");
    const opusAreasAfter = screen
      .getAllByTestId("chart-area")
      .filter((el) => el.getAttribute("data-key") === "claude-3-opus");
    expect(opusAreasAfter.length).toBeGreaterThan(0);

    // 再次点击隐藏
    fireEvent.click(opusChip);
    expect(opusChip).toHaveAttribute("aria-pressed", "false");
    expect(opusChip).toHaveClass("muted");
    const opusAreasHidden = screen
      .getAllByTestId("chart-area")
      .filter((el) => el.getAttribute("data-key") === "claude-3-opus");
    expect(opusAreasHidden).toHaveLength(0);
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
