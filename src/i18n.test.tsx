import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "./i18n";

const { getConfigWorkspaceMock, isTauriMock, listeners, setUiLanguageMock } = vi.hoisted(() => ({
  getConfigWorkspaceMock: vi.fn(),
  isTauriMock: vi.fn(() => false),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  setUiLanguageMock: vi.fn(),
}));

vi.mock("./ipc", () => ({
  ipc: {
    getConfigWorkspace: getConfigWorkspaceMock,
    setUiLanguage: setUiLanguageMock,
  },
}));

vi.mock("./types", () => ({ isTauri: isTauriMock }));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    listeners.set(event, handler);
    return () => listeners.delete(event);
  }),
}));

function setSystemLanguages(languages: string[]) {
  Object.defineProperty(navigator, "languages", {
    value: languages,
    configurable: true,
  });
  Object.defineProperty(navigator, "language", {
    value: languages[0] ?? "",
    configurable: true,
  });
}

function LanguageProbe() {
  const { language, setLanguage, t } = useI18n();
  return (
    <div>
      <span>{t("header.settings")}</span>
      <span>{t("memory.pathPatternsCount", { count: 2 })}</span>
      <span>{t("memory.pathPatternsCount", { count: 1 })}</span>
      <span>{t("profiles.toast.synced", { count: 1 })}</span>
      <span>{t("profiles.toast.synced", { count: 2 })}</span>
      <button
        type="button"
        onClick={() => void Promise.resolve(setLanguage("en")).catch(() => undefined)}
      >
        switch
      </button>
      <span data-testid="language">{language}</span>
    </div>
  );
}

function renderProbe() {
  render(
    <I18nProvider>
      <LanguageProbe />
    </I18nProvider>,
  );
}

describe("I18nProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    getConfigWorkspaceMock.mockReset();
    getConfigWorkspaceMock.mockResolvedValue({ app: { uiLanguage: "zh" } });
    isTauriMock.mockReset();
    isTauriMock.mockReturnValue(false);
    listeners.clear();
    setUiLanguageMock.mockReset();
    setUiLanguageMock.mockResolvedValue("en");
  });

  it("defaults to chinese when the system language is chinese", () => {
    setSystemLanguages(["zh-CN"]);

    renderProbe();

    expect(screen.getByText("设置")).toBeInTheDocument();
    expect(screen.getByText("2 路径")).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
  });

  it("defaults to english when the system language is not chinese", () => {
    setSystemLanguages(["en-US"]);

    renderProbe();

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("1 path")).toBeInTheDocument();
    expect(screen.getByText("2 paths")).toBeInTheDocument();
    expect(screen.getByText("Synced to 1 profile")).toBeInTheDocument();
    expect(screen.getByText("Synced to 2 profiles")).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("lang", "en-US");
  });

  it("updates translations and document language together", async () => {
    setSystemLanguages(["zh-CN"]);
    renderProbe();

    await act(async () => {
      screen.getByRole("button", { name: "switch" }).click();
    });

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByTestId("language")).toHaveTextContent("en");
    expect(document.documentElement).toHaveAttribute("lang", "en-US");
  });

  it("ignores an invalid cached language", () => {
    setSystemLanguages(["zh-CN"]);
    localStorage.setItem("code-manager-settings", JSON.stringify({ language: "fr" }));

    renderProbe();

    expect(screen.getByText("设置")).toBeInTheDocument();
  });

  it("persists a language switch through the atomic command", async () => {
    isTauriMock.mockReturnValue(true);
    setSystemLanguages(["zh-CN"]);
    renderProbe();

    await act(async () => {
      screen.getByRole("button", { name: "switch" }).click();
    });

    await waitFor(() => expect(setUiLanguageMock).toHaveBeenCalledWith("en"));
    expect(screen.getByTestId("language")).toHaveTextContent("en");
    expect(JSON.parse(localStorage.getItem("code-manager-settings") ?? "{}")).toEqual({
      language: "en",
    });
  });

  it("rolls back the UI and cache when persistence fails", async () => {
    isTauriMock.mockReturnValue(true);
    setUiLanguageMock.mockRejectedValue(new Error("offline"));
    setSystemLanguages(["zh-CN"]);
    renderProbe();

    await act(async () => {
      screen.getByRole("button", { name: "switch" }).click();
    });

    await waitFor(() => expect(screen.getByTestId("language")).toHaveTextContent("zh"));
    expect(JSON.parse(localStorage.getItem("code-manager-settings") ?? "{}")).toEqual({
      language: "zh",
    });
  });

  it("synchronizes language after a config change event", async () => {
    isTauriMock.mockReturnValue(true);
    setSystemLanguages(["zh-CN"]);
    renderProbe();
    await waitFor(() => expect(listeners.has("config-workspace-changed")).toBe(true));
    getConfigWorkspaceMock.mockResolvedValue({ app: { uiLanguage: "en" } });

    await act(async () => {
      listeners.get("config-workspace-changed")?.({ payload: undefined });
    });

    await waitFor(() => expect(screen.getByTestId("language")).toHaveTextContent("en"));
    expect(setUiLanguageMock).not.toHaveBeenCalled();
  });
});
