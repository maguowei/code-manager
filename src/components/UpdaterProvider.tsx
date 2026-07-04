import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from "react";
import { type AppUpdaterState, useAppUpdater } from "../hooks/useAppUpdater";
import { isTauri } from "../types";

// 定时轮询间隔：6 小时。桌面应用运行期间无需更频繁，避免打扰用户与 endpoint 压力。
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
// 窗口聚焦触发的检查节流：距上次检查不足 30 分钟则跳过，避免频繁切窗反复请求。
const FOCUS_THROTTLE_MS = 30 * 60 * 1000;

const UpdaterContext = createContext<AppUpdaterState | null>(null);

/**
 * 全局唯一的应用更新状态：把 useAppUpdater 状态机提升为 Context，
 * 供顶部横幅与设置页卡片共享同一份状态，并在启动 / 窗口聚焦 / 定时三种时机自动静默检查。
 * 运行中即可发现新版本，无需重启应用。
 */
export function UpdaterProvider({ children }: { children: ReactNode }) {
  const updater = useAppUpdater();
  // 用 ref 读取最新的 status / checkForUpdate，让自动检查回调保持稳定、不随状态变化重建
  const statusRef = useRef(updater.status);
  statusRef.current = updater.status;
  const checkRef = useRef(updater.checkForUpdate);
  checkRef.current = updater.checkForUpdate;
  const lastCheckRef = useRef(0);

  // 静默自动检查：仅在空闲态触发，避免打断正在进行的检查 / 下载 / 待重启流程
  const autoCheck = useCallback(() => {
    const status = statusRef.current;
    if (
      status === "checking" ||
      status === "available" ||
      status === "downloading" ||
      status === "ready"
    ) {
      return;
    }
    lastCheckRef.current = nowMs();
    void checkRef.current({ silent: true });
  }, []);

  // 启动时检查一次
  const didInitialCheck = useRef(false);
  useEffect(() => {
    if (didInitialCheck.current) return;
    didInitialCheck.current = true;
    autoCheck();
  }, [autoCheck]);

  // 定时轮询
  useEffect(() => {
    if (!isTauri()) return;
    const id = window.setInterval(autoCheck, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [autoCheck]);

  // 窗口重新聚焦时检查（带节流）
  useEffect(() => {
    if (!isTauri()) return;
    const onFocus = () => {
      if (nowMs() - lastCheckRef.current < FOCUS_THROTTLE_MS) return;
      autoCheck();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [autoCheck]);

  return <UpdaterContext.Provider value={updater}>{children}</UpdaterContext.Provider>;
}

/** 读取全局更新状态；必须在 UpdaterProvider 内使用 */
export function useUpdater(): AppUpdaterState {
  const ctx = useContext(UpdaterContext);
  if (!ctx) {
    throw new Error("useUpdater 必须在 UpdaterProvider 内使用");
  }
  return ctx;
}

// 抽出取时函数，便于测试；生产环境即 Date.now
function nowMs(): number {
  return Date.now();
}
