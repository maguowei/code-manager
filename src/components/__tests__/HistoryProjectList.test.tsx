import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryProjectGroup } from "../../history-utils";
import { I18nProvider } from "../../i18n";
import HistoryProjectList from "../HistoryProjectList";

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

const groups: HistoryProjectGroup[] = [
  {
    project: "/work/code-manager",
    shortName: "code-manager",
    messageCount: 12,
    sessionCount: 2,
    lastTimestamp: 3,
    entries: [],
  },
  {
    project: "/work/dotfiles",
    shortName: "dotfiles",
    messageCount: 4,
    sessionCount: 1,
    lastTimestamp: 2,
    entries: [],
  },
];

function renderProjectList(selectedProject: string | null = null) {
  const onSelect = vi.fn();
  render(
    <I18nProvider>
      <HistoryProjectList groups={groups} selectedProject={selectedProject} onSelect={onSelect} />
    </I18nProvider>,
  );
  return onSelect;
}

describe("HistoryProjectList", () => {
  beforeEach(() => {
    localStorage.clear();
    setSystemLanguages(["zh-CN"]);
  });

  it("moves selection forward with ArrowRight for horizontal narrow layouts", () => {
    const onSelect = renderProjectList(null);

    fireEvent.keyDown(screen.getByRole("listbox", { name: "使用历史" }), { key: "ArrowRight" });

    expect(onSelect).toHaveBeenCalledWith("/work/code-manager");
  });

  it("moves selection backward with ArrowLeft for horizontal narrow layouts", () => {
    const onSelect = renderProjectList("/work/dotfiles");

    fireEvent.keyDown(screen.getByRole("listbox", { name: "使用历史" }), { key: "ArrowLeft" });

    expect(onSelect).toHaveBeenCalledWith("/work/code-manager");
  });

  it("keeps vertical keyboard navigation for the sidebar layout", () => {
    const onSelect = renderProjectList("/work/code-manager");

    fireEvent.keyDown(screen.getByRole("listbox", { name: "使用历史" }), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("listbox", { name: "使用历史" }), { key: "ArrowUp" });

    expect(onSelect).toHaveBeenNthCalledWith(1, "/work/dotfiles");
    expect(onSelect).toHaveBeenNthCalledWith(2, null);
  });
});
