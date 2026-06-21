import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { Provider } from "../../types";
import ProvidersPage from "../ProvidersPage";

const { openUrlMock, showToastMock } = vi.hoisted(() => ({
  openUrlMock: vi.fn(async () => null),
  showToastMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

const SETTINGS_STORAGE_KEY = "ai-manager-settings";

const BUILTIN_PROVIDERS: Provider[] = [
  {
    id: "builtin:openrouter",
    name: "OpenRouter",
    localizedName: { zh: "开放路由", en: "OpenRouter" },
    description: "OpenRouter provider",
    docUrl: "https://docs.example.com/openrouter",
    modelSuggestions: ["claude-sonnet-4-6"],
    env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
  },
  {
    id: "builtin:deepseek",
    name: "DeepSeek",
    localizedName: { zh: "DeepSeek", en: "DeepSeek" },
    description: "DeepSeek provider",
    docUrl: "https://docs.example.com/deepseek",
    modelSuggestions: ["deepseek-v4-pro[1m]", "deepseek-v4-flash"],
    env: {
      ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
      ANTHROPIC_MODEL: "deepseek-v4-pro[1m]",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-pro[1m]",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "deepseek-v4-pro[1m]",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-v4-flash",
      CLAUDE_CODE_SUBAGENT_MODEL: "deepseek-v4-flash",
      CLAUDE_CODE_EFFORT_LEVEL: "max",
    },
  },
];

function renderPage(providers: Provider[] = BUILTIN_PROVIDERS) {
  render(
    <I18nProvider>
      <ProvidersPage providers={providers} />
    </I18nProvider>,
  );
}

describe("ProvidersPage", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ language: "en", theme: "dark" }));
    openUrlMock.mockClear();
    showToastMock.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
  });

  it("renders the read-only built-in providers header", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Built-in Providers" })).toBeInTheDocument();
    // 只读：没有新增/编辑/删除入口
    expect(screen.queryByRole("button", { name: /Add Provider/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("renders a provider card with id, base url, models and docs link", () => {
    renderPage();

    const card = screen
      .getByRole("heading", { name: "OpenRouter", level: 3 })
      .closest('[data-slot="preset-card"]') as HTMLElement | null;
    expect(card).not.toBeNull();
    if (!card) {
      return;
    }

    expect(within(card).getByText("builtin:openrouter")).toBeInTheDocument();
    expect(within(card).getByText("https://openrouter.ai/api")).toBeInTheDocument();
    expect(within(card).getByText("Model List")).toBeInTheDocument();
    expect(within(card).getByText("claude-sonnet-4-6")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Open Docs" })).toBeInTheDocument();
    // OpenRouter 无模型 env：不渲染「默认模型」分级网格
    expect(within(card).queryByText("Default Models")).not.toBeInTheDocument();
  });

  it("renders the default model mapping grid from provider env", () => {
    renderPage();

    const card = screen
      .getByRole("heading", { name: "DeepSeek", level: 3 })
      .closest('[data-slot="preset-card"]') as HTMLElement | null;
    expect(card).not.toBeNull();
    if (!card) {
      return;
    }

    expect(within(card).getByText("Default Models")).toBeInTheDocument();
    expect(within(card).getByText("Primary")).toBeInTheDocument();
    expect(within(card).getByText("Opus")).toBeInTheDocument();
    expect(within(card).getByText("Haiku")).toBeInTheDocument();
    expect(within(card).getByText("Effort Level")).toBeInTheDocument();
    // 模型值按 env 映射展示
    expect(within(card).getAllByText("deepseek-v4-pro[1m]").length).toBeGreaterThan(0);
    expect(within(card).getByText("max")).toBeInTheDocument();
  });

  it("copies the full provider id to the clipboard", async () => {
    renderPage();

    const card = screen
      .getByRole("heading", { name: "OpenRouter", level: 3 })
      .closest('[data-slot="preset-card"]') as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Copy ID" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("builtin:openrouter");
    });
  });
});
