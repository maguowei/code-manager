import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { CodexProfile, CodexProvider } from "../../types";
import CodexProfileEditor, { type CodexProfileEditorHandle } from "../CodexProfileEditor";
import { ThemeProvider } from "../theme-provider";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

const MOCK_PROVIDERS: CodexProvider[] = [
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

const MOCK_PROFILE: CodexProfile = {
  id: "p-1",
  name: "我的 DeepSeek 配置",
  description: "主力开发模型",
  providerId: "codex-builtin:deepseek",
  apiKey: "sk-••••12",
  model: "deepseek-v4-flash",
  modelReasoningEffort: "high",
  createdAt: "2026-01-01T00:00:00+08:00",
  updatedAt: "2026-01-01T00:00:00+08:00",
};

describe("CodexProfileEditor", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "preview_codex_input") {
        return {
          profileId: "prev",
          profileName: "Prev",
          providerName: "DeepSeek",
          currentModelProvider: "openai",
          nextModelProvider: "deepseek",
          authMode: "apiKey",
          configTomlPreview: 'model_provider = "deepseek"',
        };
      }
      return null;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("渲染已有 Profile 的数据与描述", async () => {
    const editorRef = createRef<CodexProfileEditorHandle>();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ThemeProvider>
        <I18nProvider>
          <CodexProfileEditor
            ref={editorRef}
            profile={MOCK_PROFILE}
            providers={MOCK_PROVIDERS}
            onSave={onSave}
            onClose={onClose}
          />
        </I18nProvider>
      </ThemeProvider>,
    );

    expect(screen.getByDisplayValue("我的 DeepSeek 配置")).toBeInTheDocument();
    expect(screen.getByDisplayValue("主力开发模型")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://api.deepseek.com/")).toBeInTheDocument();
    expect(editorRef.current?.canSave()).toBe(true);
    expect(editorRef.current?.isDirty()).toBe(false);
  });

  it("修改字段后 isDirty 返回 true，保存调用 onSave", async () => {
    const editorRef = createRef<CodexProfileEditorHandle>();
    const onSave = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();

    render(
      <ThemeProvider>
        <I18nProvider>
          <CodexProfileEditor
            ref={editorRef}
            profile={MOCK_PROFILE}
            providers={MOCK_PROVIDERS}
            onSave={onSave}
            onClose={onClose}
          />
        </I18nProvider>
      </ThemeProvider>,
    );

    const descInput = screen.getByLabelText("描述");
    fireEvent.change(descInput, { target: { value: "修改后的描述" } });

    expect(editorRef.current?.isDirty()).toBe(true);

    const saveButton = screen.getByRole("button", { name: "保存" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "我的 DeepSeek 配置",
          description: "修改后的描述",
          providerId: "codex-builtin:deepseek",
        }),
      );
    });
  });

  it("点击推荐模型 Chip 快捷填入模型", async () => {
    const editorRef = createRef<CodexProfileEditorHandle>();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ThemeProvider>
        <I18nProvider>
          <CodexProfileEditor
            ref={editorRef}
            profile={MOCK_PROFILE}
            providers={MOCK_PROVIDERS}
            onSave={onSave}
            onClose={onClose}
          />
        </I18nProvider>
      </ThemeProvider>,
    );

    const chatChip = screen.getByRole("button", { name: "DeepSeek Chat" });
    fireEvent.click(chatChip);

    expect(screen.getByDisplayValue("deepseek-chat")).toBeInTheDocument();
  });
});
