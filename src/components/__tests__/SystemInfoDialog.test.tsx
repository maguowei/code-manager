import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import SystemInfoDialog from "../SystemInfoDialog";

const {
  getVersionMock,
  hostnameMock,
  localeMock,
  onCloseMock,
  toastErrorMock,
  toastSuccessMock,
  writeTextMock,
} = vi.hoisted(() => ({
  getVersionMock: vi.fn<() => Promise<string>>(async () => "0.19.0"),
  hostnameMock: vi.fn<() => Promise<string>>(async () => "dev-machine"),
  localeMock: vi.fn<() => Promise<string>>(async () => "zh-CN"),
  onCloseMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  writeTextMock: vi.fn<(value: string) => Promise<void>>(async () => undefined),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: getVersionMock,
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  arch: () => "aarch64",
  family: () => "unix",
  hostname: hostnameMock,
  locale: localeMock,
  platform: () => "macos",
  type: () => "Darwin",
  version: () => "26.0.0",
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

function renderDialog() {
  return render(
    <I18nProvider>
      <SystemInfoDialog onClose={onCloseMock} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  getVersionMock.mockResolvedValue("0.19.0");
  hostnameMock.mockResolvedValue("dev-machine");
  localeMock.mockResolvedValue("zh-CN");
  onCloseMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  writeTextMock.mockReset();
  writeTextMock.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextMock },
  });
});

describe("SystemInfoDialog", () => {
  it("loads system fields and copies markdown diagnostics", async () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "系统信息" })).toBeInTheDocument();
    expect(screen.getByText("OS Type")).toBeInTheDocument();
    expect(screen.getByText("Darwin")).toBeInTheDocument();

    expect(await screen.findByText("0.19.0")).toBeInTheDocument();
    expect(screen.getByText("dev-machine")).toBeInTheDocument();
    expect(screen.getByText("zh-CN")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "复制" }));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledTimes(1));
    expect(writeTextMock.mock.calls[0]?.[0]).toContain("| App Version | 0.19.0 |");
    expect(writeTextMock.mock.calls[0]?.[0]).toContain("| Hostname | dev-machine |");
    expect(toastSuccessMock).toHaveBeenCalledWith("系统信息已复制到剪贴板");
  });

  it("shows unknown async fields when loading fails and closes from footer", async () => {
    getVersionMock.mockRejectedValueOnce(new Error("version unavailable"));

    renderDialog();

    await waitFor(() => {
      const rows = screen.getAllByRole("row");
      const appVersionRow = rows.find((row) => within(row).queryByText("App Version"));
      expect(appVersionRow).toBeDefined();
      expect(within(appVersionRow as HTMLElement).getByText("未知")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "关闭" })[0]);

    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it("reports copy failures through the toast error channel", async () => {
    writeTextMock.mockRejectedValueOnce(new Error("clipboard denied"));

    renderDialog();
    expect(await screen.findByText("0.19.0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "复制" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0]?.[0]).toBe("复制失败");
  });
});
