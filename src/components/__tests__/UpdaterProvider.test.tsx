import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { checkForUpdateMock, isTauriMock, updaterState } = vi.hoisted(() => ({
  checkForUpdateMock: vi.fn(),
  isTauriMock: vi.fn(() => true),
  updaterState: {
    availability: "enabled",
    currentVersion: "1.6.0",
    status: "idle",
    availableVersion: null,
    progress: 0,
    checkForUpdate: vi.fn(),
    downloadAndRestart: vi.fn(),
  },
}));

vi.mock("../../hooks/useAppUpdater", () => ({
  useAppUpdater: () => ({ ...updaterState, checkForUpdate: checkForUpdateMock }),
}));
vi.mock("../../types", () => ({ isTauri: isTauriMock }));

import { UpdaterProvider } from "../UpdaterProvider";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-04T00:00:00Z"));
  vi.clearAllMocks();
  updaterState.status = "idle";
  updaterState.availability = "enabled";
  isTauriMock.mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("UpdaterProvider", () => {
  it("已发现更新时不再因窗口聚焦发起自动检查", () => {
    const { rerender } = render(
      <UpdaterProvider>
        <div />
      </UpdaterProvider>,
    );
    expect(checkForUpdateMock).toHaveBeenCalledTimes(1);

    checkForUpdateMock.mockClear();
    updaterState.status = "available";
    rerender(
      <UpdaterProvider>
        <div />
      </UpdaterProvider>,
    );
    vi.advanceTimersByTime(31 * 60 * 1000);
    fireEvent.focus(window);

    expect(checkForUpdateMock).not.toHaveBeenCalled();
  });

  it("Nightly 通道不注册或触发自动检查", () => {
    updaterState.availability = "nightly";
    render(
      <UpdaterProvider>
        <div />
      </UpdaterProvider>,
    );

    vi.advanceTimersByTime(7 * 60 * 60 * 1000);
    fireEvent.focus(window);
    expect(checkForUpdateMock).not.toHaveBeenCalled();
  });
});
