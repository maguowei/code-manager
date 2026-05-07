import { openUrl } from "@tauri-apps/plugin-opener";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import EnabledPluginsEditor from "../EnabledPluginsEditor";
import { buildOfficialPluginId, OFFICIAL_MARKETPLACE_RAW_URL } from "../marketplace-presets";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => null),
}));

const { showToastMock } = vi.hoisted(() => ({
  showToastMock: vi.fn(),
}));

vi.mock("../../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();
const OFFICIAL_PLUGIN_CACHE_KEY = "ai-manager-official-plugin-cache:v1";

function renderEditor(options?: {
  value?: Record<string, boolean | string[]>;
  showTitle?: boolean;
  onChange?: (next: Record<string, unknown>) => void;
  officialMarketplaceEnabled?: boolean;
}) {
  const onChange = options?.onChange ?? vi.fn();
  const onError = vi.fn();
  const result = render(
    <I18nProvider>
      <EnabledPluginsEditor
        value={options?.value ?? {}}
        onChange={onChange}
        onError={onError}
        showTitle={options?.showTitle}
        officialMarketplaceEnabled={options?.officialMarketplaceEnabled}
      />
    </I18nProvider>,
  );
  return { ...result, onChange, onError };
}

function chooseComboboxOption(label: string | RegExp, optionName: string | RegExp) {
  const combobox = screen.getByRole("combobox", { name: label });
  act(() => {
    fireEvent.pointerDown(combobox, { button: 0, ctrlKey: false, pointerType: "mouse" });
  });
  const option = screen.getByRole("option", { name: optionName });
  act(() => {
    fireEvent.click(option);
  });
}

function getPluginRow(pluginId: string): HTMLElement {
  const row = screen.getByText(pluginId).closest('[data-slot="plugin-list-row"]');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

function getPluginRowByDeleteAction(label: string): HTMLElement {
  const row = screen
    .getByRole("button", { name: `删除插件 ${label}` })
    .closest('[data-slot="plugin-list-row"]');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

describe("EnabledPluginsEditor", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    showToastMock.mockReset();
    vi.mocked(openUrl).mockReset();
    localStorage.clear();
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
  });

  it("renders read-only plugin rows with switch controls and a footer add button", () => {
    renderEditor({
      value: {
        "formatter@anthropic-tools": true,
      },
      showTitle: false,
    });

    expect(screen.queryByRole("heading", { name: "插件", level: 4 })).not.toBeInTheDocument();
    expect(screen.getByText("操作")).toBeInTheDocument();
    expect(screen.getByText("formatter@anthropic-tools")).toBeInTheDocument();
    expect(screen.queryByLabelText("插件 ID 1")).not.toBeInTheDocument();
    const pluginRow = getPluginRow("formatter@anthropic-tools");
    expect(
      within(pluginRow).getByRole("switch", {
        name: "插件状态 formatter@anthropic-tools",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(within(pluginRow).getByText("已启用")).toBeInTheDocument();
    expect(
      within(pluginRow).getByRole("button", {
        name: "删除插件 formatter@anthropic-tools",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索插件 ID" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "状态筛选" })).toHaveValue("all");
    expect(screen.getByRole("button", { name: "新增插件" })).toBeInTheDocument();
  });

  it("filters plugins by plugin id with case-insensitive matching", () => {
    renderEditor({
      showTitle: false,
      value: {
        "formatter@anthropic-tools": true,
        "reviewer@anthropic-tools": false,
      },
    });

    fireEvent.change(screen.getByRole("textbox", { name: "搜索插件 ID" }), {
      target: { value: "FORMATTER" },
    });

    expect(screen.getByText("formatter@anthropic-tools")).toBeInTheDocument();
    expect(screen.queryByText("reviewer@anthropic-tools")).not.toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("combines keyword and status filters", () => {
    renderEditor({
      showTitle: false,
      value: {
        "formatter@anthropic-tools": true,
        "formatter-reviewer@anthropic-tools": false,
        "writer@anthropic-tools": false,
      },
    });

    fireEvent.change(screen.getByRole("textbox", { name: "搜索插件 ID" }), {
      target: { value: "formatter" },
    });
    chooseComboboxOption("状态筛选", "未启用");

    expect(screen.queryByText("formatter@anthropic-tools")).not.toBeInTheDocument();
    expect(screen.getByText("formatter-reviewer@anthropic-tools")).toBeInTheDocument();
    expect(screen.queryByText("writer@anthropic-tools")).not.toBeInTheDocument();
  });

  it("updates the visible list immediately when toggling status inside a filtered view", () => {
    const { onChange } = renderEditor({
      showTitle: false,
      value: {
        "formatter@anthropic-tools": true,
        "reviewer@anthropic-tools": false,
      },
    });

    chooseComboboxOption("状态筛选", "已启用");

    const formatterSwitch = screen.getByRole("switch", {
      name: "插件状态 formatter@anthropic-tools",
    });
    fireEvent.click(formatterSwitch);

    expect(screen.queryByText("formatter@anthropic-tools")).not.toBeInTheDocument();
    expect(screen.getByText("未找到匹配插件。")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      "formatter@anthropic-tools": false,
      "reviewer@anthropic-tools": false,
    });
  });

  it("keeps the draft row visible while filters are active", () => {
    renderEditor({
      showTitle: false,
      value: {
        "formatter@anthropic-tools": true,
      },
    });

    fireEvent.change(screen.getByRole("textbox", { name: "搜索插件 ID" }), {
      target: { value: "reviewer" },
    });
    chooseComboboxOption("状态筛选", "未启用");
    fireEvent.click(screen.getByRole("button", { name: "新增插件" }));

    expect(screen.getByLabelText("新插件 ID")).toBeInTheDocument();
    expect(screen.getByText("新插件")).toBeInTheDocument();
  });

  it("shows a filtered empty state while keeping footer actions available", () => {
    renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
      value: {
        "formatter@anthropic-tools": true,
      },
    });

    fireEvent.change(screen.getByRole("textbox", { name: "搜索插件 ID" }), {
      target: { value: "reviewer" },
    });

    expect(screen.getByText("未找到匹配插件。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加载官方插件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增插件" })).toBeInTheDocument();
  });

  it("hydrates cached official metadata for filtering, verified icons, and homepage actions without refetching", async () => {
    localStorage.setItem(
      OFFICIAL_PLUGIN_CACHE_KEY,
      JSON.stringify({
        version: 1,
        updatedAt: "2026-04-23T00:00:00.000Z",
        plugins: [
          {
            pluginId: buildOfficialPluginId("reviewer-plugin"),
            description: "官方审核插件",
            category: "development",
            authorName: "Anthropic",
            sourceType: "url",
            homepage: "https://example.com/reviewer-plugin",
          },
          {
            pluginId: buildOfficialPluginId("writer-plugin"),
            description: "官方写作插件",
            category: "productivity",
            authorName: "Writer Team",
            sourceType: "path",
            homepage: "",
          },
        ],
      }),
    );

    renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
      value: {
        "manual-plugin@example": true,
        [buildOfficialPluginId("reviewer-plugin")]: false,
        [buildOfficialPluginId("writer-plugin")]: true,
      },
    });

    const reviewerHomepageButton = screen.getByRole("button", {
      name: `打开插件主页 ${buildOfficialPluginId("reviewer-plugin")}`,
    });
    expect(reviewerHomepageButton).toHaveAttribute("data-description", "官方审核插件");
    expect(
      screen.queryByRole("button", {
        name: `打开插件主页 ${buildOfficialPluginId("writer-plugin")}`,
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(reviewerHomepageButton);
    await waitFor(() => {
      expect(openUrl).toHaveBeenCalledWith("https://example.com/reviewer-plugin");
    });
    expect(fetchMock).not.toHaveBeenCalled();

    const reviewerRow = getPluginRow(buildOfficialPluginId("reviewer-plugin"));
    const writerRow = getPluginRow(buildOfficialPluginId("writer-plugin"));

    expect(within(reviewerRow).queryByText("已验证")).not.toBeInTheDocument();
    expect(
      within(reviewerRow).getByRole("img", {
        name: "已验证插件",
      }),
    ).toBeInTheDocument();
    expect(within(reviewerRow).getByText("Anthropic")).toBeInTheDocument();
    expect(within(reviewerRow).getByText("development")).toBeInTheDocument();
    expect(within(writerRow).queryByText("已验证")).not.toBeInTheDocument();
    expect(
      within(writerRow).getByRole("img", {
        name: "已验证插件",
      }),
    ).toBeInTheDocument();
    expect(within(writerRow).getByText("Writer Team")).toBeInTheDocument();
    expect(within(writerRow).getByText("productivity")).toBeInTheDocument();

    chooseComboboxOption("类别筛选", "development");
    chooseComboboxOption("来源类型筛选", "url");

    expect(screen.getByText(buildOfficialPluginId("reviewer-plugin"))).toBeInTheDocument();
    expect(screen.queryByText(buildOfficialPluginId("writer-plugin"))).not.toBeInTheDocument();
    expect(screen.queryByText("manual-plugin@example")).not.toBeInTheDocument();
  });

  it("renders homepage plugin links and static plugin ids with the same identity text", () => {
    localStorage.setItem(
      OFFICIAL_PLUGIN_CACHE_KEY,
      JSON.stringify({
        version: 1,
        updatedAt: "2026-04-23T00:00:00.000Z",
        plugins: [
          {
            pluginId: buildOfficialPluginId("homepage-plugin"),
            description: "带主页插件",
            homepage: "https://example.com/homepage-plugin",
          },
          {
            pluginId: buildOfficialPluginId("static-plugin"),
            description: "静态插件",
            homepage: "",
          },
        ],
      }),
    );

    renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
      value: {
        [buildOfficialPluginId("homepage-plugin")]: true,
        [buildOfficialPluginId("static-plugin")]: true,
      },
    });

    expect(
      screen.getByRole("button", {
        name: `打开插件主页 ${buildOfficialPluginId("homepage-plugin")}`,
      }),
    ).toHaveAttribute("data-description", "带主页插件");
    expect(screen.getByText(buildOfficialPluginId("static-plugin"))).toBeInTheDocument();
  });

  it("keeps plugin ids, status labels, and row actions available in each row", () => {
    renderEditor({
      showTitle: false,
      value: {
        "formatter@anthropic-tools": true,
      },
    });

    const pluginRow = getPluginRow("formatter@anthropic-tools");

    expect(within(pluginRow).getByText("formatter@anthropic-tools")).toBeInTheDocument();
    expect(within(pluginRow).getByText("已启用")).toBeInTheDocument();
    expect(
      within(pluginRow).getByRole("button", { name: "删除插件 formatter@anthropic-tools" }),
    ).toBeInTheDocument();
  });

  it("renders the table headers for id, status, and actions", () => {
    renderEditor({
      showTitle: false,
      value: {
        "formatter@anthropic-tools": true,
      },
    });

    expect(screen.getByText("序号")).toBeInTheDocument();
    expect(screen.getByText("插件 ID")).toBeInTheDocument();
    expect(screen.getByText("状态")).toBeInTheDocument();
    expect(screen.getByText("操作")).toBeInTheDocument();
  });

  it("fills the full filter row with a stable search field and compresses the trailing selects within the same line", () => {
    renderEditor({
      showTitle: false,
      value: {
        "formatter@anthropic-tools": true,
      },
    });

    expect(screen.getByText("状态")).toBeInTheDocument();
    expect(screen.getByText("类别")).toBeInTheDocument();
    expect(screen.getByText("来源")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", {
        name: "搜索作者",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索插件 ID" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "状态筛选" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "类别筛选" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "来源类型筛选" })).toBeInTheDocument();
  });

  it("shows a subtle verified icon even before metadata is loaded", () => {
    renderEditor({
      showTitle: false,
      value: {
        [buildOfficialPluginId("plain-official-plugin")]: false,
      },
    });

    const officialRow = getPluginRow(buildOfficialPluginId("plain-official-plugin"));

    expect(within(officialRow).queryByText("已验证")).not.toBeInTheDocument();
    expect(
      within(officialRow).getByRole("img", {
        name: "已验证插件",
      }),
    ).toBeInTheDocument();
  });

  it("uses one shared metadata surface for author and category plus a verified icon", () => {
    localStorage.setItem(
      OFFICIAL_PLUGIN_CACHE_KEY,
      JSON.stringify({
        version: 1,
        updatedAt: "2026-04-23T00:00:00.000Z",
        plugins: [
          {
            pluginId: buildOfficialPluginId("metadata-plugin"),
            category: "development",
            authorName: "Anthropic",
          },
        ],
      }),
    );

    renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
      value: {
        [buildOfficialPluginId("metadata-plugin")]: true,
      },
    });
    const pluginRow = getPluginRow(buildOfficialPluginId("metadata-plugin"));

    expect(
      within(pluginRow).getByRole("img", {
        name: "已验证插件",
      }),
    ).toBeInTheDocument();
    expect(within(pluginRow).getByText("Anthropic")).toBeInTheDocument();
    expect(within(pluginRow).getByText("development")).toBeInTheDocument();
  });

  it("adds a placeholder plugin row, edits it inline, and saves boolean state", () => {
    const { onChange, onError } = renderEditor({
      showTitle: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "新增插件" }));

    const draftRow = getPluginRowByDeleteAction("新插件");
    expect(within(draftRow).getByText("新插件")).toBeInTheDocument();
    expect(within(draftRow).getByText("草稿")).toBeInTheDocument();
    expect(within(draftRow).getByRole("switch", { name: "插件状态 新插件" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(draftRow).getByLabelText("新插件 ID")).toBeInTheDocument();

    fireEvent.click(within(draftRow).getByRole("switch", { name: "插件状态 新插件" }));
    fireEvent.change(within(draftRow).getByLabelText("新插件 ID"), {
      target: { value: "formatter@anthropic-tools" },
    });
    expect(
      within(draftRow).getByRole("button", {
        name: "删除插件 formatter@anthropic-tools",
      }),
    ).toBeInTheDocument();
    expect(
      within(draftRow).getByRole("switch", {
        name: "插件状态 formatter@anthropic-tools",
      }),
    ).toHaveAttribute("aria-checked", "false");
    expect(within(draftRow).getByText("formatter@anthropic-tools")).toBeInTheDocument();
    fireEvent.click(within(draftRow).getByRole("button", { name: "保存插件" }));

    expect(screen.queryByLabelText("新插件 ID")).not.toBeInTheDocument();
    expect(screen.getByText("formatter@anthropic-tools")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "插件状态 formatter@anthropic-tools" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(onChange).toHaveBeenLastCalledWith({
      "formatter@anthropic-tools": false,
    });
    expect(onError).toHaveBeenLastCalledWith("");
  });

  it("removes the placeholder row on cancel or delete", () => {
    renderEditor({
      showTitle: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "新增插件" }));
    const draftRow = getPluginRowByDeleteAction("新插件");

    fireEvent.click(within(draftRow).getByRole("button", { name: "取消编辑插件" }));
    expect(screen.queryByText("新插件")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("新插件 ID")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新增插件" }));
    fireEvent.click(screen.getByRole("button", { name: "删除插件 新插件" }));
    expect(screen.queryByText("新插件")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("新插件 ID")).not.toBeInTheDocument();
    expect(screen.queryByText("删除插件")).not.toBeInTheDocument();
  });

  it("validates draft ids and blocks creating a second placeholder before saving", () => {
    renderEditor({
      showTitle: false,
      value: {
        "formatter@anthropic-tools": true,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "新增插件" }));
    fireEvent.click(screen.getByRole("button", { name: "保存插件" }));
    expect(screen.getByText("插件 ID 不能为空")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("新插件 ID"), {
      target: { value: "formatter@anthropic-tools" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存插件" }));
    expect(screen.getByText("插件 ID 不能重复")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新增插件" }));
    expect(screen.getAllByLabelText("新插件 ID")).toHaveLength(1);
    expect(screen.getByText("当前插件编辑未保存，请先保存或取消。")).toBeInTheDocument();
  });

  it("shows one-based row numbers and reindexes them after confirmed removal", () => {
    const { onChange } = renderEditor({
      showTitle: false,
      value: {
        "formatter@anthropic-tools": true,
        "reviewer@anthropic-tools": false,
      },
    });

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除插件 formatter@anthropic-tools" }));

    const dialogMessage = "确定要从当前设置中移除插件 formatter@anthropic-tools 吗？";
    const dialog = screen.getByRole("alertdialog", { name: "删除插件" });
    expect(within(dialog).getByText(dialogMessage)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.getByText("reviewer@anthropic-tools")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "插件状态 reviewer@anthropic-tools" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(onChange).toHaveBeenLastCalledWith({
      "reviewer@anthropic-tools": false,
    });
  });

  it("keeps a saved plugin when deletion is canceled", () => {
    const { onChange } = renderEditor({
      showTitle: false,
      value: {
        "formatter@anthropic-tools": true,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "删除插件 formatter@anthropic-tools" }));

    const dialogMessage = "确定要从当前设置中移除插件 formatter@anthropic-tools 吗？";
    const dialog = screen.getByRole("alertdialog", { name: "删除插件" });
    expect(within(dialog).getByText(dialogMessage)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));

    expect(screen.getByText("formatter@anthropic-tools")).toBeInTheDocument();
    expect(screen.queryByText(dialogMessage)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hides the official load button when the official marketplace is not enabled", () => {
    renderEditor({
      showTitle: false,
    });

    expect(screen.queryByRole("button", { name: "加载官方插件" })).not.toBeInTheDocument();
  });

  it("shows the official load button when the official marketplace is enabled", () => {
    renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
    });

    expect(screen.getAllByRole("button", { name: "加载官方插件" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "新增插件" })).toBeInTheDocument();
  });

  it("can render the official load action outside the editor toolbar with refresh affordance", async () => {
    function ExternalActionHost() {
      const [action, setAction] = useState<ReactNode>(null);
      const value = useMemo(() => ({}), []);

      return (
        <I18nProvider>
          <div data-testid="external-mode-row">{action}</div>
          <EnabledPluginsEditor
            value={value}
            onChange={() => {}}
            onError={() => {}}
            showTitle={false}
            officialMarketplaceEnabled
            showOfficialToolbar={false}
            onOfficialActionChange={setAction}
          />
        </I18nProvider>
      );
    }

    render(<ExternalActionHost />);

    await waitFor(() => {
      expect(
        within(screen.getByTestId("external-mode-row")).getByRole("button", {
          name: "加载官方插件",
        }),
      ).toBeInTheDocument();
    });
    const actionButton = within(screen.getByTestId("external-mode-row")).getByRole("button", {
      name: "加载官方插件",
    });

    expect(actionButton).toHaveAttribute("title", "重新获取官方插件列表并刷新本地缓存。");
    expect(actionButton).toHaveAttribute("data-tooltip", "重新获取官方插件列表并刷新本地缓存。");
    expect(screen.getAllByRole("button", { name: "加载官方插件" })).toHaveLength(1);
  });

  it("keeps the official refresh action label unchanged while loading", async () => {
    const pendingRequest = new Promise(() => {});
    fetchMock.mockReturnValue(pendingRequest);

    renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
    });

    const actionButton = screen.getByRole("button", { name: "加载官方插件" });
    expect(actionButton).toHaveTextContent("加载官方插件");
    expect(actionButton).not.toHaveAttribute("aria-busy", "true");

    await act(async () => {
      fireEvent.click(actionButton);
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "加载官方插件" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "加载官方插件" })).toHaveTextContent("加载官方插件");
    expect(screen.getByRole("button", { name: "加载官方插件" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("keeps fast official plugin loads visible briefly and confirms success with toast", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        plugins: [{ name: "fast-plugin" }],
      }),
    });

    renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "加载官方插件" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const loadingButton = screen.getByRole("button", { name: "加载官方插件" });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveAttribute("aria-busy", "true");
    expect(showToastMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(499);
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "加载官方插件" })).toBeDisabled();
    expect(showToastMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "加载官方插件" })).not.toBeDisabled();
    expect(showToastMock).toHaveBeenCalledWith("官方插件列表已刷新");
  });

  it("loads official plugins without overwriting existing plugin states or legacy entries", async () => {
    const { onChange } = renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
      value: {
        "formatter@anthropic-tools": true,
        [buildOfficialPluginId("existing-plugin")]: true,
        "legacy-tools@anthropic-tools": ["format", "lint"],
      },
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        plugins: [
          {
            name: "existing-plugin",
            description: "已存在插件",
            category: "development",
            author: { name: "Anthropic" },
            source: { source: "url", url: "https://example.com/existing-plugin.git" },
            homepage: "https://example.com/existing-plugin",
          },
          {
            name: "reviewer-plugin",
            description: "审核插件",
            category: "development",
            author: { name: "Anthropic" },
            source: { source: "url", url: "https://example.com/reviewer-plugin.git" },
            homepage: "https://example.com/reviewer-plugin",
          },
          {
            name: " reviewer-plugin ",
            description: "重复审核插件",
            source: { source: "url", url: "https://example.com/reviewer-plugin.git" },
          },
          {
            name: "writer-plugin",
            description: "写作插件",
            category: "productivity",
            source: "./plugins/writer-plugin",
          },
          {
            name: "mystery-plugin",
            source: { unexpected: true },
          },
          { bad: "entry" },
        ],
      }),
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "加载官方插件" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(OFFICIAL_MARKETPLACE_RAW_URL);
    expect(screen.getByText(buildOfficialPluginId("reviewer-plugin"))).toBeInTheDocument();
    expect(screen.getByText(buildOfficialPluginId("writer-plugin"))).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: `插件状态 ${buildOfficialPluginId("reviewer-plugin")}` }),
    ).toHaveAttribute("aria-checked", "false");

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        "formatter@anthropic-tools": true,
        [buildOfficialPluginId("existing-plugin")]: true,
        "legacy-tools@anthropic-tools": ["format", "lint"],
        [buildOfficialPluginId("reviewer-plugin")]: false,
        [buildOfficialPluginId("writer-plugin")]: false,
        [buildOfficialPluginId("mystery-plugin")]: false,
      });
    });

    expect(JSON.parse(localStorage.getItem(OFFICIAL_PLUGIN_CACHE_KEY) ?? "{}")).toMatchObject({
      version: 1,
      plugins: [
        {
          pluginId: buildOfficialPluginId("existing-plugin"),
          description: "已存在插件",
          category: "development",
          authorName: "Anthropic",
          sourceType: "url",
          homepage: "https://example.com/existing-plugin",
        },
        {
          pluginId: buildOfficialPluginId("reviewer-plugin"),
          description: "审核插件",
          category: "development",
          authorName: "Anthropic",
          sourceType: "url",
          homepage: "https://example.com/reviewer-plugin",
        },
        {
          pluginId: buildOfficialPluginId("writer-plugin"),
          description: "写作插件",
          category: "productivity",
          authorName: "",
          sourceType: "path",
          homepage: "",
        },
        {
          pluginId: buildOfficialPluginId("mystery-plugin"),
          description: "",
          category: "",
          authorName: "",
          sourceType: "unknown",
          homepage: "",
        },
      ],
    });
  });

  it("only appends newly discovered official plugins on repeated loads", async () => {
    vi.useFakeTimers();
    const { onChange } = renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          plugins: [{ name: "alpha-plugin" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          plugins: [{ name: "alpha-plugin" }, { name: "beta-plugin" }],
        }),
      });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "加载官方插件" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenLastCalledWith({
      [buildOfficialPluginId("alpha-plugin")]: false,
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "加载官方插件" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenLastCalledWith({
      [buildOfficialPluginId("alpha-plugin")]: false,
      [buildOfficialPluginId("beta-plugin")]: false,
    });
  });

  it("blocks official plugin loading when a draft plugin is still dirty", () => {
    renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "新增插件" }));
    fireEvent.click(screen.getByRole("button", { name: "加载官方插件" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("当前插件编辑未保存，请先保存或取消。")).toBeInTheDocument();
  });

  it("falls back to cached official metadata when the latest request fails", async () => {
    const { onChange } = renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
    });

    localStorage.setItem(
      OFFICIAL_PLUGIN_CACHE_KEY,
      JSON.stringify({
        version: 1,
        updatedAt: "2026-04-23T00:00:00.000Z",
        plugins: [
          {
            pluginId: buildOfficialPluginId("cached-plugin"),
            description: "缓存插件",
            category: "development",
            authorName: "Anthropic",
            sourceType: "url",
            homepage: "https://example.com/cached-plugin",
          },
        ],
      }),
    );
    fetchMock.mockRejectedValue(new Error("network error"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "加载官方插件" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(buildOfficialPluginId("cached-plugin"))).toBeInTheDocument();
    expect(screen.queryByText("加载官方插件失败，请稍后重试。")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        [buildOfficialPluginId("cached-plugin")]: false,
      });
    });
  });

  it("shows an error and keeps the current list unchanged when the official manifest is invalid", async () => {
    const { onChange } = renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
      value: {
        "formatter@anthropic-tools": true,
      },
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        plugins: null,
      }),
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "加载官方插件" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("加载官方插件失败，请稍后重试。")).toBeInTheDocument();
    expect(screen.queryByText(buildOfficialPluginId("reviewer-plugin"))).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the active filters after loading official plugins", async () => {
    renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
      value: {
        "formatter@anthropic-tools": true,
      },
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        plugins: [{ name: "reviewer-plugin" }, { name: "writer-plugin" }],
      }),
    });

    fireEvent.change(screen.getByRole("textbox", { name: "搜索插件 ID" }), {
      target: { value: "reviewer" },
    });
    chooseComboboxOption("状态筛选", "未启用");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "加载官方插件" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(buildOfficialPluginId("reviewer-plugin"))).toBeInTheDocument();
    expect(screen.queryByText(buildOfficialPluginId("writer-plugin"))).not.toBeInTheDocument();
    expect(screen.queryByText("formatter@anthropic-tools")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索插件 ID" })).toHaveValue("reviewer");
    expect(screen.getByRole("combobox", { name: "状态筛选" })).toHaveValue("disabled");
  });
});
