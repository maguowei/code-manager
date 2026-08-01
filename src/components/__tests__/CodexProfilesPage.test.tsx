import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { CodexWorkspace } from "../../types";
import CodexProfilesPage from "../CodexProfilesPage";
import { ThemeProvider } from "../theme-provider";

const { invokeMock, showToastMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
  showToastMock: vi.fn(),
  listenMock: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

const BUILTIN_OPENAI = {
  id: "codex-builtin:openai",
  name: "OpenAI 官方",
  baseUrl: "https://api.openai.com/v1",
  envKey: "OPENAI_API_KEY",
  wireApi: "responses",
  docUrl: "https://developers.openai.com/codex/",
};

const BUILTIN_WORKSPACE: CodexWorkspace = {
  providers: [BUILTIN_OPENAI],
  profiles: [],
  bindings: {},
  builtinProviderIds: ["codex-builtin:openai"],
};

function stubInvoke(workspace: CodexWorkspace) {
  invokeMock.mockImplementation(async (command: string, args?: unknown) => {
    if (command === "get_codex_workspace") return workspace;
    if (command === "upsert_codex_provider") {
      const data = (args as { data?: { name?: string } })?.data;
      return {
        id: "custom:new",
        name: data?.name ?? "x",
        baseUrl: "https://r.example.com/v1",
        envKey: "OPENAI_API_KEY",
        wireApi: "responses",
      };
    }
    if (command === "delete_codex_provider") return null;
    return null;
  });
}

function renderPage() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <CodexProfilesPage />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe("CodexProfilesPage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    showToastMock.mockReset();
    listenMock.mockReset();
  });

  it("渲染内置只读 Provider,内置项无删除按钮", async () => {
    stubInvoke(BUILTIN_WORKSPACE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("OpenAI 官方")).toBeInTheDocument();
    });
    expect(screen.getByText("内置")).toBeInTheDocument();
    // 内置 Provider 只读:无删除按钮
    expect(screen.queryAllByLabelText("删除")).toHaveLength(0);
  });

  it("自定义 Provider 可删除,删除调用后端", async () => {
    const ws: CodexWorkspace = {
      providers: [
        ...BUILTIN_WORKSPACE.providers,
        {
          id: "custom:relay",
          name: "我的中转",
          baseUrl: "https://r.example.com/v1",
          envKey: "RELAY_KEY",
          wireApi: "chat",
        },
      ],
      profiles: [],
      bindings: {},
      builtinProviderIds: ["codex-builtin:openai"],
    };
    stubInvoke(ws);
    renderPage();
    await waitFor(() => expect(screen.getByText("我的中转")).toBeInTheDocument());

    fireEvent.click(screen.getAllByLabelText("删除")[0]);

    // 删除走两段式确认:弹出确认面板后再次点击删除
    await waitFor(() => {
      expect(screen.getByText("删除 Codex Provider")).toBeInTheDocument();
    });
    // 确认面板内的删除按钮(此时列表按钮已不可见,只剩确认面板一个删除按钮)
    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("delete_codex_provider", { id: "custom:relay" });
    });
  });

  it("空 Provider 列表展示空状态", async () => {
    const empty: CodexWorkspace = {
      providers: [],
      profiles: [],
      bindings: {},
      builtinProviderIds: [],
    };
    stubInvoke(empty);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("尚无 Codex Provider")).toBeInTheDocument();
    });
  });

  it("Profile 列表展示脱敏 api key,删除调用后端", async () => {
    const ws: CodexWorkspace = {
      providers: [...BUILTIN_WORKSPACE.providers],
      profiles: [
        {
          id: "codex-1",
          name: "工作中转",
          providerId: "codex-builtin:openai",
          apiKey: "test••••ey", // 后端已脱敏
          createdAt: "2026-01-01T00:00:00+08:00",
          updatedAt: "2026-01-01T00:00:00+08:00",
        },
      ],
      bindings: {},
      builtinProviderIds: ["codex-builtin:openai"],
    };
    stubInvoke(ws);
    renderPage();
    await waitFor(() => expect(screen.getByText("工作中转")).toBeInTheDocument());
    // 脱敏 key 展示(不含明文)
    expect(screen.getByText(/test••••ey/)).toBeInTheDocument();

    // 删除 profile:两段式确认
    fireEvent.click(screen.getAllByLabelText("删除")[0]);
    await waitFor(() => {
      expect(screen.getByText("删除 Codex 配置")).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("delete_codex_profile", { id: "codex-1" });
    });
  });
});
