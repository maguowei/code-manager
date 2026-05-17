import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ConfigWorkspace } from "../../types";
import SettingsDrawer from "../SettingsDrawer";
import { ThemeProvider } from "../theme-provider";
import { Toaster } from "../ui/sonner";

const { invokeMock, isPermissionGrantedMock, platformMock, requestPermissionMock } = vi.hoisted(
  () => ({
    invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
    isPermissionGrantedMock: vi.fn<() => Promise<boolean>>(async () => false),
    platformMock: vi.fn(() => "macos"),
    requestPermissionMock: vi.fn<() => Promise<string>>(async () => "granted"),
  }),
);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: platformMock,
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: isPermissionGrantedMock,
  requestPermission: requestPermissionMock,
}));

const WORKSPACE_FIXTURE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    showTraySessions: true,
    systemNotificationsEnabled: false,
    collapseSidebarByDefault: false,
    thirdPartyProviderPricingEnabled: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
  },
  builtinPresets: [],
  customPresets: [],
  profiles: [],
  bindings: {},
};

function renderSettingsDrawer() {
  render(
    <I18nProvider>
      <ThemeProvider>
        <SettingsDrawer onClose={vi.fn()} />
        <Toaster richColors closeButton position="top-right" />
      </ThemeProvider>
    </I18nProvider>,
  );
}

function setSystemLanguages(languages: string[]) {
  Object.defineProperty(navigator, "languages", {
    value: languages,
    configurable: true,
  });
  Object.defineProperty(navigator, "language", {
    value: languages[0] ?? "",
    configurable: true,
  });
}

describe("SettingsDrawer", () => {
  beforeEach(() => {
    localStorage.clear();
    setSystemLanguages(["zh-CN"]);
    isPermissionGrantedMock.mockReset();
    isPermissionGrantedMock.mockResolvedValue(false);
    platformMock.mockReturnValue("macos");
    requestPermissionMock.mockReset();
    requestPermissionMock.mockResolvedValue("granted");
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_native_open_app_options") {
        return {
          platform: "macos",
          supportedEditors: [
            { slug: "vscode", label: "VS Code" },
            { slug: "cursor", label: "Cursor" },
            { slug: "windsurf", label: "Windsurf" },
            { slug: "zed", label: "Zed" },
          ],
          supportedTerminals: [
            { slug: "terminal", label: "Terminal" },
            { slug: "iterm", label: "iTerm" },
            { slug: "warp", label: "Warp" },
            { slug: "ghostty", label: "Ghostty" },
          ],
          editors: [
            { slug: "vscode", label: "VS Code" },
            { slug: "cursor", label: "Cursor" },
            { slug: "windsurf", label: "Windsurf" },
            { slug: "zed", label: "Zed" },
          ],
          terminals: [
            { slug: "terminal", label: "Terminal" },
            { slug: "iterm", label: "iTerm" },
            { slug: "warp", label: "Warp" },
            { slug: "ghostty", label: "Ghostty" },
          ],
        };
      }
      if (command === "get_app_logs") {
        return {
          logDir: "/tmp/logs",
          truncated: false,
          entries: [],
        };
      }
      return WORKSPACE_FIXTURE;
    });
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      configurable: true,
    });
  });

  it("opens the log viewer from the diagnostics section", async () => {
    renderSettingsDrawer();

    expect(await screen.findByText("诊断")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看日志" }));

    expect(await screen.findByRole("dialog", { name: "应用日志" })).toBeInTheDocument();
  });

  it("persists the menubar sessions switch independently", async () => {
    renderSettingsDrawer();

    expect(await screen.findByText("在菜单栏显示当前会话")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "在菜单栏显示当前会话" }));

    expect(invokeMock).toHaveBeenCalledWith("set_app_preferences", {
      data: {
        showTrayTitle: true,
        showTraySessions: false,
        systemNotificationsEnabled: false,
        collapseSidebarByDefault: false,
        thirdPartyProviderPricingEnabled: true,
        uiLanguage: "zh",
        defaultTerminalApp: "terminal",
        defaultEditorApp: null,
      },
    });
  });

  it("persists the sidebar icon-only default switch independently", async () => {
    renderSettingsDrawer();

    expect(await screen.findByText("默认收起侧边栏")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "默认收起侧边栏" }));

    expect(invokeMock).toHaveBeenCalledWith("set_app_preferences", {
      data: {
        showTrayTitle: true,
        showTraySessions: true,
        systemNotificationsEnabled: false,
        collapseSidebarByDefault: true,
        thirdPartyProviderPricingEnabled: true,
        uiLanguage: "zh",
        defaultTerminalApp: "terminal",
        defaultEditorApp: null,
      },
    });
  });

  it("persists the third-party provider pricing switch independently", async () => {
    renderSettingsDrawer();

    expect(await screen.findByText("第三方模型计价")).toBeInTheDocument();
    expect(screen.getByText(/DeepSeek/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "第三方模型计价" }));

    expect(invokeMock).toHaveBeenCalledWith("set_app_preferences", {
      data: {
        showTrayTitle: true,
        showTraySessions: true,
        systemNotificationsEnabled: false,
        collapseSidebarByDefault: false,
        thirdPartyProviderPricingEnabled: false,
        uiLanguage: "zh",
        defaultTerminalApp: "terminal",
        defaultEditorApp: null,
      },
    });
  });

  it("requests permission before enabling system notifications", async () => {
    renderSettingsDrawer();

    expect(await screen.findByText("系统通知")).toBeInTheDocument();
    const notificationSwitch = screen.getByRole("switch", { name: "系统通知" });
    expect(notificationSwitch).not.toBeChecked();

    fireEvent.click(notificationSwitch);

    await waitFor(() => {
      expect(requestPermissionMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenCalledWith("set_app_preferences", {
        data: {
          showTrayTitle: true,
          showTraySessions: true,
          systemNotificationsEnabled: true,
          collapseSidebarByDefault: false,
          thirdPartyProviderPricingEnabled: true,
          uiLanguage: "zh",
          defaultTerminalApp: "terminal",
          defaultEditorApp: null,
        },
      });
    });
  });

  it("does not enable system notifications when permission is denied", async () => {
    requestPermissionMock.mockResolvedValue("denied");
    renderSettingsDrawer();

    const notificationSwitch = await screen.findByRole("switch", { name: "系统通知" });
    fireEvent.click(notificationSwitch);

    await waitFor(() => {
      expect(requestPermissionMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).not.toHaveBeenCalledWith(
        "set_app_preferences",
        expect.objectContaining({
          data: expect.objectContaining({ systemNotificationsEnabled: true }),
        }),
      );
    });
    expect(notificationSwitch).not.toBeChecked();
    expect(await screen.findByText("未获得系统通知权限，已保持关闭")).toBeInTheDocument();
  });

  it("does not enable system notifications when permission request fails", async () => {
    requestPermissionMock.mockRejectedValue(new Error("permission unavailable"));
    renderSettingsDrawer();

    const notificationSwitch = await screen.findByRole("switch", { name: "系统通知" });
    fireEvent.click(notificationSwitch);

    await waitFor(() => {
      expect(requestPermissionMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).not.toHaveBeenCalledWith(
        "set_app_preferences",
        expect.objectContaining({
          data: expect.objectContaining({ systemNotificationsEnabled: true }),
        }),
      );
    });
    expect(notificationSwitch).not.toBeChecked();
    expect(await screen.findByText("请求系统通知权限失败")).toBeInTheDocument();
  });

  it("lists actual system notification triggers in the help popover", async () => {
    renderSettingsDrawer();

    fireEvent.click(await screen.findByRole("button", { name: "查看系统通知触发场景" }));

    expect(await screen.findByText("系统通知触发场景")).toBeInTheDocument();
    expect(screen.getByText("Claude 会话进入待处理状态。")).toBeInTheDocument();
    expect(screen.getByText("点击会话跳转但终端定位失败。")).toBeInTheDocument();
  });

  it("hides macOS-only terminal choices on Linux", async () => {
    platformMock.mockReturnValue("linux");
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_native_open_app_options") {
        return {
          platform: "linux",
          supportedEditors: [
            { slug: "vscode", label: "VS Code" },
            { slug: "cursor", label: "Cursor" },
            { slug: "windsurf", label: "Windsurf" },
            { slug: "zed", label: "Zed" },
          ],
          supportedTerminals: [
            { slug: "terminal", label: "Terminal" },
            { slug: "warp", label: "Warp" },
            { slug: "ghostty", label: "Ghostty" },
          ],
          editors: [],
          terminals: [
            { slug: "terminal", label: "Terminal" },
            { slug: "warp", label: "Warp" },
            { slug: "ghostty", label: "Ghostty" },
          ],
        };
      }
      if (command === "get_app_logs") {
        return {
          logDir: "/tmp/logs",
          truncated: false,
          entries: [],
        };
      }
      return WORKSPACE_FIXTURE;
    });
    renderSettingsDrawer();

    const terminalSelect = await screen.findByRole("combobox", { name: "默认终端" });
    fireEvent.click(terminalSelect);

    expect(screen.getByRole("option", { name: "系统默认终端" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Warp" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ghostty" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "iTerm" })).not.toBeInTheDocument();
  });

  it("shows supported Windows terminal choices including Warp", async () => {
    platformMock.mockReturnValue("windows");
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_native_open_app_options") {
        return {
          platform: "windows",
          supportedEditors: [
            { slug: "vscode", label: "VS Code" },
            { slug: "cursor", label: "Cursor" },
            { slug: "windsurf", label: "Windsurf" },
            { slug: "zed", label: "Zed" },
          ],
          supportedTerminals: [
            { slug: "terminal", label: "Terminal" },
            { slug: "warp", label: "Warp" },
          ],
          editors: [],
          terminals: [
            { slug: "terminal", label: "Terminal" },
            { slug: "warp", label: "Warp" },
          ],
        };
      }
      if (command === "get_app_logs") {
        return {
          logDir: "/tmp/logs",
          truncated: false,
          entries: [],
        };
      }
      return WORKSPACE_FIXTURE;
    });
    renderSettingsDrawer();

    const terminalSelect = await screen.findByRole("combobox", { name: "默认终端" });
    fireEvent.click(terminalSelect);

    expect(screen.getByRole("option", { name: "系统默认终端" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Warp" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "iTerm" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Ghostty" })).not.toBeInTheDocument();
  });

  it("shows only locally available supported tools with app-style icons", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_native_open_app_options") {
        return {
          platform: "macos",
          supportedEditors: [
            { slug: "vscode", label: "VS Code" },
            { slug: "cursor", label: "Cursor" },
            { slug: "windsurf", label: "Windsurf" },
            { slug: "zed", label: "Zed" },
          ],
          supportedTerminals: [
            { slug: "terminal", label: "Terminal" },
            { slug: "iterm", label: "iTerm" },
            { slug: "warp", label: "Warp" },
            { slug: "ghostty", label: "Ghostty" },
          ],
          editors: [{ slug: "vscode", label: "VS Code" }],
          terminals: [{ slug: "ghostty", label: "Ghostty" }],
        };
      }
      if (command === "get_app_logs") {
        return {
          logDir: "/tmp/logs",
          truncated: false,
          entries: [],
        };
      }
      return {
        ...WORKSPACE_FIXTURE,
        app: {
          ...WORKSPACE_FIXTURE.app,
          defaultTerminalApp: "ghostty",
          defaultEditorApp: "vscode",
        },
      };
    });
    renderSettingsDrawer();

    const editorSelect = await screen.findByRole("combobox", { name: "默认编辑器" });
    fireEvent.click(editorSelect);

    const vscodeOption = screen.getByRole("option", { name: "VS Code" });
    expect(vscodeOption.querySelector('[data-slot="native-open-option-icon"]')).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Cursor" })).not.toBeInTheDocument();

    fireEvent.click(vscodeOption);
    const terminalSelect = screen.getByRole("combobox", { name: "默认终端" });
    fireEvent.click(terminalSelect);

    const ghosttyOption = screen.getByRole("option", { name: "Ghostty" });
    expect(ghosttyOption.querySelector('[data-slot="native-open-option-icon"]')).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Terminal" })).not.toBeInTheDocument();
  });

  it("shows a help popover with supported and detected Windows terminal tools", async () => {
    platformMock.mockReturnValue("windows");
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_native_open_app_options") {
        return {
          platform: "windows",
          supportedEditors: [
            { slug: "vscode", label: "VS Code" },
            { slug: "cursor", label: "Cursor" },
            { slug: "windsurf", label: "Windsurf" },
            { slug: "zed", label: "Zed" },
          ],
          supportedTerminals: [
            { slug: "terminal", label: "Terminal" },
            { slug: "warp", label: "Warp" },
          ],
          editors: [{ slug: "vscode", label: "VS Code" }],
          terminals: [{ slug: "terminal", label: "Terminal" }],
        };
      }
      if (command === "get_app_logs") {
        return {
          logDir: "/tmp/logs",
          truncated: false,
          entries: [],
        };
      }
      return WORKSPACE_FIXTURE;
    });
    renderSettingsDrawer();

    fireEvent.click(await screen.findByRole("button", { name: "查看默认终端支持列表" }));

    expect(await screen.findByText("当前系统")).toBeInTheDocument();
    expect(screen.getByText("Windows")).toBeInTheDocument();
    expect(screen.getAllByText("系统默认终端").length).toBeGreaterThan(0);
    expect(screen.getByText("Warp")).toBeInTheDocument();
    expect(screen.getByText("已检测到")).toBeInTheDocument();
    expect(screen.getByText("未检测到")).toBeInTheDocument();
  });

  it("shows empty detection hints when no supported tools are available locally", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_native_open_app_options") {
        return {
          platform: "windows",
          supportedEditors: [
            { slug: "vscode", label: "VS Code" },
            { slug: "cursor", label: "Cursor" },
            { slug: "windsurf", label: "Windsurf" },
            { slug: "zed", label: "Zed" },
          ],
          supportedTerminals: [
            { slug: "terminal", label: "Terminal" },
            { slug: "warp", label: "Warp" },
          ],
          editors: [],
          terminals: [],
        };
      }
      if (command === "get_app_logs") {
        return {
          logDir: "/tmp/logs",
          truncated: false,
          entries: [],
        };
      }
      return {
        ...WORKSPACE_FIXTURE,
        app: {
          ...WORKSPACE_FIXTURE.app,
          defaultTerminalApp: "warp",
          defaultEditorApp: "cursor",
        },
      };
    });
    renderSettingsDrawer();

    expect(await screen.findByText("未检测到可用终端。")).toBeInTheDocument();
    expect(screen.getByText("未检测到可用编辑器。")).toBeInTheDocument();
    expect(screen.getAllByText("当前选择未检测到，可能无法启动。")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "查看默认编辑器支持列表" }));
    expect(
      await screen.findByText("支持但未检测到，请确认已安装在常见位置或可通过 PATH 访问。"),
    ).toBeInTheDocument();
  });

  it("switches theme through the three-state radio group", async () => {
    renderSettingsDrawer();

    const darkRadio = await screen.findByRole("radio", { name: "深色" });
    fireEvent.click(darkRadio);

    await waitFor(() => {
      expect(localStorage.getItem("ai-manager.theme")).toBe("dark");
    });

    const systemRadio = screen.getByRole("radio", { name: "跟随系统" });
    fireEvent.click(systemRadio);

    await waitFor(() => {
      expect(localStorage.getItem("ai-manager.theme")).toBe("system");
    });
  });
});
