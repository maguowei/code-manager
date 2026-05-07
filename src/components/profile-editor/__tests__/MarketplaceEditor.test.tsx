import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import MarketplaceEditor from "../MarketplaceEditor";
import { OFFICIAL_MARKETPLACE_ID, OFFICIAL_MARKETPLACE_REPO } from "../marketplace-presets";

function renderEditor(options?: {
  value?: Record<string, unknown>;
  showTitle?: boolean;
  onChange?: (next: Record<string, unknown>) => void;
}) {
  const onChange = options?.onChange ?? vi.fn();
  const onError = vi.fn();
  render(
    <I18nProvider>
      <MarketplaceEditor
        value={
          options?.value ?? {
            "team-market": {
              source: {
                source: "github",
                repo: "team/plugins",
              },
              installLocation: "/tmp/team-market",
            },
            "backup-market": {
              source: {
                source: "url",
                url: "https://example.com/marketplace.json",
              },
            },
          }
        }
        onChange={onChange}
        onError={onError}
        showTitle={options?.showTitle ?? false}
      />
    </I18nProvider>,
  );
  return { onChange, onError };
}

describe("MarketplaceEditor", () => {
  it("adds the official marketplace with the built-in github source", () => {
    const { onChange } = renderEditor({ value: {} });

    fireEvent.click(screen.getByRole("button", { name: "启用官方市场" }));

    expect(onChange).toHaveBeenLastCalledWith({
      [OFFICIAL_MARKETPLACE_ID]: {
        source: {
          source: "github",
          repo: OFFICIAL_MARKETPLACE_REPO,
        },
      },
    });
  });

  it("hides the official marketplace shortcut when the current layer already contains it", () => {
    renderEditor({
      value: {
        [OFFICIAL_MARKETPLACE_ID]: {
          source: {
            source: "github",
            repo: OFFICIAL_MARKETPLACE_REPO,
          },
        },
      },
    });

    expect(screen.queryByRole("button", { name: "启用官方市场" })).not.toBeInTheDocument();
  });

  it("blocks adding the official marketplace while the current marketplace draft is dirty", () => {
    const { onChange } = renderEditor({ value: {} });

    fireEvent.click(screen.getByRole("button", { name: "新增 Marketplace" }));
    fireEvent.change(screen.getByLabelText("Marketplace ID"), {
      target: { value: "draft-market" },
    });
    fireEvent.click(screen.getByRole("button", { name: "启用官方市场" }));

    expect(screen.getByText("请先保存或取消当前 Marketplace 编辑。")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a confirmation dialog before deleting a saved marketplace", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "删除 Marketplace team-market" }));

    const dialogMessage = "确定要从当前设置中移除 Marketplace team-market 吗？";
    const dialog = screen.getByRole("alertdialog", { name: "删除 Marketplace" });
    expect(within(dialog).getByText(dialogMessage)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));

    expect(onChange).toHaveBeenLastCalledWith({
      "backup-market": {
        source: {
          source: "url",
          url: "https://example.com/marketplace.json",
        },
      },
    });
  });

  it("keeps the marketplace when deletion is canceled", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "删除 Marketplace team-market" }));

    const dialogMessage = "确定要从当前设置中移除 Marketplace team-market 吗？";
    const dialog = screen.getByRole("alertdialog", { name: "删除 Marketplace" });
    expect(within(dialog).getByText(dialogMessage)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));

    expect(
      screen.getByRole("button", { name: "编辑 Marketplace team-market" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(dialogMessage)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows deleting a new draft marketplace directly without confirmation", () => {
    const { onChange } = renderEditor({ value: {} });

    fireEvent.click(screen.getByRole("button", { name: "新增 Marketplace" }));

    fireEvent.change(screen.getByLabelText("Marketplace ID"), {
      target: { value: "draft-market" },
    });
    fireEvent.click(screen.getByRole("button", { name: "删除 Marketplace draft-market" }));

    expect(screen.queryByLabelText("Marketplace ID")).not.toBeInTheDocument();
    expect(screen.queryByText("删除 Marketplace")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("blocks deletion while the current marketplace row has unsaved changes", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "编辑 Marketplace team-market" }));
    fireEvent.change(screen.getByLabelText("Marketplace 仓库"), {
      target: { value: "team/updated-plugins" },
    });
    fireEvent.click(screen.getByRole("button", { name: "删除 Marketplace team-market" }));

    expect(screen.getByText("请先保存或取消当前 Marketplace 编辑。")).toBeInTheDocument();
    expect(
      screen.queryByText("确定要从当前设置中移除 Marketplace team-market 吗？"),
    ).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
