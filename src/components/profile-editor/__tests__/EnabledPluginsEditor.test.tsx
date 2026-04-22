import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import EnabledPluginsEditor from "../EnabledPluginsEditor";
import { buildOfficialPluginId, OFFICIAL_MARKETPLACE_RAW_URL } from "../marketplace-presets";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

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
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
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
    expect(screen.getByRole("button", { name: "新增插件" })).toBeInTheDocument();
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
    renderEditor({
      showTitle: false,
      officialMarketplaceEnabled: true,
    });

    expect(screen.getByRole("button", { name: "加载官方插件" })).toBeInTheDocument();
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
          { name: "existing-plugin" },
          { name: "reviewer-plugin" },
          { name: " reviewer-plugin " },
          { name: "writer-plugin" },
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
      });
    });
  });

  it("only appends newly discovered official plugins on repeated loads", async () => {
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

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        [buildOfficialPluginId("alpha-plugin")]: false,
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "加载官方插件" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({
        [buildOfficialPluginId("alpha-plugin")]: false,
        [buildOfficialPluginId("beta-plugin")]: false,
      });
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
});
