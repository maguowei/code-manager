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
  const onDuplicate = vi.fn();
  const onDelete = vi.fn();
  const view = render(
    <I18nProvider>
      <MemoryItem
        memory={memory}
        isEditing={false}
        onToggle={onToggle}
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    </I18nProvider>,
  );

  return { ...view, onToggle, onEdit, onDuplicate, onDelete };
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

  it("renders preview text together with the target metadata", () => {
    renderMemoryItem();

    const card = screen.getByRole("button", { name: /强制约束规范/ });
    const preview = screen.getByText("## 核心原则");
    const metadata = screen.getByText("CLAUDE.md");

    expect(card).toContainElement(metadata);
    expect(card).toContainElement(preview);
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
    const { onDelete, onDuplicate, onEdit, onToggle } = renderMemoryItem();

    const toggleButton = screen.getByRole("switch", { name: "已启用" });
    const duplicateButton = screen.getByRole("button", { name: "复制" });
    const deleteButton = screen.getByRole("button", { name: "删除" });

    expect(duplicateButton).toHaveAttribute("aria-label", "复制");
    expect(deleteButton).toHaveAttribute("aria-label", "删除");

    fireEvent.click(toggleButton);
    fireEvent.click(duplicateButton);
    fireEvent.click(deleteButton);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("does not repeat the CLAUDE.md filename next to the type badge", () => {
    renderMemoryItem();

    expect(screen.getAllByText("CLAUDE.md")).toHaveLength(1);
    expect(screen.queryByText("rules/CLAUDE.md")).not.toBeInTheDocument();
  });

  it("shows rule paths without the rules directory prefix", () => {
    renderMemoryItem({
      ...baseMemory,
      targetType: "rule",
      rulePath: "frontend/api.md",
    });

    expect(screen.getByText("Rules")).toBeInTheDocument();
    expect(screen.getByText("frontend/api.md")).toBeInTheDocument();
    expect(screen.queryByText("rules/frontend/api.md")).not.toBeInTheDocument();
  });

  it("exposes memory actions without opening the editor", () => {
    renderMemoryItem();

    expect(screen.getByRole("switch", { name: "已启用" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("shows target type and rule path metadata", () => {
    renderMemoryItem({
      ...baseMemory,
      targetType: "rule",
      rulePath: "frontend/deeply/nested/path/style.md",
    });

    expect(screen.getByText("Rules")).toBeInTheDocument();
    expect(screen.getByText("frontend/deeply/nested/path/style.md")).toBeInTheDocument();
  });

  it("keeps card controls available with the main content", () => {
    renderMemoryItem();

    const card = screen.getByRole("button", { name: /强制约束规范/ });

    expect(card).toContainElement(screen.getByText("强制约束规范"));
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });
});
