import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useIsDark } from "../useIsDark";

async function setHtmlDarkClass(enabled: boolean) {
  await act(async () => {
    document.documentElement.classList.toggle("dark", enabled);
    // jsdom 的 MutationObserver 在微任务后触发。
    await Promise.resolve();
  });
}

describe("useIsDark", () => {
  beforeEach(async () => {
    await setHtmlDarkClass(false);
  });

  afterEach(async () => {
    await setHtmlDarkClass(false);
  });

  it("初始值取自 <html> 是否含有 dark class", async () => {
    await setHtmlDarkClass(true);
    const { result } = renderHook(() => useIsDark());
    expect(result.current).toBe(true);
  });

  it("无 dark class 时初始为 false", () => {
    const { result } = renderHook(() => useIsDark());
    expect(result.current).toBe(false);
  });

  it("class 变化时通过 MutationObserver 触发更新", async () => {
    const { result } = renderHook(() => useIsDark());
    expect(result.current).toBe(false);

    await setHtmlDarkClass(true);

    expect(result.current).toBe(true);

    await setHtmlDarkClass(false);

    expect(result.current).toBe(false);
  });

  it("卸载时断开 observer，不再响应 class 变化", async () => {
    const { result, unmount } = renderHook(() => useIsDark());
    unmount();

    await setHtmlDarkClass(true);

    // 卸载后 hook 已脱离 React 树，result.current 保留卸载前的值
    expect(result.current).toBe(false);
  });
});
