import { useEffect, useRef } from "react";

/**
 * 监听 ESC 键按下事件，触发回调
 * 内部使用 useRef 存储最新回调，避免因回调引用变化导致重复注册事件监听器
 * @param callback ESC 键按下时的回调函数
 * @param enabled 是否启用监听，默认 true
 */
function useEscapeKey(callback: () => void, enabled: boolean = true): void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        callbackRef.current();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}

export default useEscapeKey;
