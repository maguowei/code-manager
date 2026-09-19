import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// 覆盖率插桩与慢 CI runner 下，事件驱动的 waitFor 断言可能超过 testing-library 默认 1000ms，
// 与 vitest.config 放宽 testTimeout 同一思路，把异步等待上限调高。仅延长等待上限、不引入固定延迟，
// 通过用例仍即时结算，消除负载相关的 waitFor flake。
configure({ asyncUtilTimeout: 5000 });

Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;

// jsdom 不实现 ResizeObserver，Radix UI Slider 组件依赖它
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom 不实现 matchMedia，react-resizable-panels（isCoarsePointer）与 useIsNarrowViewport 依赖它
globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent() {
    return false;
  },
})) as typeof globalThis.matchMedia;

// jsdom 30 起，焦点从文档本体（activeElement 为 body）转移到元素时会额外向 window 派发一个
// 非冒泡的 blur（浏览器不会）。Radix 浮层用 window 的 blur 关闭自身，于是测试里刚用
// pointerdown 打开的 Select 会在同一次事件内被关掉（ProfileEditor 的 combobox 用例全挂）。
// 仅在"焦点仍在文档内转移"（activeElement 停在 body）时吞掉该事件，真实窗口失焦不受影响。
// 注意不能用 event.target === window 判断：vitest 注入的全局 window 与 jsdom 派发事件用的
// Window 实例不是同一个对象，只能按"持有同一个 document 的非元素对象"识别。
window.addEventListener(
  "blur",
  (event) => {
    const target = event.target as (Node & { document?: Document }) | null;
    const isWindowTarget = !(target instanceof Element) && target?.document === document;
    if (isWindowTarget && !event.bubbles && document.activeElement === document.body) {
      event.stopImmediatePropagation();
    }
  },
  true,
);

// jsdom 默认 navigator.language 为 "en-US"，会让 i18n 默认走 en；
// 而项目大量历史测试在 a7f3e2a 之前依赖默认 zh 行为。统一覆盖为 zh-CN，
// 让"未显式设语言"的测试与历史一致；显式 setItem 切换语言的测试不受影响。
Object.defineProperty(globalThis.navigator, "language", {
  configurable: true,
  get: () => "zh-CN",
});
Object.defineProperty(globalThis.navigator, "languages", {
  configurable: true,
  get: () => ["zh-CN", "zh"],
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(String(key)) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(String(key));
    },
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value));
    },
  };
}

const memoryStorage = createMemoryStorage();

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: memoryStorage,
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: memoryStorage,
});
