import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TranslationKey } from "../../i18n";
import { ConversationSearch } from "../ConversationSearch";

const t = (k: TranslationKey) => k as string;

/** 把一段文本放进容器 div，并将 ConversationSearch 指向它（查找栏在容器外，不计入匹配） */
function Harness({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={ref} data-testid="messages">
        <p>{text}</p>
      </div>
      <ConversationSearch containerRef={ref} onClose={vi.fn()} t={t} />
    </>
  );
}

describe("ConversationSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function typeQuery(value: string) {
    fireEvent.change(screen.getByLabelText("history.searchPlaceholder"), {
      target: { value },
    });
    // 跨过 150ms 防抖，等待匹配重算落定
    act(() => {
      vi.advanceTimersByTime(200);
    });
  }

  it("在容器文本中统计匹配数并显示 当前/总数", () => {
    render(<Harness text="alpha beta alpha gamma alpha" />);
    typeQuery("alpha");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("无匹配时显示无结果文案", () => {
    render(<Harness text="alpha beta gamma" />);
    typeQuery("zzz");
    expect(screen.getByText("history.searchNoResults")).toBeInTheDocument();
  });

  it("不区分大小写计数", () => {
    render(<Harness text="Plan PLAN plan" />);
    typeQuery("plan");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });
});
