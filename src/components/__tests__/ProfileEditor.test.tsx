import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ConfigProfile, ConfigWorkspace, Provider } from "../../types";
import ProfileEditor from "../ProfileEditor";
import {
  MOJIBAKE_POST_TOOL_USE_COMMAND,
  MOJIBAKE_PRE_TOOL_USE_COMMAND,
} from "../profile-editor/hook-presets";
import {
  OFFICIAL_MARKETPLACE_ID,
  OFFICIAL_MARKETPLACE_REPO,
} from "../profile-editor/marketplace-presets";
import { ThemeProvider } from "../theme-provider";

const { invokeMock, showToastMock, fetchMock, openDialogMock, openUrlMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  showToastMock: vi.fn(),
  fetchMock: vi.fn(),
  openDialogMock: vi.fn(),
  openUrlMock: vi.fn(async (_url: string) => null),
}));
const SETTINGS_STORAGE_KEY = "ai-manager-settings";
const originalFetch = globalThis.fetch;
const originalIntersectionObserver = globalThis.IntersectionObserver;

Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openDialogMock(...args),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (url: string) => openUrlMock(url),
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
    actions,
  }: {
    content: string;
    onChange?: (value: string) => void;
    jsonError?: string;
    actions?: ReactNode;
  }) => (
    <div>
      {actions}
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

vi.mock("../profile-editor/ModelTestResultDialog", () => {
  type ModelTestDialogResult = {
    ok?: boolean;
    responseText?: string;
    promptText?: string;
    resolvedModel?: string;
    providerModel?: string;
    durationMs?: number;
    statusCode?: number;
    errorMessage?: string;
    requestId?: string;
    stopReason?: string;
    requestUrl?: string;
    requestHeaders?: Record<string, string>;
    requestBody?: string;
    responseHeaders?: Record<string, string>;
    rawResponse?: string;
  };

  type MockModelTestResultDialogProps = {
    isOpen: boolean;
    result: ModelTestDialogResult | null;
    profileName?: string;
    errorMessage: string;
    rawResponseExpanded: boolean;
    onClose: () => void;
    onToggleRawResponse: () => void;
    onRetest?: (promptText?: string) => void;
    isRetesting?: boolean;
  };

  function formatJson(value: unknown) {
    return JSON.stringify(value ?? {}, null, 2);
  }

  function formatRawResponse(rawResponse: string) {
    try {
      return JSON.stringify(JSON.parse(rawResponse), null, 2);
    } catch {
      return rawResponse;
    }
  }

  function MockModelTestResultDialog({
    isOpen,
    result,
    profileName,
    errorMessage,
    rawResponseExpanded,
    onClose,
    onToggleRawResponse,
    onRetest,
    isRetesting = false,
  }: MockModelTestResultDialogProps) {
    const isSuccess = result?.ok === true && !errorMessage;
    const summaryText = errorMessage || result?.errorMessage || result?.responseText || "";

    if (!isOpen) {
      return null;
    }

    return (
      <div role="dialog" aria-labelledby="mock-model-test-title">
        <h2 id="mock-model-test-title">模型测试结果</h2>
        <span
          data-testid="model-test-status-badge"
          className={isSuccess ? "bg-success" : "bg-destructive"}
        >
          {isSuccess ? "测试成功" : "测试失败"}
        </span>
        <div data-testid="model-test-context">
          <span data-testid="model-test-profile-row">{profileName}</span>
          <span data-testid="model-test-request-url-row">{result?.requestUrl}</span>
        </div>
        <div data-testid="model-test-profile-name">{profileName}</div>
        <div data-testid="model-test-request-url">{result?.requestUrl}</div>
        <div data-testid="model-test-meta-list" className="grid gap-2">
          {result?.resolvedModel ? <span>{result.resolvedModel}</span> : null}
          {result?.providerModel ? <span>{result.providerModel}</span> : null}
          {typeof result?.statusCode === "number" ? <span>{result.statusCode}</span> : null}
          {typeof result?.durationMs === "number" ? <span>{result.durationMs} ms</span> : null}
          {result?.requestId ? <span>{result.requestId}</span> : null}
          {result?.stopReason ? <span>{result.stopReason}</span> : null}
        </div>
        <div data-testid="model-test-content-grid" className="grid gap-3">
          <div data-testid="model-test-prompt-panel" className="p-3">
            {result?.promptText ? <p>{result.promptText}</p> : null}
          </div>
          <div data-testid="model-test-response-panel" className="border-chart-2">
            {summaryText ? <p>{summaryText}</p> : null}
          </div>
        </div>
        <div data-testid="model-test-exchange-details">
          {result?.requestHeaders ? (
            <>
              <button type="button">查看请求 Headers</button>
              <pre data-testid="model-test-request-headers-code">
                {formatJson(result.requestHeaders)}
              </pre>
            </>
          ) : null}
          {result?.requestBody ? (
            <>
              <button type="button">查看请求体</button>
              <pre data-testid="model-test-request-body-code">{result.requestBody}</pre>
            </>
          ) : null}
          {result?.responseHeaders ? (
            <>
              <button type="button">查看响应 Headers</button>
              <pre data-testid="model-test-response-headers-code">
                {formatJson(result.responseHeaders)}
              </pre>
            </>
          ) : null}
          {result?.rawResponse ? (
            <>
              <button type="button" onClick={onToggleRawResponse}>
                {rawResponseExpanded ? "隐藏响应体" : "查看响应体"}
              </button>
              {rawResponseExpanded ? (
                <pre data-testid="model-test-raw-response-code">
                  {formatRawResponse(result.rawResponse)}
                </pre>
              ) : null}
            </>
          ) : null}
        </div>
        {onRetest ? (
          <button type="button" disabled={isRetesting} onClick={() => onRetest()}>
            重新测试
          </button>
        ) : null}
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </div>
    );
  }

  return { default: MockModelTestResultDialog };
});

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
    trayTitleMaxChars: null,
    sessionTrayCountStyle: "superscriptCompact",
    trayPulseWaiting: true,
    focusSessionShortcut: "Command+Control+J",
    floatingWidgetEnabled: false,
    floatingWidgetMetrics: ["cost", "totalTokens", "cacheHitRate"],
    floatingWidgetOpacity: 92,
  },
  builtinProviders: [],
  profiles: [],
  bindings: {},
} as ConfigWorkspace;

// 段 B：Provider 不再有 settingsPatch/basePresetId，只有 env 扁平字典
const BUILTIN_PRESETS: Provider[] = [
  {
    id: "builtin:openrouter",
    name: "OpenRouter",
    localizedName: {
      zh: "开放路由",
      en: "OpenRouter",
    },
    description: "OpenRouter 预设",
    models: [{ id: "claude-opus-4-1" }, { id: "claude-sonnet-4-6" }, { id: "claude-haiku-4-5" }],
    modelSuggestions: ["claude-sonnet-4-6", "claude-opus-4-1"],
    docUrl: "https://openrouter.ai/docs",
    env: {
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      ANTHROPIC_MODEL: "claude-sonnet-4-6",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-1",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-6",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5",
    },
  },
  {
    id: "custom:team-plan",
    name: "Team Plan",
    localizedName: {
      zh: "团队计划",
      en: "Team Plan",
    },
    description: "Team Plan 预设",
    modelSuggestions: ["claude-haiku-fallback"],
    env: {},
  },
  {
    id: "custom:explicit-model",
    name: "Explicit Model",
    localizedName: {
      zh: "显式模型",
      en: "Explicit Model",
    },
    description: "显式模型预设",
    modelSuggestions: ["claude-sonnet-4-6"],
    env: {
      ANTHROPIC_MODEL: "claude-opus-explicit",
    },
  },
  {
    id: "custom:env-level-overrides",
    name: "Env Level Overrides",
    localizedName: {
      zh: "环境变量级别覆盖",
      en: "Env Level Overrides",
    },
    description: "环境变量级别覆盖预设",
    modelSuggestions: ["claude-sonnet-4-6"],
    env: {
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "haiku-env-override",
      CLAUDE_CODE_SUBAGENT_MODEL: "subagent-env-override",
    },
  },
];

const PROFILE_FIXTURE: ConfigProfile = {
  id: "user-openrouter",
  name: "OpenRouter User",
  description: "默认用户配置",
  providerId: "builtin:openrouter",
  settings: {
    env: {
      ANTHROPIC_AUTH_TOKEN: "token",
    },
  },
  createdAt: "2026-04-18T12:00:00Z",
  updatedAt: "2026-04-18T12:00:00Z",
};

function renderEditor(options?: {
  profile?: ConfigProfile | null;
  providers?: Provider[];
  onSave?: (data: {
    id?: string;
    name: string;
    description: string;
    providerId?: string;
    settings: Record<string, unknown>;
  }) => boolean | Promise<boolean>;
}) {
  const profile = options && "profile" in options ? (options.profile ?? null) : PROFILE_FIXTURE;
  const onSave =
    options?.onSave ??
    vi.fn<
      (data: {
        id?: string;
        name: string;
        description: string;
        providerId?: string;
        settings: Record<string, unknown>;
      }) => boolean | Promise<boolean>
    >(() => true);
  render(
    <I18nProvider>
      <ThemeProvider>
        <ProfileEditor
          profile={profile}
          providers={options?.providers ?? BUILTIN_PRESETS}
          onSave={onSave}
          onClose={() => {}}
        />
      </ThemeProvider>
    </I18nProvider>,
  );
  return { onSave };
}

function getSection(name: string): HTMLElement {
  const section = screen.getByRole("heading", { name, level: 3 }).closest("section");
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

async function findModelTestDialog(): Promise<HTMLElement> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog?.textContent?.includes("模型测试结果")) {
      return dialog;
    }
    await Promise.resolve();
  }
  throw new Error("模型测试结果弹窗未渲染");
}

function expectAccordionHeaderMeta(section: HTMLElement, text: string) {
  expect(within(section).getByText(text)).toBeInTheDocument();
}

function getFieldForLabel(label: string | RegExp): HTMLElement {
  const field = screen.getByLabelText(label).closest('[data-slot="settings-field"]');
  expect(field).not.toBeNull();
  return field as HTMLElement;
}

function getSectionModeRow(section: HTMLElement, label: string): HTMLElement {
  const modeRow = within(section)
    .getByRole("tablist", { name: new RegExp(label) })
    .closest('[data-slot="settings-section-mode-row"]');
  expect(modeRow).not.toBeNull();
  return modeRow as HTMLElement;
}

function chooseComboboxOption(label: string | RegExp, optionName: string | RegExp) {
  const combobox = screen.getByRole("combobox", { name: label });
  act(() => {
    fireEvent.pointerDown(combobox, { button: 0, ctrlKey: false, pointerType: "mouse" });
  });
  const option = screen.getByRole("option", { name: optionName });
  act(() => {
    fireEvent.click(option);
  });
}

function comboboxOptionNames(label: string | RegExp): string[] {
  const combobox = screen.getByRole("combobox", { name: label });
  act(() => {
    fireEvent.pointerDown(combobox, { button: 0, ctrlKey: false, pointerType: "mouse" });
  });
  const names = screen.getAllByRole("option").map((option) => option.textContent ?? "");
  act(() => {
    fireEvent.keyDown(combobox, { key: "Escape" });
  });
  return names;
}

function toggleAccordionSection(name: string) {
  const section = getSection(name);
  const [toggleButton] = within(section).getAllByRole("button");
  fireEvent.click(toggleButton);
  return section;
}

function switchSectionToJson(name: string, options?: { expandFirst?: boolean }) {
  const section = getSection(name);
  if (options?.expandFirst || !within(section).queryByRole("button", { name: "JSON" })) {
    toggleAccordionSection(name);
  }
  fireEvent.click(within(section).getByRole("button", { name: "JSON" }));
  expect(within(section).getAllByLabelText("config-preview-input")).toHaveLength(1);
  expect(within(section).queryByTestId("config-preview-output")).not.toBeInTheDocument();
  return section;
}

function switchDocumentSectionToEdit(name: string, editButtonName: string): HTMLTextAreaElement {
  const section = getSection(name);
  fireEvent.click(within(section).getByRole("button", { name: editButtonName }));
  return within(section).getByLabelText("config-preview-input") as HTMLTextAreaElement;
}

async function flushProfilePreviewDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushAsyncUpdates() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ProfileEditor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    Object.defineProperty(globalThis.navigator, "languages", {
      value: ["zh-CN"],
      configurable: true,
    });
    Object.defineProperty(globalThis.navigator, "language", {
      value: "zh-CN",
      configurable: true,
    });
    invokeMock.mockReset();
    showToastMock.mockReset();
    fetchMock.mockReset();
    openDialogMock.mockReset();
    openUrlMock.mockClear();
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      if (command === "get_config_workspace") {
        return WORKSPACE_FIXTURE;
      }
      if (command === "preview_profile") {
        const settings =
          (payload as { data?: { settings?: Record<string, unknown> } } | undefined)?.data
            ?.settings ?? {};
        return JSON.stringify(
          {
            $schema: "https://json.schemastore.org/claude-code-settings.json",
            ...settings,
          },
          null,
          2,
        );
      }
      return null;
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn(async () => undefined),
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, "fetch", {
      value: fetchMock,
      configurable: true,
      writable: true,
    });
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();
    Object.defineProperty(globalThis, "fetch", {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: originalIntersectionObserver,
    });
  });

  it("renders control-first sections with unified mode switches and document editor entry", async () => {
    renderEditor();

    const topBadge = screen.getByText("O").closest('[data-slot="profile-name-badge"]');
    expect(topBadge).not.toBeNull();
    expect(topBadge).toHaveTextContent("O");
    const initialColorIndex = topBadge?.getAttribute("data-color-index");
    expect(initialColorIndex).toBeTruthy();

    expect(screen.queryByLabelText("降低动画")).not.toBeInTheDocument();

    for (const heading of [
      "基础信息",
      "认证",
      "模型与行为",
      "常用选项",
      "环境变量",
      "权限",
      "Sandbox",
      "Hooks",
      "插件市场",
      "插件",
      "状态行",
    ]) {
      expect(screen.getByRole("heading", { name: heading, level: 3 })).toBeInTheDocument();
    }
    expect(screen.queryByRole("heading", { name: "集成", level: 3 })).not.toBeInTheDocument();

    const topLevelSectionHeadings = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(topLevelSectionHeadings).toEqual([
      "基础信息",
      "认证",
      "模型与行为",
      "常用选项",
      "环境变量",
      "权限",
      "Sandbox",
      "Hooks",
      "插件市场",
      "插件",
      "状态行",
      "最终配置",
    ]);

    const documentSection = getSection("最终配置");
    expect(within(documentSection).getByRole("button", { name: "预览" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(documentSection).getByRole("button", { name: "编辑源 JSON" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "整份配置 JSON" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("env")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "常用选项", level: 3 }).closest("button"),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("heading", { name: "权限", level: 3 }).closest("button"),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("heading", { name: "模型与行为", level: 3 })).toHaveClass("text-base");

    const authSection = screen.getByRole("heading", { name: "认证", level: 3 }).closest("section");
    const basicSection = screen
      .getByRole("heading", { name: "基础信息", level: 3 })
      .closest("section");
    expect(basicSection).not.toBeNull();
    expect(authSection).not.toBeNull();
    if (authSection) {
      expect(within(authSection).getByRole("heading", { name: "认证", level: 3 })).toHaveClass(
        "text-base",
      );
      expect(within(authSection).getByLabelText("供应商")).toHaveClass("text-sm");
      expect(within(authSection).getByLabelText("供应商")).toBeInTheDocument();
      expect(within(authSection).getByLabelText("ANTHROPIC_AUTH_TOKEN")).toHaveValue("token");
      // 地址只读：显示所选供应商（builtin:openrouter）的 env.ANTHROPIC_BASE_URL
      expect(within(authSection).getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue(
        "https://openrouter.ai/api",
      );
    }
    if (basicSection) {
      expect(within(basicSection).getByRole("heading", { name: "基础信息", level: 3 })).toHaveClass(
        "text-base",
      );
      expect(within(basicSection).queryByLabelText("供应商")).not.toBeInTheDocument();
      expect(within(basicSection).getByText("必填")).toBeInTheDocument();
    }

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/名称/), {
        target: { value: "beta profile" },
      });
      await Promise.resolve();
    });
    expect(topBadge).toHaveTextContent("B");
    expect(topBadge?.getAttribute("data-color-index")).not.toBe(initialColorIndex);

    const sandboxSection = screen.getByRole("heading", { name: "Sandbox" }).closest("section");
    expect(sandboxSection).not.toBeNull();
    if (sandboxSection) {
      expect(
        within(sandboxSection).queryByRole("button", { name: "控件" }),
      ).not.toBeInTheDocument();
      expect(
        within(sandboxSection).queryByRole("button", { name: "JSON" }),
      ).not.toBeInTheDocument();
      expect(
        within(sandboxSection).getByRole("switch", { name: "Sandbox 头部开关" }),
      ).toHaveAttribute("aria-checked", "false");
      expect(within(sandboxSection).getByText("沙盒开关")).toBeInTheDocument();
      expect(within(sandboxSection).getByText("已关闭 · 无附加配置")).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(within(sandboxSection).getByRole("switch", { name: "Sandbox 头部开关" }));
        await Promise.resolve();
      });
      expect(within(sandboxSection).getByText("已启用 · 无附加配置")).toBeInTheDocument();
      expect(
        within(sandboxSection).queryByRole("button", { name: "控件" }),
      ).not.toBeInTheDocument();
    }

    expect(screen.queryByRole("button", { name: "新增 Hook 事件" })).not.toBeInTheDocument();

    const hooksSection = screen.getByRole("heading", { name: "Hooks" }).closest("section");
    expect(hooksSection).not.toBeNull();
    if (hooksSection) {
      expectAccordionHeaderMeta(hooksSection, "0");
      expect(within(hooksSection).queryByRole("button", { name: "控件" })).not.toBeInTheDocument();
      expect(within(hooksSection).queryByRole("button", { name: "JSON" })).not.toBeInTheDocument();
      expect(within(hooksSection).queryByText("暂无 Hooks 配置。")).not.toBeInTheDocument();
      expect(within(hooksSection).queryByLabelText("config-preview-input")).not.toBeInTheDocument();
    }

    const behaviorSection = screen.getByRole("heading", { name: "模型与行为" }).closest("section");
    const commonSection = screen.getByRole("heading", { name: "常用选项" }).closest("section");
    expect(behaviorSection).not.toBeNull();
    expect(commonSection).not.toBeNull();
    if (behaviorSection) {
      expect(within(behaviorSection).getByRole("button", { name: "控件" })).toBeInTheDocument();
      expect(within(behaviorSection).getByRole("button", { name: "JSON" })).toBeInTheDocument();
      const outputStyleSelect = within(behaviorSection).getByRole("combobox", {
        name: "输出风格",
      }) as HTMLSelectElement;
      expect(outputStyleSelect).toBeInTheDocument();
      expect(outputStyleSelect).toHaveValue("");
      expect(comboboxOptionNames("输出风格")).toEqual([
        "未设置",
        "default",
        "Explanatory",
        "Learning",
      ]);
      expect(within(behaviorSection).queryByText("默认启用深度思考")).not.toBeInTheDocument();
      expect(within(behaviorSection).queryByText("尊重 .gitignore")).not.toBeInTheDocument();
      expect(within(behaviorSection).queryByText("跳过 WebFetch 预检")).not.toBeInTheDocument();
    }
    if (commonSection) {
      expect(within(commonSection).getByRole("button", { name: "展开 常用选项" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(within(commonSection).getByText("已启用 0/15")).toBeInTheDocument();
      expect(within(commonSection).queryByRole("button", { name: "控件" })).not.toBeInTheDocument();
      expect(within(commonSection).queryByRole("button", { name: "JSON" })).not.toBeInTheDocument();

      const commonHeader = within(commonSection)
        .getByText("已启用 0/15")
        .closest('[data-slot="settings-section-header"]');
      expect(commonHeader).toHaveClass("cursor-pointer");
      fireEvent.click(commonHeader as HTMLElement);
      expect(within(commonSection).getByRole("button", { name: "控件" })).toBeInTheDocument();
      expect(within(commonSection).getByRole("button", { name: "JSON" })).toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "输出风格" })).not.toBeInTheDocument();
      expect(
        within(commonSection).queryByRole("combobox", { name: "输出风格" }),
      ).not.toBeInTheDocument();
      expect(within(commonSection).getAllByRole("switch")).toHaveLength(15);
      expect(within(commonSection).getByText("默认启用深度思考")).toBeInTheDocument();
      expect(within(commonSection).getByText("显示 Thinking 摘要")).toBeInTheDocument();
      expect(within(commonSection).getByText("接受计划时显示清理上下文")).toBeInTheDocument();
      expect(within(commonSection).getByText("禁用所有 Hooks")).toBeInTheDocument();
      expect(within(commonSection).getByText("禁用 AI 署名")).toBeInTheDocument();
      expect(within(commonSection).getByText("已完成引导设置")).toBeInTheDocument();
      expect(within(commonSection).getByText("禁用自动更新")).toBeInTheDocument();
      expect(within(commonSection).getByText("尊重 .gitignore")).toBeInTheDocument();
      expect(within(commonSection).getByText("启用 LSP 工具")).toBeInTheDocument();
      expect(within(commonSection).getByText("显式启用 Tool Search")).toBeInTheDocument();
      expect(within(commonSection).getByText("启用新版 Init")).toBeInTheDocument();
      expect(within(commonSection).getByText("启用无闪烁模式")).toBeInTheDocument();
    }

    const permissionsSection = screen.getByRole("heading", { name: "权限" }).closest("section");
    expect(permissionsSection).not.toBeNull();
    if (permissionsSection) {
      const permissionModeSelect = within(permissionsSection).getByLabelText(
        "权限头部默认模式",
      ) as HTMLSelectElement;
      expect(permissionModeSelect).toHaveValue("");
      expect(comboboxOptionNames("权限头部默认模式")).toEqual([
        "未设置",
        "default",
        "acceptEdits",
        "plan",
        "dontAsk",
        "bypassPermissions",
        "auto",
      ]);
      expect(
        within(permissionsSection).queryByRole("button", { name: "控件" }),
      ).not.toBeInTheDocument();
      expect(
        within(permissionsSection).queryByRole("button", { name: "JSON" }),
      ).not.toBeInTheDocument();
    }

    const envSection = screen
      .getByRole("heading", { name: "环境变量", level: 3 })
      .closest("section");
    expect(envSection).not.toBeNull();
    if (envSection) {
      expectAccordionHeaderMeta(envSection, "0");
      expect(within(envSection).queryByRole("button", { name: "控件" })).not.toBeInTheDocument();
      expect(within(envSection).queryByRole("button", { name: "JSON" })).not.toBeInTheDocument();
      expect(
        within(envSection).queryByDisplayValue("ANTHROPIC_AUTH_TOKEN"),
      ).not.toBeInTheDocument();

      toggleAccordionSection("环境变量");

      expect(within(envSection).getByRole("button", { name: "控件" })).toBeInTheDocument();
      expect(within(envSection).getByRole("button", { name: "JSON" })).toBeInTheDocument();
      expect(
        within(envSection).queryByRole("button", {
          name: "编辑环境变量 CLAUDE_CODE_EFFORT_LEVEL",
        }),
      ).not.toBeInTheDocument();
      expect(within(envSection).queryByLabelText("环境变量名称")).not.toBeInTheDocument();
      expect(within(envSection).queryByLabelText("环境变量值")).not.toBeInTheDocument();
    }

    const marketplacesSection = screen
      .getByRole("heading", { name: "插件市场", level: 3 })
      .closest("section");
    expect(marketplacesSection).not.toBeNull();
    if (marketplacesSection) {
      expectAccordionHeaderMeta(marketplacesSection, "0");
      expect(
        within(marketplacesSection).queryByRole("button", { name: "新增 Marketplace" }),
      ).not.toBeInTheDocument();
      expect(
        within(marketplacesSection).queryByRole("button", { name: "JSON" }),
      ).not.toBeInTheDocument();

      toggleAccordionSection("插件市场");

      expect(within(marketplacesSection).getByRole("button", { name: "控件" })).toBeInTheDocument();
      expect(within(marketplacesSection).getByRole("button", { name: "JSON" })).toBeInTheDocument();
      expect(
        within(marketplacesSection).getByRole("button", { name: "新增 Marketplace" }),
      ).toBeInTheDocument();
      expect(
        within(marketplacesSection).queryByLabelText("Marketplace ID"),
      ).not.toBeInTheDocument();
      expect(
        within(marketplacesSection).queryByLabelText("config-preview-input"),
      ).not.toBeInTheDocument();
    }

    const pluginsSection = screen
      .getByRole("heading", { name: "插件", level: 3 })
      .closest("section");
    expect(pluginsSection).not.toBeNull();
    if (pluginsSection) {
      expect(within(pluginsSection).getByText("已启用 0/0")).toBeInTheDocument();
      expect(
        within(pluginsSection).queryByRole("button", { name: "新增插件" }),
      ).not.toBeInTheDocument();
      expect(
        within(pluginsSection).queryByRole("button", { name: "JSON" }),
      ).not.toBeInTheDocument();

      toggleAccordionSection("插件");

      expect(within(pluginsSection).getByRole("button", { name: "控件" })).toBeInTheDocument();
      expect(within(pluginsSection).getByRole("button", { name: "JSON" })).toBeInTheDocument();
      expect(
        within(pluginsSection).getByRole("button", { name: "去浏览市场安装插件" }),
      ).toBeInTheDocument();
      expect(within(pluginsSection).queryByLabelText("新插件 ID")).not.toBeInTheDocument();
      expect(within(pluginsSection).queryByText("插件模式")).not.toBeInTheDocument();
      expect(
        within(pluginsSection).queryByLabelText("config-preview-input"),
      ).not.toBeInTheDocument();

      expect(
        within(marketplacesSection as HTMLElement).queryByRole("button", { name: "控件" }),
      ).not.toBeInTheDocument();

      expect(
        within(envSection as HTMLElement).getByRole("button", { name: "控件" }),
      ).toBeInTheDocument();
    }
  });

  it("renders status line settings with the chinese section title", () => {
    renderEditor();

    expect(screen.getByRole("heading", { name: "状态行", level: 3 })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Status Line", level: 3 }),
    ).not.toBeInTheDocument();
  });

  it("opens localized official docs from structured settings sections", () => {
    renderEditor();

    const behaviorDocsButton = screen.getByRole("button", { name: "查看 模型与行为 官方文档" });
    expect(behaviorDocsButton).toBeInTheDocument();
    expect(behaviorDocsButton).toHaveTextContent("官方文档");

    const docsSections = [
      { section: "环境变量", button: "查看 环境变量 官方文档" },
      { section: "权限", button: "查看 权限 官方文档" },
      { section: "Sandbox", button: "查看 Sandbox 官方文档" },
      { section: "Hooks", button: "查看 Hooks 官方文档" },
      { section: "插件市场", button: "查看 插件市场 官方文档" },
      { section: "插件", button: "查看 插件 官方文档" },
      { section: "状态行", button: "查看 状态行 官方文档" },
    ];

    for (const { button } of docsSections) {
      expect(screen.queryByRole("button", { name: button })).not.toBeInTheDocument();
    }

    for (const { section, button } of docsSections) {
      const sectionElement = toggleAccordionSection(section);
      const docsButton = within(sectionElement).getByRole("button", { name: button });
      expect(docsButton).toBeInTheDocument();
      expect(docsButton).toHaveTextContent("官方文档");

      if (button === "查看 环境变量 官方文档" || button === "查看 插件 官方文档") {
        fireEvent.click(docsButton);
      }
    }

    fireEvent.click(behaviorDocsButton);
    fireEvent.click(screen.getByRole("button", { name: "查看 状态行 官方文档" }));

    expect(openUrlMock).toHaveBeenNthCalledWith(1, "https://code.claude.com/docs/zh-CN/env-vars");
    expect(openUrlMock).toHaveBeenNthCalledWith(
      2,
      "https://code.claude.com/docs/zh-CN/discover-plugins",
    );
    expect(openUrlMock).toHaveBeenNthCalledWith(
      3,
      "https://code.claude.com/docs/zh-CN/model-config",
    );
    expect(openUrlMock).toHaveBeenNthCalledWith(4, "https://code.claude.com/docs/zh-CN/statusline");
  });

  it("uses english official docs links when the UI language is english", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );

    renderEditor();

    const behaviorDocsButton = screen.getByRole("button", {
      name: "Open Model & Behavior official docs",
    });
    expect(behaviorDocsButton).toHaveTextContent("Docs");

    expect(
      screen.queryByRole("button", { name: "Open Environment Variables official docs" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Sandbox official docs" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Plugins official docs" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Status Line official docs" }),
    ).not.toBeInTheDocument();

    const envSection = toggleAccordionSection("Environment Variables");
    const envDocsButton = within(envSection).getByRole("button", {
      name: "Open Environment Variables official docs",
    });
    expect(envDocsButton).toHaveTextContent("Docs");
    fireEvent.click(envDocsButton);

    const pluginsSection = toggleAccordionSection("Plugins");
    fireEvent.click(
      within(pluginsSection).getByRole("button", { name: "Open Plugins official docs" }),
    );

    const sandboxSection = toggleAccordionSection("Sandbox");
    fireEvent.click(
      within(sandboxSection).getByRole("button", { name: "Open Sandbox official docs" }),
    );

    fireEvent.click(behaviorDocsButton);

    const statusLineSection = toggleAccordionSection("Status Line");
    fireEvent.click(
      within(statusLineSection).getByRole("button", { name: "Open Status Line official docs" }),
    );

    expect(openUrlMock).toHaveBeenNthCalledWith(1, "https://code.claude.com/docs/en/env-vars");
    expect(openUrlMock).toHaveBeenNthCalledWith(
      2,
      "https://code.claude.com/docs/en/discover-plugins",
    );
    expect(openUrlMock).toHaveBeenNthCalledWith(3, "https://code.claude.com/docs/en/sandboxing");
    expect(openUrlMock).toHaveBeenNthCalledWith(4, "https://code.claude.com/docs/en/model-config");
    expect(openUrlMock).toHaveBeenNthCalledWith(5, "https://code.claude.com/docs/en/statusline");
  });

  it("shows enabled plugin summary in the collapsed plugins section", () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          ...PROFILE_FIXTURE.settings,
          enabledPlugins: {
            "formatter@anthropic-tools": true,
            "reviewer@anthropic-tools": false,
          },
        },
      },
    });

    const pluginsSection = getSection("插件");
    expect(within(pluginsSection).getByText("已启用 1/2")).toBeInTheDocument();
    expect(
      within(pluginsSection).queryByRole("button", { name: "新增插件" }),
    ).not.toBeInTheDocument();
  });

  it("uses localized preset names in the preset selector", () => {
    renderEditor();

    expect(comboboxOptionNames("供应商")).toContain("开放路由");
    expect(screen.queryByRole("option", { name: "OpenRouter" })).not.toBeInTheDocument();
  });

  it("shows the selected preset docs link beside the compact preset selector", () => {
    renderEditor();

    const authSection = getSection("认证");
    const presetSelector = within(authSection).getByLabelText("供应商");
    expect(presetSelector).toHaveAttribute("data-slot", "select-trigger");

    const docsButton = within(authSection).getByRole("button", { name: "查看文档" });
    expect(docsButton).toHaveAttribute("data-slot", "button");

    fireEvent.click(docsButton);
    expect(openUrlMock).toHaveBeenCalledWith("https://openrouter.ai/docs");

    chooseComboboxOption("供应商", "团队计划");
    expect(within(authSection).queryByRole("button", { name: "查看文档" })).not.toBeInTheDocument();
  });

  it("hides scope and project path fields for user-only profiles", () => {
    renderEditor();

    expect(screen.queryByLabelText("作用域")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("项目路径")).not.toBeInTheDocument();
  });

  it("renders behavior controls in rows with at most two items", () => {
    renderEditor();

    const behaviorSection = screen.getByRole("heading", { name: "模型与行为" }).closest("section");
    expect(behaviorSection).not.toBeNull();
    if (!behaviorSection) {
      return;
    }

    expect(within(behaviorSection).getByLabelText("默认模型")).toBeInTheDocument();
    expect(within(behaviorSection).getByLabelText("努力级别")).toBeInTheDocument();
    expect(within(behaviorSection).getByRole("combobox", { name: "回复语言" })).toBeInTheDocument();
    expect(within(behaviorSection).getByRole("combobox", { name: "输出风格" })).toBeInTheDocument();
  });

  it("tests the current profile draft from the behavior section, opens the dialog, and reopens it from the result badge", async () => {
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      if (command === "get_config_workspace") {
        return WORKSPACE_FIXTURE;
      }
      if (command === "preview_profile") {
        const settings =
          (payload as { data?: { settings?: Record<string, unknown> } } | undefined)?.data
            ?.settings ?? {};
        return JSON.stringify(
          {
            $schema: "https://json.schemastore.org/claude-code-settings.json",
            ...settings,
          },
          null,
          2,
        );
      }
      if (command === "test_profile_model") {
        const promptText =
          (payload as { data?: { promptText?: string } } | undefined)?.data?.promptText ??
          "Please reply with one short sentence confirming this API test request succeeded.";
        return {
          ok: true,
          responseText: "API 测试成功，当前配置可以正常返回响应。",
          promptText,
          resolvedModel: "claude-sonnet-4-6",
          providerModel: "openrouter/claude-sonnet-4-6",
          durationMs: 123,
          requestId: "req_test_123",
          stopReason: "end_turn",
          requestMethod: "POST",
          requestUrl: "https://openrouter.ai/api/v1/messages",
          requestHeaders: {
            "x-api-key": "<redacted>",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          requestBody: JSON.stringify(
            {
              model: "claude-sonnet-4-6",
              max_tokens: 2048,
              messages: [{ role: "user", content: promptText }],
            },
            null,
            2,
          ),
          responseHeaders: {
            "content-type": "application/json",
            "request-id": "req_test_123",
          },
          rawResponse: JSON.stringify({
            id: "msg_test_123",
            model: "openrouter/claude-sonnet-4-6",
            content: [{ type: "text", text: "API 测试成功，当前配置可以正常返回响应。" }],
          }),
        };
      }
      return null;
    });

    renderEditor();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("默认模型"), {
        target: { value: "claude-sonnet-4-6" },
      });
      await Promise.resolve();
    });

    const behaviorSection = getSection("模型与行为");
    const testButton = within(behaviorSection).getByRole("button", { name: "测试模型" });
    expect(testButton).toHaveTextContent("测试模型");
    expect(testButton).toHaveClass("active:scale-95");

    await act(async () => {
      fireEvent.click(testButton);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(invokeMock).toHaveBeenCalledWith("test_profile_model", {
      data: {
        id: "user-openrouter",
        name: "OpenRouter User",
        description: "默认用户配置",
        providerId: "builtin:openrouter",
        settings: {
          env: {
            ANTHROPIC_AUTH_TOKEN: "token",
            ANTHROPIC_MODEL: "claude-sonnet-4-6",
          },
        },
      },
    });
    const dialog = await findModelTestDialog();
    const dialogClassTokens = Array.from(dialog.querySelectorAll<HTMLElement>("[class]"))
      .flatMap((element) => Array.from(element.classList))
      .join(" ");

    expect(dialogClassTokens).not.toContain("py-4-top");
    expect(dialogClassTokens).not.toContain("py-4-main");
    expect(within(dialog).getByTestId("model-test-meta-list").getAttribute("class")).not.toContain(
      "flex flex-col",
    );
    expect(
      within(dialog).getByTestId("model-test-content-grid").getAttribute("class"),
    ).not.toContain("grid gap-3 flex");
    expect(
      within(dialog).getByTestId("model-test-prompt-panel").getAttribute("class"),
    ).not.toContain("p-3 flex flex-col");
    expect(within(dialog).getByTestId("model-test-status-badge")).toHaveClass("bg-success");
    expect(within(dialog).getByTestId("model-test-response-panel")).toHaveClass("border-chart-2");
    expect(within(dialog).getByText("测试成功")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-profile-name")).toHaveTextContent(
      "OpenRouter User",
    );
    expect(within(dialog).getByTestId("model-test-request-url")).toHaveTextContent(
      "https://openrouter.ai/api/v1/messages",
    );
    expect(within(dialog).getByTestId("model-test-context")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-profile-row")).toHaveTextContent(
      "OpenRouter User",
    );
    expect(within(dialog).getByTestId("model-test-request-url-row")).toHaveTextContent(
      "https://openrouter.ai/api/v1/messages",
    );
    expect(within(dialog).getByTestId("model-test-meta-list")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-content-grid")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-prompt-panel")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-response-panel")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-exchange-details")).toBeInTheDocument();
    expect(
      within(dialog).getByText("API 测试成功，当前配置可以正常返回响应。"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("claude-sonnet-4-6")).toBeInTheDocument();
    expect(within(dialog).getByText("openrouter/claude-sonnet-4-6")).toBeInTheDocument();
    expect(within(dialog).getByText("123 ms")).toBeInTheDocument();
    const successResultButton = within(behaviorSection).getByRole("button", {
      name: "查看最近一次测试结果：测试成功 · 123 ms",
    });
    expect(successResultButton).toHaveTextContent("测试成功 · 123 ms");
    expect(successResultButton).toHaveClass("border-chart-2/40");
    expect(successResultButton).toHaveClass("bg-chart-2/10");
    expect(successResultButton).toHaveClass("text-chart-2");
    expect(within(dialog).getByText("req_test_123")).toBeInTheDocument();
    expect(within(dialog).getByText("end_turn")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-request-headers-code").textContent).toContain(
      '"x-api-key": "<redacted>"',
    );
    expect(within(dialog).getByTestId("model-test-request-body-code").textContent).toContain(
      '"max_tokens": 2048',
    );
    expect(within(dialog).getByTestId("model-test-response-headers-code").textContent).toContain(
      '"request-id": "req_test_123"',
    );
    expect(
      within(dialog).getByText(
        "Please reply with one short sentence confirming this API test request succeeded.",
      ),
    ).toBeInTheDocument();

    const rawResponseViewer = within(dialog).getByTestId("model-test-raw-response-code");
    expect(rawResponseViewer.textContent).toContain('{\n  "id": "msg_test_123",');
    expect(rawResponseViewer.textContent).toContain('\n  "content": [\n');
    vi.clearAllTimers();
  });

  it("keeps the test button available in behavior json mode and shows a loading state", async () => {
    let resolveTest: ((value: unknown) => void) | null = null;
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      if (command === "get_config_workspace") {
        return WORKSPACE_FIXTURE;
      }
      if (command === "preview_profile") {
        const settings =
          (payload as { data?: { settings?: Record<string, unknown> } } | undefined)?.data
            ?.settings ?? {};
        return JSON.stringify(
          {
            $schema: "https://json.schemastore.org/claude-code-settings.json",
            ...settings,
          },
          null,
          2,
        );
      }
      if (command === "test_profile_model") {
        return await new Promise((resolve) => {
          resolveTest = resolve;
        });
      }
      return null;
    });

    renderEditor();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("默认模型"), {
        target: { value: "claude-sonnet-4-6" },
      });
      await Promise.resolve();
    });

    const behaviorSection = getSection("模型与行为");

    fireEvent.click(within(behaviorSection).getByRole("button", { name: "JSON" }));

    const testButton = within(behaviorSection).getByRole("button", { name: "测试模型" });
    expect(testButton).toBeInTheDocument();
    expect(testButton).toHaveTextContent("测试模型");

    await act(async () => {
      fireEvent.click(testButton);
      await Promise.resolve();
    });

    const runningButton = within(behaviorSection).getByRole("button", { name: "测试中..." });
    expect(runningButton).toBeDisabled();
    expect(runningButton).toHaveClass("is-testing");
    expect(runningButton).toHaveClass("active:scale-95");
    expect(
      within(runningButton).getByTestId("profile-editor-model-test-spinner"),
    ).toBeInTheDocument();

    await act(async () => {
      resolveTest?.({
        ok: true,
        responseText: "JSON 模式下测试成功。",
        resolvedModel: "claude-sonnet-4-6",
        durationMs: 88,
        rawResponse: JSON.stringify({ ok: true }, null, 2),
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(within(behaviorSection).getByRole("button", { name: "测试模型" })).toBeInTheDocument();
    expect(await findModelTestDialog()).toBeInTheDocument();
    expect(screen.getByText("JSON 模式下测试成功。")).toBeInTheDocument();
  });

  it("disables model test for official Anthropic provider when no auth key is filled", () => {
    renderEditor({
      profile: {
        id: "user-anthropic",
        name: "Anthropic 官方",
        description: "",
        providerId: "builtin:anthropic",
        settings: { env: {} },
        createdAt: "2026-04-18T12:00:00Z",
        updatedAt: "2026-04-18T12:00:00Z",
      },
    });

    const behaviorSection = getSection("模型与行为");
    expect(within(behaviorSection).getByRole("button", { name: "测试模型" })).toBeDisabled();
  });

  it("enables model test for official Anthropic provider once an auth key is present", () => {
    renderEditor({
      profile: {
        id: "user-anthropic",
        name: "Anthropic 官方",
        description: "",
        providerId: "builtin:anthropic",
        settings: { env: { ANTHROPIC_AUTH_TOKEN: "token" } },
        createdAt: "2026-04-18T12:00:00Z",
        updatedAt: "2026-04-18T12:00:00Z",
      },
    });

    const behaviorSection = getSection("模型与行为");
    expect(within(behaviorSection).getByRole("button", { name: "测试模型" })).toBeEnabled();
  });

  it("disables model test for non-official provider when no auth key is filled", () => {
    renderEditor({
      profile: {
        id: "user-openrouter",
        name: "OpenRouter User",
        description: "",
        providerId: "builtin:openrouter",
        settings: { env: {} },
        createdAt: "2026-04-18T12:00:00Z",
        updatedAt: "2026-04-18T12:00:00Z",
      },
    });

    const behaviorSection = getSection("模型与行为");
    expect(within(behaviorSection).getByRole("button", { name: "测试模型" })).toBeDisabled();
  });

  it("clears stale success badge after behavior settings change and blocks testing when invalid", async () => {
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      if (command === "get_config_workspace") {
        return WORKSPACE_FIXTURE;
      }
      if (command === "preview_profile") {
        const settings =
          (payload as { data?: { settings?: Record<string, unknown> } } | undefined)?.data
            ?.settings ?? {};
        return JSON.stringify(
          {
            $schema: "https://json.schemastore.org/claude-code-settings.json",
            ...settings,
          },
          null,
          2,
        );
      }
      if (command === "test_profile_model") {
        return {
          ok: true,
          responseText: "旧的测试结果",
          resolvedModel: "claude-sonnet-4-6",
          durationMs: 45,
          rawResponse: JSON.stringify({ ok: true }, null, 2),
        };
      }
      return null;
    });

    renderEditor();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("默认模型"), {
        target: { value: "claude-sonnet-4-6" },
      });
      await Promise.resolve();
    });

    const behaviorSection = getSection("模型与行为");

    await act(async () => {
      fireEvent.click(within(behaviorSection).getByRole("button", { name: "测试模型" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = await findModelTestDialog();
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(
      within(behaviorSection).getByRole("button", {
        name: "查看最近一次测试结果：测试成功 · 45 ms",
      }),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("默认模型"), {
        target: { value: "claude-opus-4-1" },
      });
      await Promise.resolve();
    });

    expect(
      within(behaviorSection).queryByRole("button", {
        name: "查看最近一次测试结果：测试成功 · 45 ms",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(behaviorSection).getByRole("button", { name: "JSON" }));
    fireEvent.change(within(behaviorSection).getByLabelText("config-preview-input"), {
      target: { value: "{ invalid json" },
    });

    const testButton = within(behaviorSection).getByRole("button", { name: "测试模型" });
    expect(testButton).toBeDisabled();
  });

  it("shows a failed dialog with expandable raw response when the upstream api returns a structured error", async () => {
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      if (command === "get_config_workspace") {
        return WORKSPACE_FIXTURE;
      }
      if (command === "preview_profile") {
        const settings =
          (payload as { data?: { settings?: Record<string, unknown> } } | undefined)?.data
            ?.settings ?? {};
        return JSON.stringify(
          {
            $schema: "https://json.schemastore.org/claude-code-settings.json",
            ...settings,
          },
          null,
          2,
        );
      }
      if (command === "test_profile_model") {
        return {
          ok: false,
          responseText: "",
          promptText:
            "Please reply with one short sentence confirming this API test request succeeded.",
          resolvedModel: "claude-sonnet-4-6",
          durationMs: 67,
          statusCode: 401,
          errorMessage: "模型测试失败（HTTP 401）：invalid api key",
          rawResponse: '{"error":{"type":"authentication_error","message":"invalid api key"}}',
        };
      }
      return null;
    });

    renderEditor();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("默认模型"), {
        target: { value: "claude-sonnet-4-6" },
      });
      await Promise.resolve();
    });

    const behaviorSection = getSection("模型与行为");

    await act(async () => {
      fireEvent.click(within(behaviorSection).getByRole("button", { name: "测试模型" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = await findModelTestDialog();
    expect(within(dialog).getByText("测试失败")).toBeInTheDocument();
    expect(
      within(dialog).getByText("模型测试失败（HTTP 401）：invalid api key"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("401")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Please reply with one short sentence confirming this API test request succeeded.",
      ),
    ).toBeInTheDocument();
    const failureResultButton = within(behaviorSection).getByRole("button", {
      name: "查看最近一次测试结果：测试失败",
    });
    expect(failureResultButton).toHaveTextContent("测试失败");
    expect(failureResultButton).toHaveClass("border-destructive/40");
    expect(failureResultButton).toHaveClass("bg-destructive/10");
    expect(failureResultButton).toHaveClass("text-destructive");

    expect(within(dialog).getByRole("button", { name: "隐藏响应体" })).toBeInTheDocument();
    const rawResponseViewer = within(dialog).getByTestId("model-test-raw-response-code");
    expect(rawResponseViewer.textContent).toContain('{\n  "error": {\n');
    expect(rawResponseViewer.textContent).toContain('"type": "authentication_error"');

    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(screen.queryByText("模型测试结果")).not.toBeInTheDocument();
    fireEvent.click(failureResultButton);
    expect(await findModelTestDialog()).toBeInTheDocument();
    expect(screen.getByText("模型测试失败（HTTP 401）：invalid api key")).toBeInTheDocument();
  });

  it("opens the failed dialog without a raw response toggle when invoke rejects", async () => {
    let modelTestCallCount = 0;
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      if (command === "get_config_workspace") {
        return WORKSPACE_FIXTURE;
      }
      if (command === "preview_profile") {
        const settings =
          (payload as { data?: { settings?: Record<string, unknown> } } | undefined)?.data
            ?.settings ?? {};
        return JSON.stringify(
          {
            $schema: "https://json.schemastore.org/claude-code-settings.json",
            ...settings,
          },
          null,
          2,
        );
      }
      if (command === "test_profile_model") {
        modelTestCallCount += 1;
        if (modelTestCallCount === 1) {
          throw new Error("模型测试请求失败：network down");
        }
        return {
          ok: true,
          responseText: "重新测试成功",
          promptText:
            "Please reply with one short sentence confirming this API test request succeeded.",
          resolvedModel: "claude-sonnet-4-6",
          durationMs: 88,
          rawResponse: JSON.stringify({ content: [{ type: "text", text: "重新测试成功" }] }),
        };
      }
      return null;
    });

    renderEditor();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("默认模型"), {
        target: { value: "claude-sonnet-4-6" },
      });
      await Promise.resolve();
    });

    const behaviorSection = getSection("模型与行为");

    await act(async () => {
      fireEvent.click(within(behaviorSection).getByRole("button", { name: "测试模型" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = await findModelTestDialog();
    expect(within(dialog).getByText("测试失败")).toBeInTheDocument();
    expect(within(dialog).getByText("模型测试请求失败：network down")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "查看响应体" })).not.toBeInTheDocument();
    const failureResultButton = within(behaviorSection).getByRole("button", {
      name: "查看最近一次测试结果：测试失败",
    });
    expect(failureResultButton).toHaveTextContent("测试失败");
    expect(failureResultButton).toHaveClass("border-destructive/40");
    expect(failureResultButton).toHaveClass("bg-destructive/10");
    expect(failureResultButton).toHaveClass("text-destructive");

    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(screen.queryByText("模型测试结果")).not.toBeInTheDocument();
    fireEvent.click(failureResultButton);
    const reopenedDialog = await findModelTestDialog();
    expect(within(reopenedDialog).getByText("模型测试请求失败：network down")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(reopenedDialog).getByRole("button", { name: "重新测试" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const modelTestPayloads = invokeMock.mock.calls
      .filter(([command]) => command === "test_profile_model")
      .map(([, payload]) => (payload as { data?: { promptText?: string } }).data);
    expect(modelTestPayloads).toHaveLength(2);
    expect(modelTestPayloads[1]).not.toHaveProperty("promptText");
  });

  it("renders language as a select list and exposes the full effort enum set", async () => {
    await act(async () => {
      renderEditor();
      await Promise.resolve();
    });

    expect(comboboxOptionNames("回复语言")).toEqual(
      expect.arrayContaining([
        "English",
        "中文 (Chinese)",
        "日本語 (Japanese)",
        "한국어 (Korean)",
        "Español (Spanish)",
        "Français (French)",
        "Deutsch (German)",
        "Português (Portuguese)",
        "Русский (Russian)",
        "العربية (Arabic)",
        "Italiano (Italian)",
      ]),
    );

    // 努力级别现在是触发按钮 + 浮窗,点开后才有刻度条
    const effortTrigger = screen.getByLabelText("努力级别");
    expect(effortTrigger).toHaveTextContent("未设置");
    act(() => {
      fireEvent.click(effortTrigger);
    });
    const effortSlider = document.querySelector('[data-slot="effort-level-slider"]') as HTMLElement;
    const stopButtons = within(effortSlider).getAllByRole("button");
    expect(stopButtons.map((button) => button.textContent)).toEqual([
      "未设置",
      "auto",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultracode",
    ]);
    // 默认未设置:刻度条停在最左端
    expect(within(effortSlider).getByRole("slider", { name: "努力级别" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    // 底部描述表覆盖 ultracode
    expect(screen.getByText("何时使用")).toBeInTheDocument();
  });

  it("defaults reply language to chinese for new profiles and persists it on save", async () => {
    const onSave = vi.fn();
    renderEditor({ profile: null, onSave });

    expect(screen.getByLabelText("回复语言")).toHaveValue("chinese");

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/名称/), {
        target: { value: "默认配置" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          language: "chinese",
        }),
      }),
    );
  });

  it("defaults reply language to english for new profiles when ui language is english", async () => {
    const onSave = vi.fn();
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );

    renderEditor({ profile: null, onSave });

    expect(screen.getByLabelText("Language")).toHaveValue("english");

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Name/), {
        target: { value: "Default Profile" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          language: "english",
        }),
      }),
    );
  });

  it("does not auto-fill reply language for existing profiles that do not define it", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/名称/), {
        target: { value: "已存在配置" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.not.objectContaining({
          language: expect.anything(),
        }),
      }),
    );
  });

  it("stores model and effort as standard env settings and keeps the env editor in sync", async () => {
    const onSave = vi.fn();
    await act(async () => {
      renderEditor({ onSave });
      await Promise.resolve();
    });

    const envSection = screen
      .getByRole("heading", { name: "环境变量", level: 3 })
      .closest("section") as HTMLElement | null;
    expect(envSection).not.toBeNull();
    if (!envSection) {
      return;
    }

    toggleAccordionSection("环境变量");

    expect(
      within(envSection).queryByRole("button", {
        name: "编辑环境变量 ANTHROPIC_MODEL",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(envSection).queryByRole("button", {
        name: "编辑环境变量 CLAUDE_CODE_EFFORT_LEVEL",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(envSection).queryByRole("button", {
        name: "编辑环境变量 ANTHROPIC_DEFAULT_OPUS_MODEL",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(envSection).queryByRole("button", {
        name: "编辑环境变量 ANTHROPIC_DEFAULT_SONNET_MODEL",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(envSection).queryByRole("button", {
        name: "编辑环境变量 ANTHROPIC_DEFAULT_HAIKU_MODEL",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(envSection).queryByRole("button", {
        name: "编辑环境变量 CLAUDE_CODE_SUBAGENT_MODEL",
      }),
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Opus 默认模型"), {
        target: { value: "claude-opus-4-1" },
      });
      fireEvent.change(screen.getByLabelText("Sonnet 默认模型"), {
        target: { value: "claude-sonnet-4-6" },
      });
      fireEvent.change(screen.getByLabelText("Haiku 默认模型"), {
        target: { value: "claude-haiku-4-5" },
      });
      fireEvent.change(screen.getByLabelText("Subagent 模型"), {
        target: { value: "claude-sonnet-4-6" },
      });
      await Promise.resolve();
    });

    // 点开努力级别浮窗后再操作刻度条
    act(() => {
      fireEvent.click(screen.getByLabelText("努力级别"));
    });
    const effortSlider = document.querySelector('[data-slot="effort-level-slider"]') as HTMLElement;
    expect(within(effortSlider).getByRole("slider", { name: "努力级别" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText("默认模型"), {
        target: { value: "claude-opus-4-1" },
      });
      await Promise.resolve();
    });
    act(() => {
      fireEvent.click(within(effortSlider).getByRole("button", { name: "auto" }));
    });

    expect(
      within(envSection).getByRole("button", {
        name: "编辑环境变量 ANTHROPIC_MODEL",
      }),
    ).toBeInTheDocument();
    expect(
      within(envSection).getByRole("button", {
        name: "编辑环境变量 CLAUDE_CODE_EFFORT_LEVEL",
      }),
    ).toBeInTheDocument();
    expect(
      within(envSection).getByRole("button", {
        name: "编辑环境变量 ANTHROPIC_DEFAULT_OPUS_MODEL",
      }),
    ).toBeInTheDocument();
    expect(
      within(envSection).getByRole("button", {
        name: "编辑环境变量 ANTHROPIC_DEFAULT_SONNET_MODEL",
      }),
    ).toBeInTheDocument();
    expect(
      within(envSection).getByRole("button", {
        name: "编辑环境变量 ANTHROPIC_DEFAULT_HAIKU_MODEL",
      }),
    ).toBeInTheDocument();
    expect(
      within(envSection).getByRole("button", {
        name: "编辑环境变量 CLAUDE_CODE_SUBAGENT_MODEL",
      }),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.settings.env).toEqual({
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: "claude-opus-4-1",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-1",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-6",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5",
      CLAUDE_CODE_SUBAGENT_MODEL: "claude-sonnet-4-6",
      CLAUDE_CODE_EFFORT_LEVEL: "auto",
    });
    expect(saved.settings).not.toHaveProperty("model");
    expect(saved.settings).not.toHaveProperty("effortLevel");
  });

  it("renders env-backed model override fields inside behavior", async () => {
    await act(async () => {
      renderEditor();
      await Promise.resolve();
    });

    for (const label of ["Opus 默认模型", "Sonnet 默认模型", "Haiku 默认模型", "Subagent 模型"]) {
      const fieldGroup = getFieldForLabel(label);
      const helpButton = within(fieldGroup).getByRole("button", {
        name:
          label === "Opus 默认模型"
            ? "ANTHROPIC_DEFAULT_OPUS_MODEL"
            : label === "Sonnet 默认模型"
              ? "ANTHROPIC_DEFAULT_SONNET_MODEL"
              : label === "Haiku 默认模型"
                ? "ANTHROPIC_DEFAULT_HAIKU_MODEL"
                : "CLAUDE_CODE_SUBAGENT_MODEL",
      });
      expect(helpButton).toHaveAttribute("data-tooltip", helpButton.getAttribute("aria-label"));
    }

    expect(
      screen.getByRole("button", { name: "ANTHROPIC_DEFAULT_OPUS_MODEL" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ANTHROPIC_DEFAULT_SONNET_MODEL" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ANTHROPIC_DEFAULT_HAIKU_MODEL" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CLAUDE_CODE_SUBAGENT_MODEL" })).toBeInTheDocument();
  });

  it("renders mapping controls inline inside field headers", async () => {
    await act(async () => {
      renderEditor();
      await Promise.resolve();
    });

    const modelGroup = getFieldForLabel("默认模型");
    const effortGroup = getFieldForLabel("努力级别");
    const languageGroup = getFieldForLabel("回复语言");

    expect(within(modelGroup).getByRole("button", { name: "ANTHROPIC_MODEL" })).toHaveAttribute(
      "data-tooltip",
      "ANTHROPIC_MODEL",
    );
    expect(
      within(effortGroup).getByRole("button", { name: "CLAUDE_CODE_EFFORT_LEVEL" }),
    ).toHaveAttribute("data-tooltip", "CLAUDE_CODE_EFFORT_LEVEL");
    expect(within(languageGroup).getByRole("button", { name: "language" })).toHaveAttribute(
      "data-tooltip",
      "language",
    );
    expect(screen.queryByLabelText("模型使用环境变量映射")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("努力级别使用环境变量映射")).not.toBeInTheDocument();
  });

  it("shows helper buttons for top-level behavior and common options", () => {
    renderEditor();

    const behaviorSection = getSection("模型与行为");
    const commonSection = toggleAccordionSection("常用选项");
    expect(within(behaviorSection).getByRole("button", { name: "outputStyle" })).toHaveAttribute(
      "data-tooltip",
      "outputStyle",
    );
    expect(
      within(commonSection).getByRole("button", { name: "alwaysThinkingEnabled" }),
    ).toHaveAttribute("data-tooltip", "alwaysThinkingEnabled");
    expect(
      within(commonSection).getByRole("button", { name: "showThinkingSummaries" }),
    ).toHaveAttribute("data-tooltip", "showThinkingSummaries");
    expect(
      within(commonSection).getByRole("button", { name: "showClearContextOnPlanAccept" }),
    ).toHaveAttribute("data-tooltip", "showClearContextOnPlanAccept");
    expect(within(commonSection).getByRole("button", { name: "disableAllHooks" })).toHaveAttribute(
      "data-tooltip",
      "disableAllHooks",
    );
    expect(within(commonSection).getByRole("button", { name: "attribution" })).toHaveAttribute(
      "data-tooltip",
      "attribution",
    );
    expect(
      within(commonSection).getByRole("button", { name: "hasCompletedOnboarding" }),
    ).toHaveAttribute("data-tooltip", "hasCompletedOnboarding");
    expect(
      within(commonSection).getByRole("button", { name: "skipWebFetchPreflight" }),
    ).toHaveAttribute("data-tooltip", "skipWebFetchPreflight");
    expect(
      within(commonSection).getByRole("button", { name: "DISABLE_AUTOUPDATER" }),
    ).toHaveAttribute("data-tooltip", "DISABLE_AUTOUPDATER");
    expect(within(commonSection).getByRole("button", { name: "respectGitignore" })).toHaveAttribute(
      "data-tooltip",
      "respectGitignore",
    );
    expect(
      within(commonSection).getByRole("button", { name: "ENABLE_TOOL_SEARCH" }),
    ).toHaveAttribute("data-tooltip", "ENABLE_TOOL_SEARCH");
    expect(
      within(commonSection).getByRole("button", { name: "CLAUDE_CODE_NO_FLICKER" }),
    ).toHaveAttribute("data-tooltip", "CLAUDE_CODE_NO_FLICKER");
  });

  it("stores common options as top-level fields and env switches", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    const commonSection = toggleAccordionSection("常用选项");
    const behaviorSection = getSection("模型与行为");
    expect(within(behaviorSection).getByRole("combobox", { name: "输出风格" })).toBeInTheDocument();
    chooseComboboxOption("输出风格", "Learning");
    const labels = [
      "默认启用深度思考",
      "显示 Thinking 摘要",
      "接受计划时显示清理上下文",
      "禁用所有 Hooks",
      "禁用 AI 署名",
      "已完成引导设置",
      "尊重 .gitignore",
      "跳过 WebFetch 预检",
      "禁用自动更新",
      "禁用非必要网络请求",
      "启用 LSP 工具",
      "显式启用 Tool Search",
      "启用新版 Init",
      "启用无闪烁模式",
      "启用 Agent Teams",
    ];

    for (const label of labels) {
      await act(async () => {
        fireEvent.click(
          within(commonSection).getByRole("switch", { name: `切换常用选项 ${label}` }),
        );
        await Promise.resolve();
      });
    }

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.settings).toMatchObject({
      outputStyle: "Learning",
      alwaysThinkingEnabled: true,
      showThinkingSummaries: true,
      showClearContextOnPlanAccept: true,
      disableAllHooks: true,
      attribution: {
        commit: "",
        pr: "",
      },
      hasCompletedOnboarding: true,
      respectGitignore: true,
      skipWebFetchPreflight: true,
    });
    expect(saved.settings.env).toMatchObject({
      ANTHROPIC_AUTH_TOKEN: "token",
      DISABLE_AUTOUPDATER: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      ENABLE_LSP_TOOL: "1",
      ENABLE_TOOL_SEARCH: "true",
      CLAUDE_CODE_NEW_INIT: "1",
      CLAUDE_CODE_NO_FLICKER: "1",
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
    });
  });

  it("preserves custom outputStyle values from behavior json", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });
    const behaviorSection = switchSectionToJson("模型与行为");

    fireEvent.change(within(behaviorSection).getByLabelText("config-preview-input"), {
      target: { value: '{\n  "outputStyle": "MyTeamStyle"\n}' },
    });
    fireEvent.click(within(behaviorSection).getByRole("button", { name: "控件" }));
    expect(
      within(getSection("模型与行为")).getByRole("combobox", { name: "输出风格" }),
    ).toHaveValue("MyTeamStyle");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].settings.outputStyle).toBe("MyTeamStyle");
  });

  it("stores built-in outputStyle values from the outputStyle select", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    chooseComboboxOption("输出风格", "default");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].settings.outputStyle).toBe("default");
  });

  function openAutoCompactWindowPopover(): HTMLElement {
    const trigger = within(getSection("模型与行为")).getByRole("button", { name: "自动压缩窗口" });
    act(() => {
      fireEvent.click(trigger);
    });
    return document.querySelector('[data-slot="auto-compact-window-control"]') as HTMLElement;
  }

  it("shows unset auto compact window trigger and reveals slider with empty input", () => {
    renderEditor({
      profile: { ...PROFILE_FIXTURE, settings: { env: { ANTHROPIC_AUTH_TOKEN: "token" } } },
    });

    const trigger = within(getSection("模型与行为")).getByRole("button", { name: "自动压缩窗口" });
    expect(trigger).toHaveTextContent("未设置");

    const control = openAutoCompactWindowPopover();
    expect(within(control).getByRole("slider")).toBeInTheDocument();
    expect(within(control).getByRole("spinbutton")).toHaveValue(null);
  });

  it("shows the current auto compact window value in trigger and input", () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          env: { ANTHROPIC_AUTH_TOKEN: "token", CLAUDE_CODE_AUTO_COMPACT_WINDOW: "512000" },
        },
      },
    });

    const trigger = within(getSection("模型与行为")).getByRole("button", { name: "自动压缩窗口" });
    expect(trigger).toHaveTextContent("512K");

    const control = openAutoCompactWindowPopover();
    expect(within(control).getByRole("spinbutton")).toHaveValue(512000);
  });

  it("writes auto compact window env value on save", async () => {
    const onSave = vi.fn();
    renderEditor({
      onSave,
      profile: { ...PROFILE_FIXTURE, settings: { env: { ANTHROPIC_AUTH_TOKEN: "token" } } },
    });

    const control = openAutoCompactWindowPopover();
    fireEvent.change(within(control).getByRole("spinbutton"), {
      target: { value: "300000" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave.mock.calls[0][0].settings.env).toMatchObject({
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: "300000",
    });
  });

  it("clears auto compact window env value when the numeric input is emptied", async () => {
    const onSave = vi.fn();
    renderEditor({
      onSave,
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          env: { ANTHROPIC_AUTH_TOKEN: "token", CLAUDE_CODE_AUTO_COMPACT_WINDOW: "512000" },
        },
      },
    });

    const control = openAutoCompactWindowPopover();
    fireEvent.change(within(control).getByRole("spinbutton"), {
      target: { value: "" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    const env = (onSave.mock.calls[0][0].settings.env ?? {}) as Record<string, unknown>;
    expect(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBeUndefined();
  });

  it("sets auto compact window from a quick anchor button", async () => {
    const onSave = vi.fn();
    renderEditor({
      onSave,
      profile: { ...PROFILE_FIXTURE, settings: { env: { ANTHROPIC_AUTH_TOKEN: "token" } } },
    });

    const control = openAutoCompactWindowPopover();
    fireEvent.click(within(control).getByRole("button", { name: "400K" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave.mock.calls[0][0].settings.env).toMatchObject({
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: "400000",
    });
  });

  it("syncs structured env, permissions, sandbox, and hooks json editor into source json", async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("默认模型"), {
      target: { value: "claude-opus-4-1" },
    });
    fireEvent.change(screen.getByLabelText("ANTHROPIC_AUTH_TOKEN"), {
      target: { value: "new-token" },
    });

    chooseComboboxOption("权限头部默认模式", "plan");
    toggleAccordionSection("权限");
    expect(screen.queryByLabelText("默认模式")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新增允许规则" }));
    fireEvent.change(screen.getByLabelText("允许规则 1"), {
      target: { value: "Bash(git status:*)" },
    });

    const sandboxSection = switchSectionToJson("Sandbox");
    fireEvent.change(within(sandboxSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            enabled: true,
            network: {
              allowedDomains: ["api.openai.com"],
            },
          },
          null,
          2,
        ),
      },
    });

    const hooksSection = switchSectionToJson("Hooks");
    fireEvent.change(within(hooksSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            PostToolUse: [
              {
                matcher: "Edit|Write",
                hooks: [
                  {
                    type: "command",
                    command: "pnpm biome:ci",
                  },
                ],
              },
            ],
          },
          null,
          2,
        ),
      },
    });

    const rawJsonValue = switchDocumentSectionToEdit("最终配置", "编辑源 JSON").value;
    expect(rawJsonValue).toContain('"ANTHROPIC_MODEL": "claude-opus-4-1"');
    expect(rawJsonValue).toContain('"ANTHROPIC_AUTH_TOKEN": "new-token"');
    expect(rawJsonValue).toContain('"defaultMode": "plan"');
    expect(rawJsonValue).toContain('"Bash(git status:*)"');
    expect(rawJsonValue).toContain('"allowedDomains"');
    expect(rawJsonValue).toContain('"api.openai.com"');
    expect(rawJsonValue).toContain('"PostToolUse"');
    expect(rawJsonValue).toContain('"pnpm biome:ci"');
  });

  it("renders permission rows without reorder actions and with shared input styling", async () => {
    openDialogMock.mockResolvedValueOnce("~/projects/shared");
    renderEditor();

    toggleAccordionSection("权限");
    const allowSection = screen
      .getByRole("heading", { name: "允许规则" })
      .closest('[data-slot="profile-subsection"]') as HTMLElement | null;
    const directorySection = screen
      .getByRole("heading", { name: "附加目录" })
      .closest('[data-slot="profile-subsection"]') as HTMLElement | null;

    expect(allowSection).not.toBeNull();
    expect(directorySection).not.toBeNull();

    if (!allowSection || !directorySection) {
      return;
    }

    const addAllowButton = within(allowSection).getByRole("button", { name: "新增允许规则" });

    expect(
      within(allowSection).queryByRole("button", { name: "收起 允许规则" }),
    ).not.toBeInTheDocument();
    expect(addAllowButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(addAllowButton);
      fireEvent.click(within(directorySection).getByRole("button", { name: "新增附加目录" }));
      await Promise.resolve();
    });

    const allowRuleInput = screen.getByLabelText("允许规则 1");
    const directoryInput = screen.getByLabelText("附加目录 1");
    expect(allowRuleInput).toHaveAttribute("data-slot", "input");
    expect(directoryInput).toHaveAttribute("data-slot", "input");
    expect(screen.queryByRole("button", { name: "上移 允许规则 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下移 允许规则 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除 允许规则 1" })).toBeInTheDocument();
    expect(within(allowSection).getByRole("button", { name: "收起 允许规则" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(directorySection).getByRole("button", { name: "收起 附加目录" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      allowRuleInput.compareDocumentPosition(
        within(allowSection).getByRole("button", { name: "新增允许规则" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      directoryInput.compareDocumentPosition(
        within(directorySection).getByRole("button", { name: "新增附加目录" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await act(async () => {
      fireEvent.click(within(allowSection).getByRole("button", { name: "收起 允许规则" }));
      fireEvent.click(within(directorySection).getByRole("button", { name: "收起 附加目录" }));
      await Promise.resolve();
    });

    expect(within(allowSection).queryByLabelText("允许规则 1")).not.toBeInTheDocument();
    expect(
      within(allowSection).queryByRole("button", { name: "新增允许规则" }),
    ).not.toBeInTheDocument();
    expect(within(directorySection).queryByLabelText("附加目录 1")).not.toBeInTheDocument();
    expect(
      within(directorySection).queryByRole("button", { name: "新增附加目录" }),
    ).not.toBeInTheDocument();
  });

  it("syncs local json editors for behavior, common options, permissions, env, plugins, marketplaces, and status line", async () => {
    renderEditor();

    const behaviorSection = switchSectionToJson("模型与行为");
    fireEvent.change(within(behaviorSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            env: {
              ANTHROPIC_MODEL: "claude-opus-4-1",
              CLAUDE_CODE_EFFORT_LEVEL: "high",
            },
            outputStyle: "Explanatory",
          },
          null,
          2,
        ),
      },
    });
    fireEvent.click(within(behaviorSection).getByRole("button", { name: "控件" }));
    expect(screen.getByLabelText("输出风格")).toHaveValue("Explanatory");

    const commonSection = switchSectionToJson("常用选项");
    fireEvent.change(within(commonSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            env: {
              CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
              ENABLE_LSP_TOOL: "1",
            },
            alwaysThinkingEnabled: true,
            showThinkingSummaries: true,
            showClearContextOnPlanAccept: true,
            disableAllHooks: true,
            attribution: {
              commit: "",
              pr: "",
            },
            hasCompletedOnboarding: true,
            respectGitignore: true,
          },
          null,
          2,
        ),
      },
    });
    fireEvent.click(within(commonSection).getByRole("button", { name: "控件" }));
    for (const label of [
      "默认启用深度思考",
      "显示 Thinking 摘要",
      "接受计划时显示清理上下文",
      "禁用所有 Hooks",
      "已完成引导设置",
      "尊重 .gitignore",
    ]) {
      expect(
        within(commonSection).getByRole("switch", {
          name: `切换常用选项 ${label}`,
        }),
      ).toHaveAttribute("aria-checked", "true");
    }
    expect(
      within(commonSection).getByRole("switch", {
        name: "切换常用选项 禁用 AI 署名",
      }),
    ).toHaveAttribute("aria-checked", "true");

    const permissionsSection = switchSectionToJson("权限");
    fireEvent.change(within(permissionsSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            defaultMode: "plan",
            allow: ["Bash(git status:*)"],
          },
          null,
          2,
        ),
      },
    });

    const envSection = switchSectionToJson("环境变量");
    fireEvent.change(within(envSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            OPENAI_API_KEY: "json-token",
          },
          null,
          2,
        ),
      },
    });

    const pluginsSection = switchSectionToJson("插件", { expandFirst: true });
    fireEvent.change(within(pluginsSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            "formatter@anthropic-tools": ["format"],
          },
          null,
          2,
        ),
      },
    });

    const marketplacesSection = switchSectionToJson("插件市场", { expandFirst: true });
    fireEvent.change(within(marketplacesSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            "team-market": {
              source: {
                source: "github",
                repo: "team/plugins",
              },
            },
          },
          null,
          2,
        ),
      },
    });

    const statusLineSection = switchSectionToJson("状态行", { expandFirst: true });
    fireEvent.change(within(statusLineSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            type: "command",
            command: "~/.claude/statusline.sh",
            padding: 2,
            refreshInterval: 5,
          },
          null,
          2,
        ),
      },
    });

    const rawJsonValue = switchDocumentSectionToEdit("最终配置", "编辑源 JSON").value;
    expect(rawJsonValue).toContain('"alwaysThinkingEnabled": true');
    expect(rawJsonValue).toContain('"hasCompletedOnboarding": true');
    expect(rawJsonValue).toContain('"respectGitignore": true');
    expect(rawJsonValue).toContain('"CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"');
    expect(rawJsonValue).toContain('"ENABLE_LSP_TOOL": "1"');
    expect(rawJsonValue).toContain('"defaultMode": "plan"');
    expect(rawJsonValue).toContain('"Bash(git status:*)"');
    expect(rawJsonValue).toContain('"OPENAI_API_KEY": "json-token"');
    expect(rawJsonValue).toContain('"formatter@anthropic-tools"');
    expect(rawJsonValue).toContain('"team-market"');
    expect(rawJsonValue).toContain('"statusLine"');
    expect(rawJsonValue).toContain('"~/.claude/statusline.sh"');
  });

  it("blocks save when behavior json is invalid", async () => {
    renderEditor();

    const behaviorSection = getSection("模型与行为");
    await act(async () => {
      fireEvent.click(within(behaviorSection).getByRole("button", { name: "JSON" }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.change(within(behaviorSection).getByLabelText("config-preview-input"), {
        target: { value: "[]" },
      });
      await Promise.resolve();
    });
    expect(
      within(behaviorSection).getAllByText("模型与行为 JSON 必须是 JSON 对象").length,
    ).toBeGreaterThan(0);
    expect(
      within(behaviorSection).getByText("当前草稿未生效，仍使用上一次合法 JSON。"),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("hydrates structured editors from profile settings", async () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          env: {
            ANTHROPIC_MODEL: "claude-haiku-4-5",
          },
          permissions: {
            defaultMode: "dontAsk",
            disableBypassPermissionsMode: "disable",
            deny: ["Read(.env)"],
          },
          sandbox: {
            enabled: true,
            network: {
              allowedDomains: ["example.com"],
            },
          },
          hooks: {
            PostToolUse: [
              {
                matcher: "Write",
                hooks: [
                  {
                    type: "command",
                    command: "pnpm build",
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-haiku-4-5");
    const permissionsSection = getSection("权限");
    expect(within(permissionsSection).getByLabelText("权限头部默认模式")).toHaveValue("dontAsk");
    toggleAccordionSection("权限");
    expect(screen.queryByLabelText("默认模式")).not.toBeInTheDocument();
    expect(screen.queryByText("权限规则")).not.toBeInTheDocument();
    expect(screen.queryByText("用规则构建器快速维护权限配置。")).not.toBeInTheDocument();
    const disableBypassSwitch = screen.getByRole("switch", {
      name: "禁用 bypassPermissions 模式",
    });
    expect(disableBypassSwitch).toHaveAttribute("aria-checked", "true");
    expect(disableBypassSwitch).toHaveAttribute("data-slot", "switch");
    expect(screen.getByText("禁用 bypassPermissions 模式")).toBeInTheDocument();
    expect(within(permissionsSection).getByRole("button", { name: "拒绝规则 1" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      within(permissionsSection).queryByRole("button", { name: "清空拒绝规则" }),
    ).not.toBeInTheDocument();
    expect(within(permissionsSection).queryByLabelText("拒绝规则 1")).not.toBeInTheDocument();
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 拒绝规则" }));
    expect(
      within(permissionsSection).getByRole("button", { name: "清空拒绝规则" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("拒绝规则 1")).toHaveValue("Read(.env)");

    const sandboxSection = getSection("Sandbox");
    toggleAccordionSection("Sandbox");
    expect(within(sandboxSection).getByText("已启用 · 1 个附加配置键")).toBeInTheDocument();
    const headerSandboxSwitch = within(sandboxSection).getByRole("switch", {
      name: "Sandbox 头部开关",
    });
    expect(headerSandboxSwitch).toHaveAttribute("aria-checked", "true");
    expect(headerSandboxSwitch).toHaveAttribute("data-slot", "switch");
    expect(within(sandboxSection).getByText("沙盒开关")).toBeInTheDocument();
    expect(
      within(sandboxSection).queryByRole("switch", {
        name: "Sandbox 开关",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(sandboxSection).queryByText("横栏和此处开关会同步更新，详细配置请切到 JSON。"),
    ).toBeNull();
    expect(within(sandboxSection).getByText("当前状态：已启用")).toBeInTheDocument();
    expect(within(sandboxSection).getByText("当前有 1 个附加配置键。")).toBeInTheDocument();
    expect(within(sandboxSection).getByText("network")).toBeInTheDocument();
    expect(within(sandboxSection).queryByLabelText("允许域名 1")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(sandboxSection).getByRole("button", { name: "JSON" }));
      await Promise.resolve();
    });
    const sandboxJsonInput = within(sandboxSection).getByLabelText("config-preview-input");
    const sandboxJsonValue = (sandboxJsonInput as HTMLTextAreaElement).value;
    expect(sandboxJsonValue).toContain('"allowedDomains"');
    expect(sandboxJsonValue).toContain("example.com");

    const hooksSection = getSection("Hooks");
    expect(within(hooksSection).getByText("1")).toBeInTheDocument();
    toggleAccordionSection("Hooks");
    expect(within(hooksSection).getByText("PostToolUse")).toBeInTheDocument();
    expect(within(hooksSection).getByText("Write")).toBeInTheDocument();
    expect(within(hooksSection).getByText("command: pnpm build")).toBeInTheDocument();
    expect(within(hooksSection).queryByLabelText("Hook 事件 1")).not.toBeInTheDocument();
  });

  it("loads recommended permission rules after confirmation and preserves local permission options", async () => {
    const onSave = vi.fn();
    renderEditor({
      onSave,
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          permissions: {
            defaultMode: "dontAsk",
            disableBypassPermissionsMode: "disable",
            disableAutoMode: "disable",
            allow: ["Bash(old-allow *)"],
            ask: ["Bash(rm *)"],
            deny: ["Read(**/config.yaml)"],
            additionalDirectories: ["~/projects/shared"],
          },
        },
      },
    });

    const permissionsSection = getSection("权限");
    toggleAccordionSection("权限");

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "加载推荐规则预设" }));
    expect(screen.getByText("加载推荐权限规则")).toBeInTheDocument();
    expect(
      screen.getByText(
        "这会覆盖当前 allow、ask、deny 规则，并保留默认模式、禁用 bypassPermissions 和附加目录。",
      ),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "取消" }));
    });
    expect(
      within(permissionsSection).queryByRole("button", { name: "清空允许规则" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 允许规则" }));
    expect(
      within(permissionsSection).getByRole("button", { name: "清空允许规则" }),
    ).toBeInTheDocument();
    expect(within(permissionsSection).getByLabelText("允许规则 1")).toHaveValue(
      "Bash(old-allow *)",
    );

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "加载推荐规则预设" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "加载规则" }));
    });

    expect(within(permissionsSection).queryByLabelText("允许规则 1")).not.toBeInTheDocument();
    expect(within(permissionsSection).queryByLabelText("询问规则 1")).not.toBeInTheDocument();
    expect(within(permissionsSection).queryByLabelText("拒绝规则 1")).not.toBeInTheDocument();

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 允许规则" }));
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 询问规则" }));
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 拒绝规则" }));

    expect(within(permissionsSection).getByLabelText("允许规则 1")).toHaveValue("Bash(pwd)");
    expect(within(permissionsSection).getByLabelText("询问规则 1")).toHaveValue("Bash(rm *)");
    expect(within(permissionsSection).getByLabelText("拒绝规则 1")).toHaveValue("Bash(sudo *)");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedPermissions = onSave.mock.calls[0]?.[0]?.settings.permissions as
      | Record<string, unknown>
      | undefined;
    expect(savedPermissions).toMatchObject({
      defaultMode: "dontAsk",
      disableBypassPermissionsMode: "disable",
      disableAutoMode: "disable",
      additionalDirectories: ["~/projects/shared"],
    });
    expect(savedPermissions?.allow).toContain("Bash(go test *)");
    expect(savedPermissions?.allow).not.toContain("Bash(old-allow *)");
    expect(savedPermissions?.ask).toContain("Bash(curl *)");
    expect(savedPermissions?.deny).toContain("Bash(git reset --hard*)");
    expect(savedPermissions?.deny).not.toContain("Read(**/config.yaml)");
  }, 10_000);

  it("clears allow, ask, and deny rules independently without clearing other permission options", async () => {
    const onSave = vi.fn();
    renderEditor({
      onSave,
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          permissions: {
            defaultMode: "dontAsk",
            disableBypassPermissionsMode: "disable",
            allow: ["Bash(git status *)", "Bash(pnpm test *)"],
            ask: ["Bash(curl *)"],
            deny: ["Bash(git reset --hard*)"],
            additionalDirectories: ["~/projects/shared"],
          },
        },
      },
    });

    const permissionsSection = getSection("权限");
    toggleAccordionSection("权限");

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 允许规则" }));
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "清空允许规则" }));
    const allowClearDialog = screen.getByRole("alertdialog", { name: "清空允许规则" });
    expect(within(allowClearDialog).getByText("清空允许规则")).toBeInTheDocument();
    fireEvent.click(within(allowClearDialog).getByRole("button", { name: "取消" }));
    expect(within(permissionsSection).getByLabelText("允许规则 1")).toHaveValue(
      "Bash(git status *)",
    );

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "清空允许规则" }));
    fireEvent.click(screen.getByRole("button", { name: "确认清空" }));
    expect(within(permissionsSection).queryByLabelText("允许规则 1")).not.toBeInTheDocument();
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 询问规则" }));
    expect(within(permissionsSection).getByLabelText("询问规则 1")).toHaveValue("Bash(curl *)");

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "清空询问规则" }));
    const askClearDialog = screen.getByRole("alertdialog", { name: "清空询问规则" });
    expect(within(askClearDialog).getByText("清空询问规则")).toBeInTheDocument();
    fireEvent.click(within(askClearDialog).getByRole("button", { name: "确认清空" }));
    expect(within(permissionsSection).queryByLabelText("询问规则 1")).not.toBeInTheDocument();
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 拒绝规则" }));
    expect(within(permissionsSection).getByLabelText("拒绝规则 1")).toHaveValue(
      "Bash(git reset --hard*)",
    );

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "清空拒绝规则" }));
    const denyClearDialog = screen.getByRole("alertdialog", { name: "清空拒绝规则" });
    expect(within(denyClearDialog).getByText("清空拒绝规则")).toBeInTheDocument();
    fireEvent.click(within(denyClearDialog).getByRole("button", { name: "确认清空" }));
    expect(within(permissionsSection).queryByLabelText("拒绝规则 1")).not.toBeInTheDocument();
    expect(within(permissionsSection).getByLabelText("附加目录 1")).toHaveValue(
      "~/projects/shared",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedPermissions = onSave.mock.calls[0]?.[0]?.settings.permissions as
      | Record<string, unknown>
      | undefined;
    expect(savedPermissions).toMatchObject({
      defaultMode: "dontAsk",
      disableBypassPermissionsMode: "disable",
      additionalDirectories: ["~/projects/shared"],
    });
    expect(savedPermissions).not.toHaveProperty("allow");
    expect(savedPermissions).not.toHaveProperty("ask");
    expect(savedPermissions).not.toHaveProperty("deny");
  });

  it("moves rules between allow and ask lists without duplicating existing target rules", async () => {
    const onSave = vi.fn();
    renderEditor({
      onSave,
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          permissions: {
            defaultMode: "dontAsk",
            disableBypassPermissionsMode: "disable",
            disableAutoMode: "disable",
            allow: ["Bash(pwd)", "Bash(curl *)"],
            ask: ["Bash(rm *)", "Bash(curl *)"],
            deny: ["Bash(git reset --hard*)"],
            additionalDirectories: ["~/projects/shared"],
          },
        },
      },
    });

    const permissionsSection = getSection("权限");
    toggleAccordionSection("权限");
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 允许规则" }));
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 询问规则" }));

    fireEvent.click(
      within(permissionsSection).getByRole("button", { name: "转为询问 允许规则 1" }),
    );
    fireEvent.click(
      within(permissionsSection).getByRole("button", { name: "转为询问 允许规则 1" }),
    );
    fireEvent.click(
      within(permissionsSection).getByRole("button", { name: "转为允许 询问规则 1" }),
    );

    expect(within(permissionsSection).getByLabelText("允许规则 1")).toHaveValue("Bash(rm *)");
    expect(within(permissionsSection).getByLabelText("询问规则 1")).toHaveValue("Bash(curl *)");
    expect(within(permissionsSection).getByLabelText("询问规则 2")).toHaveValue("Bash(pwd)");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedPermissions = onSave.mock.calls[0]?.[0]?.settings.permissions as
      | Record<string, unknown>
      | undefined;
    expect(savedPermissions).toMatchObject({
      defaultMode: "dontAsk",
      disableBypassPermissionsMode: "disable",
      disableAutoMode: "disable",
      additionalDirectories: ["~/projects/shared"],
    });
    expect(savedPermissions?.allow).toEqual(["Bash(rm *)"]);
    expect(savedPermissions?.ask).toEqual(["Bash(curl *)", "Bash(pwd)"]);
    expect(savedPermissions?.deny).toEqual(["Bash(git reset --hard*)"]);
  });

  it("toggles loose mode by moving configured ask rules into allow and back", async () => {
    const onSave = vi.fn();
    renderEditor({
      onSave,
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          permissions: {
            defaultMode: "dontAsk",
            disableBypassPermissionsMode: "disable",
            allow: ["Bash(pwd)"],
            ask: ["Bash(kill *)", "Bash(env)", "Bash(custom *)"],
            additionalDirectories: ["~/projects/shared"],
          },
        },
      },
    });

    const permissionsSection = getSection("权限");
    await act(async () => {
      toggleAccordionSection("权限");
      await Promise.resolve();
    });
    const looseModeSwitch = within(permissionsSection).getByRole("switch", {
      name: "宽松模式",
    });
    expect(
      within(permissionsSection).getByRole("button", { name: "宽松模式说明" }),
    ).toHaveAttribute(
      "data-tooltip",
      "启用后会把宽松规则从询问规则移动到允许规则；关闭后会把这些规则移回询问规则。只影响当前编辑草稿，保存后生效。",
    );
    expect(looseModeSwitch).toHaveAttribute("aria-checked", "false");

    await act(async () => {
      fireEvent.click(looseModeSwitch);
      await Promise.resolve();
    });
    expect(looseModeSwitch).toHaveAttribute("aria-checked", "true");
    expect(
      within(permissionsSection).getByRole("button", { name: "收起 允许规则" }),
    ).toBeInTheDocument();

    expect(within(permissionsSection).getByLabelText("允许规则 1")).toHaveValue("Bash(pwd)");
    expect(within(permissionsSection).getByLabelText("允许规则 2")).toHaveValue("Bash(kill *)");
    expect(within(permissionsSection).getByLabelText("允许规则 3")).toHaveValue("Bash(env)");
    expect(within(permissionsSection).getByLabelText("询问规则 1")).toHaveValue("Bash(custom *)");

    await act(async () => {
      fireEvent.click(looseModeSwitch);
      await Promise.resolve();
    });
    expect(looseModeSwitch).toHaveAttribute("aria-checked", "false");

    expect(within(permissionsSection).getByLabelText("允许规则 1")).toHaveValue("Bash(pwd)");
    expect(within(permissionsSection).getByLabelText("询问规则 1")).toHaveValue("Bash(custom *)");
    expect(within(permissionsSection).getByLabelText("询问规则 2")).toHaveValue("Bash(kill *)");
    expect(within(permissionsSection).getByLabelText("询问规则 3")).toHaveValue("Bash(env)");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedPermissions = onSave.mock.calls[0]?.[0]?.settings.permissions as
      | Record<string, unknown>
      | undefined;
    expect(savedPermissions).toMatchObject({
      defaultMode: "dontAsk",
      disableBypassPermissionsMode: "disable",
      additionalDirectories: ["~/projects/shared"],
    });
    expect(savedPermissions?.allow).toEqual(["Bash(pwd)"]);
    expect(savedPermissions?.ask).toEqual(["Bash(custom *)", "Bash(kill *)", "Bash(env)"]);
  });

  it("selects an additional directory from the add action and preserves cancel as no-op", async () => {
    const onSave = vi.fn();
    openDialogMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("/Users/test-user/Projects/shared");
    renderEditor({
      onSave,
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          permissions: {},
        },
      },
    });

    const permissionsSection = getSection("权限");
    toggleAccordionSection("权限");

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "新增附加目录" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(openDialogMock).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "选择附加目录",
    });
    expect(within(permissionsSection).queryByLabelText("附加目录 1")).not.toBeInTheDocument();

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "新增附加目录" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(within(permissionsSection).getByLabelText("附加目录 1")).toHaveValue(
      "/Users/test-user/Projects/shared",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedPermissions = onSave.mock.calls[0]?.[0]?.settings.permissions as
      | Record<string, unknown>
      | undefined;
    expect(savedPermissions?.additionalDirectories).toEqual(["/Users/test-user/Projects/shared"]);
  });

  it("replaces an existing additional directory from the row select action", async () => {
    const onSave = vi.fn();
    openDialogMock.mockResolvedValueOnce("/Users/test-user/Projects/replacement");
    renderEditor({
      onSave,
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          permissions: {
            additionalDirectories: ["~/projects/shared"],
          },
        },
      },
    });

    const permissionsSection = getSection("权限");
    toggleAccordionSection("权限");

    fireEvent.click(
      within(permissionsSection).getByRole("button", { name: "选择目录 附加目录 1" }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(within(permissionsSection).getByLabelText("附加目录 1")).toHaveValue(
      "/Users/test-user/Projects/replacement",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    const savedPermissions = onSave.mock.calls[0]?.[0]?.settings.permissions as
      | Record<string, unknown>
      | undefined;
    expect(savedPermissions?.additionalDirectories).toEqual([
      "/Users/test-user/Projects/replacement",
    ]);
  });

  it("syncs permission default mode between header quick select and editor, and clears it on save", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    const permissionsSection = getSection("权限");
    const headerDefaultMode = within(permissionsSection).getByLabelText("权限头部默认模式");

    fireEvent.change(headerDefaultMode, {
      target: { value: "plan" },
    });

    toggleAccordionSection("权限");
    expect(screen.queryByLabelText("默认模式")).not.toBeInTheDocument();
    expect(within(permissionsSection).getByLabelText("权限头部默认模式")).toHaveValue("plan");

    fireEvent.change(within(permissionsSection).getByLabelText("权限头部默认模式"), {
      target: { value: "" },
    });
    expect(screen.queryByLabelText("默认模式")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]?.settings).not.toHaveProperty("permissions");
  });

  it("adds the mojibake hook preset from the hooks shortcut in profile view", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    const hooksSection = getSection("Hooks");
    toggleAccordionSection("Hooks");

    fireEvent.click(within(hooksSection).getByRole("button", { name: "添加乱码检查预设" }));

    expect(within(hooksSection).getByText("PreToolUse")).toBeInTheDocument();
    expect(within(hooksSection).getByText("PostToolUse")).toBeInTheDocument();
    expect(within(hooksSection).getByText("Bash")).toBeInTheDocument();
    expect(within(hooksSection).getByText("Edit|Write")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  {
                    type: "command",
                    command: MOJIBAKE_PRE_TOOL_USE_COMMAND,
                  },
                ],
              },
            ],
            PostToolUse: [
              {
                matcher: "Edit|Write",
                hooks: [
                  {
                    type: "command",
                    command: MOJIBAKE_POST_TOOL_USE_COMMAND,
                  },
                ],
              },
            ],
          },
        }),
      }),
    );
  });

  it("adds the sandbox preset from the sandbox shortcut in profile view", async () => {
    const onSave = vi.fn();
    renderEditor({
      onSave,
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          sandbox: {
            filesystem: {
              allowWrite: ["/tmp/build"],
            },
            excludedCommands: ["pnpm *"],
            network: {
              allowedDomains: ["example.com"],
              allowUnixSockets: ["/tmp/app.sock"],
            },
          },
        },
      },
    });

    const sandboxSection = getSection("Sandbox");
    toggleAccordionSection("Sandbox");

    fireEvent.click(within(sandboxSection).getByRole("button", { name: "添加沙盒预设配置" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedSandbox = onSave.mock.calls[0]?.[0]?.settings.sandbox as
      | Record<string, unknown>
      | undefined;
    expect(savedSandbox).toMatchObject({
      enabled: true,
      autoAllowBashIfSandboxed: true,
      filesystem: {
        allowWrite: ["/tmp/build"],
      },
    });
    expect(savedSandbox?.excludedCommands).toEqual(["pnpm *", "docker *", "git *"]);
    const savedNetwork = savedSandbox?.network as Record<string, unknown> | undefined;
    expect(savedNetwork).toMatchObject({
      allowedDomains: ["example.com"],
      allowLocalBinding: true,
    });
    expect(savedNetwork?.allowUnixSockets).toEqual(["/tmp/app.sock", "/var/run/docker.sock"]);
  });

  it("keeps delegate visible for existing permissions default mode without exposing it as a normal option", () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          ...PROFILE_FIXTURE.settings,
          permissions: {
            defaultMode: "delegate",
          },
        },
      },
    });

    const permissionsSection = getSection("权限");
    const permissionModeSelect = within(permissionsSection).getByLabelText(
      "权限头部默认模式",
    ) as HTMLSelectElement;

    expect(permissionModeSelect).toHaveValue("delegate");
    expect(comboboxOptionNames("权限头部默认模式")).toEqual([
      "未设置",
      "default",
      "acceptEdits",
      "plan",
      "dontAsk",
      "bypassPermissions",
      "delegate",
      "auto",
    ]);
  });

  it("keeps detailed sandbox json while toggling the sandbox switch off", async () => {
    const { onSave } = renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          ...PROFILE_FIXTURE.settings,
          sandbox: {
            enabled: true,
            network: {
              allowedDomains: ["example.com"],
            },
          },
        },
      },
    });

    const sandboxSection = getSection("Sandbox");
    toggleAccordionSection("Sandbox");
    await act(async () => {
      fireEvent.click(within(sandboxSection).getByRole("switch", { name: "Sandbox 头部开关" }));
      fireEvent.click(within(sandboxSection).getByRole("button", { name: "JSON" }));
      await Promise.resolve();
    });
    expect(within(sandboxSection).getByText("已关闭 · 1 个附加配置键")).toBeInTheDocument();
    const sandboxJsonInput = within(sandboxSection).getByLabelText("config-preview-input");
    const sandboxJsonValue = (sandboxJsonInput as HTMLTextAreaElement).value;
    expect(sandboxJsonValue).toContain('"allowedDomains"');
    expect(sandboxJsonValue).not.toContain('"enabled": true');

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          sandbox: {
            network: {
              allowedDomains: ["example.com"],
            },
          },
        }),
      }),
    );
  });

  it("blocks save when sandbox json is invalid", async () => {
    renderEditor();

    const sandboxSection = getSection("Sandbox");
    toggleAccordionSection("Sandbox");
    await act(async () => {
      fireEvent.click(within(sandboxSection).getByRole("button", { name: "JSON" }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.change(within(sandboxSection).getByLabelText("config-preview-input"), {
        target: { value: "[]" },
      });
      await Promise.resolve();
    });
    expect(
      within(sandboxSection).getAllByText("Sandbox JSON 必须是 JSON 对象").length,
    ).toBeGreaterThan(0);
    expect(
      within(sandboxSection).getByText("当前草稿未生效，仍使用上一次合法 JSON。"),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("blocks save when status line json is invalid", async () => {
    renderEditor();

    const statusLineSection = switchSectionToJson("状态行", { expandFirst: true });
    fireEvent.change(within(statusLineSection).getByLabelText("config-preview-input"), {
      target: {
        value: JSON.stringify(
          {
            type: "command",
            command: "",
            refreshInterval: 0,
          },
          null,
          2,
        ),
      },
    });

    expect(
      within(statusLineSection).getAllByText("状态行 JSON 中的 command 不能为空").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("blocks save when source json is invalid", async () => {
    renderEditor();

    const documentSection = getSection("最终配置");
    await act(async () => {
      fireEvent.click(within(documentSection).getByRole("button", { name: "编辑源 JSON" }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.change(within(documentSection).getByLabelText("config-preview-input"), {
        target: { value: "[]" },
      });
      await Promise.resolve();
    });

    expect(within(documentSection).getByText("settings 必须是 JSON 对象")).toBeInTheDocument();
    expect(
      within(documentSection).getByText("当前草稿未生效，仍使用上一次合法 JSON。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("renders resolved preview output after structured edits", async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("默认模型"), {
      target: { value: "claude-haiku-4-5" },
    });

    await flushProfilePreviewDebounce();

    const previewOutputs = screen.getAllByTestId("config-preview-output");
    const latestPreview = previewOutputs[previewOutputs.length - 1];
    expect(latestPreview).toHaveTextContent('"$schema"');
    expect(latestPreview).toHaveTextContent('"claude-haiku-4-5"');
    expect(invokeMock).toHaveBeenLastCalledWith(
      "preview_profile",
      expect.objectContaining({
        data: expect.not.objectContaining({
          target: expect.anything(),
        }),
      }),
    );
  });

  it("preloads resolved profile preview before the final config section is visible", async () => {
    class MockIntersectionObserver implements Pick<IntersectionObserver, "disconnect" | "observe"> {
      readonly disconnect = vi.fn();
      readonly observe = vi.fn();
    }
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: MockIntersectionObserver,
    });

    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          permissions: {
            allow: ["Bash(pwd)", "Bash(git status *)"],
            ask: ["Bash(cat *)"],
            deny: ["Bash(sudo *)"],
          },
        },
      },
    });

    await flushProfilePreviewDebounce();

    expect(invokeMock).toHaveBeenCalledWith("preview_profile", expect.anything());
  });

  it("renders resolved settings labels in english", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );

    renderEditor();

    const documentSection = getSection("Resolved Settings");
    expect(within(documentSection).getByRole("button", { name: "Preview" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(documentSection).getByRole("button", { name: "Edit Source JSON" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Full Settings JSON" })).not.toBeInTheDocument();
  });

  it("saves marketplace and status line settings from structured controls", async () => {
    const { onSave } = renderEditor();

    const marketplacesSection = screen
      .getByRole("heading", { name: "插件市场", level: 3 })
      .closest("section") as HTMLElement | null;
    expect(marketplacesSection).not.toBeNull();
    if (!marketplacesSection) {
      return;
    }

    toggleAccordionSection("插件市场");
    fireEvent.click(within(marketplacesSection).getByRole("button", { name: "新增 Marketplace" }));
    fireEvent.change(screen.getByLabelText("Marketplace ID"), {
      target: { value: "team-market" },
    });
    fireEvent.change(screen.getByLabelText("Marketplace 来源"), {
      target: { value: "github" },
    });
    fireEvent.change(screen.getByLabelText("Marketplace 仓库"), {
      target: { value: "team/plugins" },
    });
    fireEvent.change(screen.getByLabelText("Marketplace Ref"), {
      target: { value: "main" },
    });
    fireEvent.change(screen.getByLabelText("Marketplace 路径"), {
      target: { value: ".claude-plugin/marketplace.json" },
    });
    fireEvent.change(screen.getByLabelText("Marketplace 安装位置"), {
      target: { value: "/tmp/team-market" },
    });
    fireEvent.click(within(marketplacesSection).getByRole("button", { name: "保存 Marketplace" }));

    expect(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace team-market" }),
    ).toBeInTheDocument();
    expect(within(marketplacesSection).getByText("github")).toBeInTheDocument();
    expect(within(marketplacesSection).getByText("team/plugins")).toBeInTheDocument();
    expect(screen.queryByLabelText("Marketplace ID")).not.toBeInTheDocument();

    const statusLineSection = screen
      .getByRole("heading", { name: "状态行", level: 3 })
      .closest("section") as HTMLElement | null;
    expect(statusLineSection).not.toBeNull();
    if (!statusLineSection) {
      return;
    }

    toggleAccordionSection("状态行");
    fireEvent.change(within(statusLineSection).getByLabelText("状态行命令"), {
      target: { value: "~/.claude/statusline.sh" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("状态行填充"), {
      target: { value: "2" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("状态行刷新间隔"), {
      target: { value: "5" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledWith({
      id: "user-openrouter",
      name: "OpenRouter User",
      description: "默认用户配置",
      providerId: "builtin:openrouter",
      settings: expect.objectContaining({
        env: {
          ANTHROPIC_AUTH_TOKEN: "token",
        },
        extraKnownMarketplaces: {
          "team-market": {
            source: {
              source: "github",
              repo: "team/plugins",
              ref: "main",
              path: ".claude-plugin/marketplace.json",
            },
            installLocation: "/tmp/team-market",
          },
        },
        statusLine: {
          type: "command",
          command: "~/.claude/statusline.sh",
          padding: 2,
          refreshInterval: 5,
        },
      }),
    });
  }, 15000);

  it("installs the default status line preset and saves its command path", async () => {
    const { onSave } = renderEditor();
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      if (command === "install_status_line_preset") {
        expect(payload).toEqual({
          presetId: "default",
          overwrite: false,
        });
        return {
          presetId: "default",
          targetPath: "/Users/test/.claude/statusline.sh",
          commandPath: "~/.claude/statusline.sh",
          installed: true,
          needsOverwrite: false,
        };
      }
      if (command === "preview_profile") {
        const settings =
          (payload as { data?: { settings?: Record<string, unknown> } } | undefined)?.data
            ?.settings ?? {};
        return JSON.stringify(
          {
            $schema: "https://json.schemastore.org/claude-code-settings.json",
            ...settings,
          },
          null,
          2,
        );
      }
      return null;
    });

    const statusLineSection = getSection("状态行");
    toggleAccordionSection("状态行");

    await act(async () => {
      fireEvent.click(
        within(statusLineSection).getByRole("button", { name: "启用默认状态行预设" }),
      );
      await Promise.resolve();
    });

    expect(within(statusLineSection).getByLabelText("状态行命令")).toHaveValue(
      "~/.claude/statusline.sh",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          statusLine: {
            type: "command",
            command: "~/.claude/statusline.sh",
          },
        }),
      }),
    );
  });

  it("confirms before overwriting a different status line script", async () => {
    const { onSave } = renderEditor();
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      if (command === "install_status_line_preset") {
        const overwrite = (payload as { overwrite?: boolean }).overwrite === true;
        return overwrite
          ? {
              presetId: "default",
              targetPath: "/Users/test/.claude/statusline.sh",
              commandPath: "~/.claude/statusline.sh",
              installed: true,
              needsOverwrite: false,
            }
          : {
              presetId: "default",
              targetPath: "/Users/test/.claude/statusline.sh",
              commandPath: "~/.claude/statusline.sh",
              installed: false,
              needsOverwrite: true,
            };
      }
      if (command === "preview_profile") {
        const settings =
          (payload as { data?: { settings?: Record<string, unknown> } } | undefined)?.data
            ?.settings ?? {};
        return JSON.stringify(
          {
            $schema: "https://json.schemastore.org/claude-code-settings.json",
            ...settings,
          },
          null,
          2,
        );
      }
      return null;
    });

    const statusLineSection = getSection("状态行");
    toggleAccordionSection("状态行");

    await act(async () => {
      fireEvent.click(
        within(statusLineSection).getByRole("button", { name: "启用默认状态行预设" }),
      );
      await Promise.resolve();
    });

    expect(screen.getByText("覆盖状态行脚本")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("install_status_line_preset", {
      presetId: "default",
      overwrite: false,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "覆盖" }));
      await Promise.resolve();
    });

    expect(invokeMock).toHaveBeenCalledWith("install_status_line_preset", {
      presetId: "default",
      overwrite: true,
    });
    expect(within(statusLineSection).getByLabelText("状态行命令")).toHaveValue(
      "~/.claude/statusline.sh",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          statusLine: {
            type: "command",
            command: "~/.claude/statusline.sh",
          },
        }),
      }),
    );
  });

  it("keeps the existing status line value when preset installation fails", async () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          ...PROFILE_FIXTURE.settings,
          statusLine: {
            type: "command",
            command: "~/.claude/custom-statusline.sh",
          },
        },
      },
    });
    invokeMock.mockImplementation(async (command: string, payload?: unknown) => {
      if (command === "install_status_line_preset") {
        throw new Error("install failed");
      }
      if (command === "preview_profile") {
        const settings =
          (payload as { data?: { settings?: Record<string, unknown> } } | undefined)?.data
            ?.settings ?? {};
        return JSON.stringify(
          {
            $schema: "https://json.schemastore.org/claude-code-settings.json",
            ...settings,
          },
          null,
          2,
        );
      }
      return null;
    });

    const statusLineSection = getSection("状态行");
    toggleAccordionSection("状态行");

    await act(async () => {
      fireEvent.click(
        within(statusLineSection).getByRole("button", { name: "启用默认状态行预设" }),
      );
      await Promise.resolve();
    });

    expect(showToastMock).toHaveBeenCalledWith("启用状态行预设失败", "error");
    expect(within(statusLineSection).getByLabelText("状态行命令")).toHaveValue(
      "~/.claude/custom-statusline.sh",
    );
  });

  it("shows a platform-specific message when the default status line preset is unsupported", async () => {
    renderEditor();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "install_status_line_preset") {
        throw new Error("status_line_preset_unsupported_platform");
      }
      return null;
    });

    const statusLineSection = getSection("状态行");
    toggleAccordionSection("状态行");

    await act(async () => {
      fireEvent.click(
        within(statusLineSection).getByRole("button", { name: "启用默认状态行预设" }),
      );
      await Promise.resolve();
    });

    expect(showToastMock).toHaveBeenCalledWith("当前平台不支持默认状态行预设", "error");
  });

  it("validates status line controls and removes statusLine when cleared", async () => {
    const onSave = vi.fn();
    renderEditor({
      onSave,
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          ...PROFILE_FIXTURE.settings,
          statusLine: {
            type: "command",
            command: "~/.claude/statusline.sh",
            padding: 2,
            refreshInterval: 5,
          },
        },
      },
    });

    const statusLineSection = getSection("状态行");
    toggleAccordionSection("状态行");

    fireEvent.change(within(statusLineSection).getByLabelText("状态行命令"), {
      target: { value: "" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("状态行填充"), {
      target: { value: "2" },
    });
    expect(within(statusLineSection).getAllByText("状态行命令不能为空").length).toBeGreaterThan(0);

    fireEvent.change(within(statusLineSection).getByLabelText("状态行命令"), {
      target: { value: "~/.claude/statusline.sh" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("状态行刷新间隔"), {
      target: { value: "0" },
    });
    expect(
      within(statusLineSection).getAllByText("状态行刷新间隔必须大于或等于 1").length,
    ).toBeGreaterThan(0);

    fireEvent.change(within(statusLineSection).getByLabelText("状态行命令"), {
      target: { value: "" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("状态行填充"), {
      target: { value: "" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("状态行刷新间隔"), {
      target: { value: "" },
    });

    expect(within(statusLineSection).queryByText("状态行命令不能为空")).toBeNull();
    expect(within(statusLineSection).queryByText("状态行刷新间隔必须大于或等于 1")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.not.objectContaining({
          statusLine: expect.anything(),
        }),
      }),
    );
  });

  it("renders marketplace summaries and blocks switching, adding, and deleting while a draft is dirty", () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          ...PROFILE_FIXTURE.settings,
          extraKnownMarketplaces: {
            "team-market": {
              source: {
                source: "github",
                repo: "team/plugins",
                ref: "main",
                path: ".claude-plugin/marketplace.json",
              },
              installLocation: "/tmp/team-market",
            },
            "docs-market": {
              source: {
                source: "url",
                url: "https://example.com/marketplace.json",
              },
            },
          },
        },
      },
    });

    const marketplacesSection = getSection("插件市场");
    toggleAccordionSection("插件市场");

    expect(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace team-market" }),
    ).toBeInTheDocument();
    expect(
      within(marketplacesSection).getByRole("button", {
        name: "删除 Marketplace team-market",
      }),
    ).toBeInTheDocument();
    expect(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace docs-market" }),
    ).toBeInTheDocument();
    expect(within(marketplacesSection).getByText("team/plugins")).toBeInTheDocument();
    expect(
      within(marketplacesSection).getByText("https://example.com/marketplace.json"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Marketplace ID")).not.toBeInTheDocument();

    fireEvent.click(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace team-market" }),
    );
    fireEvent.change(screen.getByLabelText("Marketplace Ref"), {
      target: { value: "release" },
    });

    fireEvent.click(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace docs-market" }),
    );
    expect(
      within(marketplacesSection).getAllByText("请先保存或取消当前 Marketplace 编辑。").length,
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText("Marketplace Ref")).toHaveValue("release");

    fireEvent.click(within(marketplacesSection).getByRole("button", { name: "新增 Marketplace" }));
    expect(
      within(marketplacesSection).getAllByText("请先保存或取消当前 Marketplace 编辑。").length,
    ).toBeGreaterThan(0);

    fireEvent.click(
      within(marketplacesSection).getByRole("button", { name: "删除 Marketplace docs-market" }),
    );
    expect(
      within(marketplacesSection).getByRole("button", { name: "编辑 Marketplace docs-market" }),
    ).toBeInTheDocument();
    expect(
      within(marketplacesSection).getAllByText("请先保存或取消当前 Marketplace 编辑。").length,
    ).toBeGreaterThan(0);

    fireEvent.click(within(marketplacesSection).getByRole("button", { name: "保存 Marketplace" }));

    expect(screen.queryByLabelText("Marketplace Ref")).not.toBeInTheDocument();
    expect(within(marketplacesSection).getByText(/Ref: release/)).toBeInTheDocument();
  });

  it("allows deleting a new marketplace draft directly without saving first", () => {
    renderEditor();

    const marketplacesSection = getSection("插件市场");
    toggleAccordionSection("插件市场");

    fireEvent.click(within(marketplacesSection).getByRole("button", { name: "新增 Marketplace" }));
    fireEvent.change(screen.getByLabelText("Marketplace ID"), {
      target: { value: "draft-market" },
    });

    fireEvent.click(
      within(marketplacesSection).getByRole("button", {
        name: "删除 Marketplace draft-market",
      }),
    );

    expect(
      within(marketplacesSection).queryByRole("button", {
        name: "编辑 Marketplace draft-market",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Marketplace ID")).not.toBeInTheDocument();
    expect(
      within(marketplacesSection).queryByText("请先保存或取消当前 Marketplace 编辑。"),
    ).not.toBeInTheDocument();
  });

  it("saves the official marketplace from the shared marketplace shortcut", async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });

    const marketplacesSection = getSection("插件市场");
    toggleAccordionSection("插件市场");

    await act(async () => {
      fireEvent.click(within(marketplacesSection).getByRole("button", { name: "启用官方市场" }));
      await Promise.resolve();
    });

    expect(
      within(marketplacesSection).getByRole("button", {
        name: `编辑 Marketplace ${OFFICIAL_MARKETPLACE_ID}`,
      }),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          extraKnownMarketplaces: {
            [OFFICIAL_MARKETPLACE_ID]: {
              source: {
                source: "github",
                repo: OFFICIAL_MARKETPLACE_REPO,
              },
            },
          },
        }),
      }),
    );
  });

  it("shows marketplace plugins in the browse tab without writing them to enabledPlugins until enabled", async () => {
    const onSave = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        plugins: [{ name: "reviewer-plugin" }, { name: "writer-plugin" }],
      }),
    });
    renderEditor({
      onSave,
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          ...PROFILE_FIXTURE.settings,
          extraKnownMarketplaces: {
            [OFFICIAL_MARKETPLACE_ID]: {
              source: {
                source: "github",
                repo: OFFICIAL_MARKETPLACE_REPO,
              },
            },
          },
          enabledPlugins: {
            "formatter@anthropic-tools": true,
          },
        },
      },
    });

    const pluginsSection = getSection("插件");
    toggleAccordionSection("插件");

    // 双 Tab 结构已替换原来的加载官方插件按钮
    expect(within(pluginsSection).getByRole("tab", { name: /已配置/ })).toBeInTheDocument();
    expect(within(pluginsSection).getByRole("tab", { name: "浏览市场" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    // 浏览市场中的插件不会自动写入 enabledPlugins
    expect(onSave).toHaveBeenCalledTimes(1);
    const savedProfile = onSave.mock.calls[0][0];
    expect(savedProfile.settings.enabledPlugins).toEqual({
      "formatter@anthropic-tools": true,
    });
  });

  it("keeps the plugin refresh action in the browse tab", async () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        settings: {
          ...PROFILE_FIXTURE.settings,
          extraKnownMarketplaces: {
            [OFFICIAL_MARKETPLACE_ID]: {
              source: {
                source: "github",
                repo: OFFICIAL_MARKETPLACE_REPO,
              },
            },
          },
        },
      },
    });

    const pluginsSection = getSection("插件");
    toggleAccordionSection("插件");
    await flushAsyncUpdates();

    const modeRow = getSectionModeRow(pluginsSection, "插件");
    expect(within(modeRow).getByRole("button", { name: "控件" })).toBeInTheDocument();
    expect(within(modeRow).getByRole("button", { name: "JSON" })).toBeInTheDocument();
    const docsButton = within(modeRow).getByRole("button", { name: "查看 插件 官方文档" });
    expect(docsButton).toBeInTheDocument();
    expect(docsButton).toHaveTextContent("官方文档");

    // 刷新按钮已移至浏览市场 Tab，不再出现在模式切换行
    expect(within(modeRow).queryByRole("button", { name: "加载官方插件" })).not.toBeInTheDocument();

    // 浏览市场 Tab 存在，刷新功能在此 Tab 内
    expect(within(pluginsSection).getByRole("tab", { name: "浏览市场" })).toBeInTheDocument();
  });

  it("does not show the official plugin load button when the marketplace is not in the profile settings", () => {
    // 段 B：Provider 不再有 settingsPatch/basePresetId，extraKnownMarketplaces 只能存在于 profile.settings
    // 此测试验证 profile.settings 未配置 extraKnownMarketplaces 时不显示"加载官方插件"按钮
    renderEditor({
      providers: [
        ...BUILTIN_PRESETS,
        {
          id: "custom:no-marketplace",
          name: "No Marketplace",
          localizedName: {
            zh: "无市场配置",
            en: "No Marketplace",
          },
          description: "未配置官方市场的供应商",
          modelSuggestions: [],
          env: {},
        },
      ],
      profile: {
        ...PROFILE_FIXTURE,
        providerId: "custom:no-marketplace",
        settings: {
          ...PROFILE_FIXTURE.settings,
        },
      },
    });

    const pluginsSection = getSection("插件");
    toggleAccordionSection("插件");

    expect(
      within(pluginsSection).queryByRole("button", { name: "加载官方插件" }),
    ).not.toBeInTheDocument();
  });

  it("selects a provider model via the model dropdown without exposing removed legacy scope fields", async () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        providerId: undefined,
      },
    });

    expect(screen.queryByLabelText("作用域")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/项目路径/)).not.toBeInTheDocument();

    chooseComboboxOption("供应商", "开放路由");
    await act(async () => {
      await Promise.resolve();
    });
    // 未覆盖时 provider 默认作占位显示,值为空(覆盖层只存差异)
    expect(screen.getByLabelText("默认模型")).toHaveValue("");
    expect(screen.getByLabelText("默认模型")).toHaveAttribute("placeholder", "claude-sonnet-4-6");

    // 模型字段为可输入下拉框:展开后从供应商候选中选择即回填到字段
    const modelField = screen.getByLabelText("默认模型").closest('[data-slot="settings-field"]');
    expect(modelField).not.toBeNull();
    await act(async () => {
      fireEvent.click(within(modelField as HTMLElement).getByRole("button", { name: "选择模型" }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: "claude-opus-4-1" }));
      await Promise.resolve();
    });

    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-opus-4-1");

    const modelBehaviorSection = screen
      .getByRole("heading", { name: "模型与行为" })
      .closest("section");
    expect(modelBehaviorSection).not.toBeNull();
    if (modelBehaviorSection) {
      expect(
        within(modelBehaviorSection).queryByPlaceholderText("sk-ant-..."),
      ).not.toBeInTheDocument();
      expect(within(modelBehaviorSection).queryByText("Base URL")).not.toBeInTheDocument();
    }
  });

  it("removes legacy profile base url from save payload after selecting a provider", async () => {
    const onSave = vi.fn().mockReturnValue(true);
    renderEditor({
      onSave,
      profile: {
        ...PROFILE_FIXTURE,
        providerId: undefined,
        settings: {
          env: {
            ANTHROPIC_AUTH_TOKEN: "token",
            ANTHROPIC_BASE_URL: "https://manual.example.com",
            OTHER_ENV: "keep-me",
          },
        },
      },
    });

    chooseComboboxOption("供应商", "开放路由");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    const saved = onSave.mock.calls[0]?.[0];
    expect(saved).toMatchObject({
      providerId: "builtin:openrouter",
      settings: {
        env: {
          ANTHROPIC_AUTH_TOKEN: "token",
          OTHER_ENV: "keep-me",
        },
      },
    });
    expect(saved?.settings.env).not.toHaveProperty("ANTHROPIC_BASE_URL");
  });

  it("shows provider model defaults as placeholders and preserves user overrides across provider switches", () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        providerId: undefined,
        settings: {
          env: {
            ANTHROPIC_AUTH_TOKEN: "token",
          },
        },
      },
    });

    // 选开放路由（env 显式声明默认模型与 ANTHROPIC_BASE_URL）：地址只读;未覆盖的模型字段以 provider 默认作占位,值为空
    chooseComboboxOption("供应商", "开放路由");
    expect(screen.getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("https://openrouter.ai/api");
    expect(screen.getByLabelText("ANTHROPIC_BASE_URL")).toBeDisabled();
    expect(screen.getByLabelText("默认模型")).toHaveValue("");
    expect(screen.getByLabelText("默认模型")).toHaveAttribute("placeholder", "claude-sonnet-4-6");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveAttribute(
      "placeholder",
      "claude-opus-4-1",
    );
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveAttribute(
      "placeholder",
      "claude-sonnet-4-6",
    );
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveAttribute(
      "placeholder",
      "claude-haiku-4-5",
    );

    // 手动覆盖默认模型 → 写入 settings,显示为值
    fireEvent.change(screen.getByLabelText("默认模型"), { target: { value: "my-model" } });
    expect(screen.getByLabelText("默认模型")).toHaveValue("my-model");

    // 切到团队计划（env 空）：用户覆盖保留(不再被切换清空);未覆盖字段无 provider 默认
    chooseComboboxOption("供应商", "团队计划");
    expect(screen.getByLabelText("默认模型")).toHaveValue("my-model");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("");

    // 切到自定义：地址可编辑且为空,用户覆盖仍保留,auth token 不变
    chooseComboboxOption("供应商", "自定义");
    const baseUrlInput = screen.getByLabelText("ANTHROPIC_BASE_URL");
    expect(baseUrlInput).not.toBeDisabled();
    expect(baseUrlInput).toHaveValue("");
    expect(screen.getByLabelText("默认模型")).toHaveValue("my-model");
    expect(screen.getByLabelText("ANTHROPIC_AUTH_TOKEN")).toHaveValue("token");

    // 自定义模式下手填地址：值更新（写入 settings.env.ANTHROPIC_BASE_URL）
    fireEvent.change(baseUrlInput, { target: { value: "https://custom.example.com/api" } });
    expect(screen.getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue(
      "https://custom.example.com/api",
    );
  });

  it("displays provider-inherited behavior values with a from-provider tag", () => {
    const providers: Provider[] = [
      ...BUILTIN_PRESETS,
      {
        id: "builtin:withdefaults",
        name: "WithDefaults",
        localizedName: { zh: "带默认供应商", en: "WithDefaults" },
        description: "带默认值的供应商",
        modelSuggestions: [],
        env: {
          ANTHROPIC_BASE_URL: "https://example.com/anthropic",
          ANTHROPIC_MODEL: "prov-model",
          CLAUDE_CODE_EFFORT_LEVEL: "max",
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: "1000000",
        },
      },
    ];
    renderEditor({
      providers,
      profile: {
        ...PROFILE_FIXTURE,
        providerId: "builtin:withdefaults",
        settings: { env: { ANTHROPIC_AUTH_TOKEN: "token" } },
      },
    });

    const behaviorSection = getSection("模型与行为");
    // 未覆盖 → 默认模型以 provider 默认作占位
    expect(within(behaviorSection).getByLabelText("默认模型")).toHaveAttribute(
      "placeholder",
      "prov-model",
    );
    // 努力级别 / 自动压缩窗口继承 → 触发按钮显示 provider 的有效值
    expect(within(behaviorSection).getByRole("button", { name: "努力级别" })).toHaveTextContent(
      "max",
    );
    expect(within(behaviorSection).getByRole("button", { name: "自动压缩窗口" })).toHaveTextContent(
      "1M",
    );
    // 继承态显示「来自供应商」标注
    expect(within(behaviorSection).getAllByText("来自供应商").length).toBeGreaterThan(0);
  });

  it("guides users to the merged config preview from the env section", () => {
    renderEditor();

    const envSection = getSection("环境变量");
    toggleAccordionSection("环境变量");

    const viewMergedButton = within(envSection).getByRole("button", {
      name: "查看合并后的完整配置",
    });
    expect(viewMergedButton).toBeInTheDocument();
    // 点击应跳转到配置预览且不抛错(jsdom 下 scrollIntoView 可能未定义,已用可选链规避)
    expect(() => {
      act(() => {
        fireEvent.click(viewMergedButton);
      });
    }).not.toThrow();
  });

  it("describes the merged preview composition in the preview tab", () => {
    renderEditor();

    const documentSection = getSection("最终配置");
    // 预览为默认模式:应有组成说明
    expect(within(documentSection).getByRole("button", { name: "预览" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(documentSection).getByText(/预览是应用后写入/, { selector: "p" }),
    ).toBeInTheDocument();
  });

  it("clarifies edit mode scope and shows clear/format actions on the editor toolbar", () => {
    renderEditor();

    const documentSection = getSection("最终配置");
    fireEvent.click(within(documentSection).getByRole("button", { name: "编辑源 JSON" }));

    expect(within(documentSection).getByText(/这里只编辑当前配置自身的设置/)).toBeInTheDocument();
    // 清空 / 格式化按钮落到编辑框工具条
    expect(within(documentSection).getByRole("button", { name: "清空 JSON" })).toBeInTheDocument();
    expect(
      within(documentSection).getByRole("button", { name: "格式化 JSON" }),
    ).toBeInTheDocument();
  });

  it("renders authentication controls in a dedicated section and keeps hidden env keys in preview", async () => {
    renderEditor();

    const authSection = screen.getByRole("heading", { name: "认证", level: 3 }).closest("section");
    const envSection = screen
      .getByRole("heading", { name: "环境变量", level: 3 })
      .closest("section");
    expect(authSection).not.toBeNull();
    expect(envSection).not.toBeNull();
    if (!authSection || !envSection) {
      return;
    }

    expect(within(authSection).getByLabelText("供应商")).toBeInTheDocument();
    const authTokenInput = within(authSection).getByLabelText("ANTHROPIC_AUTH_TOKEN");
    expect(authTokenInput).toHaveValue("token");
    expect(authTokenInput).toHaveAttribute("type", "password");
    // 地址只读：来自所选供应商（builtin:openrouter）的 env.ANTHROPIC_BASE_URL
    const baseUrlInput = within(authSection).getByLabelText("ANTHROPIC_BASE_URL");
    expect(baseUrlInput).toHaveValue("https://openrouter.ai/api");
    expect(baseUrlInput).toBeDisabled();
    expect(within(authSection).getByLabelText("ANTHROPIC_AUTH_TOKEN")).toBeInTheDocument();
    // 认证相关 key 不在环境变量分区中暴露
    expect(within(envSection).queryByDisplayValue("ANTHROPIC_AUTH_TOKEN")).not.toBeInTheDocument();
    expect(within(envSection).queryByDisplayValue("ANTHROPIC_BASE_URL")).not.toBeInTheDocument();

    // auth token 的显示/隐藏切换
    await act(async () => {
      fireEvent.click(within(authSection).getByRole("button", { name: "显示密钥" }));
      await Promise.resolve();
    });
    expect(authTokenInput).toHaveAttribute("type", "text");
    await act(async () => {
      fireEvent.click(within(authSection).getByRole("button", { name: "隐藏密钥" }));
      await Promise.resolve();
    });
    expect(authTokenInput).toHaveAttribute("type", "password");

    // 修改 auth token（可编辑），验证写入 profile.settings
    fireEvent.change(authTokenInput, {
      target: { value: "auth-token" },
    });

    const statusLineSection = getSection("状态行");
    toggleAccordionSection("状态行");
    fireEvent.change(within(statusLineSection).getByLabelText("状态行命令"), {
      target: { value: "~/.claude/statusline.sh" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("状态行刷新间隔"), {
      target: { value: "5" },
    });

    const rawJsonInput = switchDocumentSectionToEdit("最终配置", "编辑源 JSON");
    // auth token 写入 profile.settings，ANTHROPIC_BASE_URL 来自 provider 不写入 profile
    expect(rawJsonInput.value).toContain('"ANTHROPIC_AUTH_TOKEN": "auth-token"');
    expect(rawJsonInput.value).not.toContain('"ANTHROPIC_BASE_URL"');
    expect(rawJsonInput.value).toContain('"statusLine"');
    expect(rawJsonInput.value).toContain('"~/.claude/statusline.sh"');
    fireEvent.click(within(getSection("最终配置")).getByRole("button", { name: "预览" }));

    await flushProfilePreviewDebounce();

    const previewOutputs = screen.getAllByTestId("config-preview-output");
    const latestPreview = previewOutputs[previewOutputs.length - 1];
    expect(latestPreview).toHaveTextContent('"ANTHROPIC_AUTH_TOKEN": "auth-token"');
    expect(latestPreview).not.toHaveTextContent('"ANTHROPIC_BASE_URL"');
    expect(latestPreview).toHaveTextContent('"statusLine"');
    expect(latestPreview).toHaveTextContent('"~/.claude/statusline.sh"');
  });

  it("shows a fallback top badge for new profiles and updates it as the name changes", async () => {
    renderEditor({ profile: null });

    const topBadge = screen.getByText("P").closest('[data-slot="profile-name-badge"]');
    expect(topBadge).not.toBeNull();
    expect(topBadge).toHaveTextContent("P");

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/名称/), {
        target: { value: "中文配置" },
      });
      await Promise.resolve();
    });
    expect(topBadge).toHaveTextContent("中");
    expect(topBadge).toHaveAttribute("data-color-index");
  });

  it("seeds default-enabled common options for new profiles", async () => {
    const onSave = vi.fn();
    renderEditor({ profile: null, onSave });

    const commonSection = getSection("常用选项");
    expect(within(commonSection).getByText("已启用 8/15")).toBeInTheDocument();
    toggleAccordionSection("常用选项");
    for (const label of [
      "默认启用深度思考",
      "显示 Thinking 摘要",
      "已完成引导设置",
      "跳过 WebFetch 预检",
      "禁用非必要网络请求",
      "启用 LSP 工具",
      "启用新版 Init",
      "启用无闪烁模式",
    ]) {
      expect(
        within(commonSection).getByRole("switch", {
          name: `切换常用选项 ${label}`,
        }),
      ).toHaveAttribute("aria-checked", "true");
    }
    expect(screen.getByLabelText("输出风格")).toHaveValue("");
    for (const label of [
      "接受计划时显示清理上下文",
      "禁用 AI 署名",
      "禁用所有 Hooks",
      "尊重 .gitignore",
      "禁用自动更新",
      "显式启用 Tool Search",
      "启用 Agent Teams",
    ]) {
      expect(
        within(commonSection).getByRole("switch", {
          name: `切换常用选项 ${label}`,
        }),
      ).toHaveAttribute("aria-checked", "false");
    }

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/名称/), {
        target: { value: "默认配置" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.settings).toMatchObject({
      alwaysThinkingEnabled: true,
      showThinkingSummaries: true,
      hasCompletedOnboarding: true,
      skipWebFetchPreflight: true,
    });
    expect(saved.settings.env).toMatchObject({
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      CLAUDE_CODE_NEW_INIT: "1",
      CLAUDE_CODE_NO_FLICKER: "1",
      ENABLE_LSP_TOOL: "1",
    });
    expect(saved.settings).not.toHaveProperty("respectGitignore");
    expect(saved.settings).not.toHaveProperty("outputStyle");
    expect(saved.settings).not.toHaveProperty("attribution");
    expect(saved.settings.env).not.toHaveProperty("DISABLE_AUTOUPDATER");
    expect(saved.settings.env).not.toHaveProperty("ENABLE_TOOL_SEARCH");
    expect(saved.settings.env).not.toHaveProperty("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS");
  });
});
