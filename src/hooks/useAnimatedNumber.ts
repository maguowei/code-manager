import { useEffect, useRef, useState } from "react";

/** 默认缓动时长（毫秒） */
const DEFAULT_DURATION_MS = 450;

/** easeOutCubic：起步快、收尾缓，数值过渡更自然 */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** 是否系统开启了「减弱动态效果」 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 让数值随 target 变化用 requestAnimationFrame 平滑缓动逼近目标。
 * 仅依赖 target / durationMs，避免每帧重启动画；尊重 prefers-reduced-motion 时直接跳变。
 */
export function useAnimatedNumber(target: number, durationMs = DEFAULT_DURATION_MS): number {
  const [display, setDisplay] = useState(target);
  // 记录当前已提交的显示值，作为下一次动画的起点，避免把 display 放进 effect 依赖
  const displayRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  // 每次渲染后同步最新显示值
  useEffect(() => {
    displayRef.current = display;
  });

  useEffect(() => {
    const from = displayRef.current;
    // 减弱动态效果或目标未变化时直接落定
    if (prefersReducedMotion() || from === target || typeof requestAnimationFrame !== "function") {
      setDisplay(target);
      displayRef.current = target;
      return;
    }

    const delta = target - from;
    let start: number | null = null;

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const progress = Math.min(1, (timestamp - start) / durationMs);
      setDisplay(from + delta * easeOutCubic(progress));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, durationMs]);

  return display;
}

export default useAnimatedNumber;
