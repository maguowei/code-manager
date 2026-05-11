import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { Skill } from "../../types";
import SkillsPage from "../SkillsPage";
import { TooltipProvider } from "../ui/tooltip";

type ClaudeDirectoryTestPayload = { paths: string[] };
type SkillDirectoryImportResult = {
  skills: Skill[];
  imported: string[];
  skipped: { id: string; reason: string }[];
};

const { eventListeners, invokeMock, listenMock, openDialogMock, openUrlMock, showToastMock } =
  vi.hoisted(() => {
    type Payload = { paths: string[] };
    const eventListeners = new Map<string, Set<(payload: Payload) => void>>();

    return {
      eventListeners,
      invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => []),
      listenMock: vi.fn(async (event: string, handler: (event: { payload: Payload }) => void) => {
        const listener = (payload: Payload) => handler({ payload });
        const listeners = eventListeners.get(event) ?? new Set<(payload: Payload) => void>();
        listeners.add(listener);
        eventListeners.set(event, listeners);

        return () => {
          listeners.delete(listener);
        };
      }),
      openDialogMock: vi.fn(async (_options: unknown) => null as string | string[] | null),
      openUrlMock: vi.fn(async (_url: string) => undefined),
      showToastMock: vi.fn(),
    };
  });

const emitTauriEvent = (event: string, payload: ClaudeDirectoryTestPayload) => {
  for (const listener of eventListeners.get(event) ?? []) {
    listener(payload);
  }
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openDialogMock,
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
      <TooltipProvider>
        <SkillsPage />
      </TooltipProvider>
    </I18nProvider>,
  );
}

const managedSkill = {
  id: "managed-skill",
  name: "Managed Skill",
  description: "普通 Skill",
  content: "内容",
  disableModelInvocation: false,
  userInvocable: true,
  isActive: true,
  createdAt: 1,
  updatedAt: 1,
  isManaged: true,
  linkTarget: null,
} as Skill;

const unmanagedSkill = {
  id: "linked-skill",
  name: "Linked Skill",
  description: "软链接 Skill",
  content: "内容",
  disableModelInvocation: false,
  userInvocable: true,
  isActive: false,
  createdAt: 2,
  updatedAt: 2,
  isManaged: false,
  linkTarget: "/tmp/external/linked-skill",
} as Skill;

describe("SkillsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    setSystemLanguages(["zh-CN"]);
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });
    eventListeners.clear();
    invokeMock.mockReset();
    listenMock.mockClear();
    openDialogMock.mockReset();
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

  it("groups managed and unmanaged skills separately", async () => {
    invokeMock.mockResolvedValue([unmanagedSkill, managedSkill]);

    renderSkillsPage();

    expect(await screen.findByText("托管 Skills")).toBeInTheDocument();
    expect(screen.getByText("未托管 Skills")).toBeInTheDocument();
    const managedGroup = screen.getByText("托管 Skills").closest("section");
    const unmanagedGroup = screen.getByText("未托管 Skills").closest("section");
    expect(managedGroup).not.toBeNull();
    expect(unmanagedGroup).not.toBeNull();
    expect(within(managedGroup as HTMLElement).getByText("Managed Skill")).toBeInTheDocument();
    expect(within(unmanagedGroup as HTMLElement).getByText("Linked Skill")).toBeInTheDocument();
  });

  it("refreshes skills from the page header button", async () => {
    let loadCount = 0;
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_skills") {
        loadCount += 1;
        return loadCount === 1 ? [managedSkill] : [managedSkill, unmanagedSkill];
      }
      return null;
    });

    renderSkillsPage();
    expect(await screen.findByText("Managed Skill")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    expect(await screen.findByText("Linked Skill")).toBeInTheDocument();
    expect(invokeMock.mock.calls.filter(([command]) => command === "get_skills")).toHaveLength(2);
    expect(showToastMock).toHaveBeenCalledWith("Skills 已刷新");
  });

  it("imports skills from a selected directory and requires confirming the result", async () => {
    const importResult: SkillDirectoryImportResult = {
      skills: [managedSkill, unmanagedSkill],
      imported: ["managed-skill", "linked-skill"],
      skipped: [
        { id: "Invalid_Skill", reason: "invalid-id" },
        { id: "existing-skill", reason: "exists" },
        { id: "missing-skill-md", reason: "missing-skill-md" },
      ],
    };
    openDialogMock.mockResolvedValue("/tmp/skill-source");
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_skills") return [];
      if (command === "import_skills_from_directory") return importResult;
      return null;
    });

    renderSkillsPage();
    expect(await screen.findByText("暂无 Skills")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "导入目录" }));

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: "选择 Skills 目录",
      });
      expect(invokeMock).toHaveBeenCalledWith("import_skills_from_directory", {
        sourceDir: "/tmp/skill-source",
      });
    });
    expect(await screen.findByText("Managed Skill")).toBeInTheDocument();
    expect(await screen.findByText("Linked Skill")).toBeInTheDocument();

    const dialog = await screen.findByRole("dialog", { name: "导入结果" });
    expect(within(dialog).getByText("成功 2 个，失败 3 个")).toBeInTheDocument();
    expect(within(dialog).getByText("成功 2")).toBeInTheDocument();
    expect(within(dialog).getByText("失败 3")).toBeInTheDocument();
    expect(within(dialog).getByText("2 项")).toBeInTheDocument();
    expect(within(dialog).getByText("3 项")).toBeInTheDocument();
    expect(within(dialog).getByText("managed-skill")).toBeInTheDocument();
    expect(within(dialog).getByText("linked-skill")).toBeInTheDocument();
    expect(within(dialog).getByText("Invalid_Skill")).toBeInTheDocument();
    expect(within(dialog).getByText("名称不符合 Skill id 规则")).toBeInTheDocument();
    expect(within(dialog).getByText("existing-skill")).toBeInTheDocument();
    expect(within(dialog).getByText("同名 Skill 已存在")).toBeInTheDocument();
    expect(within(dialog).getByText("missing-skill-md")).toBeInTheDocument();
    expect(within(dialog).getByText("缺少有效的 SKILL.md 或软链接目标无效")).toBeInTheDocument();
    expect(showToastMock).not.toHaveBeenCalledWith("已导入 2 个 Skill，跳过 3 个");

    fireEvent.click(within(dialog).getByRole("button", { name: "确认" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "导入结果" })).not.toBeInTheDocument();
    });
  });

  it("shows a focused all-success import result without the failure section", async () => {
    const importResult: SkillDirectoryImportResult = {
      skills: [managedSkill, unmanagedSkill],
      imported: ["managed-skill", "linked-skill"],
      skipped: [],
    };
    openDialogMock.mockResolvedValue("/tmp/skill-source");
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_skills") return [];
      if (command === "import_skills_from_directory") return importResult;
      return null;
    });

    renderSkillsPage();
    expect(await screen.findByText("暂无 Skills")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "导入目录" }));

    const dialog = await screen.findByRole("dialog", { name: "导入结果" });
    expect(within(dialog).getByText("全部导入成功")).toBeInTheDocument();
    expect(within(dialog).getByText("已导入 2 个 Skill")).toBeInTheDocument();
    expect(within(dialog).getByText("成功 2")).toBeInTheDocument();
    expect(within(dialog).getByText("2 项")).toBeInTheDocument();
    expect(within(dialog).getByText("managed-skill")).toBeInTheDocument();
    expect(within(dialog).getByText("linked-skill")).toBeInTheDocument();
    expect(within(dialog).getAllByText("已导入")).toHaveLength(2);
    expect(within(dialog).queryByText("导入失败")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("没有失败项")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("失败 0 个")).not.toBeInTheDocument();
  });

  it("does not import skills when directory selection is cancelled", async () => {
    openDialogMock.mockResolvedValue(null);

    renderSkillsPage();
    expect(await screen.findByText("暂无 Skills")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "导入目录" }));

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalled();
    });
    expect(
      invokeMock.mock.calls.some(([command]) => command === "import_skills_from_directory"),
    ).toBe(false);
  });

  it("refreshes automatically when a skills directory change event arrives", async () => {
    let loadCount = 0;
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_skills") {
        loadCount += 1;
        return loadCount === 1 ? [managedSkill] : [managedSkill, unmanagedSkill];
      }
      return null;
    });

    renderSkillsPage();
    expect(await screen.findByText("Managed Skill")).toBeInTheDocument();

    emitTauriEvent("claude-directory-changed", { paths: ["skills/linked-skill/SKILL.md"] });

    expect(await screen.findByText("Linked Skill")).toBeInTheDocument();
    expect(invokeMock.mock.calls.filter(([command]) => command === "get_skills")).toHaveLength(2);
    expect(showToastMock).not.toHaveBeenCalledWith("Skills 已刷新");
  });

  it("uses the symlink delete confirmation copy for unmanaged skills", async () => {
    invokeMock.mockResolvedValue([unmanagedSkill]);

    renderSkillsPage();
    expect(await screen.findByText("Linked Skill")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(await screen.findByText("删除软链接 Skill")).toBeInTheDocument();
    expect(
      screen.getByText("确定要删除此 Skill 的软链接吗？源目录不会被删除。"),
    ).toBeInTheDocument();
  });
});
