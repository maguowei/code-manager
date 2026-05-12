import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../hooks/useToast";
import { I18nProvider } from "../../i18n";
import LogViewer from "../LogViewer";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

function renderLogViewer(onClose = vi.fn()) {
  render(
    <I18nProvider>
      <ToastProvider>
        <LogViewer onClose={onClose} />
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

describe("LogViewer", () => {
  beforeEach(() => {
    localStorage.clear();
    setSystemLanguages(["zh-CN"]);
    invokeMock.mockReset();
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

  it("loads and filters log entries", async () => {
    invokeMock.mockResolvedValue({
      logDir: "/Users/test-user/Library/Logs/com.gotobeta.app.ai-manager",
      truncated: false,
      entries: [
        {
          timestamp: "2026-04-29 12:00:00",
          level: "info",
          target: "ai_manager_lib::config",
          message: "event=profile.upsert status=ok profile_id=profile-1",
          raw: "[2026-04-29][12:00:00][ai_manager_lib::config][INFO] event=profile.upsert status=ok profile_id=profile-1",
        },
      ],
    });

    renderLogViewer();

    expect(
      await screen.findByText("event=profile.upsert status=ok profile_id=profile-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("/Users/test-user/Library/Logs/com.gotobeta.app.ai-manager"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("级别"), { target: { value: "error" } });
    fireEvent.change(screen.getByLabelText("搜索日志"), { target: { value: "profile" } });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenLastCalledWith("get_app_logs", {
        query: { level: "error", search: "profile", limit: 500 },
      });
    });
  });

  it("renders warning log levels with the shared warning tone", async () => {
    invokeMock.mockResolvedValue({
      logDir: "/tmp/logs",
      truncated: false,
      entries: [
        {
          timestamp: "2026-04-29 12:00:00",
          level: "warn",
          target: "ai_manager_lib::config",
          message: "event=profile.apply status=warn",
          raw: "[2026-04-29][12:00:00][ai_manager_lib::config][WARN] event=profile.apply status=warn",
        },
      ],
    });

    renderLogViewer();

    expect(
      (await screen.findByText("WARN", { selector: ".log-entry-level" })).closest(".log-line"),
    ).toHaveClass("text-warning");
  });

  it("opens log directory from the viewer", async () => {
    invokeMock.mockResolvedValue({
      logDir: "/tmp/logs",
      truncated: false,
      entries: [],
    });

    renderLogViewer();

    fireEvent.click(await screen.findByRole("button", { name: "打开日志目录" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_logs_dir");
    });
  });

  it("clears logs from the viewer", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "clear_app_logs") {
        return {
          logDir: "/tmp/logs",
          truncated: false,
          entries: [],
        };
      }
      return {
        logDir: "/tmp/logs",
        truncated: false,
        entries: [
          {
            timestamp: "2026-04-29 12:00:00+08:00",
            level: "error",
            target: "ai_manager_lib::config",
            message: "event=profile.apply status=error",
            raw: "[2026-04-29][12:00:00+08:00][ai_manager_lib::config][ERROR] event=profile.apply status=error",
          },
        ],
      };
    });

    renderLogViewer();

    expect(await screen.findByText("event=profile.apply status=error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清理日志" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("clear_app_logs");
    });
    expect(await screen.findByText("暂无日志")).toBeInTheDocument();
  });
});
