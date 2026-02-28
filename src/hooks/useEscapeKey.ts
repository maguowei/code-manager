import { useEffect } from "react";

/**
 * 监听 ESC 键按下事件，触发回调
 * @param callback ESC 键按下时的回调函数
 * @param enabled 是否启用监听，默认 true
 */
function useEscapeKey(callback: () => void, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        callback();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [callback, enabled]);
}

export default useEscapeKey;
