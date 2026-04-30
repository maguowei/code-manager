import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { Memory } from "../../types";
import MemoryItem from "../MemoryItem";

const baseMemory: Memory = {
  id: "memory-1",
  name: "强制约束规范",
  content: "## 核心原则\n- 简洁优先",
  targetType: "claude",
  isActive: true,
  createdAt: 1,
  updatedAt: 1,
};

function renderMemoryItem(memory: Memory = baseMemory) {
  const onToggle = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const view = render(
    <I18nProvider>
      <MemoryItem
        memory={memory}
        isEditing={false}
        onToggle={onToggle}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </I18nProvider>,
  );

  return { ...view, onToggle, onEdit, onDelete };
}

function setSystemLanguages(languages: string[]) {
  Object.defineProperty(navigator, "languages", {
    value: languages,
    configurable: true,
  });
  Object.defineProperty(navigator, "language", {
    value: languages[0] ?? "",
    configurable: true,
  });
}

describe("MemoryItem", () => {
  beforeEach(() => {
    localStorage.clear();
    setSystemLanguages(["zh-CN"]);
  });

  it("keeps the preview text in the same content column as the target metadata", () => {
    renderMemoryItem();

    const card = screen.getByText("强制约束规范").closest(".memory-item") as HTMLElement | null;
    const preview = screen.getByText("## 核心原则");
    const metadata = card?.querySelector<HTMLElement>(".memory-target-row") ?? null;
    const contentColumn = screen
      .getByText("强制约束规范")
      .closest(".memory-info") as HTMLElement | null;

    expect(contentColumn).toContainElement(metadata);
    expect(contentColumn).toContainElement(preview);
  });

  it("opens the memory editor from the keyboard", () => {
    const { onEdit } = renderMemoryItem();
    const card = screen.getByRole("button", { name: /强制约束规范/ });

    expect(card).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });

    expect(onEdit).toHaveBeenCalledTimes(2);
  });

  it("keeps card actions from opening the editor", () => {
    const { onDelete, onEdit, onToggle } = renderMemoryItem();

    const toggleButton = screen.getByRole("button", { name: "已启用" });
    const deleteButton = screen.getByRole("button", { name: "删除" });

    expect(deleteButton).toHaveAttribute("aria-label", "删除");

    fireEvent.click(toggleButton);
    fireEvent.click(deleteButton);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("reveals memory actions on hover or focus within like profile cards", () => {
    const css = readFileSync(`${process.cwd()}/src/components/MemoryItem.css`, "utf8");

    expect(css).toMatch(
      /\.memory-item:hover \.memory-actions,\s*\.memory-item:focus-within \.memory-actions \{/,
    );
    expect(css).toMatch(/\.memory-actions\s*\{[^}]*max-height: 0;/s);
    expect(css).toMatch(/\.memory-actions\s*\{[^}]*margin-top: calc\(var\(--space-4\) \* -1\);/s);
  });
});
