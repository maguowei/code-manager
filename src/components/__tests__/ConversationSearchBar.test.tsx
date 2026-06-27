import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { TranslationKey } from "../../i18n";
import { ConversationSearchBar } from "../ConversationSearchBar";

const t = (k: TranslationKey) => k as string;

function renderBar(overrides: Partial<Parameters<typeof ConversationSearchBar>[0]> = {}) {
  const props = {
    query: "",
    onQueryChange: vi.fn(),
    matchCount: 0,
    currentIndex: 0,
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onClose: vi.fn(),
    inputRef: createRef<HTMLInputElement>(),
    t,
    ...overrides,
  };
  render(<ConversationSearchBar {...props} />);
  return props;
}

describe("ConversationSearchBar", () => {
  it("输入触发 onQueryChange", () => {
    const props = renderBar();
    fireEvent.change(screen.getByLabelText("history.searchPlaceholder"), {
      target: { value: "plan" },
    });
    expect(props.onQueryChange).toHaveBeenCalledWith("plan");
  });

  it("有匹配时显示 当前/总数 计数", () => {
    renderBar({ query: "plan", matchCount: 17, currentIndex: 2 });
    expect(screen.getByText("3 / 17")).toBeInTheDocument();
  });

  it("有查询但无匹配时显示无结果文案", () => {
    renderBar({ query: "zzz", matchCount: 0 });
    expect(screen.getByText("history.searchNoResults")).toBeInTheDocument();
  });

  it("点击上一个/下一个调用对应回调", () => {
    const props = renderBar({ query: "plan", matchCount: 3, currentIndex: 0 });
    fireEvent.click(screen.getByLabelText("history.searchNext"));
    fireEvent.click(screen.getByLabelText("history.searchPrev"));
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onPrev).toHaveBeenCalledTimes(1);
  });

  it("无匹配时上一个/下一个按钮禁用", () => {
    renderBar({ query: "zzz", matchCount: 0 });
    expect(screen.getByLabelText("history.searchNext")).toBeDisabled();
    expect(screen.getByLabelText("history.searchPrev")).toBeDisabled();
  });

  it("点击关闭调用 onClose", () => {
    const props = renderBar();
    fireEvent.click(screen.getByLabelText("history.searchClose"));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("Enter 触发 next，Shift+Enter 触发 prev", () => {
    const props = renderBar({ query: "plan", matchCount: 3 });
    const input = screen.getByLabelText("history.searchPlaceholder");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onPrev).toHaveBeenCalledTimes(1);
  });
});
