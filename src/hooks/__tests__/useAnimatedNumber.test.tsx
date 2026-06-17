import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnimatedNumber } from "../useAnimatedNumber";

/** 伪造 matchMedia，控制是否命中「减弱动态效果」 */
function mockReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("useAnimatedNumber", () => {
  // 手动驱动 requestAnimationFrame，避免依赖真实定时器
  let rafCallbacks: Array<(timestamp: number) => void> = [];

  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 以给定时间戳冲刷当前已排队的帧回调 */
  function flushFrame(timestamp: number) {
    const callbacks = rafCallbacks;
    rafCallbacks = [];
    act(() => {
      for (const cb of callbacks) cb(timestamp);
    });
  }

  it("减弱动态效果时直接跳变到目标值", () => {
    mockReducedMotion(true);
    const { result, rerender } = renderHook(({ target }) => useAnimatedNumber(target), {
      initialProps: { target: 0 },
    });

    rerender({ target: 100 });

    expect(result.current).toBe(100);
    // 未走动画，不应排队任何帧
    expect(rafCallbacks).toHaveLength(0);
  });

  it("target 变化后通过缓动收敛到目标值", () => {
    mockReducedMotion(false);
    const { result, rerender } = renderHook(({ target }) => useAnimatedNumber(target), {
      initialProps: { target: 0 },
    });

    rerender({ target: 100 });

    // 首帧确定起点，仍停在起始值
    flushFrame(0);
    expect(result.current).toBe(0);

    // 动画中途介于起点与目标之间
    flushFrame(225);
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);

    // 到达时长末尾收敛到目标值
    flushFrame(450);
    expect(result.current).toBe(100);
  });
});
