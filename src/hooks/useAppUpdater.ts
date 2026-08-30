import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
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

export type AppUpdaterAvailability = "loading" | "enabled" | "nightly" | "unavailable";

export interface CheckForUpdateOptions {
  /**
   * 静默检查：用于启动 / 聚焦 / 定时等自动触发。
   * 失败仅记日志、不弹 Toast、不翻转为 error；也不把状态过渡到 checking，避免打扰用户。
   */
  silent?: boolean;
}

export interface AppUpdaterState {
  availability: AppUpdaterAvailability;
  currentVersion: string | null;
  status: AppUpdaterStatus;
  /** 发现的新版本号，仅在 available/downloading/ready 时有意义 */
  availableVersion: string | null;
  /** 下载进度百分比 0-100；总长未知时回退为 0 */
  progress: number;
  checkForUpdate: (options?: CheckForUpdateOptions) => Promise<void>;
  downloadAndRestart: () => Promise<void>;
}

export function isNightlyVersion(version: string): boolean {
  return /-nightly(?:\.|$)/i.test(version);
}

/** 封装 @tauri-apps/plugin-updater 的检查 / 下载 / 安装 / 重启流程，供 UpdaterProvider 统一驱动 */
export function useAppUpdater(): AppUpdaterState {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [availability, setAvailability] = useState<AppUpdaterAvailability>(
    isTauri() ? "loading" : "unavailable",
  );
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<AppUpdaterStatus>("idle");
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  // 暂存 check() 返回的 Update 句柄，供随后的 downloadAndInstall 复用
  const pendingUpdateRef = useRef<Update | null>(null);
  // 复用进行中的检查，避免自动检查与手动检查并发写入同一份更新状态
  const checkRequestRef = useRef<Promise<Update | null> | null>(null);
  // 版本读取是本地调用且全局只需一次；所有检查都等待同一结果，Nightly 默认 fail closed。
  const availabilityRequestRef = useRef<
    Promise<{ availability: AppUpdaterAvailability; version: string | null }> | undefined
  >(undefined);

  const resolveAvailability = useCallback(() => {
    if (!availabilityRequestRef.current) {
      availabilityRequestRef.current = isTauri()
        ? getVersion()
            .then((version) => ({
              availability: isNightlyVersion(version) ? ("nightly" as const) : ("enabled" as const),
              version,
            }))
            .catch((error) => {
              logger.warn(`updater: 读取应用版本失败，已停用更新检查 ${String(error)}`);
              return { availability: "unavailable" as const, version: null };
            })
        : Promise.resolve({ availability: "unavailable" as const, version: null });
    }
    return availabilityRequestRef.current;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void resolveAvailability().then((resolved) => {
      if (cancelled) return;
      setAvailability(resolved.availability);
      setCurrentVersion(resolved.version);
    });
    return () => {
      cancelled = true;
    };
  }, [resolveAvailability]);

  const checkForUpdate = useCallback(
    async (options?: CheckForUpdateOptions) => {
      if (!isTauri()) return;
      const resolved = await resolveAvailability();
      if (resolved.availability !== "enabled") return;
      // 静默检查不进入 checking，避免顶部横幅 / 设置按钮出现无意义的加载态闪烁
      if (!options?.silent) setStatus("checking");
      let request = checkRequestRef.current;
      const ownsRequest = request === null;
      if (!request) {
        request = check();
        checkRequestRef.current = request;
      }
      try {
        const update = await request;
        if (update) {
          pendingUpdateRef.current = update;
          setAvailableVersion(update.version);
          setProgress(0);
          setStatus("available");
        } else if (!options?.silent) {
          // 静默检查无更新时保持既有状态，不覆盖为 upToDate（否则会清掉横幅已发现的版本）
          pendingUpdateRef.current = null;
          setAvailableVersion(null);
          setStatus("upToDate");
        }
      } catch (error) {
        if (options?.silent) {
          logger.warn(`updater: 自动检查更新失败 ${String(error)}`);
          return;
        }
        setStatus("error");
        showOperationError(showToast, t("update.checkFailed"), error);
      } finally {
        if (ownsRequest && checkRequestRef.current === request) {
          checkRequestRef.current = null;
        }
      }
    },
    [resolveAvailability, showToast, t],
  );

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

  return {
    availability,
    currentVersion,
    status,
    availableVersion,
    progress,
    checkForUpdate,
    downloadAndRestart,
  };
}
