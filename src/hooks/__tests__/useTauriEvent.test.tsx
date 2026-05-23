import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableTauriEnv } from "@/test/tauri-mock";
import useTauriEvent from "../useTauriEvent";

// listen 必须通过 vi.hoisted 暴露给 vi.mock 工厂；vi.mock 调用会被提到文件顶端
const { listenMock } = vi.hoisted(() => ({
  listenMock:
    vi.fn<(event: string, handler: (e: { payload: unknown }) => void) => Promise<() => void>>(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

describe("useTauriEvent", () => {
  let restoreTauri: () => void;

  beforeEach(() => {
    listenMock.mockReset();
    restoreTauri = enableTauriEnv();
  });

  afterEach(() => {
    restoreTauri();
  });

  it("非 Tauri 环境直接 no-op，不调用 listen", () => {
    restoreTauri(); // 立刻切回浏览器环境
    restoreTauri = () => undefined;

    renderHook(() => useTauriEvent("any-event", vi.fn()));

    expect(listenMock).not.toHaveBeenCalled();
  });

  it("挂载时调用 listen 订阅事件", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValue(unlisten);

    renderHook(() => useTauriEvent("profile-changed", vi.fn()));

    await waitFor(() => expect(listenMock).toHaveBeenCalledTimes(1));
    expect(listenMock.mock.calls[0][0]).toBe("profile-changed");
  });

  it("事件 payload 透传给 handler", async () => {
    let trigger: ((e: { payload: unknown }) => void) | undefined;
    listenMock.mockImplementation(async (_event, handler) => {
      trigger = handler;
      return () => undefined;
    });

    const handler = vi.fn<(payload: { id: string }) => void>();
    renderHook(() => useTauriEvent<{ id: string }>("foo", handler));

    await waitFor(() => expect(trigger).toBeDefined());
    trigger?.({ payload: { id: "abc" } });

    expect(handler).toHaveBeenCalledWith({ id: "abc" });
  });

  it("卸载时调用 unlisten 清理监听器", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValue(unlisten);

    const { unmount } = renderHook(() => useTauriEvent("ev", vi.fn()));

    await waitFor(() => expect(listenMock).toHaveBeenCalledTimes(1));
    unmount();

    await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });

  it("Promise 未 resolve 时卸载，listen 完成后立即 unlisten 防泄漏", async () => {
    const unlisten = vi.fn();
    let resolveListen!: (fn: () => void) => void;
    listenMock.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveListen = resolve;
      }),
    );

    const { unmount } = renderHook(() => useTauriEvent("slow", vi.fn()));
    // 在 listen Promise 完成前卸载
    unmount();
    // 此时 listen 才返回 unlisten
    resolveListen(unlisten);

    await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });

  it("event 名变化时重新订阅", async () => {
    listenMock.mockResolvedValue(vi.fn());

    const { rerender } = renderHook(({ ev }) => useTauriEvent(ev, vi.fn()), {
      initialProps: { ev: "a" },
    });
    await waitFor(() => expect(listenMock).toHaveBeenCalledTimes(1));

    rerender({ ev: "b" });

    await waitFor(() => expect(listenMock).toHaveBeenCalledTimes(2));
    expect(listenMock.mock.calls[1][0]).toBe("b");
  });

  it("handler 引用变化时不会重新订阅（只更新 ref）", async () => {
    listenMock.mockResolvedValue(vi.fn());

    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { rerender } = renderHook(({ h }) => useTauriEvent("static", h), {
      initialProps: { h: handler1 },
    });
    await waitFor(() => expect(listenMock).toHaveBeenCalledTimes(1));

    rerender({ h: handler2 });

    expect(listenMock).toHaveBeenCalledTimes(1);
  });
});
