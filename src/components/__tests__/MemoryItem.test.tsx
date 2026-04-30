import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  return render(
    <I18nProvider>
      <MemoryItem
        memory={memory}
        isEditing={false}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe("MemoryItem", () => {
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
});
