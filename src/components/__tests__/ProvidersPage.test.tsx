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
    expect(within(card).getByText("Suggested Models")).toBeInTheDocument();
    expect(within(card).getByText("claude-sonnet-4-6")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Open Docs" })).toBeInTheDocument();
  });

  it("copies the full provider id to the clipboard", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Copy ID" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("builtin:openrouter");
    });
  });
});
