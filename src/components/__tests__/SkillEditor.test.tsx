import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { Skill } from "../../types";
import SkillEditor from "../SkillEditor";

const { invokeMock, showToastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(async () => []),
  showToastMock: vi.fn(),
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

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("../../hooks/useCodeMirrorTheme", () => ({
  useCodeMirrorTheme: () => ({}),
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

const symlinkSkill = {
  id: "linked-skill",
  name: "Linked Skill",
  description: "软链接 Skill",
  content: "内容",
  disableModelInvocation: false,
  userInvocable: true,
  isActive: true,
  createdAt: 1,
  updatedAt: 1,
  isSymlink: true,
  linkTarget: "/tmp/external/linked-skill",
} as Skill;

const localSkill = {
  ...symlinkSkill,
  id: "local-skill",
  name: "Local Skill",
  description: "普通 Skill",
  isSymlink: false,
  linkTarget: null,
} as Skill;

function renderSkillEditor(skill: Skill | null) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <I18nProvider>
      <SkillEditor skill={skill} onSave={onSave} onClose={onClose} />
    </I18nProvider>,
  );
  return { onClose, onSave };
}

describe("SkillEditor", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_skill_file_tree") {
        return [
          { path: "examples.md", kind: "file", size: 18, isBinary: false },
          { path: "scripts", kind: "directory", size: 0, isBinary: false },
          { path: "scripts/helper.sh", kind: "file", size: 22, isBinary: false },
        ];
      }
      return [];
    });
    showToastMock.mockReset();
  });

  it("opens symlink skills in a read-only editor with a clear warning", async () => {
    const { onClose, onSave } = renderSkillEditor(symlinkSkill);

    expect(await screen.findByText("软链接 Skill 不支持应用内修改")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Linked Skill")).toBeDisabled();
    expect(screen.getByDisplayValue("软链接 Skill")).toBeDisabled();
    expect(screen.getByLabelText("mock-code-editor")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(showToastMock).not.toHaveBeenCalledWith("软链接 Skill 不支持编辑内容", "error");
  });

  it("shows support files as a read-only tree without file editing actions", async () => {
    renderSkillEditor(localSkill);

    expect(await screen.findByText("examples.md")).toBeInTheDocument();
    expect(screen.getByText("scripts/helper.sh")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加文件" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑文件" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除文件" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_skill_file_tree", {
        id: "local-skill",
        isActive: true,
      });
    });
  });
});
