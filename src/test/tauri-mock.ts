// 测试用 Tauri 运行时模拟工具集。
//
// 设计取舍：
// - vitest 会把 vi.mock 调用 hoist 到文件顶部，因此 mock 工厂仍然需要写在
//   各自的测试文件中；本模块只提供与 mock 协作的运行时 helper。
// - isTauri() 通过检查 window.__TAURI_INTERNALS__，许多 hook（useTauriEvent /
//   useHistoryEntries）在浏览器环境会提前 return，因此测试时需要按需开启。

/**
 * 在测试中临时声明 isTauri() 应返回 true，返回值是还原函数。
 *
 * 用法：
 * ```ts
 * let restoreTauri: () => void;
 * beforeEach(() => { restoreTauri = enableTauriEnv(); });
 * afterEach(() => { restoreTauri(); });
 * ```
 */
export function enableTauriEnv(): () => void {
  const win = window as unknown as { __TAURI_INTERNALS__?: unknown };
  const original = win.__TAURI_INTERNALS__;
  win.__TAURI_INTERNALS__ = {};
  return () => {
    if (original === undefined) delete win.__TAURI_INTERNALS__;
    else win.__TAURI_INTERNALS__ = original;
  };
}

/** 按 command 名路由调度的 invoke mock 实现 */
export type InvokeRouteMap = Record<
  string,
  ((args?: unknown) => unknown | Promise<unknown>) | unknown
>;

/**
 * 把 invoke 调用按 command 名转发到对应响应；未注册的 command 会抛错，
 * 避免测试因后端默认值产生隐式假阳性。
 */
export function createInvokeRouter(routes: InvokeRouteMap) {
  return async (command: string, args?: unknown) => {
    if (!(command in routes)) {
      throw new Error(`createInvokeRouter: 未注册的 command "${command}"`);
    }
    const value = routes[command];
    return typeof value === "function" ? (value as (a?: unknown) => unknown)(args) : value;
  };
}
