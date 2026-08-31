import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 注入可控的 updater 状态，专注验证横幅的三态渲染与隐藏逻辑
const { useUpdaterMock, downloadAndRestartMock } = vi.hoisted(() => ({
  useUpdaterMock: vi.fn(),
  downloadAndRestartMock: vi.fn(),
}));

vi.mock("../UpdaterProvider", () => ({ useUpdater: useUpdaterMock }));
vi.mock("../../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

import { UpdateBanner } from "../UpdateBanner";

function mockUpdater(overrides: Record<string, unknown>) {
  useUpdaterMock.mockReturnValue({
    availability: "enabled",
    currentVersion: "1.6.0",
    status: "idle",
    availableVersion: null,
    progress: 0,
    checkForUpdate: vi.fn(),
    downloadAndRestart: downloadAndRestartMock,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UpdateBanner", () => {
  it("idle / upToDate / checking / error 状态下不渲染", () => {
    for (const status of ["idle", "upToDate", "checking", "error"]) {
      mockUpdater({ status });
      const { container } = render(<UpdateBanner />);
      expect(container).toBeEmptyDOMElement();
    }
  });

  it("available 时展示版本与「立即更新」按钮，点击触发下载", async () => {
    mockUpdater({ status: "available", availableVersion: "1.5.0" });
    render(<UpdateBanner />);
    const button = screen.getByRole("button", { name: "update.updateNow" });
    button.click();
    expect(downloadAndRestartMock).toHaveBeenCalledTimes(1);
  });

  it("downloading 时按钮禁用", () => {
    mockUpdater({ status: "downloading", availableVersion: "1.5.0", progress: 42 });
    render(<UpdateBanner />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("ready 时展示重启按钮，点击触发重启", () => {
    mockUpdater({ status: "ready", availableVersion: "1.5.0" });
    render(<UpdateBanner />);
    const button = screen.getByRole("button", { name: "update.restartNow" });
    button.click();
    expect(downloadAndRestartMock).toHaveBeenCalledTimes(1);
  });
});
