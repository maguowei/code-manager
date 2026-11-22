import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableTauriEnv } from "@/test/tauri-mock";
import { I18nProvider } from "../../../i18n";
import type { WidgetMetric } from "../../../types";
import FloatingWidget from "../FloatingWidget";

const { useWidgetUsageKpiMock, getConfigWorkspaceMock, openUsagePageMock, startDraggingMock } =
  vi.hoisted(() => ({
    useWidgetUsageKpiMock: vi.fn(),
    getConfigWorkspaceMock: vi.fn(),
    openUsagePageMock: vi.fn(async () => null),
    startDraggingMock: vi.fn(async () => undefined),
  }));

vi.mock("../../../hooks/useWidgetUsageKpi", () => ({
  useWidgetUsageKpi: useWidgetUsageKpiMock,
}));

vi.mock("../../../ipc", () => ({
  ipc: {
    getConfigWorkspace: getConfigWorkspaceMock,
    openUsagePage: openUsagePageMock,
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ startDragging: startDraggingMock }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

// 6 项指标全开，覆盖 metricRawValue / formatMetricNumber / 配色的全部分支
const ALL_METRICS: WidgetMetric[] = [
  "cost",
  "totalTokens",
  "cacheHitRate",
  "messages",
  "sessions",
  "topModel",
];

const kpi = {
  cost: 12.34,
  totalTokens: 4_500_000,
  cacheHitRate: 88,
  messages: 42,
  sessions: 7,
  topModel: "claude-opus-4",
};

function mockWorkspace(metrics: string[], opacity = 80) {
  getConfigWorkspaceMock.mockResolvedValue({
    app: { floatingWidgetMetrics: metrics, floatingWidgetOpacity: opacity },
  });
}

function renderWidget() {
  return render(
    <I18nProvider>
      <FloatingWidget />
    </I18nProvider>,
  );
}

function bar() {
  return screen.getByRole("button", { name: "打开用量页" });
}

describe("FloatingWidget", () => {
  let restoreTauri: () => void;

  beforeEach(() => {
    restoreTauri = enableTauriEnv();
    useWidgetUsageKpiMock.mockReset();
    getConfigWorkspaceMock.mockReset();
    openUsagePageMock.mockClear();
    startDraggingMock.mockClear();
  });

  afterEach(() => {
    restoreTauri();
  });

  it("renders only the values of every configured metric, with labels kept for hover and screen readers", async () => {
    useWidgetUsageKpiMock.mockReturnValue({ kpi, loading: false });
    mockWorkspace(ALL_METRICS);

    renderWidget();

    await waitFor(() => expect(screen.getByText("claude-opus-4")).toBeInTheDocument());
    expect(screen.getByText("$12.34")).toBeInTheDocument();
    expect(screen.getByText("4.5M")).toBeInTheDocument();
    expect(screen.getByText("88.0%")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    // 没有可见标题与标签，完整标签只作为悬停提示与读屏文本
    expect(screen.queryByText("今日")).not.toBeInTheDocument();
    expect(screen.getByTitle("今日花费")).toBeInTheDocument();
    expect(screen.getByText("今日花费")).toHaveClass("sr-only");
    expect(screen.getByTitle("Top 模型")).toHaveClass("flex-[2]");
    expect(bar()).toHaveStyle({ opacity: "0.8" });
  });

  it("opens the usage page on a click without movement and on Enter", async () => {
    useWidgetUsageKpiMock.mockReturnValue({ kpi, loading: false });
    mockWorkspace(ALL_METRICS);

    renderWidget();
    await waitFor(() => expect(screen.getByText("$12.34")).toBeInTheDocument());

    fireEvent.mouseDown(bar(), { button: 0, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(bar(), { screenX: 101, screenY: 101 });
    fireEvent.mouseUp(bar(), { button: 0, screenX: 101, screenY: 101 });
    fireEvent.keyDown(bar(), { key: "Enter" });

    expect(openUsagePageMock).toHaveBeenCalledTimes(2);
    expect(startDraggingMock).not.toHaveBeenCalled();
  });

  it("starts native dragging once the pointer moves past the threshold and skips the click", async () => {
    useWidgetUsageKpiMock.mockReturnValue({ kpi, loading: false });
    mockWorkspace(ALL_METRICS);

    renderWidget();
    await waitFor(() => expect(screen.getByText("$12.34")).toBeInTheDocument());

    fireEvent.mouseDown(bar(), { button: 0, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(bar(), { screenX: 110, screenY: 100 });
    fireEvent.mouseMove(bar(), { screenX: 130, screenY: 100 });
    fireEvent.mouseUp(bar(), { button: 0, screenX: 130, screenY: 100 });

    expect(startDraggingMock).toHaveBeenCalledTimes(1);
    expect(openUsagePageMock).not.toHaveBeenCalled();
  });

  it("ignores non-left buttons", async () => {
    useWidgetUsageKpiMock.mockReturnValue({ kpi, loading: false });
    mockWorkspace(ALL_METRICS);

    renderWidget();
    await waitFor(() => expect(screen.getByText("$12.34")).toBeInTheDocument());

    fireEvent.mouseDown(bar(), { button: 2, screenX: 100, screenY: 100 });
    fireEvent.mouseMove(bar(), { screenX: 150, screenY: 100 });
    fireEvent.mouseUp(bar(), { button: 2 });

    expect(startDraggingMock).not.toHaveBeenCalled();
    expect(openUsagePageMock).not.toHaveBeenCalled();
  });

  it("falls back to default metrics and shows placeholders when KPI is unavailable", async () => {
    useWidgetUsageKpiMock.mockReturnValue({ kpi: null, loading: true });
    // 空指标列表 → 回退默认三项；KPI 为空 → 数值占位 "—"
    mockWorkspace([]);

    renderWidget();

    await waitFor(() => expect(getConfigWorkspaceMock).toHaveBeenCalled());
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("keeps default metrics when preference loading fails", async () => {
    useWidgetUsageKpiMock.mockReturnValue({ kpi, loading: false });
    getConfigWorkspaceMock.mockRejectedValue(new Error("workspace offline"));

    renderWidget();

    // catch 分支保持默认三项指标，浮窗仍可展示
    await waitFor(() => expect(getConfigWorkspaceMock).toHaveBeenCalled());
    expect(screen.getByText("$12.34")).toBeInTheDocument();
    expect(screen.queryByText("claude-opus-4")).not.toBeInTheDocument();
  });
});
