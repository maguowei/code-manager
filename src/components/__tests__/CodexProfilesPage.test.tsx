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
    if (command === "preview_codex_apply") {
      return {
        currentModelProvider: "old",
        nextModelProvider: "openai",
        providerName: "OpenAI 官方",
        providerBaseUrl: "https://api.openai.com/v1",
        providerWireApi: "responses",
        apiKeyWillSet: true,
      };
    }
    if (command === "delete_codex_provider" || command === "apply_codex_profile") return null;
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

  it("Provider 卡片展示 base_url 摘要块与 env_key / wire_api chip", async () => {
    stubInvoke(BUILTIN_WORKSPACE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("OpenAI 官方")).toBeInTheDocument();
    });
    // base_url 摘要块
    expect(screen.getByText("https://api.openai.com/v1")).toBeInTheDocument();
    // env_key / wire_api chip
    expect(screen.getByText("OPENAI_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("responses")).toBeInTheDocument();
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

  it("Profile 卡片展示 provider Badge 与 summary 行(base_url / wire_api / key)", async () => {
    const ws: CodexWorkspace = {
      providers: [...BUILTIN_WORKSPACE.providers],
      profiles: [
        {
          id: "codex-1",
          name: "工作中转",
          providerId: "codex-builtin:openai",
          apiKey: "test••••ey",
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
    // 卡片内 provider Badge(Provider 区卡片与 Profile 卡片各一处名称)
    expect(screen.getAllByText("OpenAI 官方")).toHaveLength(2);
    // summary 行:base_url(Provider 卡片与 Profile 卡片各一处)与 wire_api 值
    expect(screen.getAllByText("https://api.openai.com/v1")).toHaveLength(2);
    expect(screen.getAllByText("responses").length).toBeGreaterThanOrEqual(1);
    // key 状态行:脱敏 key 或「未配置」
    expect(screen.getByText(/test••••ey/)).toBeInTheDocument();
  });

  it("Profile 卡片对无 key 的配置展示「未配置」", async () => {
    const ws: CodexWorkspace = {
      providers: [...BUILTIN_WORKSPACE.providers],
      profiles: [
        {
          id: "codex-1",
          name: "工作中转",
          providerId: "codex-builtin:openai",
          apiKey: "",
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
    expect(screen.getByText("未配置")).toBeInTheDocument();
  });

  it("激活态展示徽标,且不再显示应用按钮", async () => {
    const ws: CodexWorkspace = {
      providers: [...BUILTIN_WORKSPACE.providers],
      profiles: [
        {
          id: "codex-1",
          name: "工作中转",
          providerId: "codex-builtin:openai",
          apiKey: "test••••ey",
          createdAt: "2026-01-01T00:00:00+08:00",
          updatedAt: "2026-01-01T00:00:00+08:00",
        },
      ],
      // 已绑定激活 codex-1
      bindings: { codexProfileId: "codex-1" },
      builtinProviderIds: ["codex-builtin:openai"],
    };
    stubInvoke(ws);
    renderPage();
    await waitFor(() => expect(screen.getByText("工作中转")).toBeInTheDocument());
    // 激活态徽标展示,头部 Apply 按钮由徽标替换
    expect(screen.getByText("已激活")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "应用" })).not.toBeInTheDocument();
  });

  it("未激活配置点击应用先 preview 再 apply", async () => {
    const ws: CodexWorkspace = {
      providers: [...BUILTIN_WORKSPACE.providers],
      profiles: [
        {
          id: "codex-1",
          name: "工作中转",
          providerId: "codex-builtin:openai",
          apiKey: "test••••ey",
          createdAt: "2026-01-01T00:00:00+08:00",
          updatedAt: "2026-01-01T00:00:00+08:00",
        },
      ],
      // 未绑定:卡片展示应用按钮
      bindings: {},
      builtinProviderIds: ["codex-builtin:openai"],
    };
    stubInvoke(ws);
    renderPage();
    await waitFor(() => expect(screen.getByText("工作中转")).toBeInTheDocument());

    // 点击应用:先调用 preview(不写盘)
    fireEvent.click(screen.getByRole("button", { name: "应用" }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("preview_codex_apply", { id: "codex-1" });
    });
    // 预览面板展示切换摘要
    await waitFor(() => {
      expect(screen.getByText("确认应用 Codex 配置")).toBeInTheDocument();
    });
    // 确认后才真正 apply(预览 Dialog 打开后背景被 aria-hidden,仅剩确认按钮)
    fireEvent.click(screen.getByRole("button", { name: "应用" }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("apply_codex_profile", { id: "codex-1" });
    });
  });

  it("新建自定义 Provider 可选择 wire_api 为 chat 并随表单提交", async () => {
    stubInvoke(BUILTIN_WORKSPACE);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新增 Provider" })).toBeInTheDocument();
    });

    // 打开新建编辑器
    fireEvent.click(screen.getByRole("button", { name: "新增 Provider" }));
    await waitFor(() => {
      expect(screen.getByText("新增 Codex Provider")).toBeInTheDocument();
    });
    // 填必填字段
    fireEvent.change(screen.getByPlaceholderText("例如：我的中转"), {
      target: { value: "Azure 中转" },
    });
    fireEvent.change(screen.getByPlaceholderText("https://api.example.com/v1"), {
      target: { value: "https://azure.example.com/v1" },
    });
    // wire_api 选择 chat(唯一 combobox)
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("chat"));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("upsert_codex_provider", {
        data: {
          id: null,
          name: "Azure 中转",
          baseUrl: "https://azure.example.com/v1",
          envKey: "OPENAI_API_KEY",
          wireApi: "chat",
          docUrl: undefined,
        },
      });
    });
  });

  it("Profile 编辑器展示引用 provider 摘要行,API key 支持明文切换", async () => {
    stubInvoke(BUILTIN_WORKSPACE);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新增配置" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "新增配置" }));
    await waitFor(() => {
      expect(screen.getByText("新增 Codex 配置")).toBeInTheDocument();
    });
    // 引用 provider 的 base_url 摘要行(与 Provider 区卡片各一处)
    expect(screen.getAllByText("https://api.openai.com/v1")).toHaveLength(2);
    // 摘要行展示 wire_api
    expect(screen.getByText("wire_api: responses")).toBeInTheDocument();

    // API key 输入框默认密文,可切换明文
    const keyInput = screen.getByPlaceholderText("sk-...");
    expect(keyInput).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "显示 API key" }));
    expect(keyInput).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "隐藏 API key" }));
    expect(keyInput).toHaveAttribute("type", "password");
  });

  it("脏 Provider 编辑器关闭前弹未保存确认,可放弃退出", async () => {
    stubInvoke(BUILTIN_WORKSPACE);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新增 Provider" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "新增 Provider" }));
    await waitFor(() => {
      expect(screen.getByText("新增 Codex Provider")).toBeInTheDocument();
    });
    // 修改表单使其变脏
    fireEvent.change(screen.getByPlaceholderText("例如：我的中转"), {
      target: { value: "未保存的中转" },
    });
    // 点取消:弹未保存确认,而非直接关闭
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => {
      expect(screen.getByText("存在未保存的更改")).toBeInTheDocument();
    });
    // 放弃:编辑器关闭且未调用后端保存
    fireEvent.click(screen.getByRole("button", { name: "不保存退出" }));
    await waitFor(() => {
      expect(screen.queryByText("新增 Codex Provider")).not.toBeInTheDocument();
    });
    expect(invokeMock).not.toHaveBeenCalledWith(
      "upsert_codex_provider",
      expect.anything() as never,
    );
  });

  it("脏 Profile 编辑器从未保存确认中保存并退出", async () => {
    const ws: CodexWorkspace = {
      providers: [...BUILTIN_WORKSPACE.providers],
      profiles: [],
      bindings: {},
      builtinProviderIds: ["codex-builtin:openai"],
    };
    stubInvoke(ws);
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新增配置" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "新增配置" }));
    await waitFor(() => {
      expect(screen.getByText("新增 Codex 配置")).toBeInTheDocument();
    });
    // 填名称与 key 使其 dirty 且可保存
    fireEvent.change(screen.getByPlaceholderText("例如：工作中转"), {
      target: { value: "工作配置" },
    });
    fireEvent.change(screen.getByPlaceholderText("sk-..."), { target: { value: "sk-new" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => {
      expect(screen.getByText("存在未保存的更改")).toBeInTheDocument();
    });
    // 保存并退出:调用 upsert_codex_profile,编辑器关闭
    fireEvent.click(screen.getByRole("button", { name: "保存并退出" }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "upsert_codex_profile",
        expect.objectContaining({
          data: expect.objectContaining({ name: "工作配置", apiKey: "sk-new" }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("新增 Codex 配置")).not.toBeInTheDocument();
    });
  });
});
