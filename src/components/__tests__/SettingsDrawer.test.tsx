import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../hooks/useToast";
import { I18nProvider } from "../../i18n";
import type { ConfigWorkspace } from "../../types";
import SettingsDrawer from "../SettingsDrawer";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const WORKSPACE_FIXTURE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    showTraySessions: true,
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
      <ToastProvider>
        <SettingsDrawer onClose={vi.fn()} />
      </ToastProvider>
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
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command) => {
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
        uiLanguage: "zh",
        defaultTerminalApp: "terminal",
        defaultEditorApp: null,
      },
    });
  });
});
