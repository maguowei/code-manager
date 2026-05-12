import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { Skill } from "../../types";
import SkillItem from "../SkillItem";
import { TooltipProvider } from "../ui/tooltip";

const baseSkill: Skill = {
  id: "code-review",
  name: "Code Review",
  description: "Review code changes with repository conventions.",
  content: "Use this skill when reviewing code.",
  disableModelInvocation: false,
  userInvocable: true,
  isActive: false,
  createdAt: 1,
  updatedAt: 1,
  isSymlink: false,
  linkTarget: null,
} as Skill;

function renderSkillItem(skill: Skill = baseSkill) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onToggle = vi.fn();
  const onSync = vi.fn();
  const onOpenExternal = vi.fn();
  const view = render(
    <I18nProvider>
      <TooltipProvider>
        <SkillItem
          skill={skill}
          isEditing={false}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
          onSync={onSync}
          onOpenExternal={onOpenExternal}
        />
      </TooltipProvider>
    </I18nProvider>,
  );

  return { ...view, onDelete, onEdit, onOpenExternal, onSync, onToggle };
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

describe("SkillItem", () => {
  beforeEach(() => {
    localStorage.clear();
    setSystemLanguages(["zh-CN"]);
  });

  it("opens the skill editor from the keyboard", () => {
    const { onEdit } = renderSkillItem();
    const card = screen.getByRole("button", { name: /Code Review/ });

    expect(card).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });

    expect(onEdit).toHaveBeenCalledTimes(2);
  });

  it("keeps action buttons from opening the editor", () => {
    const { onDelete, onEdit, onOpenExternal, onSync, onToggle } = renderSkillItem();

    const toggleButton = screen.getByRole("switch", { name: "已禁用" });
    const openButton = screen.getByRole("button", { name: "用编辑器打开 Skill 目录" });
    const syncButton = screen.getByRole("button", { name: "同步到 ~/.codex/skills" });
    const deleteButton = screen.getByRole("button", { name: "删除" });

    expect(openButton).toHaveAttribute("aria-label", "用编辑器打开 Skill 目录");
    expect(syncButton).toHaveAttribute("aria-label", "同步到 ~/.codex/skills");
    expect(deleteButton).toHaveAttribute("aria-label", "删除");

    fireEvent.click(toggleButton);
    fireEvent.click(openButton);
    fireEvent.click(syncButton);
    fireEvent.click(deleteButton);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpenExternal).toHaveBeenCalledTimes(1);
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("uses the card body as the only edit entry point", () => {
    renderSkillItem();

    expect(screen.queryByRole("button", { name: "编辑 Skill" })).not.toBeInTheDocument();
  });

  it("toggles from the whole status pill without opening the editor", () => {
    const { onEdit, onToggle } = renderSkillItem();

    const hitArea = screen.getByText("已禁用").closest('[data-slot="switch-hit-area"]');
    expect(hitArea).toBeInstanceOf(HTMLElement);

    fireEvent.click(hitArea as HTMLElement);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("keeps inactive skills interactive and exposes card actions", () => {
    renderSkillItem();

    const card = screen.getByRole("button", { name: /Code Review/ });

    expect(screen.queryByText(/^\/code-review$/)).not.toBeInTheDocument();
    expect(card).toHaveTextContent("已禁用");
    expect(
      screen.queryByText("Review code changes with repository conventions."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "已禁用" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "同步到 ~/.codex/skills" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("marks symlink skills while keeping the read-only editor entry point", () => {
    const { onDelete, onEdit, onSync, onToggle } = renderSkillItem({
      ...baseSkill,
      isSymlink: true,
      linkTarget: "/tmp/external/code-review",
    } as Skill);

    const card = screen.getByRole("button", { name: /Code Review/ });
    expect(card).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("软链接")).toHaveAttribute("title", "/tmp/external/code-review");

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.click(screen.getByRole("switch", { name: "已禁用" }));
    fireEvent.click(screen.getByRole("button", { name: "同步到 ~/.codex/skills" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(onEdit).toHaveBeenCalledTimes(2);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
