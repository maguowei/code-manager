import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import LogViewer from "../LogViewer";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

function renderLogViewer(onClose = vi.fn()) {
  return render(
    <I18nProvider>
      <LogViewer onClose={onClose} />
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

  it("keeps a single close button in the dialog header", async () => {
    invokeMock.mockResolvedValue({
      logDir: "/tmp/logs",
      truncated: false,
      entries: [],
    });

    renderLogViewer();

    await screen.findByText("/tmp/logs");

    expect(screen.getAllByRole("button", { name: "关闭" })).toHaveLength(1);
  });

  it("uses a wide dialog and stable desktop toolbar action layout", async () => {
    invokeMock.mockResolvedValue({
      logDir: "/tmp/logs",
      truncated: false,
      entries: [],
    });

    renderLogViewer();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass("h-[min(760px,calc(100vh-2rem))]");
    expect(dialog).toHaveClass("w-[min(980px,calc(100vw-2rem))]");
    expect(dialog).toHaveClass("max-w-none");
    expect(dialog).toHaveClass("sm:max-w-none");

    expect(screen.getByRole("button", { name: "刷新" }).parentElement).toHaveClass(
      "justify-end",
      "min-w-max",
    );
    expect(screen.getByLabelText("级别")).toHaveDisplayValue("全部级别");
  });

  it("keeps long log lists inside a dedicated scrollable body", async () => {
    const entries = Array.from({ length: 40 }, (_, index) => ({
      timestamp: `2026-04-29 12:${String(index).padStart(2, "0")}:00`,
      level: "info",
      target: "ai_manager_lib::logging",
      message: `event=log.viewer.regression index=${index}`,
      raw: `[2026-04-29][12:${String(index).padStart(2, "0")}:00][ai_manager_lib::logging][INFO] event=log.viewer.regression index=${index}`,
    }));
    invokeMock.mockResolvedValue({
      logDir: "/tmp/logs",
      truncated: false,
      entries,
    });

    renderLogViewer();

    expect(await screen.findByText("event=log.viewer.regression index=0")).toBeInTheDocument();
    expect(screen.getByText("event=log.viewer.regression index=39")).toBeInTheDocument();

    expect(document.body.querySelector("[data-slot='dialog-header']")).toHaveClass("shrink-0");
    expect(document.body.querySelector(".log-viewer-toolbar")).toHaveClass("shrink-0");
    expect(document.body.querySelector(".log-viewer-content")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-hidden",
    );
    expect(document.body.querySelector(".log-viewer-body")).toHaveClass("h-full");

    const list = document.body.querySelector(".log-entry-list");
    const firstLogLine = screen
      .getByText("event=log.viewer.regression index=0")
      .closest(".log-line") as HTMLElement | null;
    const lastLogLine = screen
      .getByText("event=log.viewer.regression index=39")
      .closest(".log-line") as HTMLElement | null;

    expect(list).toContainElement(firstLogLine);
    expect(list).toContainElement(lastLogLine);
    expect(screen.getByRole("button", { name: "刷新" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开日志目录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清理日志" })).toBeInTheDocument();
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
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_app_logs", {
        query: { limit: 500 },
      });
    });

    fireEvent.change(screen.getByLabelText("级别"), { target: { value: "error" } });
    fireEvent.change(screen.getByLabelText("搜索日志"), { target: { value: "profile" } });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenLastCalledWith("get_app_logs", {
        query: { level: "error", search: "profile", limit: 500 },
      });
    });
  });

  it("reloads logs with the selected display limit", async () => {
    invokeMock.mockResolvedValue({
      logDir: "/tmp/logs",
      truncated: false,
      entries: [],
    });

    renderLogViewer();

    await screen.findByText("/tmp/logs");
    fireEvent.change(screen.getByLabelText("显示数量"), { target: { value: "5000" } });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenLastCalledWith("get_app_logs", {
        query: { limit: 5000 },
      });
    });
    expect(screen.getByLabelText("显示数量")).toHaveDisplayValue("最近 5000 条");
  });

  it("explains truncation with the active display limit", async () => {
    invokeMock.mockResolvedValue({
      logDir: "/tmp/logs",
      truncated: true,
      entries: [
        {
          timestamp: "2026-04-29 12:00:00",
          level: "info",
          target: "ai_manager_lib::logging",
          message: "event=logs.truncated status=ok",
          raw: "[2026-04-29][12:00:00][ai_manager_lib::logging][INFO] event=logs.truncated status=ok",
        },
      ],
    });

    renderLogViewer();

    expect(
      await screen.findByText(
        "仅显示最近 500 条日志。可调大显示数量，或打开日志目录查看原始文件。",
      ),
    ).toBeInTheDocument();
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
