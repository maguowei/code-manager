import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useRef, useState } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import { useI18n } from "../i18n";
import { isTauri } from "../types";
import { logger } from "../utils/logger";
import { useToast } from "./useToast";

/**
 * 应用自更新状态机：
 * - idle：未检查
 * - checking：正在向 endpoint 查询
 * - upToDate：已是最新
 * - available：发现新版本，待用户确认下载
 * - downloading：正在下载并安装（progress 0-100）
 * - ready：安装完成，待重启
 * - error：检查或下载失败（已通过 Toast 反馈）
 */
export type AppUpdaterStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export interface AppUpdaterState {
  status: AppUpdaterStatus;
  /** 发现的新版本号，仅在 available/downloading/ready 时有意义 */
  availableVersion: string | null;
  /** 下载进度百分比 0-100；总长未知时回退为 0 */
  progress: number;
  checkForUpdate: () => Promise<void>;
  downloadAndRestart: () => Promise<void>;
}

/** 封装 @tauri-apps/plugin-updater 的检查 / 下载 / 安装 / 重启流程，供设置页手动更新使用 */
export function useAppUpdater(): AppUpdaterState {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [status, setStatus] = useState<AppUpdaterStatus>("idle");
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  // 暂存 check() 返回的 Update 句柄，供随后的 downloadAndInstall 复用
  const pendingUpdateRef = useRef<Update | null>(null);

  const checkForUpdate = useCallback(async () => {
    if (!isTauri()) return;
    setStatus("checking");
    try {
      const update = await check();
      if (update) {
        pendingUpdateRef.current = update;
        setAvailableVersion(update.version);
        setProgress(0);
        setStatus("available");
      } else {
        pendingUpdateRef.current = null;
        setAvailableVersion(null);
        setStatus("upToDate");
      }
    } catch (error) {
      setStatus("error");
      showOperationError(showToast, t("update.checkFailed"), error);
    }
  }, [showToast, t]);

  // 安装完成后重启进入新版本；重启失败不应回退为下载失败，保留 ready 让用户重试
  const restartApp = useCallback(async () => {
    try {
      await relaunch();
    } catch (error) {
      // Windows passive 安装器可能自行退出，或 dev 环境无可重启进程；仅记日志，保留 ready 状态
      logger.warn(`updater: 安装成功但自动重启失败 ${String(error)}`);
    }
  }, []);

  const downloadAndRestart = useCallback(async () => {
    // 已安装完成（ready）时只重启，不对已消费的 Update 句柄重复下载
    if (status === "ready") {
      await restartApp();
      return;
    }
    const update = pendingUpdateRef.current;
    if (!update) return;
    setStatus("downloading");
    setProgress(0);
    try {
      let downloaded = 0;
      let contentLength = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            setProgress(0);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setProgress(Math.min(100, Math.round((downloaded / contentLength) * 100)));
            }
            break;
          case "Finished":
            setProgress(100);
            break;
        }
      });
      // 下载安装成功后才进入 ready；重启单独处理，失败不污染此处的成功状态
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      showOperationError(showToast, t("update.downloadFailed"), error);
      return;
    }
    await restartApp();
  }, [status, restartApp, showToast, t]);

  return { status, availableVersion, progress, checkForUpdate, downloadAndRestart };
}

/**
 * 启动时静默检查更新：发现新版仅返回版本号，失败仅记日志、不打扰用户。
 * 与设置页的 useAppUpdater 相互独立，避免在 App 壳层挂载完整状态机。
 */
export async function silentCheckForUpdate(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const update = await check();
    return update?.version ?? null;
  } catch (error) {
    logger.warn(`updater: 启动静默检查失败 ${String(error)}`);
    return null;
  }
}
