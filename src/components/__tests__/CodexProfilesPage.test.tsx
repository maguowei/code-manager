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
        providerName: "DeepSeek",
        currentModelProvider: "openai",
        nextModelProvider: "deepseek",
        authMode: "apiKey",
        targetModel: "deepseek-v4-flash",
        targetReasoningEffort: "high",
        configTomlPreview: 'model_provider = "deepseek"\nmodel = "deepseek-v4-flash"',
        modelsJsonPreview: '{"deepseek-v4-flash": {}}',
      };
    }
    if (command === "preview_codex_apply") {
      return {
        profileId: "profile-1",
        profileName: "DeepSeek 快速起步",
        providerName: "DeepSeek",
        currentModelProvider: "openai",
        nextModelProvider: "deepseek",
        authMode: "apiKey",
        targetModel: "deepseek-v4-flash",
        targetReasoningEffort: "high",
        configTomlPreview: 'model_provider = "deepseek"\nmodel = "deepseek-v4-flash"',
        modelsJsonPreview: '{"deepseek-v4-flash": {}}',
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

  it("渲染 Profile 列表与已激活状态", async () => {
    stubInvoke(MOCK_WORKSPACE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("DeepSeek 快速起步")).toBeInTheDocument();
    });
    expect(screen.getByText("当前激活")).toBeInTheDocument();
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

  it("点击新增配置打开抽屉，可选择预设并提交保存", async () => {
    stubInvoke(MOCK_WORKSPACE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("DeepSeek 快速起步")).toBeInTheDocument();
    });

    const addButtons = screen.getAllByRole("button", { name: /新增配置/i });
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("新增 Codex 配置")).toBeInTheDocument();
    });

    // 填写 API key 并保存
    const apiKeyInput = screen.getByLabelText("API Key");
    fireEvent.change(apiKeyInput, { target: { value: "sk-test-key-123" } });

    const saveButton = screen.getByRole("button", { name: "保存" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "upsert_codex_profile",
        expect.objectContaining({
          data: expect.objectContaining({
            providerId: "codex-builtin:deepseek",
            apiKey: "sk-test-key-123",
          }),
        }),
      );
    });
  });

  it("创建自定义片段 Profile：切换到自定义模式，输入 toml 与 models.json 片段并保存", async () => {
    stubInvoke(MOCK_WORKSPACE);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("DeepSeek 快速起步")).toBeInTheDocument();
    });

    const addButtons = screen.getAllByRole("button", { name: /新增配置/i });
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("新增 Codex 配置")).toBeInTheDocument();
    });

    // 切换到自定义片段模式
    const customModeTab = screen.getByRole("button", { name: "自定义片段" });
    fireEvent.click(customModeTab);

    // 修改名称
    const nameInput = screen.getByPlaceholderText("例如：DeepSeek 快速起步");
    fireEvent.change(nameInput, { target: { value: "我的自定义中转" } });

    // 输入 toml 片段
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
});
