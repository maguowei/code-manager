import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import SkillsPage from "../SkillsPage";

const { invokeMock, openUrlMock, showToastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => []),
  openUrlMock: vi.fn(async (_url: string) => undefined),
  showToastMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
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

function renderSkillsPage() {
  render(
    <I18nProvider>
      <SkillsPage />
    </I18nProvider>,
  );
}

describe("SkillsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    setSystemLanguages(["zh-CN"]);
    invokeMock.mockReset();
    openUrlMock.mockReset();
    showToastMock.mockReset();
    invokeMock.mockResolvedValue([]);
  });

  it("opens the localized Claude skills docs from the page header", async () => {
    renderSkillsPage();

    const docsButton = await screen.findByRole("link", {
      name: "查看 Claude Code Skills 官方文档",
    });
    expect(docsButton).toHaveTextContent("官方文档");

    fireEvent.click(docsButton);

    expect(openUrlMock).toHaveBeenCalledWith("https://code.claude.com/docs/zh-CN/skills");
  });

  it("uses the English Claude skills docs when the UI language is English", async () => {
    localStorage.setItem("ai-manager-settings", JSON.stringify({ language: "en", theme: "dark" }));
    setSystemLanguages(["en-US"]);

    renderSkillsPage();

    const docsButton = await screen.findByRole("link", {
      name: "Open Claude Code Skills docs",
    });
    expect(docsButton).toHaveTextContent("Docs");

    fireEvent.click(docsButton);

    expect(openUrlMock).toHaveBeenCalledWith("https://code.claude.com/docs/en/skills");
  });
});
