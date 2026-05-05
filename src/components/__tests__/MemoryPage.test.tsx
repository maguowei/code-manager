import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { MemoryState } from "../../types";
import MemoryPage from "../MemoryPage";

const { invokeMock, openUrlMock, showToastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => null),
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

function renderMemoryPage() {
  render(
    <I18nProvider>
      <MemoryPage />
    </I18nProvider>,
  );
}

const initialState: MemoryState = {
  memories: [
    {
      id: "global-a",
      name: "全局 A",
      content: "A",
      targetType: "claude",
      rulePath: undefined,
      isActive: false,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "global-b",
      name: "全局 B",
      content: "B",
      targetType: "claude",
      rulePath: undefined,
      isActive: true,
      createdAt: 2,
      updatedAt: 2,
    },
  ],
};

const toggledState: MemoryState = {
  memories: [
    {
      ...initialState.memories[0],
      isActive: true,
      updatedAt: 3,
    },
    {
      ...initialState.memories[1],
      isActive: false,
      updatedAt: 3,
    },
  ],
};

describe("MemoryPage", () => {
  beforeEach(() => {
    localStorage.clear();
    setSystemLanguages(["zh-CN"]);
    invokeMock.mockReset();
    openUrlMock.mockReset();
    showToastMock.mockReset();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") return initialState;
      if (command === "toggle_memory") return toggledState;
      return null;
    });
  });

  it("opens the localized Claude memory docs from the page header", async () => {
    renderMemoryPage();

    const docsButton = await screen.findByRole("button", {
      name: "查看 Claude Code 记忆官方文档",
    });
    expect(docsButton).toHaveTextContent("官方文档");

    fireEvent.click(docsButton);

    expect(openUrlMock).toHaveBeenCalledWith("https://code.claude.com/docs/zh-CN/memory");
  });

  it("uses the English Claude memory docs when the UI language is English", async () => {
    localStorage.setItem("ai-manager-settings", JSON.stringify({ language: "en", theme: "dark" }));
    setSystemLanguages(["en-US"]);

    renderMemoryPage();

    const docsButton = await screen.findByRole("button", {
      name: "Open Claude Code memory docs",
    });
    expect(docsButton).toHaveTextContent("Docs");

    fireEvent.click(docsButton);

    expect(openUrlMock).toHaveBeenCalledWith("https://code.claude.com/docs/en/memory");
  });

  it("refreshes the list from returned state after toggling a CLAUDE.md memory", async () => {
    renderMemoryPage();

    const firstCard = (await screen.findByText("全局 A")).closest(".memory-item");
    const secondCard = screen.getByText("全局 B").closest(".memory-item");
    expect(firstCard).not.toBeNull();
    expect(secondCard).not.toBeNull();
    if (!firstCard || !secondCard) return;

    expect(within(firstCard as HTMLElement).getByText("启用")).toBeInTheDocument();
    expect(within(secondCard as HTMLElement).getByText("已启用")).toBeInTheDocument();

    fireEvent.click(within(firstCard as HTMLElement).getByRole("button", { name: /启用/ }));

    await waitFor(() => {
      expect(within(firstCard as HTMLElement).getByText("已启用")).toBeInTheDocument();
      expect(within(secondCard as HTMLElement).getByText("启用")).toBeInTheDocument();
    });
  });

  it("aligns memory group headers with the card list inset", () => {
    const css = readFileSync(`${process.cwd()}/src/components/MemoryPage.css`, "utf8");
    const groupHeaderRule = css.match(/\.memory-group-header\s*\{[^}]*\}/)?.[0] ?? "";

    expect(groupHeaderRule).toContain("padding: 0 var(--space-2);");
  });

  it("shows unmanaged .claude memories with an import action", async () => {
    const stateWithUnmanaged: MemoryState = {
      memories: [],
      unmanagedMemories: [
        {
          id: "unmanaged:claude",
          name: "CLAUDE.md",
          content: "手写全局记忆",
          targetType: "claude",
          rulePath: undefined,
          pathPatterns: [],
          sourcePath: "CLAUDE.md",
          size: 18,
          modifiedAt: 4,
          importStatus: "ready",
        },
      ],
    };
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_memories") return stateWithUnmanaged;
      if (command === "import_unmanaged_memory") return initialState;
      return null;
    });

    renderMemoryPage();

    const card = (await screen.findByText("手写全局记忆")).closest(".memory-item");
    expect(card).not.toBeNull();
    if (!card) return;

    expect(within(card as HTMLElement).getByText("未导入")).toBeInTheDocument();
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "导入管理" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("import_unmanaged_memory", {
        source: { targetType: "claude", rulePath: undefined },
      });
    });
  });
});
