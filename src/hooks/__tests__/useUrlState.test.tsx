import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUrlSearchParam } from "../useUrlState";

describe("useUrlSearchParam", () => {
  beforeEach(() => {
    // 每个测试都从干净的 URL 开始；history.replaceState 用绝对 URL 不会触发 jsdom 异常
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("URL 上无该 key 时返回默认值", () => {
    const { result } = renderHook(() => useUrlSearchParam("q", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("URL 上有该 key 时初始值取自 URL", () => {
    window.history.replaceState(null, "", "/?q=hello");
    const { result } = renderHook(() => useUrlSearchParam("q", "default"));
    expect(result.current[0]).toBe("hello");
  });

  it("setValue 写入 URL 并更新状态（round-trip）", () => {
    const { result } = renderHook(() => useUrlSearchParam("q"));

    act(() => result.current[1]("world"));

    expect(result.current[0]).toBe("world");
    expect(window.location.search).toBe("?q=world");
  });

  it("写入空字符串时从 URL 中删除该 key", () => {
    window.history.replaceState(null, "", "/?q=keep&other=stay");
    const { result } = renderHook(() => useUrlSearchParam("q"));

    act(() => result.current[1](""));

    expect(window.location.search).toBe("?other=stay");
  });

  it("写入与默认值相同的值时也从 URL 中删除", () => {
    window.history.replaceState(null, "", "/?q=keep");
    const { result } = renderHook(() => useUrlSearchParam("q", "all"));

    act(() => result.current[1]("all"));

    expect(window.location.search).toBe("");
  });

  it("使用 replaceState 写入（不污染历史栈）", () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useUrlSearchParam("q"));

    act(() => result.current[1]("v"));

    expect(replaceSpy).toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("保留 URL 中的其他 query 参数", () => {
    window.history.replaceState(null, "", "/?other=keep");
    const { result } = renderHook(() => useUrlSearchParam("q"));

    act(() => result.current[1]("v"));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("other")).toBe("keep");
    expect(params.get("q")).toBe("v");
  });

  it("popstate 触发时回填最新 URL 状态", () => {
    const { result } = renderHook(() => useUrlSearchParam("q"));

    act(() => {
      // 模拟浏览器前进/后退：先改 URL，再派发 popstate
      window.history.replaceState(null, "", "/?q=after-back");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current[0]).toBe("after-back");
  });
});
