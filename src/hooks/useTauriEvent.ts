import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { isTauri } from "../types";

/**
 * 监听 Tauri 事件，组件卸载时自动取消订阅
 * 内部使用 handlerRef 存储最新回调，避免 stale closure 问题
 * cleanup 用 unlisten?.() 修复 Promise 未 resolve 时的泄漏窗口
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
    let unlisten: (() => void) | undefined;
    listen<T>(event, (e) => handlerRef.current(e.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [event]);
}

export default useTauriEvent;
