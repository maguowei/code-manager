import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ConfigProfile, ConfigWorkspace, SettingsPreset } from "../../types";
import ProfileEditor from "../ProfileEditor";
import {
  MOJIBAKE_POST_TOOL_USE_COMMAND,
  MOJIBAKE_PRE_TOOL_USE_COMMAND,
} from "../profile-editor/hook-presets";
import {
  OFFICIAL_MARKETPLACE_ID,
  OFFICIAL_MARKETPLACE_REPO,
} from "../profile-editor/marketplace-presets";

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

interface MockIntersectionObserverInstance {
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
}

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

const WORKSPACE_FIXTURE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
  },
  builtinPresets: [],
  customPresets: [],
  profiles: [],
  bindings: {},
} as ConfigWorkspace;

const BUILTIN_PRESETS: SettingsPreset[] = [
  {
    id: "builtin:openrouter",
    name: "OpenRouter",
    localizedName: {
      zh: "开放路由",
      en: "OpenRouter",
    },
    description: "OpenRouter 预设",
    models: [
      { id: "claude-opus-4-1", category: "opus" },
      { id: "claude-sonnet-4-6", category: "sonnet" },
      { id: "claude-haiku-4-5", category: "haiku" },
    ],
    modelSuggestions: ["claude-sonnet-4-6", "claude-opus-4-1"],
    settingsPatch: {
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      },
    },
    source: "builtin",
  },
  {
    id: "custom:team-plan",
    name: "Team Plan",
    localizedName: {
      zh: "团队计划",
      en: "Team Plan",
    },
    description: "Team Plan 预设",
    basePresetId: "builtin:openrouter",
    modelSuggestions: ["claude-haiku-fallback"],
    settingsPatch: {
      permissions: {
        defaultMode: "plan",
      },
    },
    source: "custom",
  },
  {
    id: "custom:explicit-model",
    name: "Explicit Model",
    localizedName: {
      zh: "显式模型",
      en: "Explicit Model",
    },
    description: "显式模型预设",
    basePresetId: "custom:team-plan",
    modelSuggestions: ["claude-sonnet-4-6"],
    settingsPatch: {
      model: "claude-opus-explicit",
    },
    source: "custom",
  },
  {
    id: "custom:env-level-overrides",
    name: "Env Level Overrides",
    localizedName: {
      zh: "环境变量级别覆盖",
      en: "Env Level Overrides",
    },
    description: "环境变量级别覆盖预设",
    basePresetId: "custom:explicit-model",
    modelSuggestions: ["claude-sonnet-4-6"],
    settingsPatch: {
      env: {
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "haiku-env-override",
        CLAUDE_CODE_SUBAGENT_MODEL: "subagent-env-override",
      },
    },
    source: "custom",
  },
];

const PROFILE_FIXTURE: ConfigProfile = {
  id: "user-openrouter",
  name: "OpenRouter User",
  description: "默认用户配置",
  presetId: "builtin:openrouter",
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
  presets?: SettingsPreset[];
  onSave?: (data: {
    id?: string;
    name: string;
    description: string;
    presetId?: string;
    settings: Record<string, unknown>;
  }) => void | Promise<void>;
}) {
  const profile = options && "profile" in options ? (options.profile ?? null) : PROFILE_FIXTURE;
  const onSave =
    options?.onSave ??
    vi.fn<
      (data: {
        id?: string;
        name: string;
        description: string;
        presetId?: string;
        settings: Record<string, unknown>;
      }) => void | Promise<void>
    >();
  render(
    <I18nProvider>
      <ProfileEditor
        profile={profile}
        presets={options?.presets ?? BUILTIN_PRESETS}
        onSave={onSave}
        onClose={() => {}}
      />
    </I18nProvider>,
  );
  return { onSave };
}

function getSection(name: string): HTMLElement {
  const section = screen.getByRole("heading", { name, level: 3 }).closest("section");
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

function expectAccordionHeaderMeta(section: HTMLElement, text: string) {
  const meta = section.querySelector(".profile-accordion-header-meta");
  expect(meta).not.toBeNull();
  expect(meta).toHaveTextContent(text);
  expect(section.querySelector(".profile-accordion-badge")).toBeNull();
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

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
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

    const topBadge = document.querySelector(
      ".editor-badge-large.profile-name-badge",
    ) as HTMLElement | null;
    expect(topBadge).not.toBeNull();
    expect(topBadge).toHaveTextContent("O");
    const initialColorClass = topBadge?.className.match(/profile-name-badge--color-\d/)?.[0];
    expect(initialColorClass).toBeTruthy();

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
      "Status Line",
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
      "Status Line",
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
    ).toHaveClass("profile-accordion-trigger-large-target");
    expect(screen.getByRole("heading", { name: "权限", level: 3 }).closest("button")).toHaveClass(
      "profile-accordion-trigger-large-target",
    );

    const authSection = screen.getByRole("heading", { name: "认证", level: 3 }).closest("section");
    const basicSection = screen
      .getByRole("heading", { name: "基础信息", level: 3 })
      .closest("section");
    expect(basicSection).not.toBeNull();
    expect(authSection).not.toBeNull();
    if (authSection) {
      expect(within(authSection).getByLabelText("预设")).toBeInTheDocument();
      expect(within(authSection).getByLabelText("ANTHROPIC_AUTH_TOKEN")).toHaveValue("token");
      expect(within(authSection).getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("");
    }
    if (basicSection) {
      expect(within(basicSection).queryByLabelText("预设")).not.toBeInTheDocument();
      const nameLabel = basicSection.querySelector(
        'label[for="profile-name"]',
      ) as HTMLElement | null;
      expect(nameLabel).not.toBeNull();
      expect(nameLabel).toHaveClass("label-required");
      if (nameLabel) {
        expect(within(nameLabel).getByText("必填")).toBeInTheDocument();
      }
    }

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/名称/), {
        target: { value: "beta profile" },
      });
      await Promise.resolve();
    });
    expect(topBadge).toHaveTextContent("B");
    expect(topBadge?.className).not.toContain(initialColorClass ?? "");

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
      const languageSelect = within(behaviorSection).getByRole("combobox", {
        name: "回复语言",
      }) as HTMLSelectElement;
      expect(outputStyleSelect).toBeInTheDocument();
      expect(outputStyleSelect).toHaveValue("");
      expect(Array.from(outputStyleSelect.options, (option) => option.value)).toEqual([
        "",
        "default",
        "Explanatory",
        "Learning",
      ]);
      expect(languageSelect.closest(".form-row")).toBe(outputStyleSelect.closest(".form-row"));
      expect(within(behaviorSection).queryByText("默认启用深度思考")).not.toBeInTheDocument();
      expect(within(behaviorSection).queryByText("尊重 .gitignore")).not.toBeInTheDocument();
      expect(within(behaviorSection).queryByText("跳过 WebFetch 预检")).not.toBeInTheDocument();
    }
    if (commonSection) {
      expect(within(commonSection).getByRole("button", { name: "展开 常用选项" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(within(commonSection).getByText("已启用 0/16")).toBeInTheDocument();
      expect(within(commonSection).queryByRole("button", { name: "控件" })).not.toBeInTheDocument();
      expect(within(commonSection).queryByRole("button", { name: "JSON" })).not.toBeInTheDocument();

      fireEvent.click(within(commonSection).getByRole("button", { name: "展开 常用选项" }));
      expect(within(commonSection).getByRole("button", { name: "控件" })).toBeInTheDocument();
      expect(within(commonSection).getByRole("button", { name: "JSON" })).toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "输出风格" })).not.toBeInTheDocument();
      expect(
        within(commonSection).queryByRole("combobox", { name: "输出风格" }),
      ).not.toBeInTheDocument();
      expect(within(commonSection).getAllByRole("switch")).toHaveLength(16);
      expect(within(commonSection).getByText("默认启用深度思考")).toBeInTheDocument();
      expect(within(commonSection).getByText("显示 Thinking 摘要")).toBeInTheDocument();
      expect(within(commonSection).getByText("接受计划时显示清理上下文")).toBeInTheDocument();
      expect(within(commonSection).getByText("禁用所有 Hooks")).toBeInTheDocument();
      expect(within(commonSection).getByText("禁用 AI 署名")).toBeInTheDocument();
      expect(within(commonSection).getByText("已完成引导设置")).toBeInTheDocument();
      expect(within(commonSection).getByText("启用 Fast Mode")).toBeInTheDocument();
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
      expect(Array.from(permissionModeSelect.options, (option) => option.value)).toEqual([
        "",
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
      expect(within(pluginsSection).getByRole("button", { name: "新增插件" })).toBeInTheDocument();
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

  it("opens localized official docs from structured settings sections", () => {
    renderEditor();

    const docsSections = [
      { section: "环境变量", button: "查看 环境变量 官方文档" },
      { section: "权限", button: "查看 权限 官方文档" },
      { section: "Hooks", button: "查看 Hooks 官方文档" },
      { section: "插件市场", button: "查看 插件市场 官方文档" },
      { section: "插件", button: "查看 插件 官方文档" },
      { section: "Status Line", button: "查看 Status Line 官方文档" },
    ];

    for (const { button } of docsSections) {
      expect(screen.queryByRole("button", { name: button })).not.toBeInTheDocument();
    }

    for (const { section, button } of docsSections) {
      const sectionElement = toggleAccordionSection(section);
      const docsButton = within(sectionElement).getByRole("button", { name: button });
      expect(docsButton).toBeInTheDocument();
      expect(docsButton).toHaveTextContent("官方文档");
      expect(docsButton).toHaveClass("profile-secondary-btn");
      expect(docsButton).not.toHaveClass("profile-icon-btn");

      if (button === "查看 环境变量 官方文档" || button === "查看 插件 官方文档") {
        fireEvent.click(docsButton);
      }
    }

    fireEvent.click(screen.getByRole("button", { name: "查看 Status Line 官方文档" }));

    expect(openUrlMock).toHaveBeenNthCalledWith(1, "https://code.claude.com/docs/zh-CN/env-vars");
    expect(openUrlMock).toHaveBeenNthCalledWith(
      2,
      "https://code.claude.com/docs/zh-CN/discover-plugins",
    );
    expect(openUrlMock).toHaveBeenNthCalledWith(3, "https://code.claude.com/docs/zh-CN/statusline");
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

    expect(
      screen.queryByRole("button", { name: "Open Environment Variables official docs" }),
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
    expect(envDocsButton).toHaveClass("profile-secondary-btn");
    expect(envDocsButton).not.toHaveClass("profile-icon-btn");
    fireEvent.click(envDocsButton);

    const pluginsSection = toggleAccordionSection("Plugins");
    fireEvent.click(
      within(pluginsSection).getByRole("button", { name: "Open Plugins official docs" }),
    );

    const statusLineSection = toggleAccordionSection("Status Line");
    fireEvent.click(
      within(statusLineSection).getByRole("button", { name: "Open Status Line official docs" }),
    );

    expect(openUrlMock).toHaveBeenNthCalledWith(1, "https://code.claude.com/docs/en/env-vars");
    expect(openUrlMock).toHaveBeenNthCalledWith(
      2,
      "https://code.claude.com/docs/en/discover-plugins",
    );
    expect(openUrlMock).toHaveBeenNthCalledWith(3, "https://code.claude.com/docs/en/statusline");
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

    expect(screen.getByRole("option", { name: "开放路由" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "OpenRouter" })).not.toBeInTheDocument();
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

    const behaviorRows = behaviorSection.querySelectorAll(".form-row");
    expect(behaviorRows.length).toBeGreaterThan(1);
    for (const row of behaviorRows) {
      expect(row.querySelectorAll(".form-group").length).toBeLessThanOrEqual(2);
    }

    const toggleRows = behaviorSection.querySelectorAll(".profile-toggle-grid");
    expect(toggleRows.length).toBe(0);
  });

  it("tests the current profile draft from the behavior section, opens the dialog, and reopens it from the success badge", async () => {
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
            "x-api-key": "token",
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
    expect(testButton).not.toHaveTextContent("测试模型");

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
        presetId: "builtin:openrouter",
        settings: {
          env: {
            ANTHROPIC_AUTH_TOKEN: "token",
            ANTHROPIC_MODEL: "claude-sonnet-4-6",
          },
        },
      },
    });
    const dialog = screen.getByRole("dialog", { name: "模型测试结果" });
    expect(within(dialog).getByText("测试成功")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-profile-name")).toHaveTextContent(
      "OpenRouter User",
    );
    expect(within(dialog).getByTestId("model-test-request-url")).toHaveTextContent(
      "https://openrouter.ai/api/v1/messages",
    );
    expect(within(dialog).getByTestId("model-test-context")).toHaveClass(
      "profile-model-test-dialog-context--stacked",
    );
    expect(
      within(dialog)
        .getByTestId("model-test-context")
        .closest(".profile-model-test-dialog-header-main"),
    ).toBeNull();
    expect(within(dialog).getByTestId("model-test-profile-row")).toHaveClass(
      "profile-model-test-dialog-context-item--inline",
    );
    expect(within(dialog).getByTestId("model-test-request-url-row")).toHaveClass(
      "profile-model-test-dialog-context-item--inline",
    );
    expect(within(dialog).getByTestId("model-test-meta-list")).toHaveClass(
      "profile-model-test-dialog-meta-list--compact",
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
    expect(
      within(dialog).getByText("API 测试成功，当前配置可以正常返回响应。"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("claude-sonnet-4-6")).toBeInTheDocument();
    expect(within(dialog).getByText("openrouter/claude-sonnet-4-6")).toBeInTheDocument();
    expect(within(dialog).getByText("123 ms")).toBeInTheDocument();
    expect(within(dialog).getByText("req_test_123")).toBeInTheDocument();
    expect(within(dialog).getByText("end_turn")).toBeInTheDocument();
    expect(within(dialog).queryByTestId("model-test-request-headers-code")).not.toBeInTheDocument();
    expect(within(dialog).queryByTestId("model-test-request-body-code")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByTestId("model-test-response-headers-code"),
    ).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "查看请求 Headers" }));
      await Promise.resolve();
    });
    expect(within(dialog).getByTestId("model-test-request-headers-code").textContent).toContain(
      '"x-api-key": "token"',
    );
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "查看请求体" }));
      await Promise.resolve();
    });
    expect(within(dialog).getByTestId("model-test-request-body-code").textContent).toContain(
      '"max_tokens": 2048',
    );
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "查看响应 Headers" }));
      await Promise.resolve();
    });
    expect(within(dialog).getByTestId("model-test-response-headers-code").textContent).toContain(
      '"request-id": "req_test_123"',
    );
    expect(within(dialog).queryByLabelText("输入提示词")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Please reply with one short sentence confirming this API test request succeeded.",
      ),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "编辑提示词" }));
      await Promise.resolve();
    });
    const promptInput = within(dialog).getByLabelText("输入提示词") as HTMLTextAreaElement;
    expect(promptInput.value).toBe(
      "Please reply with one short sentence confirming this API test request succeeded.",
    );

    fireEvent.change(promptInput, { target: { value: "Reply OK only." } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "发起请求" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(within(dialog).queryByLabelText("输入提示词")).not.toBeInTheDocument();
    expect(invokeMock).toHaveBeenLastCalledWith("test_profile_model", {
      data: {
        id: "user-openrouter",
        name: "OpenRouter User",
        description: "默认用户配置",
        presetId: "builtin:openrouter",
        settings: {
          env: {
            ANTHROPIC_AUTH_TOKEN: "token",
            ANTHROPIC_MODEL: "claude-sonnet-4-6",
          },
        },
        promptText: "Reply OK only.",
      },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "查看响应体" }));
      await Promise.resolve();
    });
    const rawResponseViewer = within(dialog).getByTestId("model-test-raw-response-code");
    expect(rawResponseViewer.textContent).toContain('{\n  "id": "msg_test_123",');
    expect(rawResponseViewer.textContent).toContain('\n  "content": [\n');

    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog", { name: "模型测试结果" })).not.toBeInTheDocument();

    fireEvent.click(
      within(behaviorSection).getByRole("button", { name: "查看最近一次成功测试结果" }),
    );
    expect(screen.getByRole("dialog", { name: "模型测试结果" })).toBeInTheDocument();
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
    expect(testButton).not.toHaveTextContent("测试模型");

    await act(async () => {
      fireEvent.click(testButton);
      await Promise.resolve();
    });

    expect(within(behaviorSection).getByRole("button", { name: "测试中..." })).toBeDisabled();

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
    expect(screen.getByRole("dialog", { name: "模型测试结果" })).toBeInTheDocument();
    expect(screen.getByText("JSON 模式下测试成功。")).toBeInTheDocument();
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

    const dialog = screen.getByRole("dialog", { name: "模型测试结果" });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(
      within(behaviorSection).getByRole("button", { name: "查看最近一次成功测试结果" }),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("默认模型"), {
        target: { value: "claude-opus-4-1" },
      });
      await Promise.resolve();
    });

    expect(
      within(behaviorSection).queryByRole("button", { name: "查看最近一次成功测试结果" }),
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

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "测试模型" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = screen.getByRole("dialog", { name: "模型测试结果" });
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

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "查看响应体" }));
      await Promise.resolve();
    });
    const rawResponseViewer = within(dialog).getByTestId("model-test-raw-response-code");
    expect(rawResponseViewer.textContent).toContain('{\n  "error": {\n');
    expect(rawResponseViewer.textContent).toContain('"type": "authentication_error"');
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

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "测试模型" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = screen.getByRole("dialog", { name: "模型测试结果" });
    expect(within(dialog).getByText("测试失败")).toBeInTheDocument();
    expect(within(dialog).getByText("Error: 模型测试请求失败：network down")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "查看响应体" })).not.toBeInTheDocument();

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

  it("keeps model test prompt and response body text smaller than section labels", () => {
    const css = readFileSync(
      `${process.cwd()}/src/components/profile-editor/editor-shared.css`,
      "utf8",
    );

    expect(css).toMatch(
      /\.profile-model-test-content-panel--primary\s+\.profile-model-test-label\s*\{[^}]*color:\s*var\(--text-secondary\);[^}]*font-size:\s*14px;/s,
    );
    expect(css).toMatch(
      /\.profile-model-test-content-panel--primary\s+\.profile-model-test-dialog-panel-text\s*\{[^}]*font-size:\s*13px;/s,
    );
    expect(css).toMatch(
      /\.profile-model-test-content-panel--primary\s+\.profile-model-test-prompt-input\s*\{[^}]*font-size:\s*13px;/s,
    );
    expect(css).toMatch(
      /\.profile-model-test-progress-spinner\s*\{[^}]*animation:\s*profile-model-test-spin\s+0\.8s\s+linear\s+infinite;/s,
    );
    expect(css).toMatch(
      /\.profile-model-test-progress-track::after\s*\{[^}]*animation:\s*profile-model-test-progress-sweep\s+1\.2s\s+ease-in-out\s+infinite;/s,
    );
    expect(css).toMatch(
      /\.profile-model-test-dialog-context-item--inline\s+\.profile-model-test-label\s*\{[^}]*flex:\s*none;[^}]*white-space:\s*nowrap;/s,
    );
    expect(css).toMatch(
      /\.profile-model-test-dialog-context-item\.request-url\s+\.profile-model-test-dialog-context-value\s*\{[^}]*flex:\s*1\s+1\s+auto;/s,
    );
    expect(css).toMatch(/\.profile-model-test-url-text\s*\{[^}]*flex:\s*1\s+1\s+auto;/s);
    expect(css).toMatch(
      /\.profile-model-test-compact-action:disabled\s*\{[^}]*cursor:\s*not-allowed;/s,
    );
  });

  it("renders language as a select list and exposes the full effort enum set", async () => {
    await act(async () => {
      renderEditor();
      await Promise.resolve();
    });

    const languageSelect = screen.getByLabelText("回复语言") as HTMLSelectElement;
    expect(languageSelect.tagName).toBe("SELECT");
    expect(Array.from(languageSelect.options).map((option) => option.value)).toEqual(
      expect.arrayContaining([
        "english",
        "chinese",
        "japanese",
        "korean",
        "spanish",
        "french",
        "german",
        "portuguese",
        "russian",
        "arabic",
        "italian",
      ]),
    );

    const effortSelect = screen.getByLabelText("努力级别") as HTMLSelectElement;
    expect(Array.from(effortSelect.options).map((option) => option.value)).toEqual([
      "",
      "auto",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(effortSelect).toHaveValue("");
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

    const effortSelect = screen.getByLabelText("努力级别") as HTMLSelectElement;
    expect(effortSelect).toHaveValue("");

    await act(async () => {
      fireEvent.change(screen.getByLabelText("默认模型"), {
        target: { value: "claude-opus-4-1" },
      });
      fireEvent.change(effortSelect, {
        target: { value: "auto" },
      });
      await Promise.resolve();
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
      const fieldGroup = screen.getByLabelText(label).closest(".form-group") as HTMLElement | null;
      expect(fieldGroup).not.toBeNull();
      if (!fieldGroup) {
        continue;
      }
      const header = fieldGroup.querySelector(".profile-field-header") as HTMLElement | null;
      expect(header).not.toBeNull();
      expect(fieldGroup.querySelector(".profile-field-mapping-row")).toBeNull();
      expect(header).not.toBeNull();
      if (header) {
        expect(header.querySelector(".profile-field-label-meta")).toBeNull();
        const helpButton = within(header).getByRole("button", {
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
      expect(fieldGroup.querySelector(".profile-field-badge")).toBeNull();
      expect(fieldGroup.querySelector(".profile-field-inline-meta")).toBeNull();
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

    const modelGroup = screen
      .getByLabelText("默认模型")
      .closest(".form-group") as HTMLElement | null;
    const effortGroup = screen
      .getByLabelText("努力级别")
      .closest(".form-group") as HTMLElement | null;

    expect(modelGroup).not.toBeNull();
    expect(effortGroup).not.toBeNull();

    if (!modelGroup || !effortGroup) {
      return;
    }

    const modelHeader = modelGroup.querySelector(".profile-field-header") as HTMLElement | null;
    const effortHeader = effortGroup.querySelector(".profile-field-header") as HTMLElement | null;

    expect(modelHeader).not.toBeNull();
    expect(effortHeader).not.toBeNull();
    expect(modelGroup.querySelector(".profile-field-mapping-row")).toBeNull();
    expect(effortGroup.querySelector(".profile-field-mapping-row")).toBeNull();

    if (modelHeader && effortHeader) {
      expect(modelHeader.querySelector(".profile-field-label-meta")).toBeNull();
      expect(effortHeader.querySelector(".profile-field-label-meta")).toBeNull();
      expect(within(modelHeader).getByRole("button", { name: "ANTHROPIC_MODEL" })).toHaveAttribute(
        "data-tooltip",
        "ANTHROPIC_MODEL",
      );
      expect(
        within(effortHeader).getByRole("button", { name: "CLAUDE_CODE_EFFORT_LEVEL" }),
      ).toHaveAttribute("data-tooltip", "CLAUDE_CODE_EFFORT_LEVEL");
    }

    const languageGroup = screen
      .getByLabelText("回复语言")
      .closest(".form-group") as HTMLElement | null;
    expect(languageGroup).not.toBeNull();
    if (languageGroup) {
      const languageHeader = languageGroup.querySelector(
        ".profile-field-header",
      ) as HTMLElement | null;
      expect(languageHeader).not.toBeNull();
      if (languageHeader) {
        expect(within(languageHeader).getByRole("button", { name: "language" })).toHaveAttribute(
          "data-tooltip",
          "language",
        );
      }
    }

    expect(modelGroup.querySelector(".profile-field-inline-meta")).toBeNull();
    expect(effortGroup.querySelector(".profile-field-inline-meta")).toBeNull();
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
    expect(within(commonSection).getByRole("button", { name: "fastMode" })).toHaveAttribute(
      "data-tooltip",
      "fastMode",
    );
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
    fireEvent.change(within(behaviorSection).getByRole("combobox", { name: "输出风格" }), {
      target: { value: "Learning" },
    });
    const labels = [
      "默认启用深度思考",
      "显示 Thinking 摘要",
      "接受计划时显示清理上下文",
      "禁用所有 Hooks",
      "禁用 AI 署名",
      "已完成引导设置",
      "启用 Fast Mode",
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
      const option = within(commonSection)
        .getByText(label)
        .closest(".profile-common-option-item") as HTMLElement | null;
      expect(option).not.toBeNull();
      if (option) {
        await act(async () => {
          fireEvent.click(within(option).getByRole("switch"));
          await Promise.resolve();
        });
      }
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
      fastMode: true,
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
    const behaviorSection = getSection("模型与行为");

    fireEvent.change(within(behaviorSection).getByRole("combobox", { name: "输出风格" }), {
      target: { value: "default" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].settings.outputStyle).toBe("default");
  });

  it("syncs structured env, permissions, sandbox, and hooks json editor into source json", async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("默认模型"), {
      target: { value: "claude-opus-4-1" },
    });
    fireEvent.change(screen.getByLabelText("ANTHROPIC_AUTH_TOKEN"), {
      target: { value: "new-token" },
    });

    fireEvent.change(screen.getByLabelText("权限头部默认模式"), {
      target: { value: "plan" },
    });
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
      .closest(".profile-subsection") as HTMLElement | null;
    const directorySection = screen
      .getByRole("heading", { name: "附加目录" })
      .closest(".profile-subsection") as HTMLElement | null;

    expect(allowSection).not.toBeNull();
    expect(directorySection).not.toBeNull();

    if (!allowSection || !directorySection) {
      return;
    }

    const emptyAllowHint = allowSection.querySelector(".profile-empty-state") as HTMLElement | null;
    const addAllowButton = within(allowSection).getByRole("button", { name: "新增允许规则" });

    expect(emptyAllowHint).not.toBeNull();
    expect(
      within(allowSection).queryByRole("button", { name: "收起 允许规则" }),
    ).not.toBeInTheDocument();
    if (emptyAllowHint) {
      expect(
        emptyAllowHint.compareDocumentPosition(addAllowButton) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }

    await act(async () => {
      fireEvent.click(addAllowButton);
      fireEvent.click(within(directorySection).getByRole("button", { name: "新增附加目录" }));
      await Promise.resolve();
    });

    const allowRuleInput = screen.getByLabelText("允许规则 1");
    const directoryInput = screen.getByLabelText("附加目录 1");
    expect(allowRuleInput).toHaveClass("form-input");
    expect(directoryInput).toHaveClass("form-input");
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

    const statusLineSection = switchSectionToJson("Status Line", { expandFirst: true });
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
    expect(disableBypassSwitch.className).toContain("profile-sandbox-switch-compact");
    expect(disableBypassSwitch.closest(".profile-toggle-item")).toBeNull();
    const disableBypassRow = disableBypassSwitch.closest(
      ".profile-inline-switch-row",
    ) as HTMLElement | null;
    expect(disableBypassRow).not.toBeNull();
    if (disableBypassRow) {
      expect(disableBypassRow).toHaveClass("profile-inline-switch-row-emphasis");
      expect(within(disableBypassRow).getByText("禁用 bypassPermissions 模式")).toHaveClass(
        "profile-inline-switch-title",
      );
    }
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
    expect(headerSandboxSwitch.className).toContain("profile-sandbox-switch-compact");
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
            allow: ["Bash(git *)"],
            ask: ["Bash(rm *)"],
            deny: ["Read(**/config.yaml)"],
            additionalDirectories: ["~/projects/shared"],
          },
        },
      },
    });

    const permissionsSection = getSection("权限");
    toggleAccordionSection("权限");

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "加载推荐规则" }));
    expect(screen.getByText("加载推荐权限规则")).toBeInTheDocument();
    expect(
      screen.getByText(
        "这会覆盖当前 allow、ask、deny 规则，并保留默认模式、禁用 bypassPermissions 和附加目录。",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(
      within(permissionsSection).queryByRole("button", { name: "清空允许规则" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 允许规则" }));
    expect(
      within(permissionsSection).getByRole("button", { name: "清空允许规则" }),
    ).toBeInTheDocument();
    expect(within(permissionsSection).getByLabelText("允许规则 1")).toHaveValue("Bash(git *)");

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "加载推荐规则" }));
    fireEvent.click(screen.getByRole("button", { name: "加载规则" }));

    expect(within(permissionsSection).queryByLabelText("允许规则 1")).not.toBeInTheDocument();
    expect(within(permissionsSection).queryByLabelText("询问规则 1")).not.toBeInTheDocument();
    expect(within(permissionsSection).queryByLabelText("拒绝规则 1")).not.toBeInTheDocument();

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 允许规则" }));
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 询问规则" }));
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 拒绝规则" }));

    expect(within(permissionsSection).getByLabelText("允许规则 1")).toHaveValue("Bash(pwd)");
    expect(within(permissionsSection).getByLabelText("询问规则 1")).toHaveValue("Bash(cat *)");
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
      additionalDirectories: ["~/projects/shared"],
    });
    expect(savedPermissions?.allow).toContain("Bash(git status *)");
    expect(savedPermissions?.allow).not.toContain("Bash(git *)");
    expect(savedPermissions?.ask).toContain("Bash(curl *)");
    expect(savedPermissions?.deny).toContain("Bash(git reset --hard*)");
    expect(savedPermissions?.deny).not.toContain("Read(**/config.yaml)");
  });

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
    expect(within(permissionsSection).queryByLabelText("允许规则 1")).not.toBeInTheDocument();
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 询问规则" }));
    expect(within(permissionsSection).getByLabelText("询问规则 1")).toHaveValue("Bash(curl *)");

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "清空询问规则" }));
    expect(within(permissionsSection).queryByLabelText("询问规则 1")).not.toBeInTheDocument();
    fireEvent.click(within(permissionsSection).getByRole("button", { name: "展开 拒绝规则" }));
    expect(within(permissionsSection).getByLabelText("拒绝规则 1")).toHaveValue(
      "Bash(git reset --hard*)",
    );

    fireEvent.click(within(permissionsSection).getByRole("button", { name: "清空拒绝规则" }));
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

  it("selects an additional directory from the add action and preserves cancel as no-op", async () => {
    const onSave = vi.fn();
    openDialogMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("/Users/maguowei/Projects/shared");
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
      "/Users/maguowei/Projects/shared",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedPermissions = onSave.mock.calls[0]?.[0]?.settings.permissions as
      | Record<string, unknown>
      | undefined;
    expect(savedPermissions?.additionalDirectories).toEqual(["/Users/maguowei/Projects/shared"]);
  });

  it("replaces an existing additional directory from the row select action", async () => {
    const onSave = vi.fn();
    openDialogMock.mockResolvedValueOnce("/Users/maguowei/Projects/replacement");
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
      "/Users/maguowei/Projects/replacement",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    const savedPermissions = onSave.mock.calls[0]?.[0]?.settings.permissions as
      | Record<string, unknown>
      | undefined;
    expect(savedPermissions?.additionalDirectories).toEqual([
      "/Users/maguowei/Projects/replacement",
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
    expect(Array.from(permissionModeSelect.options, (option) => option.value)).toEqual([
      "",
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

    const statusLineSection = switchSectionToJson("Status Line", { expandFirst: true });
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
      within(statusLineSection).getAllByText("Status Line JSON 中的 command 不能为空").length,
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

  it("defers resolved profile preview until the final config section is visible", async () => {
    const observers: MockIntersectionObserverInstance[] = [];
    class MockIntersectionObserver implements Pick<IntersectionObserver, "disconnect" | "observe"> {
      readonly callback: IntersectionObserverCallback;
      readonly disconnect = vi.fn();
      readonly observe = vi.fn();

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        observers.push(this);
      }
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

    expect(invokeMock).not.toHaveBeenCalledWith("preview_profile", expect.anything());
    expect(observers).toHaveLength(1);

    act(() => {
      observers[0]?.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observers[0] as unknown as IntersectionObserver,
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

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

  it("saves plugin, marketplace, and status line settings from structured controls", async () => {
    const { onSave } = renderEditor();

    const pluginsSection = screen
      .getByRole("heading", { name: "插件", level: 3 })
      .closest("section") as HTMLElement | null;
    expect(pluginsSection).not.toBeNull();
    if (!pluginsSection) {
      return;
    }

    toggleAccordionSection("插件");

    fireEvent.click(within(pluginsSection).getByRole("button", { name: "新增插件" }));
    const draftRow = within(pluginsSection)
      .getByRole("button", { name: "删除插件 新插件" })
      .closest(".profile-plugin-list-row");
    expect(draftRow).not.toBeNull();
    fireEvent.change(within(draftRow as HTMLElement).getByLabelText("新插件 ID"), {
      target: { value: "formatter@anthropic-tools" },
    });
    fireEvent.click(
      within(draftRow as HTMLElement).getByRole("switch", {
        name: "插件状态 formatter@anthropic-tools",
      }),
    );
    fireEvent.click(within(draftRow as HTMLElement).getByRole("button", { name: "保存插件" }));

    expect(within(pluginsSection).getByText("formatter@anthropic-tools")).toBeInTheDocument();
    expect(
      within(pluginsSection).getByRole("switch", {
        name: "插件状态 formatter@anthropic-tools",
      }),
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText("新插件 ID")).not.toBeInTheDocument();

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
      .getByRole("heading", { name: "Status Line", level: 3 })
      .closest("section") as HTMLElement | null;
    expect(statusLineSection).not.toBeNull();
    if (!statusLineSection) {
      return;
    }

    toggleAccordionSection("Status Line");
    fireEvent.change(within(statusLineSection).getByLabelText("Status Line 命令"), {
      target: { value: "~/.claude/statusline.sh" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("Status Line padding"), {
      target: { value: "2" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("Status Line refreshInterval"), {
      target: { value: "5" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledWith({
      id: "user-openrouter",
      name: "OpenRouter User",
      description: "默认用户配置",
      presetId: "builtin:openrouter",
      settings: expect.objectContaining({
        env: {
          ANTHROPIC_AUTH_TOKEN: "token",
        },
        enabledPlugins: {
          "formatter@anthropic-tools": false,
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

    const statusLineSection = getSection("Status Line");
    toggleAccordionSection("Status Line");

    fireEvent.change(within(statusLineSection).getByLabelText("Status Line 命令"), {
      target: { value: "" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("Status Line padding"), {
      target: { value: "2" },
    });
    expect(
      within(statusLineSection).getAllByText("Status Line 命令不能为空").length,
    ).toBeGreaterThan(0);

    fireEvent.change(within(statusLineSection).getByLabelText("Status Line 命令"), {
      target: { value: "~/.claude/statusline.sh" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("Status Line refreshInterval"), {
      target: { value: "0" },
    });
    expect(
      within(statusLineSection).getAllByText("Status Line refreshInterval 必须大于或等于 1").length,
    ).toBeGreaterThan(0);

    fireEvent.change(within(statusLineSection).getByLabelText("Status Line 命令"), {
      target: { value: "" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("Status Line padding"), {
      target: { value: "" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("Status Line refreshInterval"), {
      target: { value: "" },
    });

    expect(within(statusLineSection).queryByText("Status Line 命令不能为空")).toBeNull();
    expect(
      within(statusLineSection).queryByText("Status Line refreshInterval 必须大于或等于 1"),
    ).toBeNull();

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
    const teamMarketplaceRowHead = within(marketplacesSection)
      .getByRole("button", { name: "编辑 Marketplace team-market" })
      .closest(".profile-marketplace-row-head");
    expect(teamMarketplaceRowHead).not.toBeNull();
    expect(
      within(teamMarketplaceRowHead as HTMLElement).getByRole("button", {
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

  it("loads official plugins in profile view and saves them as disabled by default", async () => {
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

    await act(async () => {
      fireEvent.click(within(pluginsSection).getByRole("button", { name: "加载官方插件" }));
      await Promise.resolve();
    });
    await flushAsyncUpdates();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      within(pluginsSection).getByText("reviewer-plugin@claude-plugins-official"),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          enabledPlugins: {
            "formatter@anthropic-tools": true,
            "reviewer-plugin@claude-plugins-official": false,
            "writer-plugin@claude-plugins-official": false,
          },
        }),
      }),
    );
  });

  it("places the official plugin refresh action beside the controls/json switch", async () => {
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

    const modeRow = pluginsSection.querySelector(".profile-accordion-mode-row") as HTMLElement;
    expect(modeRow).not.toBeNull();
    expect(within(modeRow).getByRole("button", { name: "控件" })).toBeInTheDocument();
    expect(within(modeRow).getByRole("button", { name: "JSON" })).toBeInTheDocument();
    const docsButton = within(modeRow).getByRole("button", { name: "查看 插件 官方文档" });
    expect(docsButton).toBeInTheDocument();
    expect(docsButton).toHaveTextContent("官方文档");
    expect(docsButton).toHaveClass("profile-secondary-btn");
    expect(docsButton).not.toHaveClass("profile-icon-btn");

    const loadButton = within(modeRow).getByRole("button", { name: "加载官方插件" });
    expect(loadButton).toHaveAttribute("title", "重新获取官方插件列表并刷新本地缓存。");
    expect(loadButton.querySelector("svg")).not.toBeNull();
    expect(pluginsSection.querySelector(".profile-plugin-toolbar")).toBeNull();
  });

  it("does not show the official plugin load button when the marketplace only exists in an inherited preset", () => {
    renderEditor({
      presets: [
        ...BUILTIN_PRESETS,
        {
          id: "custom:official-inherited",
          name: "Inherited Official",
          localizedName: {
            zh: "继承官方市场",
            en: "Inherited Official",
          },
          description: "通过预设提供官方市场",
          modelSuggestions: [],
          settingsPatch: {
            extraKnownMarketplaces: {
              [OFFICIAL_MARKETPLACE_ID]: {
                source: {
                  source: "github",
                  repo: OFFICIAL_MARKETPLACE_REPO,
                },
              },
            },
          },
          source: "custom",
        },
      ],
      profile: {
        ...PROFILE_FIXTURE,
        presetId: "custom:official-inherited",
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

  it("copies preset suggested model to clipboard without exposing removed legacy scope fields", async () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        presetId: undefined,
      },
    });

    expect(screen.queryByLabelText("作用域")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/项目路径/)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("预设"), {
        target: { value: "builtin:openrouter" },
      });
      await Promise.resolve();
    });
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-sonnet-4-6");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "claude-opus-4-1" }));
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("claude-opus-4-1");
    expect(showToastMock).toHaveBeenCalledWith("模型已复制");
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-sonnet-4-6");

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

  it("autofills base url and all model levels from the selected preset, then clears them when preset is removed", () => {
    renderEditor({
      profile: {
        ...PROFILE_FIXTURE,
        presetId: undefined,
        settings: {
          env: {
            ANTHROPIC_AUTH_TOKEN: "token",
            ANTHROPIC_BASE_URL: "https://manual.example.com",
            ANTHROPIC_MODEL: "manual-model",
            ANTHROPIC_DEFAULT_OPUS_MODEL: "manual-opus",
            ANTHROPIC_DEFAULT_SONNET_MODEL: "manual-sonnet",
            ANTHROPIC_DEFAULT_HAIKU_MODEL: "manual-haiku",
            CLAUDE_CODE_SUBAGENT_MODEL: "manual-subagent",
          },
        },
      },
    });

    fireEvent.change(screen.getByLabelText("预设"), {
      target: { value: "builtin:openrouter" },
    });
    expect(screen.getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("https://openrouter.ai/api");
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("claude-opus-4-1");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("claude-haiku-4-5");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("claude-sonnet-4-6");

    fireEvent.change(screen.getByLabelText("预设"), {
      target: { value: "custom:team-plan" },
    });
    expect(screen.getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("https://openrouter.ai/api");
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("claude-opus-4-1");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("claude-haiku-4-5");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("claude-sonnet-4-6");

    fireEvent.change(screen.getByLabelText("预设"), {
      target: { value: "custom:explicit-model" },
    });
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-opus-explicit");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("claude-opus-4-1");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("claude-sonnet-4-6");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("claude-haiku-4-5");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("claude-sonnet-4-6");

    fireEvent.change(screen.getByLabelText("预设"), {
      target: { value: "custom:env-level-overrides" },
    });
    expect(screen.getByLabelText("默认模型")).toHaveValue("claude-opus-explicit");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("haiku-env-override");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("subagent-env-override");

    fireEvent.change(screen.getByLabelText("预设"), {
      target: { value: "" },
    });
    expect(screen.getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("");
    expect(screen.getByLabelText("默认模型")).toHaveValue("");
    expect(screen.getByLabelText("Opus 默认模型")).toHaveValue("");
    expect(screen.getByLabelText("Sonnet 默认模型")).toHaveValue("");
    expect(screen.getByLabelText("Haiku 默认模型")).toHaveValue("");
    expect(screen.getByLabelText("Subagent 模型")).toHaveValue("");
    expect(screen.getByLabelText("ANTHROPIC_AUTH_TOKEN")).toHaveValue("token");
    expect(screen.getByLabelText("ANTHROPIC_AUTH_TOKEN")).toHaveAttribute("type", "password");
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

    expect(within(authSection).getByLabelText("预设")).toBeInTheDocument();
    const authTokenInput = within(authSection).getByLabelText("ANTHROPIC_AUTH_TOKEN");
    expect(authTokenInput).toHaveValue("token");
    expect(authTokenInput).toHaveAttribute("type", "password");
    expect(within(authSection).getByLabelText("ANTHROPIC_BASE_URL")).toHaveValue("");
    expect(
      Array.from(authSection.querySelectorAll(".field-label-env"), (label) =>
        label.textContent?.trim(),
      ).filter(
        (label): label is string =>
          label === "ANTHROPIC_BASE_URL" || label === "ANTHROPIC_AUTH_TOKEN",
      ),
    ).toEqual(["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"]);
    expect(within(envSection).queryByDisplayValue("ANTHROPIC_AUTH_TOKEN")).not.toBeInTheDocument();
    expect(within(envSection).queryByDisplayValue("ANTHROPIC_BASE_URL")).not.toBeInTheDocument();

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

    fireEvent.change(authTokenInput, {
      target: { value: "auth-token" },
    });
    fireEvent.change(within(authSection).getByLabelText("ANTHROPIC_BASE_URL"), {
      target: { value: "https://example.com" },
    });

    const statusLineSection = getSection("Status Line");
    toggleAccordionSection("Status Line");
    fireEvent.change(within(statusLineSection).getByLabelText("Status Line 命令"), {
      target: { value: "~/.claude/statusline.sh" },
    });
    fireEvent.change(within(statusLineSection).getByLabelText("Status Line refreshInterval"), {
      target: { value: "5" },
    });

    const rawJsonInput = switchDocumentSectionToEdit("最终配置", "编辑源 JSON");
    expect(rawJsonInput.value).toContain('"ANTHROPIC_AUTH_TOKEN": "auth-token"');
    expect(rawJsonInput.value).toContain('"ANTHROPIC_BASE_URL": "https://example.com"');
    expect(rawJsonInput.value).toContain('"statusLine"');
    expect(rawJsonInput.value).toContain('"~/.claude/statusline.sh"');
    fireEvent.click(within(getSection("最终配置")).getByRole("button", { name: "预览" }));

    await flushProfilePreviewDebounce();

    const previewOutputs = screen.getAllByTestId("config-preview-output");
    const latestPreview = previewOutputs[previewOutputs.length - 1];
    expect(latestPreview).toHaveTextContent('"ANTHROPIC_AUTH_TOKEN": "auth-token"');
    expect(latestPreview).toHaveTextContent('"ANTHROPIC_BASE_URL": "https://example.com"');
    expect(latestPreview).toHaveTextContent('"statusLine"');
    expect(latestPreview).toHaveTextContent('"~/.claude/statusline.sh"');
  });

  it("shows a fallback top badge for new profiles and updates it as the name changes", async () => {
    renderEditor({ profile: null });

    const topBadge = document.querySelector(
      ".editor-badge-large.profile-name-badge",
    ) as HTMLElement | null;
    expect(topBadge).not.toBeNull();
    expect(topBadge).toHaveTextContent("P");

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/名称/), {
        target: { value: "中文配置" },
      });
      await Promise.resolve();
    });
    expect(topBadge).toHaveTextContent("中");
    expect(topBadge?.className).toMatch(/profile-name-badge--color-\d/);
  });

  it("seeds default-enabled common options for new profiles", async () => {
    const onSave = vi.fn();
    renderEditor({ profile: null, onSave });

    const commonSection = getSection("常用选项");
    expect(within(commonSection).getByText("已启用 7/16")).toBeInTheDocument();
    toggleAccordionSection("常用选项");
    for (const label of [
      "默认启用深度思考",
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
      "显示 Thinking 摘要",
      "接受计划时显示清理上下文",
      "禁用 AI 署名",
      "禁用所有 Hooks",
      "启用 Fast Mode",
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
      hasCompletedOnboarding: true,
      skipWebFetchPreflight: true,
    });
    expect(saved.settings.env).toMatchObject({
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      CLAUDE_CODE_NEW_INIT: "1",
      CLAUDE_CODE_NO_FLICKER: "1",
      ENABLE_LSP_TOOL: "1",
    });
    expect(saved.settings).not.toHaveProperty("fastMode");
    expect(saved.settings).not.toHaveProperty("respectGitignore");
    expect(saved.settings).not.toHaveProperty("outputStyle");
    expect(saved.settings).not.toHaveProperty("attribution");
    expect(saved.settings.env).not.toHaveProperty("DISABLE_AUTOUPDATER");
    expect(saved.settings.env).not.toHaveProperty("ENABLE_TOOL_SEARCH");
    expect(saved.settings.env).not.toHaveProperty("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS");
  });
});
