import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ConfigWorkspace } from "../../types";
import ProfilesPage from "../ProfilesPage";

const { invokeMock, showToastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
  showToastMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

vi.mock("../ConfigPreview", () => ({
  default: ({
    content,
    onChange,
    jsonError,
  }: {
    content: string;
    onChange?: (value: string) => void;
    jsonError?: string;
  }) => (
    <div>
      {onChange ? (
        <textarea
          aria-label="config-preview-input"
          value={content}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <pre data-testid="config-preview-output">{content}</pre>
      )}
      {jsonError ? <span>{jsonError}</span> : null}
    </div>
  ),
}));

const SETTINGS_STORAGE_KEY = "ai-manager-settings";

const WORKSPACE_FIXTURE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
  },
  builtinPresets: [
    {
      id: "builtin:openrouter",
      name: "OpenRouter",
      localizedName: {
        zh: "开放路由",
        en: "OpenRouter",
      },
      description: "OpenRouter 预设",
      modelSuggestions: ["claude-sonnet-4-6"],
      settingsPatch: {},
      source: "builtin",
    },
  ],
  customPresets: [],
  profiles: [
    {
      id: "user-openrouter",
      name: "OpenRouter User",
      description: "默认用户配置",
      presetId: "builtin:openrouter",
      settings: {
        env: {
          ANTHROPIC_AUTH_TOKEN: "token",
          ANTHROPIC_MODEL: "claude-sonnet-4-6",
          CLAUDE_CODE_EFFORT_LEVEL: "high",
        },
        enabledPlugins: {
          "formatter@anthropic-tools": true,
          "docs@anthropic-tools": false,
        },
      },
      createdAt: "2026-04-18T12:00:00Z",
      updatedAt: "2026-04-18T12:00:00Z",
    },
  ],
  bindings: {
    userProfileId: "user-openrouter",
  },
} as ConfigWorkspace;

function renderPage() {
  render(
    <I18nProvider>
      <ProfilesPage workspace={WORKSPACE_FIXTURE} onWorkspaceChange={async () => {}} />
    </I18nProvider>,
  );
}

function makeProfile(id: string, name: string, presetId = "builtin:openrouter") {
  return {
    id,
    name,
    description: `${name} 描述`,
    presetId,
    settings: {
      env: {
        ANTHROPIC_MODEL: `model-${id}`,
      },
    },
    createdAt: "2026-04-18T12:00:00Z",
    updatedAt: "2026-04-18T12:00:00Z",
  } as ConfigWorkspace["profiles"][number];
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("ProfilesPage", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    showToastMock.mockReset();
    invokeMock.mockResolvedValue(null);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn(async () => undefined),
      },
      configurable: true,
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

  it("renders legacy config card summaries and actions in zh", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );

    renderPage();

    expect(screen.getByRole("heading", { name: "配置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /新建配置/ })).toBeInTheDocument();

    const card = screen.getByText("OpenRouter User").closest(".profile-card") as HTMLElement | null;
    expect(card).not.toBeNull();
    if (!card) {
      return;
    }

    const badge = card.querySelector(".profile-name-badge") as HTMLElement | null;
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent("O");
    expect(badge?.className).toMatch(/profile-name-badge--color-\d/);

    expect(within(card).queryByText("用户")).not.toBeInTheDocument();
    expect(within(card).getByText("使用中")).toBeInTheDocument();
    expect(within(card).queryByText("已应用到用户设置")).not.toBeInTheDocument();
    expect(within(card).getByText("开放路由")).toBeInTheDocument();
    const titleRow = within(card)
      .getByRole("heading", { name: "OpenRouter User" })
      .closest(".profile-card-title-row");
    const presetRow = card.querySelector(".profile-card-preset-row");
    expect(titleRow?.querySelector(".profile-preset-badge")).toBeNull();
    expect(presetRow).toHaveTextContent("开放路由");
    expect(within(card).getByText("claude-sonnet-4-6")).toBeInTheDocument();
    expect(within(card).getByText("high")).toBeInTheDocument();
    expect(within(card).getByText("已启用 1/2")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "启用" })).not.toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "复制环境变量" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "复制" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "删除" })).toBeInTheDocument();
    expect(within(card).queryByText("删除")).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
  });

  it("renders enable action for unapplied profiles in zh", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );

    const unboundWorkspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      bindings: {
        userProfileId: undefined,
      },
    } as ConfigWorkspace;

    render(
      <I18nProvider>
        <ProfilesPage workspace={unboundWorkspace} onWorkspaceChange={async () => {}} />
      </I18nProvider>,
    );

    const card = screen.getByText("OpenRouter User").closest(".profile-card") as HTMLElement | null;
    expect(card).not.toBeNull();
    if (!card) {
      return;
    }

    expect(within(card).getByRole("button", { name: "启用" })).toBeInTheDocument();
    expect(within(card).queryByText("使用中")).not.toBeInTheDocument();
  });

  it("disables the batch test action when there are no profiles", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );

    render(
      <I18nProvider>
        <ProfilesPage
          workspace={{ ...WORKSPACE_FIXTURE, profiles: [] }}
          onWorkspaceChange={async () => {}}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "一键测试" })).toBeDisabled();
  });

  it("tests every saved profile with different presets concurrently and renders inline results", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    const alphaResult = createDeferred<unknown>();
    const betaResult = createDeferred<unknown>();
    const orderedWorkspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [
        makeProfile("profile-a", "Alpha", "builtin:openrouter"),
        makeProfile("profile-b", "Beta", "custom:beta"),
      ],
      bindings: {
        userProfileId: undefined,
      },
    } as ConfigWorkspace;

    invokeMock.mockImplementation((command: string, payload?: unknown) => {
      if (command !== "test_profile_model") {
        return Promise.resolve(null);
      }

      const profileName = (payload as { data?: { name?: string } } | undefined)?.data?.name;
      if (profileName === "Alpha") {
        return alphaResult.promise;
      }
      if (profileName === "Beta") {
        return betaResult.promise;
      }
      return Promise.resolve(null);
    });

    render(
      <I18nProvider>
        <ProfilesPage workspace={orderedWorkspace} onWorkspaceChange={async () => {}} />
      </I18nProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "一键测试" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "测试中..." })).toBeDisabled();
    const modelTestCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "test_profile_model",
    );
    expect(modelTestCalls).toHaveLength(2);
    expect(
      modelTestCalls.map(
        ([, payload]) => (payload as { data?: { id?: string; name?: string } }).data,
      ),
    ).toEqual([
      expect.objectContaining({ id: "profile-a", name: "Alpha" }),
      expect.objectContaining({ id: "profile-b", name: "Beta" }),
    ]);

    await act(async () => {
      alphaResult.resolve({
        ok: true,
        responseText: "Alpha 测试成功",
        promptText: "请确认测试成功。",
        resolvedModel: "model-profile-a",
        durationMs: 52,
        rawResponse: JSON.stringify({ content: [{ type: "text", text: "Alpha 测试成功" }] }),
      });
      betaResult.resolve({
        ok: false,
        responseText: "",
        promptText: "请确认测试成功。",
        resolvedModel: "model-profile-b",
        durationMs: 70,
        errorMessage: "Beta 认证失败",
        rawResponse: '{"error":{"message":"Beta 认证失败"}}',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "一键测试" })).toBeEnabled();

    const alphaCard = screen.getByText("Alpha").closest(".profile-card") as HTMLElement | null;
    const betaCard = screen.getByText("Beta").closest(".profile-card") as HTMLElement | null;
    expect(alphaCard).not.toBeNull();
    expect(betaCard).not.toBeNull();
    if (!alphaCard || !betaCard) {
      return;
    }

    expect(within(alphaCard).getByText("52 ms")).toBeInTheDocument();
    expect(within(betaCard).getByText("失败")).toBeInTheDocument();

    const alphaModelSummary = within(alphaCard)
      .getByText("model-profile-a")
      .closest(".profile-summary-main");
    const betaModelSummary = within(betaCard)
      .getByText("model-profile-b")
      .closest(".profile-summary-main");
    expect(alphaModelSummary).not.toBeNull();
    expect(betaModelSummary).not.toBeNull();
    expect(alphaModelSummary?.querySelector(".profile-test-result-badge")).toHaveTextContent(
      "52 ms",
    );
    expect(betaModelSummary?.querySelector(".profile-test-result-badge")).toHaveTextContent("失败");
    expect(
      alphaCard.querySelector(".profile-card-head-actions .profile-test-result-badge"),
    ).toBeNull();
    expect(
      betaCard.querySelector(".profile-card-head-actions .profile-test-result-badge"),
    ).toBeNull();

    fireEvent.click(within(alphaCard).getByRole("button", { name: "Alpha 测试结果：52 ms" }));
    expect(screen.getByRole("dialog", { name: "模型测试结果" })).toBeInTheDocument();
    expect(screen.getByText("Alpha 测试成功")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(within(betaCard).getByRole("button", { name: "Beta 测试结果：失败" }));
    expect(screen.getByRole("dialog", { name: "模型测试结果" })).toBeInTheDocument();
    expect(screen.getByText("Beta 认证失败")).toBeInTheDocument();
  });

  it("queues batch model tests for profiles sharing a preset while running different presets in parallel", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    const alphaResult = createDeferred<unknown>();
    const betaResult = createDeferred<unknown>();
    const gammaResult = createDeferred<unknown>();
    const startedProfileIds: string[] = [];
    const orderedWorkspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [
        makeProfile("profile-a", "Alpha", "builtin:openrouter"),
        makeProfile("profile-b", "Beta", "builtin:openrouter"),
        makeProfile("profile-c", "Gamma", "custom:gamma"),
      ],
      bindings: {
        userProfileId: undefined,
      },
    } as ConfigWorkspace;

    invokeMock.mockImplementation((command: string, payload?: unknown) => {
      if (command !== "test_profile_model") {
        return Promise.resolve(null);
      }

      const profileId = (payload as { data?: { id?: string } } | undefined)?.data?.id;
      if (profileId) {
        startedProfileIds.push(profileId);
      }
      if (profileId === "profile-a") {
        return alphaResult.promise;
      }
      if (profileId === "profile-b") {
        return betaResult.promise;
      }
      if (profileId === "profile-c") {
        return gammaResult.promise;
      }
      return Promise.resolve(null);
    });

    render(
      <I18nProvider>
        <ProfilesPage workspace={orderedWorkspace} onWorkspaceChange={async () => {}} />
      </I18nProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "一键测试" }));
      await Promise.resolve();
    });

    expect(startedProfileIds).toEqual(["profile-a", "profile-c"]);
    expect(screen.getByRole("button", { name: "测试中..." })).toBeDisabled();

    await act(async () => {
      alphaResult.resolve({
        ok: true,
        responseText: "Alpha 测试成功",
        promptText: "请确认测试成功。",
        resolvedModel: "model-profile-a",
        durationMs: 51,
        rawResponse: JSON.stringify({ content: [{ type: "text", text: "Alpha 测试成功" }] }),
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startedProfileIds).toEqual(["profile-a", "profile-c", "profile-b"]);

    await act(async () => {
      betaResult.resolve({
        ok: true,
        responseText: "Beta 测试成功",
        promptText: "请确认测试成功。",
        resolvedModel: "model-profile-b",
        durationMs: 62,
        rawResponse: JSON.stringify({ content: [{ type: "text", text: "Beta 测试成功" }] }),
      });
      gammaResult.resolve({
        ok: true,
        responseText: "Gamma 测试成功",
        promptText: "请确认测试成功。",
        resolvedModel: "model-profile-c",
        durationMs: 73,
        rawResponse: JSON.stringify({ content: [{ type: "text", text: "Gamma 测试成功" }] }),
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "一键测试" })).toBeEnabled();
  });

  it("opens a failed batch test dialog when a profile test request rejects", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    invokeMock.mockImplementation((command: string) => {
      if (command === "test_profile_model") {
        return Promise.reject(new Error("模型测试请求失败：network down"));
      }
      return Promise.resolve(null);
    });

    renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "一键测试" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const card = screen.getByText("OpenRouter User").closest(".profile-card") as HTMLElement | null;
    expect(card).not.toBeNull();
    if (!card) {
      return;
    }

    fireEvent.click(within(card).getByRole("button", { name: "OpenRouter User 测试结果：失败" }));
    expect(screen.getByRole("dialog", { name: "模型测试结果" })).toBeInTheDocument();
    expect(screen.getByText("Error: 模型测试请求失败：network down")).toBeInTheDocument();
  });

  it("retests a rejected batch result with the default prompt when no prompt metadata exists", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    let modelTestCallCount = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "test_profile_model") {
        modelTestCallCount += 1;
        if (modelTestCallCount === 1) {
          return Promise.reject(new Error("模型测试请求失败：network down"));
        }
        return Promise.resolve({
          ok: true,
          responseText: "重新测试成功",
          promptText: "请用一句简短的话确认这次 API 测试请求成功。",
          resolvedModel: "claude-sonnet-4-6",
          durationMs: 88,
          rawResponse: JSON.stringify({ content: [{ type: "text", text: "重新测试成功" }] }),
        });
      }
      return Promise.resolve(null);
    });

    renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "一键测试" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const card = screen.getByText("OpenRouter User").closest(".profile-card") as HTMLElement | null;
    expect(card).not.toBeNull();
    if (!card) {
      return;
    }

    fireEvent.click(within(card).getByRole("button", { name: "OpenRouter User 测试结果：失败" }));
    const dialog = screen.getByRole("dialog", { name: "模型测试结果" });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "重新测试" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const modelTestPayloads = invokeMock.mock.calls
      .filter(([command]) => command === "test_profile_model")
      .map(([, payload]) => (payload as { data?: { promptText?: string } }).data);
    expect(modelTestPayloads).toHaveLength(2);
    expect(modelTestPayloads[1]).not.toHaveProperty("promptText");
  });

  it("retests the current profile from the model test result dialog", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    const retryResult = createDeferred<unknown>();
    let testCallCount = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command !== "test_profile_model") {
        return Promise.resolve(null);
      }
      testCallCount += 1;
      if (testCallCount === 1) {
        return Promise.resolve({
          ok: false,
          responseText: "",
          promptText: "请确认测试成功。",
          resolvedModel: "claude-sonnet-4-6",
          durationMs: 201,
          statusCode: 500,
          errorMessage: "模型测试失败（HTTP 500）：No choices in OpenAI response",
          requestMethod: "POST",
          requestUrl: "https://api-inference.modelscope.cn/v1/messages",
          requestHeaders: {
            "x-api-key": "token",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          requestBody: JSON.stringify(
            {
              model: "claude-sonnet-4-6",
              max_tokens: 2048,
              messages: [{ role: "user", content: "请确认测试成功。" }],
            },
            null,
            2,
          ),
          responseHeaders: {
            "content-type": "application/json",
            "x-request-id": "req_500",
          },
          rawResponse: '{"detail":"No choices in OpenAI response"}',
        });
      }
      return retryResult.promise;
    });

    renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "一键测试" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const card = screen.getByText("OpenRouter User").closest(".profile-card") as HTMLElement | null;
    expect(card).not.toBeNull();
    if (!card) {
      return;
    }

    fireEvent.click(within(card).getByRole("button", { name: "OpenRouter User 测试结果：失败" }));
    const dialog = screen.getByRole("dialog", { name: "模型测试结果" });
    expect(within(dialog).getByTestId("model-test-profile-name")).toHaveTextContent(
      "OpenRouter User",
    );
    expect(within(dialog).getByTestId("model-test-request-url")).toHaveTextContent(
      "https://api-inference.modelscope.cn/v1/messages",
    );
    expect(within(dialog).getByTestId("model-test-context")).toHaveClass(
      "profile-model-test-dialog-context--stacked",
    );
    expect(within(dialog).getByTestId("model-test-profile-row")).toHaveClass(
      "profile-model-test-dialog-context-item--inline",
    );
    expect(within(dialog).getByTestId("model-test-request-url-row")).toHaveClass(
      "profile-model-test-dialog-context-item--inline",
    );
    expect(within(dialog).getByTestId("model-test-content-grid")).toHaveClass(
      "profile-model-test-content-grid--stacked",
    );
    expect(within(dialog).getByTestId("model-test-prompt-panel")).toHaveClass(
      "profile-model-test-content-panel--primary",
    );
    expect(within(dialog).getByTestId("model-test-response-panel")).toHaveClass(
      "profile-model-test-content-panel--primary",
    );
    expect(within(dialog).getByTestId("model-test-exchange-details")).toBeInTheDocument();
    expect(within(dialog).getByText(/No choices in OpenAI response/)).toBeInTheDocument();
    expect(within(dialog).getByText("请求 Headers")).toBeInTheDocument();
    expect(within(dialog).queryByTestId("model-test-request-headers-code")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "查看请求 Headers" }));
    expect(within(dialog).getByTestId("model-test-request-headers-code").textContent).toContain(
      '"x-api-key": "token"',
    );
    expect(within(dialog).getByText("请求体")).toBeInTheDocument();
    expect(within(dialog).queryByTestId("model-test-request-body-code")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "查看请求体" }));
    expect(within(dialog).getByTestId("model-test-request-body-code").textContent).toContain(
      '"content": "请确认测试成功。"',
    );
    expect(within(dialog).getByText("响应 Headers")).toBeInTheDocument();
    expect(
      within(dialog).queryByTestId("model-test-response-headers-code"),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "查看响应 Headers" }));
    expect(within(dialog).getByTestId("model-test-response-headers-code").textContent).toContain(
      '"x-request-id": "req_500"',
    );
    expect(within(dialog).getByText("响应体")).toBeInTheDocument();
    const retestButton = within(dialog).getByRole("button", { name: "重新测试" });
    expect(retestButton.querySelector("svg")).not.toBeNull();
    expect(within(dialog).queryByLabelText("输入提示词")).not.toBeInTheDocument();
    expect(within(dialog).getByText("请确认测试成功。")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "编辑提示词" }));
    const promptInput = within(dialog).getByLabelText("输入提示词") as HTMLTextAreaElement;
    fireEvent.change(promptInput, { target: { value: "   " } });
    expect(within(dialog).getByRole("button", { name: "发起请求" })).toBeDisabled();
    fireEvent.change(promptInput, { target: { value: "请只回复 OK" } });
    expect(within(dialog).getByRole("button", { name: "发起请求" })).toBeEnabled();
    expect(within(dialog).getByTestId("model-test-request-body-code").textContent).toContain(
      '"content": "请只回复 OK"',
    );

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "复制请求 cURL" }));
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("curl -X POST 'https://api-inference.modelscope.cn/v1/messages'"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("-H 'x-api-key: token'"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('"content": "请只回复 OK"'),
    );

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "发起请求" }));
      await Promise.resolve();
    });

    expect(within(dialog).queryByLabelText("输入提示词")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "测试中..." })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "测试中..." })).toHaveClass("is-testing");
    expect(within(dialog).getByRole("button", { name: "编辑提示词" })).toBeDisabled();
    const progressIndicator = within(dialog).getByTestId("model-test-progress-indicator");
    expect(progressIndicator).toHaveAttribute("role", "status");
    expect(progressIndicator).toHaveTextContent("测试中...");
    const modelTestCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "test_profile_model",
    );
    expect(modelTestCalls).toHaveLength(2);
    expect(
      modelTestCalls.map(
        ([, payload]) =>
          (payload as { data?: { id?: string; name?: string; promptText?: string } }).data,
      ),
    ).toEqual([
      expect.objectContaining({ id: "user-openrouter", name: "OpenRouter User" }),
      expect.objectContaining({
        id: "user-openrouter",
        name: "OpenRouter User",
        promptText: "请只回复 OK",
      }),
    ]);

    await act(async () => {
      retryResult.resolve({
        ok: true,
        responseText: "重新测试成功",
        promptText: "请只回复 OK",
        resolvedModel: "claude-sonnet-4-6",
        durationMs: 88,
        requestMethod: "POST",
        requestUrl: "https://api-inference.modelscope.cn/v1/messages",
        requestHeaders: {
          "x-api-key": "token",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        requestBody: JSON.stringify(
          {
            model: "claude-sonnet-4-6",
            max_tokens: 2048,
            messages: [{ role: "user", content: "请只回复 OK" }],
          },
          null,
          2,
        ),
        responseHeaders: { "content-type": "application/json" },
        rawResponse: JSON.stringify({ content: [{ type: "text", text: "重新测试成功" }] }),
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(within(dialog).getByText("重新测试成功")).toBeInTheDocument();
    expect(within(dialog).getByText("88 ms")).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "OpenRouter User 测试结果：88 ms" }),
    ).toBeInTheDocument();
  });

  it("reveals card actions only on hover or focus within", () => {
    const css = readFileSync(`${process.cwd()}/src/components/ProfilesPage.css`, "utf8");

    expect(css).toContain("max-height: 0;");
    expect(css).toContain("opacity: 0;");
    expect(css).toContain("pointer-events: none;");
    expect(css).toMatch(
      /\.profile-card:hover \.profile-card-actions,\s*\.profile-card:focus-within \.profile-card-actions \{/,
    );
    expect(css).toContain("pointer-events: auto;");
  });

  it("uses a longer high-contrast drop indicator for drag reordering", () => {
    const css = readFileSync(`${process.cwd()}/src/components/ProfilesPage.css`, "utf8");

    expect(css).toContain("--profile-drop-indicator-color: var(--accent-green);");
    expect(css).toContain("--profile-drop-indicator-bleed: calc(var(--space-3) * -1);");
    expect(css).toContain("left: var(--profile-drop-indicator-bleed);");
    expect(css).toContain("right: var(--profile-drop-indicator-bleed);");
    expect(css).toContain("height: 4px;");
    expect(css).toMatch(/radial-gradient\(\s*circle at left center,/);
  });

  it("keeps inline test result badges compact beside model names", () => {
    const css = readFileSync(`${process.cwd()}/src/components/ProfilesPage.css`, "utf8");

    expect(css).toMatch(/\.profile-test-result-badge\s*\{[^}]*min-height:\s*18px;/s);
    expect(css).toMatch(/\.profile-test-result-badge\s*\{[^}]*padding:\s*1px\s+5px;/s);
    expect(css).toMatch(/\.profile-test-result-badge\s*\{[^}]*font-size:\s*11px;/s);
    expect(css).toMatch(/\.profile-test-result-badge\s*\{[^}]*line-height:\s*1\.15;/s);
  });

  it("keeps preset badges visually quieter below profile names", () => {
    const css = readFileSync(`${process.cwd()}/src/components/ProfilesPage.css`, "utf8");

    expect(css).toMatch(/\.profile-preset-badge\s*\{[^}]*font-size:\s*10px;/s);
  });

  it("opens the profile editor when clicking the card body", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );

    renderPage();

    const card = screen.getByText("OpenRouter User").closest(".profile-card") as HTMLElement | null;
    expect(card).not.toBeNull();
    if (!card) {
      return;
    }

    await act(async () => {
      fireEvent.click(card);
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "编辑配置" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("OpenRouter User")).toBeInTheDocument();
  });

  it("renders profile cards in workspace order without re-sorting them", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );

    const orderedWorkspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [makeProfile("profile-b", "Beta"), makeProfile("profile-a", "Alpha")],
      bindings: {
        userProfileId: undefined,
      },
    } as ConfigWorkspace;

    render(
      <I18nProvider>
        <ProfilesPage workspace={orderedWorkspace} onWorkspaceChange={async () => {}} />
      </I18nProvider>,
    );

    const cardTitles = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
    expect(cardTitles).toEqual(["Beta", "Alpha"]);
  });

  it("copies resolved env exports from the card actions", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "preview_profile") {
        return JSON.stringify({
          env: {
            ANTHROPIC_AUTH_TOKEN: "token",
            ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
          },
          model: "claude-sonnet-4-6",
          effortLevel: "high",
        });
      }
      return null;
    });

    renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "复制环境变量" }));
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith(
      "preview_profile",
      expect.objectContaining({
        data: expect.objectContaining({
          id: "user-openrouter",
          name: "OpenRouter User",
        }),
      }),
    );
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        [
          'export ANTHROPIC_AUTH_TOKEN="token"',
          'export ANTHROPIC_BASE_URL="https://openrouter.ai/api"',
          'export ANTHROPIC_MODEL="claude-sonnet-4-6"',
          'export CLAUDE_CODE_EFFORT_LEVEL="high"',
        ].join("\n"),
      );
    });
  });

  it("duplicates a profile directly from the card without opening the editor", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    const onWorkspaceChange = vi.fn(async () => {});

    render(
      <I18nProvider>
        <ProfilesPage workspace={WORKSPACE_FIXTURE} onWorkspaceChange={onWorkspaceChange} />
      </I18nProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "复制" }));
      await Promise.resolve();
    });

    expect(screen.queryByRole("heading", { name: "新建配置" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("名称")).not.toBeInTheDocument();

    expect(invokeMock).toHaveBeenCalledWith("duplicate_profile", {
      id: "user-openrouter",
      nameSuffix: " 副本",
    });
    expect(onWorkspaceChange).toHaveBeenCalledTimes(1);
    expect(showToastMock).toHaveBeenCalledWith("配置已复制");
  });

  it("keeps the list page state unchanged when duplicate fails", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    const onWorkspaceChange = vi.fn(async () => {});
    invokeMock.mockRejectedValueOnce(new Error("duplicate failed"));

    render(
      <I18nProvider>
        <ProfilesPage workspace={WORKSPACE_FIXTURE} onWorkspaceChange={onWorkspaceChange} />
      </I18nProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "复制" }));
      await Promise.resolve();
    });

    expect(screen.queryByRole("heading", { name: "新建配置" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("名称")).not.toBeInTheDocument();
    expect(onWorkspaceChange).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith("复制配置失败", "error");
  });

  it("persists drag reordering for profile cards", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    const onWorkspaceChange = vi.fn(async () => {});
    const orderedWorkspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [makeProfile("profile-a", "Alpha"), makeProfile("profile-b", "Beta")],
      bindings: {
        userProfileId: undefined,
      },
    } as ConfigWorkspace;

    render(
      <I18nProvider>
        <ProfilesPage workspace={orderedWorkspace} onWorkspaceChange={onWorkspaceChange} />
      </I18nProvider>,
    );

    const firstCard = screen.getByText("Alpha").closest(".profile-card") as HTMLElement | null;
    const secondCard = screen.getByText("Beta").closest(".profile-card") as HTMLElement | null;
    expect(firstCard).not.toBeNull();
    expect(secondCard).not.toBeNull();
    if (!firstCard || !secondCard) {
      return;
    }

    Object.defineProperty(secondCard, "getBoundingClientRect", {
      value: () => ({
        top: 100,
        height: 80,
        left: 0,
        right: 200,
        bottom: 180,
        width: 200,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      }),
      configurable: true,
    });

    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      setData: vi.fn(),
      getData: vi.fn(),
    } as unknown as DataTransfer;

    await act(async () => {
      fireEvent.dragStart(firstCard, { dataTransfer });
      fireEvent.dragOver(secondCard, { clientY: 170, dataTransfer });
      fireEvent.drop(secondCard, { clientY: 170, dataTransfer });
      fireEvent.dragEnd(firstCard, { dataTransfer });
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith("reorder_profiles", {
      ids: ["profile-b", "profile-a"],
    });
    expect(onWorkspaceChange).toHaveBeenCalledTimes(1);
  });
});
