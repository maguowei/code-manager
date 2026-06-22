import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { Skill } from "../../types";
import SkillsPage from "../SkillsPage";
import { ThemeProvider } from "../theme-provider";
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

vi.mock("@uiw/react-codemirror", () => ({
  default: ({ readOnly, value }: { readOnly?: boolean; value?: string }) => (
    <textarea
      aria-label="mock-code-editor"
      readOnly={readOnly}
      value={value ?? ""}
      onChange={() => undefined}
    />
  ),
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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
    <ThemeProvider>
      <I18nProvider>
        <TooltipProvider>
          <SkillsPage />
        </TooltipProvider>
      </I18nProvider>
    </ThemeProvider>,
  );
}

const localSkill = {
  id: "local-skill",
  name: "Local Skill",
  description: "普通 Skill",
  content: "内容",
  disableModelInvocation: false,
  userInvocable: true,
  isActive: true,
  createdAt: 1,
  updatedAt: 1,
  isSymlink: false,
  hasSymlinkContent: false,
  linkTarget: null,
} as Skill;

const symlinkSkill = {
  id: "linked-skill",
  name: "Linked Skill",
  description: "软链接 Skill",
  content: "内容",
  disableModelInvocation: false,
  userInvocable: true,
  isActive: false,
  createdAt: 2,
  updatedAt: 2,
  isSymlink: true,
  hasSymlinkContent: true,
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
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
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
    localStorage.setItem(
      "code-manager-settings",
      JSON.stringify({ language: "en", theme: "dark" }),
    );
    setSystemLanguages(["en-US"]);

    renderSkillsPage();

    const docsButton = await screen.findByRole("link", {
      name: "Open Claude Code Skills docs",
    });
    expect(docsButton).toHaveTextContent("Docs");

    fireEvent.click(docsButton);

    expect(openUrlMock).toHaveBeenCalledWith("https://code.claude.com/docs/en/skills");
  });

  it("renders skills as one source-marked list", async () => {
    invokeMock.mockResolvedValue([symlinkSkill, localSkill]);

    renderSkillsPage();

    expect(await screen.findByText("Local Skill")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Skills 列表" })).toBeInTheDocument();
    expect(screen.getByText("Linked Skill")).toBeInTheDocument();
    expect(screen.getByText("本地目录")).toBeInTheDocument();
    expect(screen.getByText("软链接")).toBeInTheDocument();
  });

  it("refreshes skills from the page header button", async () => {
    let loadCount = 0;
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_skills") {
        loadCount += 1;
        return loadCount === 1 ? [localSkill] : [localSkill, symlinkSkill];
      }
      return null;
    });

    renderSkillsPage();
    expect(await screen.findByText("Local Skill")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    expect(await screen.findByText("Linked Skill")).toBeInTheDocument();
    expect(invokeMock.mock.calls.filter(([command]) => command === "get_skills")).toHaveLength(2);
    expect(showToastMock).toHaveBeenCalledWith("Skills 已刷新");
  });

  it("shows the backend reason when toggling a skill fails", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_skills") return [localSkill];
      if (command === "toggle_skill") {
        throw "目标目录已存在，无法移动 Skill";
      }
      return null;
    });

    renderSkillsPage();
    const skillCard = (await screen.findByText("Local Skill")).closest('[role="button"]');
    expect(skillCard).not.toBeNull();

    fireEvent.click(within(skillCard as HTMLElement).getByRole("switch", { name: "已启用" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith("切换 Skill 状态失败", "error", {
        description: "目标目录已存在，无法移动 Skill",
      });
    });
  });

  it("shows the backend reason when syncing a skill fails", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_skills") return [localSkill];
      if (command === "sync_skill_to_codex") {
        throw "目标 ~/.codex/skills/local-skill 已存在且不是软链接";
      }
      return null;
    });

    renderSkillsPage();
    expect(await screen.findByText("Local Skill")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "同步到 ~/.codex/skills" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith("同步 Skill 失败", "error", {
        description: "目标 ~/.codex/skills/local-skill 已存在且不是软链接",
      });
    });
  });

  it("duplicates a skill directly from the card without opening the editor", async () => {
    const duplicatedSkill = {
      ...localSkill,
      id: "local-skill-copy",
      name: "Local Skill 副本",
      isActive: false,
      createdAt: 3,
      updatedAt: 3,
    } as Skill;
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_skills") return [localSkill];
      if (command === "duplicate_skill") return duplicatedSkill;
      return null;
    });

    renderSkillsPage();
    const card = (await screen.findByText("Local Skill")).closest('[role="button"]');
    expect(card).toBeInstanceOf(HTMLElement);

    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "复制" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("duplicate_skill", {
        id: "local-skill",
        isActive: true,
        nameSuffix: " 副本",
      });
    });
    expect(await screen.findByText("Local Skill 副本")).toBeInTheDocument();
    expect(showToastMock).toHaveBeenCalledWith("Skill 已复制");
    expect(screen.queryByRole("heading", { name: "编辑 Skill" })).not.toBeInTheDocument();
  });

  it("confirms the actual meaning before copying symlink-backed skill content", async () => {
    const duplicatedSkill = {
      ...symlinkSkill,
      id: "linked-skill-copy",
      name: "Linked Skill 副本",
      isActive: false,
      isSymlink: false,
      hasSymlinkContent: false,
      linkTarget: null,
      createdAt: 4,
      updatedAt: 4,
    } as Skill;
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_skills") return [symlinkSkill];
      if (command === "duplicate_skill") return duplicatedSkill;
      return null;
    });

    renderSkillsPage();
    const card = (await screen.findByText("Linked Skill")).closest('[role="button"]');
    expect(card).toBeInstanceOf(HTMLElement);

    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "复制" }));

    expect(invokeMock).not.toHaveBeenCalledWith("duplicate_skill", expect.anything());
    const dialog = await screen.findByRole("alertdialog", { name: "复制软链接内容" });
    expect(
      within(dialog).getByText(
        "将把当前 Skill 中的软链接目标内容复制为一个新的本地未启用副本，副本会变成普通文件或目录，后续可直接编辑；原始软链接和源目录不会被修改。",
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "复制" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("duplicate_skill", {
        id: "linked-skill",
        isActive: false,
        nameSuffix: " 副本",
      });
    });
    expect(await screen.findByText("Linked Skill 副本")).toBeInTheDocument();
    expect(showToastMock).toHaveBeenCalledWith("Skill 已复制");
  });

  it("keeps the skill list unchanged when duplicate fails", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_skills") return [localSkill];
      if (command === "duplicate_skill") throw "Skill 'local-skill-copy' 已存在";
      return null;
    });

    renderSkillsPage();
    const card = (await screen.findByText("Local Skill")).closest('[role="button"]');
    expect(card).toBeInstanceOf(HTMLElement);

    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "复制" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith("复制 Skill 失败", "error", {
        description: "Skill 'local-skill-copy' 已存在",
      });
    });
    expect(screen.getByText("Local Skill")).toBeInTheDocument();
    expect(screen.queryByText("Local Skill 副本")).not.toBeInTheDocument();
  });

  it("imports skills from a selected directory and requires confirming the result", async () => {
    const importResult: SkillDirectoryImportResult = {
      skills: [localSkill, symlinkSkill],
      imported: ["local-skill", "linked-skill"],
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

    fireEvent.click(screen.getByRole("button", { name: "导入 Skills" }));

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
    expect(await screen.findByText("Local Skill")).toBeInTheDocument();
    expect(await screen.findByText("Linked Skill")).toBeInTheDocument();

    const dialog = await screen.findByRole("dialog", { name: "导入结果" });
    expect(within(dialog).getByText("成功 2 个，失败 3 个")).toBeInTheDocument();
    expect(within(dialog).getByText("成功 2")).toBeInTheDocument();
    expect(within(dialog).getByText("失败 3")).toBeInTheDocument();
    expect(within(dialog).getByText("2 项")).toBeInTheDocument();
    expect(within(dialog).getByText("3 项")).toBeInTheDocument();
    expect(within(dialog).getByText("local-skill")).toBeInTheDocument();
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

  it("keeps the import result confirmation reachable when many skills are imported", async () => {
    const imported = Array.from({ length: 6 }, (_, index) => `bulk-skill-${index + 1}`);
    const importResult: SkillDirectoryImportResult = {
      skills: [
        ...imported.map((id, index) => ({
          ...localSkill,
          id,
          name: `Bulk Skill ${index + 1}`,
          createdAt: index + 10,
          updatedAt: index + 10,
        })),
      ],
      imported,
      skipped: [],
    };
    openDialogMock.mockResolvedValue("/tmp/many-skill-source");
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_skills") return [];
      if (command === "import_skills_from_directory") return importResult;
      return null;
    });

    renderSkillsPage();
    expect(await screen.findByText("暂无 Skills")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "导入 Skills" }));

    const dialog = await screen.findByRole("dialog", { name: "导入结果" });
    expect(dialog).toHaveClass("max-h-[min(720px,88vh)]", "flex", "flex-col", "overflow-hidden");
    const resultBody = dialog.querySelector(".skills-import-result-body");
    expect(resultBody).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    const successScrollArea = within(dialog)
      .getByText("bulk-skill-1")
      .closest('[data-slot="scroll-area"]');
    expect(successScrollArea).toHaveClass("overflow-hidden");
    const successViewport = successScrollArea?.querySelector('[data-slot="scroll-area-viewport"]');
    expect(successViewport).toHaveClass("max-h-[inherit]");

    fireEvent.click(within(dialog).getByRole("button", { name: "确认" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "导入结果" })).not.toBeInTheDocument();
    });
  });

  it("shows a focused all-success import result without the failure section", async () => {
    const importResult: SkillDirectoryImportResult = {
      skills: [localSkill, symlinkSkill],
      imported: ["local-skill", "linked-skill"],
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

    fireEvent.click(screen.getByRole("button", { name: "导入 Skills" }));

    const dialog = await screen.findByRole("dialog", { name: "导入结果" });
    expect(within(dialog).getByText("全部导入成功")).toBeInTheDocument();
    expect(within(dialog).getByText("已导入 2 个 Skill")).toBeInTheDocument();
    expect(within(dialog).getByText("成功 2")).toBeInTheDocument();
    expect(within(dialog).getByText("2 项")).toBeInTheDocument();
    expect(within(dialog).getByText("local-skill")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "导入 Skills" }));

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
        return loadCount === 1 ? [localSkill] : [localSkill, symlinkSkill];
      }
      return null;
    });

    renderSkillsPage();
    expect(await screen.findByText("Local Skill")).toBeInTheDocument();

    emitTauriEvent("claude-directory-changed", { paths: ["skills/linked-skill/SKILL.md"] });

    expect(await screen.findByText("Linked Skill")).toBeInTheDocument();
    expect(invokeMock.mock.calls.filter(([command]) => command === "get_skills")).toHaveLength(2);
    expect(showToastMock).not.toHaveBeenCalledWith("Skills 已刷新");
  });

  it("opens a read-only editor drawer for symlink skills", async () => {
    invokeMock.mockResolvedValue([symlinkSkill]);

    renderSkillsPage();
    expect(await screen.findByText("Linked Skill")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Linked Skill/ }));

    const nameInput = await screen.findByDisplayValue("Linked Skill");
    expect(screen.queryByText("软链接 Skill 不支持应用内修改")).not.toBeInTheDocument();
    expect(nameInput).toHaveAttribute("readonly");
    expect(screen.getByLabelText("mock-code-editor")).toHaveAttribute("readonly");

    fireEvent.pointerDown(nameInput);

    expect(showToastMock).toHaveBeenCalledWith("软链接 Skill 不支持应用内修改", "error", {
      description: "/tmp/external/linked-skill",
    });
  });

  it("uses the symlink delete confirmation copy for symlink skills", async () => {
    invokeMock.mockResolvedValue([symlinkSkill]);

    renderSkillsPage();
    expect(await screen.findByText("Linked Skill")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(await screen.findByText("删除软链接 Skill")).toBeInTheDocument();
    expect(
      screen.getByText("确定要删除此 Skill 的软链接吗？源目录不会被删除。"),
    ).toBeInTheDocument();
  });

  it("asks before closing a dirty skill editor and keeps the editor when save fails", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_skills") return [localSkill];
      if (command === "get_skill_file_tree") return [];
      if (command === "update_skill") throw new Error("save failed");
      return null;
    });

    renderSkillsPage();

    fireEvent.click(await screen.findByRole("button", { name: "Local Skill" }));
    fireEvent.change(await screen.findByDisplayValue("Local Skill"), {
      target: { value: "Local Skill Draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(screen.getByRole("alertdialog", { name: "存在未保存的更改" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存并退出" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith("保存 Skill 失败", "error", {
        description: "save failed",
      });
    });
    expect(screen.getByRole("alertdialog", { name: "存在未保存的更改" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Local Skill Draft")).toBeInTheDocument();
  });

  it("disables save in the unsaved dialog when a dirty new skill is invalid", async () => {
    renderSkillsPage();

    fireEvent.click(await screen.findByRole("button", { name: "添加 Skill" }));
    fireEvent.change(await screen.findByPlaceholderText("如：My Skill（默认与目录名相同）"), {
      target: { value: "Only Display Name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    const dialog = screen.getByRole("alertdialog", { name: "存在未保存的更改" });
    expect(within(dialog).getByRole("button", { name: "保存并退出" })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "不保存退出" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "添加 Skill" })).not.toBeInTheDocument();
    });
  });
});
