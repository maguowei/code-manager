import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 隔离 updater / process 插件、isTauri、Toast、logger，专注验证状态机分支
const { checkMock, relaunchMock, isTauriMock, showToastMock, warnMock, showOperationErrorMock } =
  vi.hoisted(() => ({
    checkMock: vi.fn(),
    relaunchMock: vi.fn(),
    isTauriMock: vi.fn(() => true),
    showToastMock: vi.fn(),
    warnMock: vi.fn(),
    showOperationErrorMock: vi.fn(),
  }));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: checkMock }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: relaunchMock }));
vi.mock("../../types", () => ({ isTauri: isTauriMock }));
vi.mock("../../i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../useToast", () => ({ useToast: () => ({ showToast: showToastMock }) }));
vi.mock("@/lib/user-facing-error", () => ({ showOperationError: showOperationErrorMock }));
vi.mock("../../utils/logger", () => ({
  logger: { warn: warnMock, info: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() },
}));

import { silentCheckForUpdate, useAppUpdater } from "../useAppUpdater";

/** 构造一个模拟 Update 句柄，downloadAndInstall 回放 Started/Progress/Finished 事件 */
function makeUpdate(version = "1.0.1", contentLength: number | null = 100) {
  const downloadAndInstall = vi.fn(async (cb?: (event: unknown) => void) => {
    cb?.({ event: "Started", data: { contentLength } });
    cb?.({ event: "Progress", data: { chunkLength: 40 } });
    cb?.({ event: "Progress", data: { chunkLength: 60 } });
    cb?.({ event: "Finished", data: {} });
  });
  return { version, downloadAndInstall };
}

beforeEach(() => {
  vi.clearAllMocks();
  isTauriMock.mockReturnValue(true);
});

describe("useAppUpdater.checkForUpdate", () => {
  it("发现新版本时进入 available 并记录版本号", async () => {
    checkMock.mockResolvedValue(makeUpdate("1.2.0"));
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => {
      await result.current.checkForUpdate();
    });
    expect(result.current.status).toBe("available");
    expect(result.current.availableVersion).toBe("1.2.0");
  });

  it("无更新时进入 upToDate", async () => {
    checkMock.mockResolvedValue(null);
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => {
      await result.current.checkForUpdate();
    });
    expect(result.current.status).toBe("upToDate");
    expect(result.current.availableVersion).toBeNull();
  });

  it("检查失败时进入 error 并经 showOperationError 反馈", async () => {
    checkMock.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => {
      await result.current.checkForUpdate();
    });
    expect(result.current.status).toBe("error");
    expect(showOperationErrorMock).toHaveBeenCalledWith(
      showToastMock,
      "update.checkFailed",
      expect.any(Error),
    );
  });

  it("非 Tauri 环境直接返回，不触发 check", async () => {
    isTauriMock.mockReturnValue(false);
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => {
      await result.current.checkForUpdate();
    });
    expect(checkMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });
});

describe("useAppUpdater.downloadAndRestart", () => {
  it("下载安装成功后进入 ready、进度 100 并重启", async () => {
    const update = makeUpdate();
    checkMock.mockResolvedValue(update);
    relaunchMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => {
      await result.current.checkForUpdate();
    });
    await act(async () => {
      await result.current.downloadAndRestart();
    });
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(result.current.progress).toBe(100);
    expect(result.current.status).toBe("ready");
    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });

  it("总长未知时不计算进度，仍能安装完成", async () => {
    const update = makeUpdate("1.3.0", null);
    checkMock.mockResolvedValue(update);
    relaunchMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => {
      await result.current.checkForUpdate();
    });
    await act(async () => {
      await result.current.downloadAndRestart();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.progress).toBe(100);
  });

  it("无待安装更新时直接返回，不改变状态", async () => {
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => {
      await result.current.downloadAndRestart();
    });
    expect(result.current.status).toBe("idle");
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it("下载安装失败时进入 error 并不重启", async () => {
    const update = {
      version: "1.4.0",
      downloadAndInstall: vi.fn(async () => {
        throw new Error("network");
      }),
    };
    checkMock.mockResolvedValue(update);
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => {
      await result.current.checkForUpdate();
    });
    await act(async () => {
      await result.current.downloadAndRestart();
    });
    expect(result.current.status).toBe("error");
    expect(showOperationErrorMock).toHaveBeenCalledWith(
      showToastMock,
      "update.downloadFailed",
      expect.any(Error),
    );
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it("重启失败时保留 ready 并记日志，可再次重试重启而不重复下载", async () => {
    const update = makeUpdate();
    checkMock.mockResolvedValue(update);
    relaunchMock.mockRejectedValue(new Error("no process"));
    const { result } = renderHook(() => useAppUpdater());
    await act(async () => {
      await result.current.checkForUpdate();
    });
    await act(async () => {
      await result.current.downloadAndRestart();
    });
    expect(result.current.status).toBe("ready");
    expect(warnMock).toHaveBeenCalled();

    // ready 状态再次点击只重启，不再调用 downloadAndInstall
    relaunchMock.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.downloadAndRestart();
    });
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(relaunchMock).toHaveBeenCalledTimes(2);
  });
});

describe("silentCheckForUpdate", () => {
  it("发现新版返回版本号", async () => {
    checkMock.mockResolvedValue({ version: "2.0.0" });
    await expect(silentCheckForUpdate()).resolves.toBe("2.0.0");
  });

  it("无更新返回 null", async () => {
    checkMock.mockResolvedValue(null);
    await expect(silentCheckForUpdate()).resolves.toBeNull();
  });

  it("检查抛错时返回 null 并记 warn", async () => {
    checkMock.mockRejectedValue(new Error("offline"));
    await expect(silentCheckForUpdate()).resolves.toBeNull();
    expect(warnMock).toHaveBeenCalled();
  });

  it("非 Tauri 环境返回 null，不触发 check", async () => {
    isTauriMock.mockReturnValue(false);
    await expect(silentCheckForUpdate()).resolves.toBeNull();
    expect(checkMock).not.toHaveBeenCalled();
  });
});
