import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { isTauri } from "../types";

/**
 * 监听 Tauri 事件，组件卸载时自动取消订阅
 * 内部使用 handlerRef 存储最新回调，避免 stale closure 问题
 * 使用 cancelled 标志处理 Promise 未 resolve 时卸载导致的监听器泄漏
 * @param event Tauri 事件名称
 * @param handler 事件触发时的回调函数
 */
function useTauriEvent<T>(event: string, handler: (payload: T) => void): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    Promise.resolve()
      .then(() => listen<T>(event, (e) => handlerRef.current(e.payload)))
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(() => {
        // 测试桩或应用退出阶段可能没有完整事件桥；保留当前状态并等待下次挂载
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [event]);
}

export default useTauriEvent;
