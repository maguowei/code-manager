import { readFileSync } from "node:fs";
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
    const { container } = renderEditor({
      value: {
        "formatter@anthropic-tools": true,
      },
      showTitle: false,
    });

    expect(screen.queryByRole("heading", { name: "插件", level: 4 })).not.toBeInTheDocument();
    expect(container.querySelector(".profile-plugin-list")).not.toBeNull();
    expect(screen.getByText("操作")).toBeInTheDocument();
    expect(screen.getByText("formatter@anthropic-tools")).toBeInTheDocument();
    expect(screen.queryByLabelText("插件 ID 1")).not.toBeInTheDocument();
    const pluginRow = screen
      .getByText("formatter@anthropic-tools")
      .closest(".profile-plugin-list-row");
    expect(pluginRow).not.toBeNull();
    const pluginRowMain = (pluginRow as HTMLElement | null)?.querySelector(
      ".profile-plugin-list-main",
    );
    expect(pluginRowMain).not.toBeNull();
    expect(
      within(pluginRowMain as HTMLElement).getByRole("switch", {
        name: "插件状态 formatter@anthropic-tools",
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(within(pluginRowMain as HTMLElement).getByText("已启用")).toBeInTheDocument();
    expect(
      within(pluginRowMain as HTMLElement).getByRole("button", {
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
    fireEvent.change(screen.getByRole("combobox", { name: "状态筛选" }), {
      target: { value: "disabled" },
    });

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

    fireEvent.change(screen.getByRole("combobox", { name: "状态筛选" }), {
      target: { value: "enabled" },
    });

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
    fireEvent.change(screen.getByRole("combobox", { name: "状态筛选" }), {
      target: { value: "disabled" },
    });
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

    const reviewerRow = screen
      .getByText(buildOfficialPluginId("reviewer-plugin"))
      .closest(".profile-plugin-list-row");
    const writerRow = screen
      .getByText(buildOfficialPluginId("writer-plugin"))
      .closest(".profile-plugin-list-row");

    expect(reviewerRow).not.toBeNull();
    expect(writerRow).not.toBeNull();
    expect(within(reviewerRow as HTMLElement).queryByText("已验证")).not.toBeInTheDocument();
    expect(
      within(reviewerRow as HTMLElement).getByRole("img", {
        name: "已验证插件",
      }),
    ).toHaveClass("profile-plugin-verified-icon");
    expect(within(reviewerRow as HTMLElement).getByText("Anthropic")).toHaveClass(
      "profile-plugin-meta-item",
    );
    expect(within(reviewerRow as HTMLElement).getByText("development")).toBeInTheDocument();
    expect(within(writerRow as HTMLElement).queryByText("已验证")).not.toBeInTheDocument();
    expect(
      within(writerRow as HTMLElement).getByRole("img", {
        name: "已验证插件",
      }),
    ).toHaveClass("profile-plugin-verified-icon");
    expect(within(writerRow as HTMLElement).getByText("Writer Team")).toHaveClass(
      "profile-plugin-meta-item",
    );
    expect(within(writerRow as HTMLElement).getByText("productivity")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "类别筛选" }), {
      target: { value: "development" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "来源类型筛选" }), {
      target: { value: "url" },
    });

    expect(screen.getByText(buildOfficialPluginId("reviewer-plugin"))).toBeInTheDocument();
    expect(screen.queryByText(buildOfficialPluginId("writer-plugin"))).not.toBeInTheDocument();
    expect(screen.queryByText("manual-plugin@example")).not.toBeInTheDocument();
  });

  it("keeps homepage plugin links using the same inherited font as static plugin ids", () => {
    const css = readFileSync("src/components/profile-editor/EnabledPluginsEditor.css", "utf8");

    expect(css).toMatch(/\.profile-plugin-link\s*\{[^}]*font:\s*inherit;/s);
  });

  it("keeps plugin ids on the main body typography while using a smaller status label", () => {
    const css = readFileSync("src/components/profile-editor/EnabledPluginsEditor.css", "utf8");

    expect(css).toMatch(
      /\.profile-plugin-list-row\s*\{[^}]*font-size:\s*14px;[^}]*font-weight:\s*500;/s,
    );
    expect(css).toMatch(/\.profile-plugin-list-id\s*\{[^}]*font-weight:\s*inherit;/s);
    expect(css).toMatch(/\.profile-plugin-index\s*\{[^}]*font-size:\s*inherit;/s);
    expect(css).toMatch(/\.profile-plugin-index\s*\{[^}]*font-weight:\s*inherit;/s);
    expect(css).toMatch(/\.profile-plugin-status-text\s*\{[^}]*font-size:\s*12px;/s);
    expect(css).toMatch(/\.profile-plugin-status-text\s*\{[^}]*font-weight:\s*500;/s);
  });

  it("allocates most table width to plugin ids by keeping status and actions compact", () => {
    const css = readFileSync("src/components/profile-editor/EnabledPluginsEditor.css", "utf8");

    expect(css).toMatch(
      /\.profile-plugin-list\s*\{[^}]*--profile-plugin-status-width:\s*clamp\(118px,\s*12vw,\s*132px\);/s,
    );
    expect(css).toMatch(
      /\.profile-plugin-list\s*\{[^}]*--profile-plugin-action-width:\s*52px;[^}]*--profile-plugin-column-gap:\s*12px;/s,
    );
    expect(css).toMatch(/\.profile-plugin-list-header-actions\s*\{[^}]*text-align:\s*right;/s);
    expect(css).toMatch(/\.profile-plugin-row-actions\s*\{[^}]*justify-self:\s*end;/s);
    expect(css).toMatch(/\.profile-plugin-status-cell\s*\{[^}]*gap:\s*10px;/s);
  });

  it("fills the full filter row with a stable search field and compresses the trailing selects within the same line", () => {
    const css = readFileSync("src/components/profile-editor/EnabledPluginsEditor.css", "utf8");
    const { container } = renderEditor({
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
    expect(container.querySelectorAll(".profile-plugin-filter-field.is-expandable")).toHaveLength(
      0,
    );
    expect(container.querySelector(".profile-plugin-filter-field-search")).not.toBeNull();
    expect(container.querySelector(".profile-plugin-filter-field-author")).toBeNull();
    expect(css).toMatch(/\.profile-plugin-filter-field-search\s*\{[^}]*flex:\s*2\s+1\s+0;/s);
    expect(css).toMatch(
      /\.profile-plugin-filter-field-select\s*\{[^}]*flex:\s*1\s+1\s+0;[^}]*min-width:\s*150px;[^}]*max-width:\s*none;/s,
    );
    expect(css).not.toMatch(/\.profile-plugin-filter-field-input\.is-expandable:focus-within/s);
  });

  it("shows a subtle verified icon even before metadata is loaded", () => {
    renderEditor({
      showTitle: false,
      value: {
        [buildOfficialPluginId("plain-official-plugin")]: false,
      },
    });

    const officialRow = screen
      .getByText(buildOfficialPluginId("plain-official-plugin"))
      .closest(".profile-plugin-list-row");

    expect(officialRow).not.toBeNull();
    expect(within(officialRow as HTMLElement).queryByText("已验证")).not.toBeInTheDocument();
    expect(
      within(officialRow as HTMLElement).getByRole("img", {
        name: "已验证插件",
      }),
    ).toHaveClass("profile-plugin-verified-icon");
  });

  it("uses one shared metadata style for author and category plus a subtle verified icon", () => {
    const css = readFileSync("src/components/profile-editor/EnabledPluginsEditor.css", "utf8");

    expect(css).not.toMatch(/\.profile-plugin-meta-author\s*\{/);
    expect(css).toMatch(/\.profile-plugin-verified-icon\s*\{[^}]*opacity:\s*0\.[0-9]+;/s);
  });

  it("adds a placeholder plugin row, edits it inline, and saves boolean state", () => {
    const { onChange, onError } = renderEditor({
      showTitle: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "新增插件" }));

    const draftRow = screen
      .getByRole("button", { name: "删除插件 新插件" })
      .closest(".profile-plugin-list-row");
    expect(draftRow).not.toBeNull();
    expect(within(draftRow as HTMLElement).getByText("新插件")).toBeInTheDocument();
    expect(within(draftRow as HTMLElement).getByText("草稿")).toBeInTheDocument();
    expect(
      within(draftRow as HTMLElement).getByRole("switch", { name: "插件状态 新插件" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(within(draftRow as HTMLElement).getByLabelText("新插件 ID")).toBeInTheDocument();

    fireEvent.click(
      within(draftRow as HTMLElement).getByRole("switch", { name: "插件状态 新插件" }),
    );
    fireEvent.change(within(draftRow as HTMLElement).getByLabelText("新插件 ID"), {
      target: { value: "formatter@anthropic-tools" },
    });
    expect(
      within(draftRow as HTMLElement).getByRole("button", {
        name: "删除插件 formatter@anthropic-tools",
      }),
    ).toBeInTheDocument();
    expect(
      within(draftRow as HTMLElement).getByRole("switch", {
        name: "插件状态 formatter@anthropic-tools",
      }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      within(draftRow as HTMLElement).getByText("formatter@anthropic-tools"),
    ).toBeInTheDocument();
    fireEvent.click(within(draftRow as HTMLElement).getByRole("button", { name: "保存插件" }));

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
    const draftRow = screen
      .getByRole("button", { name: "删除插件 新插件" })
      .closest(".profile-plugin-list-row");
    expect(draftRow).not.toBeNull();

    fireEvent.click(within(draftRow as HTMLElement).getByRole("button", { name: "取消编辑插件" }));
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
    const dialog = screen.getByText(dialogMessage).closest(".confirm-dialog");
    expect(dialog).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(within(dialog as HTMLElement).getByRole("button", { name: "删除" }));

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
    const dialog = screen.getByText(dialogMessage).closest(".confirm-dialog");
    expect(dialog).not.toBeNull();

    fireEvent.click(within(dialog as HTMLElement).getByRole("button", { name: "取消" }));

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
    const { container } = renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
    });

    const toolbar = container.querySelector(".profile-plugin-toolbar");
    const footerActions = container.querySelector(".profile-plugin-footer-actions");

    expect(toolbar).not.toBeNull();
    expect(
      within(toolbar as HTMLElement).getByRole("button", { name: "加载官方插件" }),
    ).toBeInTheDocument();
    expect(
      within(footerActions as HTMLElement).queryByRole("button", { name: "加载官方插件" }),
    ).not.toBeInTheDocument();
  });

  it("can render the official load action outside the editor toolbar with refresh affordance", async () => {
    function ExternalActionHost() {
      const [action, setAction] = useState<ReactNode>(null);
      const value = useMemo(() => ({}), []);

      return (
        <I18nProvider>
          <div className="external-mode-row">{action}</div>
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

    const { container } = render(<ExternalActionHost />);

    await waitFor(() => {
      expect(
        within(container.querySelector(".external-mode-row") as HTMLElement).getByRole("button", {
          name: "加载官方插件",
        }),
      ).toBeInTheDocument();
    });
    const actionButton = within(
      container.querySelector(".external-mode-row") as HTMLElement,
    ).getByRole("button", { name: "加载官方插件" });

    expect(actionButton).toHaveAttribute("title", "重新获取官方插件列表并刷新本地缓存。");
    expect(actionButton).toHaveAttribute("data-tooltip", "重新获取官方插件列表并刷新本地缓存。");
    expect(actionButton.querySelector("svg")).not.toBeNull();
    expect(container.querySelector(".profile-plugin-toolbar")).toBeNull();
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
    fireEvent.change(screen.getByRole("combobox", { name: "状态筛选" }), {
      target: { value: "disabled" },
    });

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
