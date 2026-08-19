import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const MOCK_PROVIDERS = [
  {
    id: "codex-builtin:openai",
    name: "OpenAI 官方",
    localizedName: { zh: "OpenAI 官方", en: "OpenAI Official" },
    slug: "openai",
    baseUrl: "https://api.openai.com/v1",
    wireApi: "responses",
    defaultModel: "gpt-5.4",
    models: [{ id: "gpt-5.4", name: "GPT-5.4" }],
    docUrl: "https://developers.openai.com/codex/",
  },
  {
    id: "codex-builtin:deepseek",
    name: "DeepSeek",
    localizedName: { zh: "DeepSeek", en: "DeepSeek" },
    slug: "deepseek",
    baseUrl: "https://api.deepseek.com/",
    wireApi: "responses",
    defaultModel: "deepseek-v4-flash",
    models: [
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "deepseek-chat", name: "DeepSeek Chat" },
    ],
    defaultReasoningEffort: "high",
    docUrl: "https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/codex",
  },
];

const MOCK_WORKSPACE: CodexWorkspace = {
  providers: MOCK_PROVIDERS,
  profiles: [
    {
      id: "profile-1",
      name: "DeepSeek 快速起步",
      providerId: "codex-builtin:deepseek",
      apiKey: "sk-••••12",
      model: "deepseek-v4-flash",
      modelReasoningEffort: "high",
      createdAt: "2026-01-01T00:00:00+08:00",
      updatedAt: "2026-01-01T00:00:00+08:00",
    },
  ],
  bindings: {
    codexProfileId: "profile-1",
  },
};

function stubInvoke(workspace: CodexWorkspace) {
  invokeMock.mockImplementation(async (command: string, _args?: unknown) => {
    if (command === "get_codex_workspace") return workspace;
    if (command === "preview_codex_input") {
      return {
        profileId: "preview-id",
        profileName: "Preview",
        providerId: "codex-builtin:deepseek",
        currentModelProvider: "openai",
        nextModelProvider: "deepseek",
        authMode: "apiKey",
        targetModel: "deepseek-v4-flash",
        targetReasoningEffort: "high",
        configTomlPreview: 'model_provider = "deepseek"\nmodel = "deepseek-v4-flash"',
        modelsJsonPreview: '{"deepseek-v4-flash": {}}',
        warnings: [],
      };
    }
    if (command === "preview_codex_apply") {
      return {
        profileId: "profile-1",
        profileName: "DeepSeek 快速起步",
        providerId: "codex-builtin:deepseek",
        currentModelProvider: "openai",
        nextModelProvider: "deepseek",
        authMode: "apiKey",
        targetModel: "deepseek-v4-flash",
        targetReasoningEffort: "high",
        configTomlPreview: 'model_provider = "deepseek"\nmodel = "deepseek-v4-flash"',
        modelsJsonPreview: '{"deepseek-v4-flash": {}}',
        warnings: [],
      };
    }
    if (command === "upsert_codex_profile") {
      return {
        id: "profile-1",
        name: "DeepSeek 快速起步",
        providerId: "codex-builtin:deepseek",
        apiKey: "sk-••••12",
        model: "deepseek-v4-flash",
        modelReasoningEffort: "high",
        createdAt: "2026-01-01T00:00:00+08:00",
        updatedAt: "2026-01-01T00:00:00+08:00",
      };
    }
    if (command === "delete_codex_profile" || command === "apply_codex_profile") return null;
    if (command === "duplicate_codex_profile" || command === "reorder_codex_profiles") return null;
    if (command === "prepare_codex_profile_launch") {
      return { command: "codex --profile code-manager-profile-1" };
    }
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

  afterEach(() => {
    cleanup();
  });

  it("渲染 Profile 列表与使用中状态", async () => {
    stubInvoke(MOCK_WORKSPACE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("DeepSeek 快速起步")).toBeInTheDocument();
    });
    expect(screen.getByText("使用中")).toBeInTheDocument();
    expect(screen.getByText("deepseek-v4-flash")).toBeInTheDocument();
  });

  it("空列表展示空状态", async () => {
    const empty: CodexWorkspace = {
      providers: MOCK_PROVIDERS,
      profiles: [],
      bindings: {},
    };
    stubInvoke(empty);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("尚无 Codex 配置")).toBeInTheDocument();
    });
  });

  it("点击新增配置默认打开自定义片段模式，填写并提交保存", async () => {
    stubInvoke(MOCK_WORKSPACE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("DeepSeek 快速起步")).toBeInTheDocument();
    });

    const addButton = screen.getByRole("button", { name: /新增配置/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText("新增 Codex 配置")).toBeInTheDocument();
    });

    // 默认即为自定义片段，填写名称、描述与 toml 片段
    const nameInput = screen.getByPlaceholderText("例如：DeepSeek-日常开发");
    fireEvent.change(nameInput, { target: { value: "我的自定义中转" } });

    const descInput = screen.getByLabelText("描述");
    fireEvent.change(descInput, { target: { value: "我的常用代码配置" } });

    const tomlInput = screen.getByPlaceholderText(/model_provider = "my_provider"/i);
    fireEvent.change(tomlInput, {
      target: {
        value:
          'model_provider = "my_relay"\nmodel = "my-model"\n\n[model_providers.my_relay]\nbase_url = "https://example.com"',
      },
    });

    const saveButton = screen.getByRole("button", { name: "保存" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "upsert_codex_profile",
        expect.objectContaining({
          data: expect.objectContaining({
            name: "我的自定义中转",
            description: "我的常用代码配置",
            providerId: "custom",
            customConfigToml: expect.stringContaining('model_provider = "my_relay"'),
          }),
        }),
      );
    });
  });

  it("点击已创建 Profile 卡片或编辑按钮均可展开编辑抽屉", async () => {
    stubInvoke(MOCK_WORKSPACE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("DeepSeek 快速起步")).toBeInTheDocument();
    });

    const editBtn = screen.getByTitle("编辑");
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(screen.getByText("编辑 Codex 配置")).toBeInTheDocument();
    });
  });

  it("点击卡片本身直接展开编辑抽屉", async () => {
    stubInvoke(MOCK_WORKSPACE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("DeepSeek 快速起步")).toBeInTheDocument();
    });

    const card = screen.getByText("DeepSeek 快速起步").closest('[data-slot="profile-card"]');
    expect(card).not.toBeNull();
    if (card) {
      fireEvent.click(card);
    }

    await waitFor(() => {
      expect(screen.getByText("编辑 Codex 配置")).toBeInTheDocument();
    });
  });

  it("点击终端图标打开快捷启动命令弹窗并可复制命令", async () => {
    stubInvoke(MOCK_WORKSPACE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("DeepSeek 快速起步")).toBeInTheDocument();
    });

    const terminalBtn = screen.getByTitle("复制启动命令");
    fireEvent.click(terminalBtn);

    await waitFor(() => {
      expect(screen.getAllByText("Codex 启动命令").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/codex --profile code-manager-profile-1/i)).toBeInTheDocument();
      expect(invokeMock).toHaveBeenCalledWith("prepare_codex_profile_launch", {
        id: "profile-1",
      });
    });
  });

  it("点击复制按钮触发配置副本创建", async () => {
    stubInvoke(MOCK_WORKSPACE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("DeepSeek 快速起步")).toBeInTheDocument();
    });

    const copyBtn = screen.getByTitle("复制配置");
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("duplicate_codex_profile", {
        id: "profile-1",
        nameSuffix: " 副本",
      });
    });
  });

  it("拖拽排序调用后端，失败时刷新工作区并提示", async () => {
    const workspace: CodexWorkspace = {
      ...MOCK_WORKSPACE,
      profiles: [
        ...MOCK_WORKSPACE.profiles,
        {
          ...MOCK_WORKSPACE.profiles[0],
          id: "profile-2",
          name: "Second Profile",
        },
      ],
    };
    stubInvoke(workspace);
    const baseImplementation = invokeMock.getMockImplementation();
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "reorder_codex_profiles") throw new Error("persist failed");
      return baseImplementation?.(command, args);
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("Second Profile")).toBeInTheDocument());
    const cards = screen.getAllByRole("button", { name: /Profile|DeepSeek 快速起步/ });
    const firstCard = cards.find((item) => item.getAttribute("data-slot") === "profile-card");
    const secondCard = screen.getByText("Second Profile").closest('[data-slot="profile-card"]');
    expect(firstCard).toBeTruthy();
    expect(secondCard).toBeTruthy();
    if (!firstCard || !secondCard) return;
    vi.spyOn(secondCard, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 100,
      left: 0,
      right: 100,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.dragStart(firstCard);
    fireEvent.dragOver(secondCard, { clientY: 75 });
    fireEvent.drop(secondCard, { clientY: 75 });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("reorder_codex_profiles", {
        ids: ["profile-2", "profile-1"],
      });
      expect(showToastMock).toHaveBeenCalledWith(
        expect.stringContaining("保存 Codex 配置顺序失败"),
        "error",
        expect.objectContaining({ description: "persist failed" }),
      );
    });
    expect(
      invokeMock.mock.calls.filter(([command]) => command === "get_codex_workspace").length,
    ).toBeGreaterThan(1);
  });

  it("点击应用触发 Preview 对话框并确认 Apply", async () => {
    const inactiveWorkspace: CodexWorkspace = {
      ...MOCK_WORKSPACE,
      bindings: {},
    };
    stubInvoke(inactiveWorkspace);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("DeepSeek 快速起步")).toBeInTheDocument();
    });

    const applyButton = screen.getByRole("button", { name: "应用" });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(screen.getByText("应用 Codex 配置预览")).toBeInTheDocument();
    });

    const confirmApplyBtn = screen.getByRole("button", { name: "应用" });
    fireEvent.click(confirmApplyBtn);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("apply_codex_profile", { id: "profile-1" });
    });
  });

  it("Apply 预览展示 auth.json 双凭据计费风险", async () => {
    const inactiveWorkspace: CodexWorkspace = { ...MOCK_WORKSPACE, bindings: {} };
    stubInvoke(inactiveWorkspace);
    const baseImplementation = invokeMock.getMockImplementation();
    invokeMock.mockImplementation(async (command, args) => {
      const result = await baseImplementation?.(command, args);
      if (command === "preview_codex_apply" && result && typeof result === "object") {
        return {
          ...result,
          warnings: ["legacyApiKeyMayOverrideChatGptLogin"],
        };
      }
      return result;
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("DeepSeek 快速起步")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "应用" }));

    await waitFor(() => {
      expect(screen.getByText(/可能改用 API Key 计费/)).toBeInTheDocument();
    });
  });

  it("删除 Profile 调用后端 delete_codex_profile", async () => {
    stubInvoke(MOCK_WORKSPACE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("DeepSeek 快速起步")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByTitle("删除");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByText("删除 Codex 配置")).toBeInTheDocument();
    });

    const confirmDeleteBtn = screen.getByRole("button", { name: "删除" });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("delete_codex_profile", { id: "profile-1" });
    });
  });

  it("在编辑抽屉中点击查看内置供应商，展开只读预设抽屉", async () => {
    stubInvoke(MOCK_WORKSPACE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("DeepSeek 快速起步")).toBeInTheDocument();
    });

    const addButton = screen.getByRole("button", { name: /新增配置/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText("新增 Codex 配置")).toBeInTheDocument();
    });

    const viewBuiltinBtn = screen.getByRole("button", { name: /查看内置供应商/i });
    fireEvent.click(viewBuiltinBtn);

    await waitFor(() => {
      expect(screen.getByText("codex-builtin:deepseek")).toBeInTheDocument();
    });
  });
});
