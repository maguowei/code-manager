import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import type { StringRow } from "../editor-utils";
import StringListEditor from "../StringListEditor";

function renderEditor(
  initialRows: StringRow[],
  options?: {
    rowActionLabel?: string;
    onRowAction?: (row: StringRow, index: number) => void;
    buildRowActionAriaLabel?: (itemLabel: string) => string;
    rowActions?: Array<{
      label: string;
      icon?: ReactNode;
      onClick: (row: StringRow, index: number) => void;
      buildAriaLabel?: (itemLabel: string) => string;
    }>;
    clearable?: boolean;
  },
) {
  function Harness() {
    const [rows, setRows] = useState(initialRows);
    const [expanded, setExpanded] = useState(true);

    return (
      <I18nProvider>
        <StringListEditor
          label="允许规则"
          rows={rows}
          onChange={setRows}
          onAdd={() =>
            setRows((current) => [
              ...current,
              {
                id: `row-${current.length + 1}`,
                value: "",
              },
            ])
          }
          onClear={options?.clearable ? () => setRows([]) : undefined}
          addLabel="新增允许规则"
          clearLabel={options?.clearable ? "清空允许规则" : undefined}
          itemLabelPrefix="允许规则"
          placeholder="例如：Bash"
          emptyHint="当前没有允许规则。"
          rowActionLabel={options?.rowActionLabel}
          onRowAction={options?.onRowAction}
          buildRowActionAriaLabel={options?.buildRowActionAriaLabel}
          rowActions={options?.rowActions}
          collapsible
          expanded={expanded}
          onToggleExpanded={() => setExpanded((current) => !current)}
          showCollapseToggle={rows.length > 0}
        />
      </I18nProvider>
    );
  }

  render(<Harness />);
}

describe("StringListEditor", () => {
  it("keeps empty lists simple and renders the add action at the bottom", () => {
    renderEditor([]);

    const subsection = screen
      .getByRole("heading", { name: "允许规则" })
      .closest('[data-slot="profile-subsection"]') as HTMLElement | null;
    expect(subsection).not.toBeNull();
    if (!subsection) {
      return;
    }

    const emptyState = within(subsection).getByText("当前没有允许规则。");
    const addButton = within(subsection).getByRole("button", { name: "新增允许规则" });

    expect(
      within(subsection).queryByRole("button", { name: "收起 允许规则" }),
    ).not.toBeInTheDocument();
    expect(
      within(subsection).queryByRole("button", { name: "展开 允许规则" }),
    ).not.toBeInTheDocument();
    expect(emptyState.compareDocumentPosition(addButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("shows populated lists expanded by default and supports collapsing", () => {
    renderEditor([{ id: "allow-1", value: "Bash" }]);

    const subsection = screen
      .getByRole("heading", { name: "允许规则" })
      .closest('[data-slot="profile-subsection"]') as HTMLElement | null;
    expect(subsection).not.toBeNull();
    if (!subsection) {
      return;
    }

    const collapseButton = within(subsection).getByRole("button", { name: "收起 允许规则" });
    const input = within(subsection).getByLabelText("允许规则 1");
    const addButton = within(subsection).getByRole("button", { name: "新增允许规则" });

    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    expect(input.compareDocumentPosition(addButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    fireEvent.click(collapseButton);

    const expandButton = within(subsection).getByRole("button", { name: "展开 允许规则" });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    expect(within(subsection).queryByLabelText("允许规则 1")).not.toBeInTheDocument();
    expect(
      within(subsection).queryByRole("button", { name: "新增允许规则" }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(subsection).getByRole("button", { name: "展开 允许规则" }));

    expect(within(subsection).getByLabelText("允许规则 1")).toBeInTheDocument();
    expect(within(subsection).getByRole("button", { name: "新增允许规则" })).toBeInTheDocument();
  });

  it("toggles populated lists when clicking the title area", () => {
    renderEditor([{ id: "allow-1", value: "Bash" }]);

    const heading = screen.getByRole("heading", { name: "允许规则" });
    const titleTrigger = heading.closest("button");

    expect(titleTrigger).not.toBeNull();
    if (!titleTrigger) {
      return;
    }

    expect(titleTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("允许规则 1")).toBeInTheDocument();

    fireEvent.click(titleTrigger);

    expect(titleTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("允许规则 1")).not.toBeInTheDocument();

    fireEvent.click(titleTrigger);

    expect(titleTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("允许规则 1")).toBeInTheDocument();
  });

  it("places the clear action before the rule list as a secondary affordance", () => {
    renderEditor([{ id: "allow-1", value: "Bash" }], {
      clearable: true,
    });

    const subsection = screen
      .getByRole("heading", { name: "允许规则" })
      .closest('[data-slot="profile-subsection"]') as HTMLElement | null;
    expect(subsection).not.toBeNull();
    if (!subsection) {
      return;
    }

    const input = within(subsection).getByLabelText("允许规则 1");
    const clearButtons = within(subsection).getAllByRole("button", { name: "清空允许规则" });
    expect(clearButtons).toHaveLength(1);
    const clearButton = clearButtons[0];
    expect(clearButton.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("renders an optional row action without changing the default list controls", () => {
    const onRowAction = vi.fn();
    renderEditor([{ id: "allow-1", value: "Bash" }], {
      rowActionLabel: "选择目录",
      onRowAction,
      buildRowActionAriaLabel: (itemLabel) => `选择目录 ${itemLabel}`,
    });

    const subsection = screen
      .getByRole("heading", { name: "允许规则" })
      .closest('[data-slot="profile-subsection"]') as HTMLElement | null;
    expect(subsection).not.toBeNull();
    if (!subsection) {
      return;
    }

    fireEvent.click(within(subsection).getByRole("button", { name: "选择目录 允许规则 1" }));

    expect(onRowAction).toHaveBeenCalledWith({ id: "allow-1", value: "Bash" }, 0);
    expect(within(subsection).getByRole("button", { name: "删除 允许规则 1" })).toBeInTheDocument();

    cleanup();
    renderEditor([{ id: "allow-2", value: "Read" }]);
    expect(screen.queryByRole("button", { name: "选择目录 允许规则 1" })).not.toBeInTheDocument();
  });

  it("renders multiple row actions in order before the delete action", () => {
    const moveToAsk = vi.fn();
    const moveToDeny = vi.fn();
    renderEditor([{ id: "allow-1", value: "Bash" }], {
      rowActions: [
        {
          label: "转为询问",
          onClick: moveToAsk,
          buildAriaLabel: (itemLabel) => `转为询问 ${itemLabel}`,
        },
        {
          label: "转为拒绝",
          onClick: moveToDeny,
          buildAriaLabel: (itemLabel) => `转为拒绝 ${itemLabel}`,
        },
      ],
    });

    const subsection = screen
      .getByRole("heading", { name: "允许规则" })
      .closest('[data-slot="profile-subsection"]') as HTMLElement | null;
    expect(subsection).not.toBeNull();
    if (!subsection) {
      return;
    }

    const moveToAskButton = within(subsection).getByRole("button", {
      name: "转为询问 允许规则 1",
    });
    const moveToDenyButton = within(subsection).getByRole("button", {
      name: "转为拒绝 允许规则 1",
    });
    const deleteButton = within(subsection).getByRole("button", { name: "删除 允许规则 1" });

    expect(
      moveToAskButton.compareDocumentPosition(moveToDenyButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      moveToDenyButton.compareDocumentPosition(deleteButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    fireEvent.click(moveToAskButton);
    fireEvent.click(moveToDenyButton);

    expect(moveToAsk).toHaveBeenCalledWith({ id: "allow-1", value: "Bash" }, 0);
    expect(moveToDeny).toHaveBeenCalledWith({ id: "allow-1", value: "Bash" }, 0);
  });
});
