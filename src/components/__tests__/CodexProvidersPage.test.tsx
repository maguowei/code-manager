import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { CodexProvider } from "../../types";
import CodexProvidersPage from "../CodexProvidersPage";
import { ThemeProvider } from "../theme-provider";

const MOCK_PROVIDERS: CodexProvider[] = [
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
    modelCatalog: {
      models: [
        {
          slug: "deepseek-v4-flash",
          display_name: "DeepSeek V4 Flash",
        },
      ],
    },
  },
];

describe("CodexProvidersPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("渲染内置供应商列表、模型推荐与 Base URL", () => {
    const onClose = vi.fn();
    render(
      <ThemeProvider>
        <I18nProvider>
          <CodexProvidersPage providers={MOCK_PROVIDERS} onClose={onClose} />
        </I18nProvider>
      </ThemeProvider>,
    );

    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
    expect(screen.getByText("codex-builtin:deepseek")).toBeInTheDocument();
    expect(screen.getByText("https://api.deepseek.com/")).toBeInTheDocument();
    expect(screen.getByText("deepseek-v4-flash")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek V4 Flash")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek Chat")).toBeInTheDocument();
  });

  it("点击关闭按钮触发 onClose 回调", () => {
    const onClose = vi.fn();
    render(
      <ThemeProvider>
        <I18nProvider>
          <CodexProvidersPage providers={MOCK_PROVIDERS} onClose={onClose} />
        </I18nProvider>
      </ThemeProvider>,
    );

    const closeButton = screen.getByRole("button", { name: "关闭" });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });
});
