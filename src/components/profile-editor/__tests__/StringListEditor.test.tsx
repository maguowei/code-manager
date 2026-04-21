import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../../i18n";
import type { StringRow } from "../editor-utils";
import StringListEditor from "../StringListEditor";

function renderEditor(initialRows: StringRow[]) {
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
          addLabel="新增允许规则"
          itemLabelPrefix="允许规则"
          placeholder="例如：Bash"
          emptyHint="当前没有允许规则。"
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
      .closest(".profile-subsection") as HTMLElement | null;
    expect(subsection).not.toBeNull();
    if (!subsection) {
      return;
    }

    const emptyState = subsection.querySelector(".profile-empty-state") as HTMLElement | null;
    const addButton = within(subsection).getByRole("button", { name: "新增允许规则" });

    expect(emptyState).not.toBeNull();
    expect(
      within(subsection).queryByRole("button", { name: "收起 允许规则" }),
    ).not.toBeInTheDocument();
    expect(
      within(subsection).queryByRole("button", { name: "展开 允许规则" }),
    ).not.toBeInTheDocument();
    if (emptyState) {
      expect(emptyState.compareDocumentPosition(addButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });

  it("shows populated lists expanded by default and supports collapsing", () => {
    renderEditor([{ id: "allow-1", value: "Bash" }]);

    const subsection = screen
      .getByRole("heading", { name: "允许规则" })
      .closest(".profile-subsection") as HTMLElement | null;
    expect(subsection).not.toBeNull();
    if (!subsection) {
      return;
    }

    const collapseButton = within(subsection).getByRole("button", { name: "收起 允许规则" });
    const input = within(subsection).getByLabelText("允许规则 1");
    const addButton = within(subsection).getByRole("button", { name: "新增允许规则" });
    const expandedChevron = collapseButton.querySelector("svg");

    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    expect(expandedChevron).toHaveClass("profile-string-list-chevron", "expanded");
    expect(expandedChevron).not.toHaveClass("profile-accordion-chevron");
    expect(input.compareDocumentPosition(addButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    fireEvent.click(collapseButton);

    const expandButton = within(subsection).getByRole("button", { name: "展开 允许规则" });
    const collapsedChevron = expandButton.querySelector("svg");
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    expect(collapsedChevron).toHaveClass("profile-string-list-chevron");
    expect(collapsedChevron).not.toHaveClass("expanded");
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
});
