import "@testing-library/jest-dom/vitest";

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
