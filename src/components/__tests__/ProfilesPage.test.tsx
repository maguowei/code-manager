import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { ConfigWorkspace } from "../../types";
import ProfilesPage from "../ProfilesPage";
import { ThemeProvider } from "../theme-provider";

const { invokeMock, multiFileDiffMock, showToastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
  multiFileDiffMock: vi.fn(),
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

vi.mock("@pierre/diffs/react", () => ({
  MultiFileDiff: (props: {
    oldFile: { name: string; contents: string };
    newFile: { name: string; contents: string };
    options?: { diffStyle?: string; overflow?: string; themeType?: string };
  }) => {
    multiFileDiffMock(props);
    return (
      <div
        data-testid="pierre-multi-file-diff"
        data-old-file-name={props.oldFile.name}
        data-old-file-contents={props.oldFile.contents}
        data-new-file-name={props.newFile.name}
        data-new-file-contents={props.newFile.contents}
        data-diff-style={props.options?.diffStyle ?? ""}
        data-overflow={props.options?.overflow ?? ""}
      />
    );
  },
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
    showTraySessions: true,
    systemNotificationsEnabled: false,
    collapseSidebarByDefault: false,
    thirdPartyProviderPricingEnabled: true,
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
        permissions: {
          defaultMode: "plan",
        },
        sandbox: {
          enabled: true,
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

function renderPage(
  workspace: ConfigWorkspace = WORKSPACE_FIXTURE,
  onWorkspaceChange: () => Promise<void> = async () => {},
  onOpenPresets: () => void = vi.fn(),
) {
  render(
    <I18nProvider>
      <ThemeProvider>
        <ProfilesPage
          workspace={workspace}
          onWorkspaceChange={onWorkspaceChange}
          onOpenPresets={onOpenPresets}
        />
      </ThemeProvider>
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

function getProfileCard(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

function selectTab(container: HTMLElement, name: string) {
  const tab = within(container).getByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.mouseUp(tab, { button: 0, ctrlKey: false });
  fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
  fireEvent.pointerUp(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
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

function fireDragOverWithClientY(element: HTMLElement, clientY: number, dataTransfer: unknown) {
  const event = createEvent.dragOver(element, { dataTransfer });
  Object.defineProperty(event, "clientY", {
    configurable: true,
    value: clientY,
  });
  fireEvent(element, event);
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

    const card = getProfileCard("OpenRouter User");

    expect(within(card).getByText("O")).toBeInTheDocument();

    expect(within(card).queryByText("用户")).not.toBeInTheDocument();
    expect(within(card).getByText("使用中")).toBeInTheDocument();
    expect(within(card).queryByText("已应用到用户设置")).not.toBeInTheDocument();
    expect(within(card).getByText("开放路由")).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "OpenRouter User" })).toBeInTheDocument();
    expect(within(card).getByText("模型")).toBeInTheDocument();
    expect(within(card).getByText("claude-sonnet-4-6")).toBeInTheDocument();
    expect(within(card).getByText("high")).toBeInTheDocument();
    expect(within(card).queryByText("努力级别")).not.toBeInTheDocument();
    expect(within(card).getByText("权限")).toBeInTheDocument();
    expect(within(card).queryByText("权限模式")).not.toBeInTheDocument();
    expect(within(card).getByText("plan")).toBeInTheDocument();
    expect(within(card).getByText("沙盒已启用")).toBeInTheDocument();
    expect(within(card).getByText("插件")).toBeInTheDocument();
    expect(within(card).getByText("已启用 1/2")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "启用" })).not.toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "复制环境变量" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "复制" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "删除" })).toBeInTheDocument();
    expect(within(card).queryByText("删除")).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
  });

  it("renders config section tabs above profile actions and opens presets", () => {
    const onOpenPresets = vi.fn();
    renderPage(
      {
        ...WORKSPACE_FIXTURE,
        customPresets: [
          {
            id: "custom:team-plan",
            name: "Team Plan",
            localizedName: {
              zh: "团队计划",
              en: "Team Plan",
            },
            description: "团队预设",
            modelSuggestions: [],
            settingsPatch: {},
            source: "custom",
          },
        ],
      },
      async () => {},
      onOpenPresets,
    );

    const tabs = screen.getByRole("group", { name: "配置分区" });
    const profilesTab = within(tabs).getByRole("button", { name: "配置" });
    const presetsTab = within(tabs).getByRole("button", { name: "预设" });

    expect(profilesTab).toHaveAttribute("aria-pressed", "true");
    expect(presetsTab).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("group", { name: "预设管理" })).not.toBeInTheDocument();
    expect(
      tabs.compareDocumentPosition(screen.getByRole("button", { name: "新建配置" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(presetsTab);

    expect(onOpenPresets).toHaveBeenCalledTimes(1);
  });

  it("shows unmanaged user settings and imports them in place", async () => {
    const onWorkspaceChange = vi.fn(async () => {});
    const workspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [],
      bindings: {},
      unmanagedUserSettings: {
        sourcePath: "settings.json",
        settings: {
          model: "claude-sonnet-4-6",
          permissions: {
            defaultMode: "plan",
          },
          enabledPlugins: {
            "formatter@anthropic-tools": true,
          },
        },
        size: 128,
        modifiedAt: 4,
        importStatus: "ready",
      },
    };
    invokeMock.mockResolvedValue({
      id: "imported-user-settings",
      name: "导入的用户设置",
      description: "从 ~/.claude/settings.json 导入",
      settings: {},
      createdAt: "2026-05-13T00:00:00Z",
      updatedAt: "2026-05-13T00:00:00Z",
    });

    renderPage(workspace, onWorkspaceChange);

    const card = screen
      .getByText("发现未导入的用户设置")
      .closest('[data-slot="unmanaged-user-settings-card"]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(within(card).getByText("settings.json")).toBeInTheDocument();
    expect(within(card).getByText("claude-sonnet-4-6")).toBeInTheDocument();
    expect(within(card).getByText("plan")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "导入管理" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("import_user_settings_profile", {
        data: {
          name: "导入的用户设置",
          description: "从 ~/.claude/settings.json 导入",
        },
      });
    });
    expect(onWorkspaceChange).toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith("配置已导入管理");
  });

  it("disables unmanaged user settings import when the file is invalid", () => {
    const workspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [],
      bindings: {},
      unmanagedUserSettings: {
        sourcePath: "settings.json",
        settings: {},
        size: 20,
        modifiedAt: 4,
        importStatus: "invalidJson",
        errorMessage: "解析 JSON 失败",
      },
    };

    renderPage(workspace);

    const card = screen
      .getByText("发现未导入的用户设置")
      .closest('[data-slot="unmanaged-user-settings-card"]') as HTMLElement;

    expect(within(card).getByText("JSON 格式无效")).toBeInTheDocument();
    expect(within(card).getByText("解析 JSON 失败")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "导入管理" })).toBeDisabled();
  });

  it("does not show unmanaged user settings when profiles already exist", () => {
    const workspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      unmanagedUserSettings: {
        sourcePath: "settings.json",
        settings: {
          model: "claude-opus-4-7",
        },
        size: 32,
        modifiedAt: 8,
        importStatus: "ready",
      },
    };

    renderPage(workspace);

    expect(screen.queryByText("发现未导入的用户设置")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OpenRouter User" })).toBeInTheDocument();
  });

  it("keeps the active profile in use and opens a settings mismatch comparison", async () => {
    const workspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      activeUserSettingsMismatch: {
        profileId: "user-openrouter",
        sourcePath: "settings.json",
        expectedSettings: {
          model: "claude-sonnet-4-6",
        },
        actualSettings: {
          model: "claude-opus-4-7",
          skipDangerousModePermissionPrompt: true,
        },
      },
    };

    renderPage(workspace);

    const card = screen.getByRole("button", { name: "OpenRouter User" });
    expect(within(card).getByText("使用中")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "启用" })).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "配置被手动修改" }));

    expect(screen.getByRole("dialog", { name: "配置差异" })).toBeInTheDocument();
    expect(screen.getByText("skipDangerousModePermissionPrompt")).toBeInTheDocument();
    const diffViewer = await screen.findByTestId("pierre-multi-file-diff");
    expect(diffViewer).toHaveAttribute("data-old-file-name", "ai-manager-settings.json");
    expect(diffViewer).toHaveAttribute("data-new-file-name", "settings.json");
    expect(diffViewer).toHaveAttribute("data-diff-style", "split");
    expect(diffViewer).toHaveAttribute("data-overflow", "wrap");
    expect(diffViewer.getAttribute("data-old-file-contents")).toContain("claude-sonnet-4-6");
    expect(diffViewer.getAttribute("data-new-file-contents")).toContain("claude-opus-4-7");
    expect(diffViewer.getAttribute("data-new-file-contents")).toContain(
      "skipDangerousModePermissionPrompt",
    );
    expect(multiFileDiffMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oldFile: expect.objectContaining({
          contents: expect.stringContaining("claude-sonnet-4-6"),
        }),
        newFile: expect.objectContaining({
          contents: expect.stringContaining("claude-opus-4-7"),
        }),
        options: expect.objectContaining({
          diffStyle: "split",
          lineDiffType: "word-alt",
        }),
      }),
    );
  });

  it("colors high-risk permission modes on profile cards", () => {
    const workspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [
        {
          ...makeProfile("profile-bypass", "Bypass Profile"),
          settings: {
            env: {
              ANTHROPIC_MODEL: "claude-opus-4-7",
            },
            permissions: {
              defaultMode: "bypassPermissions",
            },
          },
        },
      ],
      bindings: {
        userProfileId: undefined,
      },
    } as ConfigWorkspace;

    renderPage(workspace);

    const card = getProfileCard("Bypass Profile");

    expect(within(card).getByText("bypassPermissions")).toBeInTheDocument();
    expect(within(card).getByText("沙盒未启用")).toBeInTheDocument();
  });

  it("shows sandbox state on profile cards even when permission mode is unset", () => {
    // 覆盖回归：未显式设置 permissions.defaultMode 时，整行曾被一并隐藏，
    // 导致沙盒已启用状态对用户不可见
    const workspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [
        {
          ...makeProfile("profile-sandbox-only", "Sandbox Only Profile"),
          settings: {
            env: {
              ANTHROPIC_MODEL: "claude-opus-4-7",
            },
            sandbox: {
              enabled: true,
            },
          },
        },
      ],
      bindings: {
        userProfileId: undefined,
      },
    } as ConfigWorkspace;

    renderPage(workspace);

    const card = getProfileCard("Sandbox Only Profile");
    const sandboxBadge = within(card).getByText("沙盒已启用");
    expect(sandboxBadge).toBeInTheDocument();
    expect(within(card).getByText("未设置")).toBeInTheDocument();
  });

  it("colors high-intensity effort levels on profile cards", () => {
    const workspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [
        {
          ...makeProfile("profile-max-effort", "Max Effort Profile"),
          settings: {
            env: {
              ANTHROPIC_MODEL: "claude-opus-4-7",
              CLAUDE_CODE_EFFORT_LEVEL: "max",
            },
          },
        },
      ],
      bindings: {
        userProfileId: undefined,
      },
    } as ConfigWorkspace;

    renderPage(workspace);

    const card = getProfileCard("Max Effort Profile");

    expect(within(card).getByText("max")).toBeInTheDocument();
  });

  it("uses the displayed first character in profile badges", () => {
    const workspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      builtinPresets: [
        ...WORKSPACE_FIXTURE.builtinPresets,
        {
          id: "builtin:anthropic",
          name: "Anthropic",
          localizedName: {
            zh: "Anthropic",
            en: "Anthropic",
          },
          description: "Anthropic 预设",
          modelSuggestions: ["claude-sonnet-4-6"],
          settingsPatch: {},
          source: "builtin",
        },
      ],
      profiles: [
        makeProfile("profile-a", "OpenRouter Alpha"),
        makeProfile("profile-b", "OneAPI Beta"),
        makeProfile("profile-c", "Oracle Gamma", "builtin:anthropic"),
      ],
      bindings: {
        userProfileId: undefined,
      },
    } as ConfigWorkspace;

    renderPage(workspace);

    expect(within(getProfileCard("OpenRouter Alpha")).getByText("O")).toBeInTheDocument();
    expect(within(getProfileCard("OneAPI Beta")).getByText("O")).toBeInTheDocument();
    expect(within(getProfileCard("Oracle Gamma")).getByText("O")).toBeInTheDocument();
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
        <ThemeProvider>
          <ProfilesPage workspace={unboundWorkspace} onWorkspaceChange={async () => {}} />
        </ThemeProvider>
      </I18nProvider>,
    );

    const card = getProfileCard("OpenRouter User");

    expect(within(card).getByRole("button", { name: "启用" })).toBeInTheDocument();
    expect(within(card).queryByText("使用中")).not.toBeInTheDocument();
  });

  it("shows the backend reason when applying a profile fails", async () => {
    const unboundWorkspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      bindings: {
        userProfileId: undefined,
      },
    } as ConfigWorkspace;
    invokeMock.mockImplementation(async (command) => {
      if (command === "apply_profile") {
        throw "settings 必须是 JSON object";
      }
      return null;
    });

    render(
      <I18nProvider>
        <ThemeProvider>
          <ProfilesPage workspace={unboundWorkspace} onWorkspaceChange={async () => {}} />
        </ThemeProvider>
      </I18nProvider>,
    );

    fireEvent.click(
      within(getProfileCard("OpenRouter User")).getByRole("button", { name: "启用" }),
    );

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith("应用配置失败", "error", {
        description: "settings 必须是 JSON object",
      });
    });
  });

  it("applies a profile successfully, reloads the workspace, and shows the success toast", async () => {
    const unboundWorkspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      bindings: {
        userProfileId: undefined,
      },
    } as ConfigWorkspace;
    const onWorkspaceChange = vi.fn(async () => {});

    invokeMock.mockImplementation(async (command, args) => {
      if (command === "apply_profile") {
        // 成功路径返回 void；同时记录调用以便断言传参正确
        return null;
      }
      // 默认其他 command 走 null，避免误触发未 mock 的副作用
      void args;
      return null;
    });

    render(
      <I18nProvider>
        <ThemeProvider>
          <ProfilesPage workspace={unboundWorkspace} onWorkspaceChange={onWorkspaceChange} />
        </ThemeProvider>
      </I18nProvider>,
    );

    fireEvent.click(
      within(getProfileCard("OpenRouter User")).getByRole("button", { name: "启用" }),
    );

    await waitFor(() => {
      // 用 id 调 apply_profile —— ProfilesPage 不应让前端自己计算合并设置
      expect(invokeMock).toHaveBeenCalledWith(
        "apply_profile",
        expect.objectContaining({ id: expect.any(String) }),
      );
    });

    // 成功后必须刷新 workspace 并发出成功 toast，避免 UI 与后端状态脱节
    await waitFor(() => {
      expect(onWorkspaceChange).toHaveBeenCalled();
      expect(showToastMock).toHaveBeenCalledWith("配置已应用");
    });
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
        <ThemeProvider>
          <ProfilesPage
            workspace={{ ...WORKSPACE_FIXTURE, profiles: [] }}
            onWorkspaceChange={async () => {}}
          />
        </ThemeProvider>
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
        <ThemeProvider>
          <ProfilesPage workspace={orderedWorkspace} onWorkspaceChange={async () => {}} />
        </ThemeProvider>
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

    const alphaCard = getProfileCard("Alpha");
    const betaCard = getProfileCard("Beta");

    expect(within(alphaCard).getByText("成功 · 52 ms")).toBeInTheDocument();
    expect(within(betaCard).getByText("失败")).toBeInTheDocument();
    expect(within(alphaCard).getByText("model-profile-a")).toBeInTheDocument();
    expect(within(betaCard).getByText("model-profile-b")).toBeInTheDocument();

    fireEvent.click(
      within(alphaCard).getByRole("button", { name: "Alpha 测试结果：成功 · 52 ms" }),
    );
    expect(await screen.findByRole("dialog", { name: "模型测试结果" })).toBeInTheDocument();
    expect(screen.getByText("Alpha 测试成功")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(within(betaCard).getByRole("button", { name: "Beta 测试结果：失败" }));
    expect(await screen.findByRole("dialog", { name: "模型测试结果" })).toBeInTheDocument();
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
        <ThemeProvider>
          <ProfilesPage workspace={orderedWorkspace} onWorkspaceChange={async () => {}} />
        </ThemeProvider>
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

    const card = getProfileCard("OpenRouter User");

    fireEvent.click(within(card).getByRole("button", { name: "OpenRouter User 测试结果：失败" }));
    expect(await screen.findByRole("dialog", { name: "模型测试结果" })).toBeInTheDocument();
    expect(screen.getByText("模型测试请求失败：network down")).toBeInTheDocument();
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

    const card = getProfileCard("OpenRouter User");

    fireEvent.click(within(card).getByRole("button", { name: "OpenRouter User 测试结果：失败" }));
    const dialog = await screen.findByRole("dialog", { name: "模型测试结果" });

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

    const card = getProfileCard("OpenRouter User");

    fireEvent.click(within(card).getByRole("button", { name: "OpenRouter User 测试结果：失败" }));
    const dialog = await screen.findByRole("dialog", { name: "模型测试结果" });
    expect(dialog).toHaveClass("!flex");
    expect(dialog).toHaveClass("h-[min(860px,calc(100dvh-2rem))]");
    const resultScrollBody = within(dialog).getByTestId("model-test-result-scroll-body");
    expect(resultScrollBody).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "overscroll-contain",
    );
    expect(resultScrollBody).not.toHaveAttribute("data-slot", "scroll-area");
    expect(within(dialog).getByRole("tab", { name: "概览" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(dialog).getByTestId("model-test-profile-name")).toHaveTextContent(
      "OpenRouter User",
    );
    expect(within(dialog).getByTestId("model-test-request-url")).toHaveTextContent(
      "https://api-inference.modelscope.cn/v1/messages",
    );
    expect(within(dialog).getByTestId("model-test-context")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-profile-row")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-request-url-row")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-content-grid")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-prompt-panel")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-response-panel")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-exchange-details")).toBeInTheDocument();
    expect(within(dialog).getByText(/No choices in OpenAI response/)).toBeInTheDocument();

    selectTab(dialog, "请求");
    await waitFor(() =>
      expect(within(dialog).getByRole("tab", { name: "请求" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(within(dialog).getByText("请求 Headers")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-request-headers-code").textContent).toContain(
      '"x-api-key": "<redacted>"',
    );
    expect(within(dialog).getByTestId("model-test-request-headers-code")).toHaveClass(
      "overflow-visible",
    );
    expect(within(dialog).getByTestId("model-test-request-headers-code")).not.toHaveClass(
      "overflow-x-auto",
    );
    expect(within(dialog).getByText("请求体")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-request-body-code").textContent).toContain(
      '"content": "请确认测试成功。"',
    );

    selectTab(dialog, "响应");
    await waitFor(() =>
      expect(within(dialog).getByRole("tab", { name: "响应" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(within(dialog).getByText("响应 Headers")).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-response-headers-code").textContent).toContain(
      '"x-request-id": "req_500"',
    );
    expect(within(dialog).getByText("响应体")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "隐藏响应体" })).toBeInTheDocument();
    expect(within(dialog).getByTestId("model-test-raw-response-code").textContent).toContain(
      "No choices in OpenAI response",
    );

    selectTab(dialog, "概览");
    expect(within(dialog).getByRole("button", { name: "重新测试" })).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("输入提示词")).not.toBeInTheDocument();
    expect(within(dialog).getByText("请确认测试成功。")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "编辑提示词" }));
    const promptInput = within(dialog).getByLabelText("输入提示词") as HTMLTextAreaElement;
    fireEvent.change(promptInput, { target: { value: "   " } });
    expect(within(dialog).getByRole("button", { name: "发起请求" })).toBeDisabled();
    fireEvent.change(promptInput, { target: { value: "请只回复 OK" } });
    expect(within(dialog).getByRole("button", { name: "发起请求" })).toBeEnabled();

    selectTab(dialog, "请求");
    expect(within(dialog).getByTestId("model-test-request-body-code").textContent).toContain(
      '"content": "请只回复 OK"',
    );

    selectTab(dialog, "概览");

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "复制请求 cURL" }));
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("curl -X POST 'https://api-inference.modelscope.cn/v1/messages'"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("-H 'x-api-key: <redacted>'"),
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
      within(card).getByRole("button", { name: "OpenRouter User 测试结果：成功 · 88 ms" }),
    ).toBeInTheDocument();
  });

  it("exposes card actions without opening the editor", () => {
    renderPage();

    const card = getProfileCard("OpenRouter User");

    expect(within(card).getByRole("button", { name: "复制环境变量" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "复制" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("marks the current drag-over position for profile reordering", () => {
    const workspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [makeProfile("alpha", "Alpha"), makeProfile("beta", "Beta")],
      bindings: { userProfileId: undefined },
    } as ConfigWorkspace;
    renderPage(workspace);

    const firstCard = getProfileCard("Alpha");
    const secondCard = getProfileCard("Beta");

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
    };

    fireEvent.dragStart(firstCard, { dataTransfer });
    fireEvent.dragOver(secondCard, { clientY: 120, dataTransfer });

    expect(secondCard).toHaveAttribute("data-drag-over", "below");
  });

  it("auto-scrolls the profile list while dragging near the bottom edge", () => {
    const workspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [makeProfile("alpha", "Alpha"), makeProfile("beta", "Beta")],
      bindings: { userProfileId: undefined },
    } as ConfigWorkspace;
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    const requestFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        const frameId = nextFrameId;
        nextFrameId += 1;
        frameCallbacks.set(frameId, callback);
        return frameId;
      });
    const cancelFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frameCallbacks.delete(id);
    });

    try {
      renderPage(workspace);

      const firstCard = getProfileCard("Alpha");
      const list = document.querySelector('[data-slot="profiles-list-scroll"]') as HTMLElement;
      Object.defineProperty(list, "getBoundingClientRect", {
        value: () => ({
          top: 0,
          height: 300,
          left: 0,
          right: 280,
          bottom: 300,
          width: 280,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }),
        configurable: true,
      });
      list.scrollTop = 10;

      const dataTransfer = {
        effectAllowed: "move",
        dropEffect: "move",
        setData: vi.fn(),
      };

      fireEvent.dragStart(firstCard, { dataTransfer });
      expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "0");
      fireDragOverWithClientY(list, 294, dataTransfer);

      const frame = Array.from(frameCallbacks.entries())[0];
      expect(frame).toBeDefined();
      if (!frame) {
        throw new Error("未调度拖拽自动滚动帧");
      }
      frameCallbacks.delete(frame[0]);
      frame[1](0);

      expect(list.scrollTop).toBeGreaterThan(10);
    } finally {
      requestFrameSpy.mockRestore();
      cancelFrameSpy.mockRestore();
    }
  });

  it("auto-scrolls the profile list while dragging near the top edge", () => {
    const workspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [makeProfile("alpha", "Alpha"), makeProfile("beta", "Beta")],
      bindings: { userProfileId: undefined },
    } as ConfigWorkspace;
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    const requestFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        const frameId = nextFrameId;
        nextFrameId += 1;
        frameCallbacks.set(frameId, callback);
        return frameId;
      });
    const cancelFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frameCallbacks.delete(id);
    });

    try {
      renderPage(workspace);

      const firstCard = getProfileCard("Alpha");
      const list = document.querySelector('[data-slot="profiles-list-scroll"]') as HTMLElement;
      Object.defineProperty(list, "getBoundingClientRect", {
        value: () => ({
          top: 0,
          height: 300,
          left: 0,
          right: 280,
          bottom: 300,
          width: 280,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }),
        configurable: true,
      });
      list.scrollTop = 80;

      const dataTransfer = {
        effectAllowed: "move",
        dropEffect: "move",
        setData: vi.fn(),
      };

      fireEvent.dragStart(firstCard, { dataTransfer });
      expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "0");
      fireDragOverWithClientY(list, 4, dataTransfer);

      const frame = Array.from(frameCallbacks.entries())[0];
      expect(frame).toBeDefined();
      if (!frame) {
        throw new Error("未调度拖拽自动滚动帧");
      }
      frameCallbacks.delete(frame[0]);
      frame[1](0);

      expect(list.scrollTop).toBeLessThan(80);
    } finally {
      requestFrameSpy.mockRestore();
      cancelFrameSpy.mockRestore();
    }
  });

  it("stops profile list auto-scroll after dragging ends", () => {
    const workspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [makeProfile("alpha", "Alpha"), makeProfile("beta", "Beta")],
      bindings: { userProfileId: undefined },
    } as ConfigWorkspace;
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    const requestFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        const frameId = nextFrameId;
        nextFrameId += 1;
        frameCallbacks.set(frameId, callback);
        return frameId;
      });
    const cancelFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frameCallbacks.delete(id);
    });

    try {
      renderPage(workspace);

      const firstCard = getProfileCard("Alpha");
      const list = document.querySelector('[data-slot="profiles-list-scroll"]') as HTMLElement;
      Object.defineProperty(list, "getBoundingClientRect", {
        value: () => ({
          top: 0,
          height: 300,
          left: 0,
          right: 280,
          bottom: 300,
          width: 280,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }),
        configurable: true,
      });
      list.scrollTop = 80;

      const dataTransfer = {
        effectAllowed: "move",
        dropEffect: "move",
        setData: vi.fn(),
      };

      fireEvent.dragStart(firstCard, { dataTransfer });
      expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "0");
      fireDragOverWithClientY(list, 4, dataTransfer);
      fireEvent.dragEnd(firstCard, { dataTransfer });

      expect(cancelFrameSpy).toHaveBeenCalled();
      expect(frameCallbacks.size).toBe(0);
      expect(list.scrollTop).toBe(80);
    } finally {
      requestFrameSpy.mockRestore();
      cancelFrameSpy.mockRestore();
    }
  });

  it("keeps profile summary labels close to consistently aligned values", () => {
    renderPage();

    expect(screen.getByText("模型")).toBeInTheDocument();
    expect(screen.getByText("claude-sonnet-4-6")).toBeInTheDocument();
  });

  it("separates profile summary labels from values in English", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );

    renderPage();

    expect(screen.getByText("Model")).toBeInTheDocument();
  });

  it("keeps long english model test result pills inside the model summary", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "en",
        theme: "dark",
      }),
    );
    invokeMock.mockImplementation((command: string) => {
      if (command === "test_profile_model") {
        return Promise.resolve({
          ok: true,
          responseText: "Test succeeded.",
          promptText: "Confirm this request succeeded.",
          resolvedModel: "claude-opus-4-7",
          durationMs: 3652,
          rawResponse: JSON.stringify({ content: [{ type: "text", text: "Test succeeded." }] }),
        });
      }
      return Promise.resolve(null);
    });
    const workspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [
        {
          ...WORKSPACE_FIXTURE.profiles[0],
          settings: {
            ...WORKSPACE_FIXTURE.profiles[0].settings,
            env: {
              ANTHROPIC_AUTH_TOKEN: "token",
              ANTHROPIC_MODEL: "claude-opus-4-7",
              CLAUDE_CODE_EFFORT_LEVEL: "xhigh",
            },
          },
        },
      ],
    } as ConfigWorkspace;

    renderPage(workspace);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test All" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const card = getProfileCard("OpenRouter User");
    const resultButton = within(card).getByRole("button", {
      name: "OpenRouter User test result: Success · 3652 ms",
    });
    const modelSummaryValue = resultButton.closest('[data-slot="profile-model-summary-value"]');

    expect(resultButton).toHaveClass("max-w-full");
    expect(resultButton).toHaveClass("overflow-hidden");
    expect(within(resultButton).getByText("Success · 3652 ms")).toHaveClass("truncate");
    expect(modelSummaryValue).not.toBeNull();
    expect(modelSummaryValue).toHaveClass("flex-wrap");
    expect(within(modelSummaryValue as HTMLElement).getByText("xhigh")).toBeInTheDocument();
  });

  it("colors profile permission and effort summary values by risk and intensity", () => {
    renderPage();

    expect(screen.getByText("plan")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("沙盒已启用")).toBeInTheDocument();
  });

  it("keeps preset badges visually quieter below profile names", () => {
    renderPage();

    const card = getProfileCard("OpenRouter User");

    expect(within(card).getByText("开放路由")).toBeInTheDocument();
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

    const card = getProfileCard("OpenRouter User");

    await act(async () => {
      fireEvent.click(card);
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "编辑配置" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("OpenRouter User")).toBeInTheDocument();
  });

  it("asks before closing a dirty profile editor and can keep editing or discard", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );

    renderPage();

    await act(async () => {
      fireEvent.click(getProfileCard("OpenRouter User"));
      await Promise.resolve();
    });
    fireEvent.change(screen.getByDisplayValue("OpenRouter User"), {
      target: { value: "OpenRouter Draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(screen.getByRole("heading", { name: "存在未保存的更改" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(screen.getByDisplayValue("OpenRouter Draft")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("button", { name: "不保存退出" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "编辑配置" })).not.toBeInTheDocument();
    });
    expect(invokeMock).not.toHaveBeenCalledWith("upsert_profile", expect.anything());
  });

  it("does not ask before closing after only expanding permissions", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    const workspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [
        {
          ...WORKSPACE_FIXTURE.profiles[0],
          settings: {
            ...WORKSPACE_FIXTURE.profiles[0].settings,
            permissions: {
              allow: ["Bash(git status:*)"],
              defaultMode: "plan",
            },
          },
        },
      ],
    } as ConfigWorkspace;

    renderPage(workspace);

    await act(async () => {
      fireEvent.click(getProfileCard("OpenRouter User"));
      await Promise.resolve();
    });

    const permissionsSection = screen
      .getByRole("heading", { name: "权限", level: 3 })
      .closest("section");
    expect(permissionsSection).not.toBeNull();
    if (!permissionsSection) {
      return;
    }

    const [toggleButton] = within(permissionsSection).getAllByRole("button");
    fireEvent.click(toggleButton);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(screen.queryByRole("heading", { name: "存在未保存的更改" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "编辑配置" })).not.toBeInTheDocument();
    });
    expect(invokeMock).not.toHaveBeenCalledWith("upsert_profile", expect.anything());
  });

  it("saves a dirty profile before closing from the unsaved changes dialog", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );

    renderPage();

    await act(async () => {
      fireEvent.click(getProfileCard("OpenRouter User"));
      await Promise.resolve();
    });
    fireEvent.change(screen.getByDisplayValue("OpenRouter User"), {
      target: { value: "OpenRouter Saved Draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("button", { name: "保存并退出" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "upsert_profile",
        expect.objectContaining({
          data: expect.objectContaining({
            id: "user-openrouter",
            name: "OpenRouter Saved Draft",
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "编辑配置" })).not.toBeInTheDocument();
    });
  });

  it("asks before switching away from a dirty profile editor", async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: "zh",
        theme: "dark",
      }),
    );
    const workspace: ConfigWorkspace = {
      ...WORKSPACE_FIXTURE,
      profiles: [makeProfile("profile-a", "Alpha"), makeProfile("profile-b", "Beta")],
      bindings: {},
    };

    renderPage(workspace);

    await act(async () => {
      fireEvent.click(getProfileCard("Alpha"));
      await Promise.resolve();
    });
    fireEvent.change(screen.getByDisplayValue("Alpha"), {
      target: { value: "Alpha Draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Beta", hidden: true }));

    expect(screen.getByRole("heading", { name: "存在未保存的更改" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Alpha Draft")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "不保存退出" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Beta")).toBeInTheDocument();
    });
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
        <ThemeProvider>
          <ProfilesPage workspace={orderedWorkspace} onWorkspaceChange={async () => {}} />
        </ThemeProvider>
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
        <ThemeProvider>
          <ProfilesPage workspace={WORKSPACE_FIXTURE} onWorkspaceChange={onWorkspaceChange} />
        </ThemeProvider>
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
        <ThemeProvider>
          <ProfilesPage workspace={WORKSPACE_FIXTURE} onWorkspaceChange={onWorkspaceChange} />
        </ThemeProvider>
      </I18nProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "复制" }));
      await Promise.resolve();
    });

    expect(screen.queryByRole("heading", { name: "新建配置" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("名称")).not.toBeInTheDocument();
    expect(onWorkspaceChange).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith("复制配置失败", "error", {
      description: "duplicate failed",
    });
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
        <ThemeProvider>
          <ProfilesPage workspace={orderedWorkspace} onWorkspaceChange={onWorkspaceChange} />
        </ThemeProvider>
      </I18nProvider>,
    );

    const firstCard = getProfileCard("Alpha");
    const secondCard = getProfileCard("Beta");

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
