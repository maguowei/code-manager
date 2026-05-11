import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { Skill } from "../../types";
import SkillEditor from "../SkillEditor";

const { showToastMock } = vi.hoisted(() => ({
  showToastMock: vi.fn(),
}));

vi.mock("@uiw/react-codemirror", () => ({
  default: () => <div data-testid="code-editor" />,
}));

vi.mock("../../hooks/useCodeMirrorTheme", () => ({
  useCodeMirrorTheme: () => ({}),
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

const unmanagedSkill = {
  id: "linked-skill",
  name: "Linked Skill",
  description: "软链接 Skill",
  content: "内容",
  disableModelInvocation: false,
  userInvocable: true,
  isActive: true,
  createdAt: 1,
  updatedAt: 1,
  isManaged: false,
  linkTarget: "/tmp/external/linked-skill",
} as Skill;

function renderSkillEditor(skill: Skill) {
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
    showToastMock.mockReset();
  });

  it("closes immediately when asked to edit an unmanaged symlink skill", async () => {
    const { onClose, onSave } = renderSkillEditor(unmanagedSkill);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(showToastMock).toHaveBeenCalledWith("软链接 Skill 不支持编辑内容", "error");
    expect(onSave).not.toHaveBeenCalled();
  });
});
