import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableTauriEnv } from "@/test/tauri-mock";
import { I18nProvider } from "../../../i18n";
import { formatUsd } from "../../../i18n/format";
import type { WidgetMetric } from "../../../types";
import FloatingWidget from "../FloatingWidget";

const { useWidgetUsageKpiMock, getConfigWorkspaceMock, openUsagePageMock, hideMock } = vi.hoisted(
  () => ({
    useWidgetUsageKpiMock: vi.fn(),
    getConfigWorkspaceMock: vi.fn(),
    openUsagePageMock: vi.fn(async () => null),
    hideMock: vi.fn(async () => undefined),
  }),
);

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
  getCurrentWindow: () => ({ hide: hideMock }),
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

describe("FloatingWidget", () => {
  let restoreTauri: () => void;

  beforeEach(() => {
    restoreTauri = enableTauriEnv();
    useWidgetUsageKpiMock.mockReset();
    getConfigWorkspaceMock.mockReset();
    openUsagePageMock.mockClear();
    hideMock.mockClear();
  });

  afterEach(() => {
    restoreTauri();
  });

  it("renders every configured metric row with its formatted value", async () => {
    useWidgetUsageKpiMock.mockReturnValue({ kpi, loading: false });
    mockWorkspace(ALL_METRICS);

    renderWidget();

    // 偏好读取后展示全部 6 个指标标签
    await waitFor(() => {
      expect(screen.getByText("今日花费")).toBeInTheDocument();
    });
    expect(screen.getByText("Top 模型")).toBeInTheDocument();
    // 文本指标 topModel 直接展示模型名
    expect(screen.getByText("claude-opus-4")).toBeInTheDocument();
    // 数值指标格式化展示
    expect(
      screen.getByText(
        formatUsd(12.34, "zh", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("88.0%")).toBeInTheDocument();
  });

  it("opens the usage page on click and on Enter, and hides the window on close", async () => {
    useWidgetUsageKpiMock.mockReturnValue({ kpi, loading: false });
    mockWorkspace(ALL_METRICS);

    renderWidget();
    await waitFor(() => expect(screen.getByText("今日花费")).toBeInTheDocument());

    const openButton = screen.getByTitle("打开用量页");
    fireEvent.click(openButton);
    fireEvent.keyDown(openButton, { key: "Enter" });
    expect(openUsagePageMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "隐藏浮窗" }));
    expect(hideMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to default metrics and shows placeholders when KPI is unavailable", async () => {
    useWidgetUsageKpiMock.mockReturnValue({ kpi: null, loading: true });
    // 空指标列表 → 回退默认三项；KPI 为空 → 数值占位 "—"
    mockWorkspace([]);

    renderWidget();

    await waitFor(() => expect(screen.getByText("今日花费")).toBeInTheDocument());
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("keeps default metrics when preference loading fails", async () => {
    useWidgetUsageKpiMock.mockReturnValue({ kpi, loading: false });
    getConfigWorkspaceMock.mockRejectedValue(new Error("workspace offline"));

    renderWidget();

    // catch 分支保持默认三项指标，浮窗仍可展示
    await waitFor(() => expect(screen.getByText("今日花费")).toBeInTheDocument());
    expect(screen.queryByText("Top 模型")).not.toBeInTheDocument();
  });
});
