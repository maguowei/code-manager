import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import BrowseMarketplaceTab from "../BrowseMarketplaceTab";
import type { PluginEntry } from "../useEnabledPluginsState";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

const SOURCES = [
  {
    marketplaceId: "claude-plugins-official",
    sourceType: "github",
    repo: "anthropics/claude-plugins-official",
    ref: "",
    path: "",
  },
];

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "fetch", {
    value: originalFetch,
    writable: true,
    configurable: true,
  });
});

function renderTab(props?: {
  sources?: typeof SOURCES;
  plugins?: PluginEntry[];
  active?: boolean;
  onAddPlugin?: (pluginId: string) => boolean;
  onTogglePlugin?: (pluginId: string) => void;
}) {
  const onAddPlugin = props?.onAddPlugin ?? vi.fn(() => true);
  const onTogglePlugin = props?.onTogglePlugin ?? vi.fn();
  return render(
    <I18nProvider>
      <BrowseMarketplaceTab
        sources={props?.sources ?? SOURCES}
        plugins={props?.plugins ?? []}
        active={props?.active ?? true}
        onAddPlugin={onAddPlugin}
        onTogglePlugin={onTogglePlugin}
      />
    </I18nProvider>,
  );
}

describe("BrowseMarketplaceTab", () => {
  it("active 时拉取并按 pluginId 升序渲染插件", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        plugins: [{ name: "zoo" }, { name: "alpha" }],
      }),
    } as unknown as Response);
    renderTab();
    await waitFor(() => {
      const rows = screen.getAllByRole("button", { name: /\+ 启用/ });
      expect(rows).toHaveLength(2);
    });
    const rows = screen.getAllByRole("button", { name: /\+ 启用/ });
    const firstRow = rows[0].closest("[data-slot='browse-row']");
    const secondRow = rows[1].closest("[data-slot='browse-row']");
    expect(firstRow).toHaveTextContent("alpha");
    expect(secondRow).toHaveTextContent("zoo");
  });

  it("点击 + 启用 调用 onAddPlugin", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    const onAddPlugin = vi.fn(() => true);
    renderTab({ onAddPlugin });
    const btn = await screen.findByRole("button", { name: /\+ 启用/ });
    fireEvent.click(btn);
    expect(onAddPlugin).toHaveBeenCalledWith("alpha@claude-plugins-official");
  });

  it("已启用行 hover 后显示取消启用，点击调用 onTogglePlugin", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    const onTogglePlugin = vi.fn();
    renderTab({
      plugins: [
        {
          id: "plugin:alpha@claude-plugins-official",
          pluginId: "alpha@claude-plugins-official",
          enabled: true,
          committed: true,
        },
      ],
      onTogglePlugin,
    });
    const enabledBtn = await screen.findByRole("button", { name: "已启用" });
    fireEvent.mouseEnter(enabledBtn);
    const disableBtn = await screen.findByRole("button", { name: "取消启用" });
    fireEvent.click(disableBtn);
    expect(onTogglePlugin).toHaveBeenCalledWith("alpha@claude-plugins-official");
  });

  it("无 marketplace 时显示空状态", () => {
    renderTab({ sources: [] });
    expect(screen.getByText("未配置插件来源")).toBeInTheDocument();
  });

  it("加载失败时状态条显示失败计数，popover 列出失败源", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    renderTab();
    const trigger = await screen.findByText(/1 个来源加载失败/);
    fireEvent.click(trigger);
    expect(await screen.findByText("加载失败的来源")).toBeInTheDocument();
    expect(screen.getByText("claude-plugins-official")).toBeInTheDocument();
  });
});
