import { useEffect, useState } from "react";

/** 视口宽度小于 breakpoint 时返回 true，用于把概览页面板从左右布局切换为上下堆叠 */
export function useIsNarrowViewport(breakpoint = 900): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [isNarrow, setIsNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const updateMatches = () => setIsNarrow(mediaQuery.matches);
    updateMatches();
    mediaQuery.addEventListener("change", updateMatches);
    return () => mediaQuery.removeEventListener("change", updateMatches);
  }, [query]);

  return isNarrow;
}
