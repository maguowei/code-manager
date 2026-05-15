import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import EnabledPluginsEditor from "../EnabledPluginsEditor";
import type { MarketplaceSourceInput } from "../useMarketplaceCatalog";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => null),
}));

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

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

const SOURCES: MarketplaceSourceInput[] = [
  {
    marketplaceId: "claude-plugins-official",
    sourceType: "github",
    repo: "anthropics/claude-plugins-official",
    ref: "",
    path: "",
  },
];

function renderEditor(options?: {
  value?: Record<string, unknown>;
  marketplaceSources?: MarketplaceSourceInput[];
  onChange?: (next: Record<string, unknown>) => void;
}) {
  const onChange = options?.onChange ?? vi.fn();
  const onError = vi.fn();
  const result = render(
    <I18nProvider>
      <EnabledPluginsEditor
        value={options?.value ?? {}}
        onChange={onChange}
        onError={onError}
        marketplaceSources={options?.marketplaceSources}
      />
    </I18nProvider>,
  );
  return { ...result, onChange, onError };
}

describe("EnabledPluginsEditor", () => {
  describe("双 Tab 结构", () => {
    it("默认显示「已启用」Tab", () => {
      renderEditor({ value: { "a@x": true, "b@y": false } });
      expect(screen.getByRole("tab", { name: /已启用/ })).toHaveAttribute("data-state", "active");
      expect(screen.getByText("a@x")).toBeInTheDocument();
      expect(screen.getByText("b@y")).toBeInTheDocument();
    });

    it("切到「浏览市场」Tab 触发 marketplace 拉取", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ plugins: [{ name: "alpha" }] }),
      } as unknown as Response);
      renderEditor({ marketplaceSources: SOURCES });
      const browseTab = screen.getByRole("tab", { name: /浏览市场/ });
      const user = userEvent.setup();
      await user.click(browseTab);
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      // BrowseMarketplaceTab 显示 pluginId.split("@")[0] 即 "alpha"
      await waitFor(() => {
        expect(screen.getByText("alpha")).toBeInTheDocument();
      });
    });

    it("Tab 2 启用插件后切回 Tab 1 同步显示", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ plugins: [{ name: "alpha" }] }),
      } as unknown as Response);
      const onChange = vi.fn();
      renderEditor({ marketplaceSources: SOURCES, onChange });
      const user = userEvent.setup();
      // 切到浏览市场 Tab
      await user.click(screen.getByRole("tab", { name: /浏览市场/ }));
      // 等待插件列表加载
      const enableBtn = await screen.findByRole("button", { name: /\+ 启用/ });
      await user.click(enableBtn);
      // 切回已启用 Tab - EnabledPluginsTab 显示完整 pluginId
      await user.click(screen.getByRole("tab", { name: /已启用/ }));
      await waitFor(() => {
        expect(screen.getByText("alpha@claude-plugins-official")).toBeInTheDocument();
      });
    });
  });

  describe("Tab 1 已启用", () => {
    it("空状态显示「去浏览市场」按钮，点击切换 Tab", async () => {
      renderEditor({ value: {} });
      const browseBtn = screen.getByRole("button", { name: /去浏览市场/ });
      // 「去浏览市场」按钮调用 onGoBrowse 切换 activeTab
      fireEvent.click(browseBtn);
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /浏览市场/ })).toHaveAttribute(
          "data-state",
          "active",
        );
      });
    });

    it("手动输入 ID 保存后出现在列表", () => {
      renderEditor({ value: {} });
      // 先点「手动输入 ID」进入编辑模式
      const manualBtn = screen.getByRole("button", { name: /手动输入 ID/ });
      fireEvent.click(manualBtn);
      const input = screen.getByLabelText(/新插件 ID/);
      fireEvent.change(input, { target: { value: "manual@local" } });
      const saveBtn = screen.getByRole("button", { name: /保存插件/ });
      fireEvent.click(saveBtn);
      expect(screen.getByText("manual@local")).toBeInTheDocument();
    });

    it("开关切换调用 onChange", () => {
      const onChange = vi.fn();
      renderEditor({ value: { "a@x": true }, onChange });
      const switchControl = screen.getByRole("switch", {
        name: /插件状态 a@x/,
      });
      fireEvent.click(switchControl);
      expect(onChange).toHaveBeenCalledWith({ "a@x": false });
    });

    it("删除插件需确认后才生效", () => {
      const onChange = vi.fn();
      renderEditor({ value: { "a@x": true, "b@y": false }, onChange });
      fireEvent.click(screen.getByRole("button", { name: "删除插件 a@x" }));
      // 弹出确认对话框
      const dialog = screen.getByRole("alertdialog", { name: "删除插件" });
      expect(dialog).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
      // 确认删除
      fireEvent.click(screen.getByRole("button", { name: "删除" }));
      expect(onChange).toHaveBeenCalledWith({ "b@y": false });
    });

    it("搜索过滤插件列表", () => {
      renderEditor({
        value: { "formatter@tools": true, "reviewer@tools": false },
      });
      fireEvent.change(screen.getByLabelText("搜索插件 ID"), {
        target: { value: "formatter" },
      });
      expect(screen.getByText("formatter@tools")).toBeInTheDocument();
      expect(screen.queryByText("reviewer@tools")).not.toBeInTheDocument();
    });

    it("新增插件按钮打开草稿行", () => {
      renderEditor({ value: { "a@x": true } });
      fireEvent.click(screen.getByRole("button", { name: "新增插件" }));
      expect(screen.getByLabelText("新插件 ID")).toBeInTheDocument();
    });
  });
});
