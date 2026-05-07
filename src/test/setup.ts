import "@testing-library/jest-dom/vitest";

Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;

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

if (typeof globalThis.localStorage?.clear !== "function") {
  const store = new Map<string, string>();

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
}
