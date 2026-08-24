import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import { TooltipProvider } from "../../ui/tooltip";
import BrowseMarketplaceTab from "../BrowseMarketplaceTab";
import type { PluginEntry } from "../useEnabledPluginsState";

const { invokeMock, openUrlMock, showToastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
  openUrlMock: vi.fn(async (_url: string) => null),
  showToastMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();
// jsdom 无布局引擎，元素测量恒为 0；@tanstack/virtual-core 既用 offsetHeight 量滚动视口（getRect），
// 也用它量每一行（measureElement）。若对所有元素返回同一个值，行高就等于视口高度，
// 虚拟化跑在退化几何上（约 1 行可见），窗口化断言会恒成立。故按元素分派：
// 滚动容器给视口高度，虚拟化行 wrapper（带 data-index）给真实量级的行高。
const SCROLL_VIEWPORT_HEIGHT = 400;
const STUBBED_ROW_HEIGHT = 120;
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
const originalScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");

function stubElementMeasurements() {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (this.hasAttribute("data-index")) return STUBBED_ROW_HEIGHT;
      if (this.dataset.slot === "browse-scroll") return SCROLL_VIEWPORT_HEIGHT;
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 800,
  });
  // jsdom 写 scrollTop 不会派发 scroll 事件，而真实浏览器会——virtualizer 只在 scroll 回调里
  // 同步内部偏移（observeElementOffset）。补齐该行为，让滚动路径在测试里走完整链路。
  // 注意 scrollTop 定义在 Element.prototype 上，不在 HTMLElement.prototype。
  if (originalScrollTop?.get && originalScrollTop.set) {
    const { get, set } = originalScrollTop;
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      get(this: Element) {
        return get.call(this);
      },
      set(this: Element, value: number) {
        set.call(this, value);
        this.dispatchEvent(new Event("scroll"));
      },
    });
  }
}

function restoreElementMeasurements() {
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
  }
  if (originalOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  }
  if (originalScrollTop) {
    Object.defineProperty(Element.prototype, "scrollTop", originalScrollTop);
  }
}

// 已渲染虚拟行的 data-index 升序列表
function renderedRowIndexes(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll("[data-index]"), (node) =>
    Number(node.getAttribute("data-index")),
  ).sort((a, b) => a - b);
}

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
  stubElementMeasurements();
  fetchMock.mockReset();
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (command) => {
    if (command === "get_config_workspace") {
      return { app: { uiLanguage: "zh" } };
    }
    return null;
  });
  openUrlMock.mockReset();
  showToastMock.mockReset();
  localStorage.clear();
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(globalThis, "fetch", {
    value: originalFetch,
    writable: true,
    configurable: true,
  });
  restoreElementMeasurements();
});

function renderTab(props?: {
  sources?: typeof SOURCES;
  plugins?: PluginEntry[];
  active?: boolean;
  onAddPlugin?: (pluginId: string) => boolean;
  onManagePlugin?: () => void;
  existingMarketplaceIds?: string[];
  onAddMarketplace?: (input: {
    marketplaceId: string;
    repo: string;
    ref: string;
    path: string;
  }) => void;
  onOpenAdvancedConfig?: () => void;
}) {
  const onAddPlugin = props?.onAddPlugin ?? vi.fn(() => true);
  const onManagePlugin = props?.onManagePlugin ?? vi.fn();
  return render(
    <I18nProvider>
      <TooltipProvider>
        <BrowseMarketplaceTab
          sources={props?.sources ?? SOURCES}
          plugins={props?.plugins ?? []}
          active={props?.active ?? true}
          onAddPlugin={onAddPlugin}
          onManagePlugin={onManagePlugin}
          existingMarketplaceIds={props?.existingMarketplaceIds}
          onAddMarketplace={props?.onAddMarketplace}
          onOpenAdvancedConfig={props?.onOpenAdvancedConfig}
        />
      </TooltipProvider>
    </I18nProvider>,
  );
}

function enableTauriRuntime() {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true,
  });
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
      const rows = screen.getAllByRole("button", { name: /添加并启用/ });
      expect(rows).toHaveLength(2);
    });
    const rows = screen.getAllByRole("button", { name: /添加并启用/ });
    const firstRow = rows[0].closest("[data-slot='browse-row']");
    const secondRow = rows[1].closest("[data-slot='browse-row']");
    expect(firstRow).toHaveTextContent("alpha");
    expect(secondRow).toHaveTextContent("zoo");
  });

  it("点击添加并启用调用 onAddPlugin", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    const onAddPlugin = vi.fn(() => true);
    renderTab({ onAddPlugin });
    const btn = await screen.findByRole("button", { name: /添加并启用/ });
    expect(btn).toHaveAttribute("data-variant", "default");
    fireEvent.click(btn);
    expect(onAddPlugin).toHaveBeenCalledWith("alpha@claude-plugins-official");
  });

  it("已配置行显示管理入口且不直接切换启用状态", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    const onManagePlugin = vi.fn();
    renderTab({
      plugins: [
        {
          id: "plugin:alpha@claude-plugins-official",
          pluginId: "alpha@claude-plugins-official",
          enabled: true,
          committed: true,
        },
      ],
      onManagePlugin,
    });
    const configuredBadge = await screen.findByText("已配置");
    expect(configuredBadge).toHaveAttribute("data-variant", "secondary");
    expect(screen.queryByRole("button", { name: "取消启用" })).not.toBeInTheDocument();
    const manageButton = screen.getByRole("button", { name: "管理" });
    expect(manageButton).toHaveAttribute("data-variant", "outline");
    fireEvent.click(manageButton);
    expect(onManagePlugin).toHaveBeenCalledTimes(1);
  });

  it("刷新时显示进行中反馈并禁用按钮", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    renderTab();
    const refreshButton = await screen.findByRole("button", { name: "刷新" });
    let resolveRefresh: (value: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    fireEvent.click(refreshButton);

    expect(screen.getByRole("button", { name: "刷新中..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "刷新中..." })).toHaveAttribute("aria-busy", "true");

    resolveRefresh({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled();
    });
  });

  it("刷新很快完成时仍保留最短反馈时长", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    renderTab();
    const refreshButton = await screen.findByRole("button", { name: "刷新" });

    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);

    fireEvent.click(refreshButton);

    expect(screen.getByRole("button", { name: "刷新中..." })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(screen.getByRole("button", { name: "刷新中..." })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled();
  });

  it("刷新成功后提示各插件市场的插件数量", async () => {
    const sources = [
      ...SOURCES,
      {
        marketplaceId: "team-market",
        sourceType: "github",
        repo: "team/plugins",
        ref: "",
        path: "",
      },
    ];
    fetchMock.mockImplementation(async (url: string) => {
      const plugins = url.includes("team/plugins")
        ? [{ name: "team-a" }, { name: "team-b" }]
        : [{ name: "alpha" }];
      return {
        ok: true,
        json: async () => ({ plugins }),
      } as unknown as Response;
    });
    renderTab({ sources });
    await screen.findByText("alpha");

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        "插件市场已刷新",
        "success",
        expect.objectContaining({
          description: expect.stringContaining("claude-plugins-official：1 个插件"),
        }),
      );
    });
    const description = showToastMock.mock.calls[0]?.[2]?.description;
    expect(description).toContain("team-market：2 个插件");
  });

  it("安装数刷新失败时仍刷新列表并提示失败", async () => {
    enableTauriRuntime();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_config_workspace") {
        return { app: { uiLanguage: "zh" } };
      }
      if (command === "refresh_plugin_install_counts") {
        // 模拟 claude CLI 缺失等失败：invoke 以字符串错误 reject
        throw "claude not found";
      }
      return null;
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    renderTab();
    await screen.findByText("alpha");

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        "插件安装数刷新失败，可能不是最新",
        "error",
        expect.objectContaining({ description: "claude not found" }),
      );
    });
    // GitHub 插件列表不受 catalog 重拉失败影响，仍正常展示
    expect(screen.getByText("alpha")).toBeInTheDocument();
  });

  it("插件市场筛选默认只显示全部", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    renderTab();
    await screen.findByText("alpha");
    const marketplaceFilter = screen.getByRole("combobox", { name: "插件市场" });
    expect(marketplaceFilter).toHaveTextContent("全部");
    expect(marketplaceFilter).not.toHaveTextContent("marketplace");
  });

  it("插件详情默认三行折叠并可点击详情展开收起", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        plugins: [
          {
            name: "alpha",
            description:
              "This plugin has a very long description that explains a lot of implementation detail, usage context, guardrails, examples, and workflow notes so the market row should not become too tall by default.",
            author: { name: "Anthropic" },
          },
        ],
      }),
    } as unknown as Response);
    renderTab();
    await screen.findByText("alpha");

    const details = screen.getByRole("button", {
      name: "展开插件详情 alpha@claude-plugins-official",
    });

    expect(details).toHaveAttribute("data-expanded", "false");
    expect(details).toHaveClass("line-clamp-3");
    expect(details.className).not.toContain("hover:underline");
    expect(details).toHaveAttribute("aria-expanded", "false");
    expect(details).toHaveAttribute("title", "点击展开完整详情");
    expect(screen.queryByRole("button", { name: "展开" })).not.toBeInTheDocument();

    fireEvent.click(details);

    expect(details).toHaveAttribute("data-expanded", "true");
    expect(details).not.toHaveClass("line-clamp-3");
    expect(details).toHaveAttribute("aria-expanded", "true");
    expect(details).toHaveAttribute("title", "点击收起详情");
    expect(screen.queryByRole("button", { name: "收起" })).not.toBeInTheDocument();

    fireEvent.click(details);

    expect(details).toHaveAttribute("data-expanded", "false");
    expect(details).toHaveClass("line-clamp-3");
  });

  it("保留插件主页跳转入口", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        plugins: [
          {
            name: "alpha",
            homepage: "https://example.com/alpha",
          },
        ],
      }),
    } as unknown as Response);
    renderTab();
    const homepageButton = await screen.findByRole("button", {
      name: "打开插件主页 alpha@claude-plugins-official",
    });
    fireEvent.click(homepageButton);
    expect(openUrlMock).toHaveBeenCalledWith("https://example.com/alpha");
  });

  it("读取安装数量缓存并在独立列展示", async () => {
    enableTauriRuntime();
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "get_config_workspace") {
        return { app: { uiLanguage: "zh" } };
      }
      if (command === "read_claude_file_preview") {
        expect(args).toEqual({ path: "plugins/plugin-catalog-cache.json" });
        return {
          path: "plugins/plugin-catalog-cache.json",
          name: "plugin-catalog-cache.json",
          content: JSON.stringify({
            version: 1,
            fetchedAt: "2026-05-25T00:00:00.000Z",
            catalog: {
              plugins: {
                "alpha@claude-plugins-official": { unique_installs: 1234 },
                "zoo@claude-plugins-official": { unique_installs: 56 },
              },
            },
          }),
          isBinary: false,
          truncated: false,
          size: 100,
          modifiedAt: 0,
          encoding: "utf-8",
        };
      }
      return null;
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }, { name: "zoo" }] }),
    } as unknown as Response);

    renderTab();

    expect(await screen.findByText("安装数")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("1,234")).toBeInTheDocument();
    });
    expect(screen.getByText("56")).toBeInTheDocument();
  });

  it("官方插件展示组成徽标并可展开列出组件名", async () => {
    enableTauriRuntime();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_config_workspace") {
        return { app: { uiLanguage: "zh" } };
      }
      if (command === "read_claude_file_preview") {
        return {
          path: "plugins/plugin-catalog-cache.json",
          name: "plugin-catalog-cache.json",
          content: JSON.stringify({
            version: 1,
            fetchedAt: "2026-06-14T02:00:00.000Z",
            catalog: {
              generated_at: "2026-06-13T08:00:00.000Z",
              marketplace_sha: "abc1234deadbeef",
              plugins: {
                "alpha@claude-plugins-official": {
                  unique_installs: 1234,
                  components: {
                    commands: [{ name: "cmd-a" }],
                    skills: [{ name: "skill-x" }, { name: "skill-y" }],
                    hooks: ["PreToolUse"],
                  },
                },
              },
            },
          }),
          isBinary: false,
          truncated: false,
          size: 100,
          modifiedAt: 0,
          encoding: "utf-8",
        };
      }
      return null;
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);

    renderTab();
    await screen.findByText("alpha");

    // 展开前不显示组件名，点击展开后列出 skill 名
    const expandButton = await screen.findByRole("button", { name: /展开插件组成/ });
    expect(screen.queryByText(/skill-x/)).not.toBeInTheDocument();
    fireEvent.click(expandButton);
    await waitFor(() => {
      expect(screen.getByText(/skill-x, skill-y/)).toBeInTheDocument();
    });

    // catalog 元信息 Popover 展示市场版本（短 sha）
    fireEvent.click(screen.getByRole("button", { name: "查看官方插件数据信息" }));
    expect(await screen.findByText("官方插件数据")).toBeInTheDocument();
    expect(screen.getByText("abc1234")).toBeInTheDocument();
  });

  it("按作者归属展示 Anthropic 与合作伙伴徽章", async () => {
    enableTauriRuntime();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_config_workspace") {
        return { app: { uiLanguage: "zh" } };
      }
      return null;
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        plugins: [
          { name: "alpha", author: { name: "Anthropic" } },
          { name: "zoo", author: { name: "PostHog" } },
        ],
      }),
    } as unknown as Response);

    renderTab();
    await screen.findByText("alpha");

    // 提供方筛选存在
    expect(screen.getByRole("combobox", { name: "按提供方筛选" })).toBeInTheDocument();
    // Anthropic 第一方徽章与合作伙伴作者名徽章
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("PostHog")).toBeInTheDocument();
  });

  it("快速添加市场：一键官方写回 anthropics 仓库", async () => {
    const onAddMarketplace = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    renderTab({ existingMarketplaceIds: [], onAddMarketplace });
    await screen.findByText("alpha");

    fireEvent.click(screen.getByRole("button", { name: "添加市场" }));
    fireEvent.click(await screen.findByRole("button", { name: "一键添加官方市场" }));

    expect(onAddMarketplace).toHaveBeenCalledWith({
      marketplaceId: "claude-plugins-official",
      repo: "anthropics/claude-plugins-official",
      ref: "",
      path: "",
    });
  });

  it("快速添加市场：自定义 github 仓库并自动预填名称", async () => {
    const onAddMarketplace = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    renderTab({ existingMarketplaceIds: [], onAddMarketplace });
    await screen.findByText("alpha");

    fireEvent.click(screen.getByRole("button", { name: "添加市场" }));
    fireEvent.change(await screen.findByLabelText("GitHub 仓库 (owner/repo)"), {
      target: { value: "acme/plugins" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(onAddMarketplace).toHaveBeenCalledWith({
      marketplaceId: "plugins",
      repo: "acme/plugins",
      ref: "",
      path: "",
    });
  });

  it("快速添加市场：仓库格式非法时内联报错且不写回", async () => {
    const onAddMarketplace = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    renderTab({ existingMarketplaceIds: [], onAddMarketplace });
    await screen.findByText("alpha");

    fireEvent.click(screen.getByRole("button", { name: "添加市场" }));
    fireEvent.change(await screen.findByLabelText("GitHub 仓库 (owner/repo)"), {
      target: { value: "not-a-repo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(screen.getByText("仓库格式应为 owner/repo")).toBeInTheDocument();
    expect(onAddMarketplace).not.toHaveBeenCalled();
  });

  it("快速添加市场：表单只保留仓库输入，不含名称/分支字段", async () => {
    const onAddMarketplace = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    renderTab({ existingMarketplaceIds: [], onAddMarketplace });
    await screen.findByText("alpha");

    fireEvent.click(screen.getByRole("button", { name: "添加市场" }));
    expect(await screen.findByLabelText("GitHub 仓库 (owner/repo)")).toBeInTheDocument();
    expect(screen.queryByLabelText("名称 / ID")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("分支（选填）")).not.toBeInTheDocument();
  });

  it("快速添加市场：高级配置链接触发 onOpenAdvancedConfig", async () => {
    const onOpenAdvancedConfig = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    renderTab({ existingMarketplaceIds: [], onAddMarketplace: vi.fn(), onOpenAdvancedConfig });
    await screen.findByText("alpha");

    fireEvent.click(screen.getByRole("button", { name: "添加市场" }));
    fireEvent.click(await screen.findByRole("button", { name: /需要自定义分支 \/ 来源/ }));
    expect(onOpenAdvancedConfig).toHaveBeenCalledTimes(1);
  });

  it("默认移除排序下拉框并按安装数量降序排序", async () => {
    enableTauriRuntime();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_config_workspace") {
        return { app: { uiLanguage: "zh" } };
      }
      if (command === "read_claude_file_preview") {
        return {
          path: "plugins/plugin-catalog-cache.json",
          name: "plugin-catalog-cache.json",
          content: JSON.stringify({
            version: 1,
            fetchedAt: "2026-05-25T00:00:00.000Z",
            catalog: {
              plugins: {
                "alpha@claude-plugins-official": { unique_installs: 10 },
                "zoo@claude-plugins-official": { unique_installs: 90 },
              },
            },
          }),
          isBinary: false,
          truncated: false,
          size: 100,
          modifiedAt: 0,
          encoding: "utf-8",
        };
      }
      return null;
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "zoo" }, { name: "alpha" }, { name: "beta" }] }),
    } as unknown as Response);

    renderTab();
    await screen.findByText("alpha");
    await waitFor(() => {
      expect(screen.getByText("90")).toBeInTheDocument();
    });

    expect(screen.queryByRole("combobox", { name: "排序" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "按安装数升序排序" })).toBeInTheDocument();
    expect(screen.getByText("当前排序：安装数 ↓")).toBeInTheDocument();

    const rows = screen
      .getAllByRole("button", { name: /添加并启用/ })
      .map((button) => button.closest("[data-slot='browse-row']"));
    expect(rows[0]).toHaveTextContent("zoo");
    expect(rows[1]).toHaveTextContent("alpha");
    expect(rows[2]).toHaveTextContent("beta");
  });

  it("点击插件 ID 和安装数表头切换排序方向", async () => {
    enableTauriRuntime();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_config_workspace") {
        return { app: { uiLanguage: "zh" } };
      }
      if (command === "read_claude_file_preview") {
        return {
          path: "plugins/plugin-catalog-cache.json",
          name: "plugin-catalog-cache.json",
          content: JSON.stringify({
            version: 1,
            fetchedAt: "2026-05-25T00:00:00.000Z",
            catalog: {
              plugins: {
                "alpha@claude-plugins-official": { unique_installs: 10 },
                "zoo@claude-plugins-official": { unique_installs: 90 },
              },
            },
          }),
          isBinary: false,
          truncated: false,
          size: 100,
          modifiedAt: 0,
          encoding: "utf-8",
        };
      }
      return null;
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "zoo" }, { name: "alpha" }, { name: "beta" }] }),
    } as unknown as Response);

    renderTab();
    await waitFor(() => {
      expect(screen.getByText("90")).toBeInTheDocument();
    });

    const rowTexts = () =>
      screen
        .getAllByRole("button", { name: /添加并启用/ })
        .map((button) => button.closest("[data-slot='browse-row']")?.textContent ?? "");

    expect(rowTexts()[0]).toContain("zoo");
    expect(rowTexts()[1]).toContain("alpha");
    expect(rowTexts()[2]).toContain("beta");
    expect(screen.getByRole("columnheader", { name: /安装数/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );

    fireEvent.click(screen.getByRole("button", { name: "按插件 ID 升序排序" }));
    expect(rowTexts()[0]).toContain("alpha");
    expect(rowTexts()[1]).toContain("beta");
    expect(rowTexts()[2]).toContain("zoo");
    expect(screen.getByRole("columnheader", { name: /插件 ID/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(screen.getByText("当前排序：插件 ID ↑")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "按插件 ID 降序排序" }));
    expect(rowTexts()[0]).toContain("zoo");
    expect(rowTexts()[1]).toContain("beta");
    expect(rowTexts()[2]).toContain("alpha");
    expect(screen.getByRole("columnheader", { name: /插件 ID/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );

    fireEvent.click(screen.getByRole("button", { name: "按安装数降序排序" }));
    expect(rowTexts()[0]).toContain("zoo");
    expect(rowTexts()[1]).toContain("alpha");
    expect(rowTexts()[2]).toContain("beta");

    fireEvent.click(screen.getByRole("button", { name: "按安装数升序排序" }));
    expect(rowTexts()[0]).toContain("alpha");
    expect(rowTexts()[1]).toContain("zoo");
    expect(rowTexts()[2]).toContain("beta");
    expect(screen.getByRole("columnheader", { name: /安装数/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(screen.getByText("当前排序：安装数 ↑")).toBeInTheDocument();
  });

  it("官方插件只显示验证图标并显示类别", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        plugins: [
          {
            name: "alpha",
            description: "A plugin with a complete description that should wrap in the list.",
            category: "development",
          },
        ],
      }),
    } as unknown as Response);
    renderTab();
    await screen.findByText("alpha");
    expect(screen.queryByText("已验证")).not.toBeInTheDocument();
    expect(screen.getByLabelText("已验证插件")).toBeInTheDocument();
    expect(screen.getByText("development")).toBeInTheDocument();
    expect(screen.getByText(/complete description that should wrap/)).toBeInTheDocument();
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

  it("大数据量下虚拟化只渲染可视行", async () => {
    // 模拟大型市场（280+ 插件量级）：400px 视口 / 120px 行高约 4 行可见，加 overscan 8 也远小于 300
    const plugins = Array.from({ length: 300 }, (_, i) => ({
      name: `plugin-${String(i).padStart(3, "0")}`,
    }));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins }),
    } as unknown as Response);
    const { container } = renderTab();
    await waitFor(() => {
      expect(renderedRowIndexes(container).length).toBeGreaterThan(0);
    });
    const indexes = renderedRowIndexes(container);
    // 未滚动，窗口应从头开始且连续
    expect(indexes[0]).toBe(0);
    expect(indexes).toEqual(indexes.map((_, offset) => offset));
    // 窗口远小于全量，且尾部索引不会跑到列表后半段
    expect(indexes.length).toBeLessThan(60);
    expect(indexes[indexes.length - 1]).toBeLessThan(150);
    // 行序号与表头显示总数仍是全量
    expect(screen.getByText(/共 300 个插件/)).toBeInTheDocument();
  });

  it("搜索过滤后只渲染命中的行", async () => {
    // 筛选结果需远多于一屏，否则命中 calculateRange 的 measurements.length <= lanes 短路，
    // 直接返回整个列表，测不到窗口化
    const plugins = Array.from({ length: 300 }, (_, i) => ({
      name: `plugin-${String(i).padStart(3, "0")}`,
    }));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins }),
    } as unknown as Response);
    const { container } = renderTab();
    const input = await screen.findByLabelText(/搜索/);
    await waitFor(() => {
      expect(renderedRowIndexes(container).length).toBeGreaterThan(0);
    });
    // plugin-1 命中 plugin-100 ~ plugin-199，共 100 条
    fireEvent.change(input, { target: { value: "plugin-1" } });
    await waitFor(() => {
      expect(screen.getByText(/显示 1-100/)).toBeInTheDocument();
    });
    const indexes = renderedRowIndexes(container);
    expect(indexes.length).toBeLessThan(30);
    expect(indexes[0]).toBe(0);
    expect(container.querySelector("[data-slot='browse-row']")).toHaveTextContent("plugin-100");
  });

  it("已配置但已禁用的插件仍显示管理入口", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    const onManagePlugin = vi.fn();
    renderTab({
      plugins: [
        {
          id: "plugin:alpha@claude-plugins-official",
          pluginId: "alpha@claude-plugins-official",
          // 已写入 enabledPlugins 但处于禁用态：行动作取决于「是否已配置」，不是「是否启用」
          enabled: false,
          committed: true,
        },
      ],
      onManagePlugin,
    });
    expect(await screen.findByText("已配置")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /添加并启用/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "管理" }));
    expect(onManagePlugin).toHaveBeenCalledWith("alpha@claude-plugins-official");
  });

  it("筛选条件变化后滚动位置回到列表顶部", async () => {
    const plugins = Array.from({ length: 300 }, (_, i) => ({
      name: `plugin-${String(i).padStart(3, "0")}`,
    }));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins }),
    } as unknown as Response);
    const { container } = renderTab();
    const input = await screen.findByLabelText(/搜索/);
    await waitFor(() => {
      expect(renderedRowIndexes(container).length).toBeGreaterThan(0);
    });
    const scroller = container.querySelector<HTMLDivElement>("[data-slot='browse-scroll']");
    if (!scroller) throw new Error("missing browse scroll container");

    // 滚到列表中后段（打桩的 scrollTop setter 会派发 scroll，让 virtualizer 同步偏移）
    await act(async () => {
      scroller.scrollTop = 22_000;
    });
    await waitFor(() => {
      expect(renderedRowIndexes(container)[0]).toBeGreaterThan(100);
    });

    fireEvent.change(input, { target: { value: "plugin-1" } });
    await waitFor(() => {
      expect(screen.getByText(/显示 1-100/)).toBeInTheDocument();
    });
    // 收窄结果集后若保留旧偏移，窗口会停在新结果集尾部
    expect(scroller.scrollTop).toBe(0);
    await waitFor(() => {
      expect(renderedRowIndexes(container)[0]).toBe(0);
    });
    expect(container.querySelector("[data-slot='browse-row']")).toHaveTextContent("plugin-100");
  });

  it("滚动容器与表头保持列表滚动样式契约", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    const { container } = renderTab();
    await screen.findByText("alpha");
    const scroller = container.querySelector("[data-slot='browse-scroll']");
    expect(scroller).toHaveClass("max-h-[480px]", "overflow-y-auto", "overscroll-contain");
    // 表头必须在滚动容器内并 sticky，否则滚动条宽度只从行网格里扣，列会错位
    const header = container.querySelector("[data-slot='browse-header']");
    expect(scroller).toContainElement(header as HTMLElement);
    expect(header).toHaveClass("sticky", "top-0");
  });
});
