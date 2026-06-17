import { type RefObject, useCallback, useEffect, useLayoutEffect, useState } from "react";

// 目录项：对应正文中的一个 H2 分区或 H3 子区
export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

// 滚动监听只在顶部 30% 区带内判定当前标题，避免整页都算“可见”
const SCROLLSPY_ROOT_MARGIN = "0px 0px -70% 0px";

/**
 * 速查表目录钩子：在 markdown 渲染后扫描正文标题构建目录，并随滚动高亮当前区块。
 *
 * 不解析 markdown 文本，而是直接查询渲染出的 DOM 标题并就地赋 id，
 * 保证目录项与正文标题一一对应、id 必然匹配。
 */
export function useCheatSheetToc(contentRef: RefObject<HTMLElement | null>, content: string) {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // 正文变化（含语言切换）后重建目录：扫描 H2/H3，逐个赋稳定 id
  // biome-ignore lint/correctness/useExhaustiveDependencies: content 不在体内被引用，但它变化意味着正文已重渲染，需借此触发重扫 DOM
  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) {
      return;
    }
    const headings = Array.from(root.querySelectorAll<HTMLHeadingElement>("h2, h3"));
    const next: TocEntry[] = headings.map((heading, index) => {
      const id = `cheatsheet-h-${index}`;
      heading.id = id;
      return {
        id,
        text: (heading.textContent ?? "").trim(),
        level: heading.tagName === "H3" ? 3 : 2,
      };
    });
    setEntries(next);
    // 语言切换后旧 activeId 失效时回落到第一个
    setActiveId((prev) =>
      prev && next.some((entry) => entry.id === prev) ? prev : (next[0]?.id ?? null),
    );
  }, [contentRef, content]);

  // scrollspy：jsdom 无 IntersectionObserver，缺失时跳过（目录仍可用）
  useEffect(() => {
    const root = contentRef.current;
    if (!root || entries.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (observerEntries) => {
        for (const entry of observerEntries) {
          visible.set(entry.target.id, entry.isIntersecting);
        }
        // 取文档顺序中第一个进入区带的标题；都不在区带时保留上一个
        const firstVisible = entries.find((entry) => visible.get(entry.id));
        if (firstVisible) {
          setActiveId(firstVisible.id);
        }
      },
      { root, rootMargin: SCROLLSPY_ROOT_MARGIN, threshold: 0 },
    );
    for (const entry of entries) {
      const element = root.querySelector(`#${CSS.escape(entry.id)}`);
      if (element) {
        observer.observe(element);
      }
    }
    return () => observer.disconnect();
  }, [contentRef, entries]);

  const scrollToHeading = useCallback((id: string) => {
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  return { entries, activeId, scrollToHeading };
}
