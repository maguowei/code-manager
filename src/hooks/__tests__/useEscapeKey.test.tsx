import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useEscapeKey from "../useEscapeKey";

describe("useEscapeKey", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function pressKey(key: string) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key }));
  }

  it("按下 Escape 时触发回调，并传入事件对象", () => {
    const callback = vi.fn();
    renderHook(() => useEscapeKey(callback));

    pressKey("Escape");

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toBeInstanceOf(KeyboardEvent);
  });

  it("非 Escape 键不触发回调", () => {
    const callback = vi.fn();
    renderHook(() => useEscapeKey(callback));

    pressKey("Enter");
    pressKey("a");
    pressKey("Tab");

    expect(callback).not.toHaveBeenCalled();
  });

  it("enabled=false 时不注册监听器", () => {
    const callback = vi.fn();
    renderHook(() => useEscapeKey(callback, false));

    pressKey("Escape");

    expect(callback).not.toHaveBeenCalled();
  });

  it("卸载后不再触发回调", () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(callback));

    pressKey("Escape");
    expect(callback).toHaveBeenCalledTimes(1);

    unmount();
    pressKey("Escape");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("回调引用变化时不会重复注册监听器（最新回调生效）", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(({ cb }) => useEscapeKey(cb), {
      initialProps: { cb: first },
    });

    const addCallsAfterMount = addSpy.mock.calls.filter(([type]) => type === "keydown").length;

    rerender({ cb: second });

    const addCallsAfterRerender = addSpy.mock.calls.filter(([type]) => type === "keydown").length;
    // 回调变化只更新 ref，不重新 addEventListener
    expect(addCallsAfterRerender).toBe(addCallsAfterMount);

    pressKey("Escape");
    // 只触发最新回调
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("多实例并存时所有回调都被触发", () => {
    const cbA = vi.fn();
    const cbB = vi.fn();
    renderHook(() => useEscapeKey(cbA));
    renderHook(() => useEscapeKey(cbB));

    pressKey("Escape");

    expect(cbA).toHaveBeenCalledTimes(1);
    expect(cbB).toHaveBeenCalledTimes(1);
  });
});
