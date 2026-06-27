import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

// CSS Custom Highlight API 注册名
const HIGHLIGHT_ALL = "conversation-search";
const HIGHLIGHT_CURRENT = "conversation-search-current";
// 极端长会话的匹配上限，超出截断防卡顿
const MAX_MATCHES = 2000;
// 输入防抖，避免每次按键都全量遍历文本节点
const DEBOUNCE_MS = 150;

/** 返回 haystack 中 needle 全部出现的起始下标（不区分大小写，非重叠）；needle 为空返回 [] */
export function findMatchIndices(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const indices: number[] = [];
  const lowerHaystack = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let from = 0;
  for (;;) {
    const idx = lowerHaystack.indexOf(lowerNeedle, from);
    if (idx === -1) break;
    indices.push(idx);
    from = idx + lowerNeedle.length;
  }
  return indices;
}

// CSS Custom Highlight API 的类型在部分 TS lib 中缺失，用结构化访问做特性检测，避免 any
type HighlightCtor = new (...ranges: Range[]) => unknown;
type HighlightRegistryLike = {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
};

function getHighlightRegistry(): HighlightRegistryLike | null {
  if (typeof CSS === "undefined") return null;
  const reg = (CSS as unknown as { highlights?: HighlightRegistryLike }).highlights;
  return reg ?? null;
}

function getHighlightCtor(): HighlightCtor | null {
  const ctor = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight;
  return ctor ?? null;
}

/** 在 container 内顺序遍历文本节点，收集 query 的全部匹配 Range（DOM 顺序＝主线在前、侧链在后） */
function collectRanges(container: HTMLElement, query: string): Range[] {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue ?? "";
    if (text) {
      for (const idx of findMatchIndices(text, query)) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + query.length);
        ranges.push(range);
        if (ranges.length >= MAX_MATCHES) return ranges;
      }
    }
    node = walker.nextNode();
  }
  return ranges;
}

/**
 * 查找开关控制器。住在抽屉顶层，只持有 `open` 这一个 state，使输入时的重渲染不触及消息列表。
 * Cmd/Ctrl+F 打开查找栏（替代 WebView 无效的默认查找）。
 */
export function useConversationSearchController() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isFind = (e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "f" || e.key === "F");
      if (!isFind) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return { open, close };
}

/**
 * 查找引擎。**只在查找栏组件内调用**（查找栏仅在 open 时挂载），使 query/matchCount/currentIndex
 * 等高频 state 局限在小组件内，输入时不重渲染数百条消息。
 * 在 containerRef 内精确高亮全部匹配词，↑/↓ 循环跳转并滚动到当前匹配；
 * 依赖 CSS Custom Highlight API，不支持时降级为仅滚动定位。
 * containerRef 应指向「仅含消息」的元素（不含查找栏自身），避免计数把查找栏文本算进去。
 */
export function useConversationSearch(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rangesRef = useRef<Range[]>([]);

  const clearHighlights = useCallback(() => {
    const reg = getHighlightRegistry();
    reg?.delete(HIGHLIGHT_ALL);
    reg?.delete(HIGHLIGHT_CURRENT);
    rangesRef.current = [];
  }, []);

  // 设置 current 高亮并把当前匹配滚动到视图中央
  const applyCurrent = useCallback((index: number) => {
    const ranges = rangesRef.current;
    if (ranges.length === 0) return;
    const clamped = ((index % ranges.length) + ranges.length) % ranges.length;
    const range = ranges[clamped];
    const reg = getHighlightRegistry();
    const Ctor = getHighlightCtor();
    if (reg && Ctor) reg.set(HIGHLIGHT_CURRENT, new Ctor(range));
    // content-visibility 下浏览器据 contain-intrinsic-size 知道位置，滚入时自动渲染
    const el =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as Element)
        : range.startContainer.parentElement;
    el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, []);

  const next = useCallback(() => {
    setCurrentIndex((i) => {
      const len = rangesRef.current.length;
      const ni = len ? (i + 1) % len : 0;
      applyCurrent(ni);
      return ni;
    });
  }, [applyCurrent]);

  const prev = useCallback(() => {
    setCurrentIndex((i) => {
      const len = rangesRef.current.length;
      const ni = len ? (i - 1 + len) % len : 0;
      applyCurrent(ni);
      return ni;
    });
  }, [applyCurrent]);

  // 挂载即聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 捕获阶段处理 Esc：只关查找栏，阻止 Radix Sheet 连带关闭整个抽屉
  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDownCapture, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDownCapture, { capture: true });
  }, [onClose]);

  // query 变化后（防抖）重算匹配并设置高亮；effect 在 DOM 更新后运行，侧链已展开
  useEffect(() => {
    const handle = setTimeout(() => {
      const container = containerRef.current;
      if (!container || !query) {
        clearHighlights();
        setMatchCount(0);
        setCurrentIndex(0);
        return;
      }
      const ranges = collectRanges(container, query);
      rangesRef.current = ranges;
      setMatchCount(ranges.length);
      setCurrentIndex(0);
      const reg = getHighlightRegistry();
      const Ctor = getHighlightCtor();
      if (reg && Ctor) {
        if (ranges.length > 0) reg.set(HIGHLIGHT_ALL, new Ctor(...ranges));
        else {
          reg.delete(HIGHLIGHT_ALL);
          reg.delete(HIGHLIGHT_CURRENT);
        }
      }
      if (ranges.length > 0) applyCurrent(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, containerRef, clearHighlights, applyCurrent]);

  // 卸载（关闭查找栏）时清理高亮，避免残留在全局 CSS.highlights 注册表
  useEffect(() => () => clearHighlights(), [clearHighlights]);

  return { query, setQuery, matchCount, currentIndex, next, prev, inputRef };
}
