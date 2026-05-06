import { act, renderHook, waitFor } from "@testing-library/react";
import { xcodeDark, xcodeLight } from "@uiw/codemirror-theme-xcode";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCodeMirrorTheme } from "@/hooks/useCodeMirrorTheme";

describe("useCodeMirrorTheme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("html 无 dark class 时返回 xcodeLight", () => {
    const { result } = renderHook(() => useCodeMirrorTheme());

    expect(result.current).toBe(xcodeLight);
  });

  it("dark class 加上后切换到 xcodeDark", async () => {
    const { result } = renderHook(() => useCodeMirrorTheme());

    expect(result.current).toBe(xcodeLight);

    act(() => {
      document.documentElement.classList.add("dark");
    });

    await waitFor(() => {
      expect(result.current).toBe(xcodeDark);
    });
  });
});
