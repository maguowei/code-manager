import { act, renderHook, waitFor } from "@testing-library/react";
import { xcodeDark, xcodeLight } from "@uiw/codemirror-theme-xcode";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCodeMirrorTheme } from "@/hooks/useCodeMirrorTheme";

async function setHtmlDarkClass(enabled: boolean) {
  await act(async () => {
    document.documentElement.classList.toggle("dark", enabled);
    // jsdom 的 MutationObserver 在微任务后触发。
    await Promise.resolve();
  });
}

describe("useCodeMirrorTheme", () => {
  beforeEach(async () => {
    await setHtmlDarkClass(false);
  });

  afterEach(async () => {
    await setHtmlDarkClass(false);
  });

  it("html 无 dark class 时返回 xcodeLight", () => {
    const { result } = renderHook(() => useCodeMirrorTheme());

    expect(result.current).toBe(xcodeLight);
  });

  it("dark class 加上后切换到 xcodeDark", async () => {
    const { result } = renderHook(() => useCodeMirrorTheme());

    expect(result.current).toBe(xcodeLight);

    await setHtmlDarkClass(true);

    await waitFor(() => {
      expect(result.current).toBe(xcodeDark);
    });
  });
});
