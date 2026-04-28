import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import HooksEditor from "../HooksEditor";
import { MOJIBAKE_POST_TOOL_USE_COMMAND, MOJIBAKE_PRE_TOOL_USE_COMMAND } from "../hook-presets";

function renderEditor(options?: {
  value?: Record<string, unknown>;
  onChange?: (next: Record<string, unknown>) => void;
}) {
  const onChange = options?.onChange ?? vi.fn();
  const onError = vi.fn();
  const result = render(
    <I18nProvider>
      <HooksEditor value={options?.value ?? {}} onChange={onChange} onError={onError} />
    </I18nProvider>,
  );
  return { ...result, onChange, onError };
}

describe("HooksEditor", () => {
  it("adds the mojibake check preset from an empty hooks object", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "添加乱码检查预设" }));

    expect(screen.getByText("PreToolUse")).toBeInTheDocument();
    expect(screen.getByText("PostToolUse")).toBeInTheDocument();
    expect(screen.getByText("Bash")).toBeInTheDocument();
    expect(screen.getByText("Edit|Write")).toBeInTheDocument();
    expect(screen.getAllByText("乱码检测")).toHaveLength(2);
    expect(onChange).toHaveBeenLastCalledWith({
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command",
              command: MOJIBAKE_PRE_TOOL_USE_COMMAND,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "Edit|Write",
          hooks: [
            {
              type: "command",
              command: MOJIBAKE_POST_TOOL_USE_COMMAND,
            },
          ],
        },
      ],
    });
  });

  it("merges the mojibake preset into existing hooks without duplicating the same command", () => {
    const { onChange } = renderEditor({
      value: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: MOJIBAKE_PRE_TOOL_USE_COMMAND,
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: "Write",
            hooks: [
              {
                type: "command",
                command: "pnpm build",
              },
            ],
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "添加乱码检查预设" }));

    expect(onChange).toHaveBeenLastCalledWith({
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command",
              command: MOJIBAKE_PRE_TOOL_USE_COMMAND,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "Write",
          hooks: [
            {
              type: "command",
              command: "pnpm build",
            },
          ],
        },
        {
          matcher: "Edit|Write",
          hooks: [
            {
              type: "command",
              command: MOJIBAKE_POST_TOOL_USE_COMMAND,
            },
          ],
        },
      ],
    });
  });

  it("hides the mojibake preset action when the preset already exists", () => {
    renderEditor({
      value: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: MOJIBAKE_PRE_TOOL_USE_COMMAND,
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: "Edit|Write",
            hooks: [
              {
                type: "command",
                command: MOJIBAKE_POST_TOOL_USE_COMMAND,
              },
            ],
          },
        ],
      },
    });

    expect(screen.queryByRole("button", { name: "添加乱码检查预设" })).not.toBeInTheDocument();
    expect(screen.getAllByText("乱码检测")).toHaveLength(2);
  });

  it("marks only the built-in preset command action when a matcher has mixed actions", () => {
    renderEditor({
      value: {
        PostToolUse: [
          {
            matcher: "Edit|Write",
            hooks: [
              {
                type: "command",
                command: "pnpm build",
              },
              {
                type: "command",
                command: MOJIBAKE_POST_TOOL_USE_COMMAND,
              },
            ],
          },
        ],
      },
    });

    const customAction = screen
      .getByText("command: pnpm build")
      .closest(".profile-hook-action-summary");
    const presetAction = screen
      .getByText((content) => content.startsWith("command: FILE="))
      .closest(".profile-hook-action-summary");

    expect(customAction).not.toBeNull();
    expect(presetAction).not.toBeNull();
    if (!customAction || !presetAction) {
      return;
    }

    expect(customAction).not.toHaveClass("has-preset-tag");
    expect(presetAction).toHaveClass("has-preset-tag");
    expect(within(customAction as HTMLElement).queryByText("乱码检测")).not.toBeInTheDocument();
    expect(within(presetAction as HTMLElement).getByText("乱码检测")).toBeInTheDocument();
  });

  it("renders hook matchers as separated rule items", () => {
    renderEditor({
      value: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: "pnpm test",
              },
            ],
          },
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: MOJIBAKE_PRE_TOOL_USE_COMMAND,
              },
            ],
          },
        ],
      },
    });

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("expands and collapses a command action when its summary is clicked", () => {
    renderEditor({
      value: {
        PostToolUse: [
          {
            matcher: "Edit|Write",
            hooks: [
              {
                type: "command",
                command: MOJIBAKE_POST_TOOL_USE_COMMAND,
              },
            ],
          },
        ],
      },
    });

    const presetAction = screen
      .getByText((content) => content.startsWith("command: FILE="))
      .closest(".profile-hook-action-summary");
    expect(presetAction).not.toBeNull();
    if (!presetAction) {
      return;
    }

    expect(
      within(presetAction as HTMLElement).queryByText((content) =>
        content.includes("检测到乱码字符"),
      ),
    ).not.toBeInTheDocument();

    const commandButton = within(presetAction as HTMLElement).getByRole("button");
    expect(commandButton).not.toHaveAttribute("title");
    fireEvent.click(commandButton);
    expect(
      within(presetAction as HTMLElement).getByText((content) =>
        content.includes("检测到乱码字符"),
      ),
    ).toBeInTheDocument();

    fireEvent.click(commandButton);
    expect(
      within(presetAction as HTMLElement).queryByText((content) =>
        content.includes("检测到乱码字符"),
      ),
    ).not.toBeInTheDocument();
  });

  it("confirms before deleting a configured hook event", () => {
    const { onChange } = renderEditor({
      value: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: MOJIBAKE_PRE_TOOL_USE_COMMAND,
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: "Edit|Write",
            hooks: [
              {
                type: "command",
                command: "pnpm build",
              },
            ],
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "删除 Hook PostToolUse" }));

    const dialogMessage = "确定要从当前设置中移除 Hook 事件 PostToolUse 吗？";
    const dialog = screen.getByText(dialogMessage).closest(".confirm-dialog");
    expect(dialog).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(within(dialog as HTMLElement).getByRole("button", { name: "取消" }));
    expect(screen.getByText("PostToolUse")).toBeInTheDocument();
    expect(screen.queryByText(dialogMessage)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "删除 Hook PostToolUse" }));
    const confirmDialog = screen.getByText(dialogMessage).closest(".confirm-dialog");
    expect(confirmDialog).not.toBeNull();
    fireEvent.click(within(confirmDialog as HTMLElement).getByRole("button", { name: "删除" }));

    expect(screen.queryByText("PostToolUse")).not.toBeInTheDocument();
    expect(screen.getByText("PreToolUse")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command",
              command: MOJIBAKE_PRE_TOOL_USE_COMMAND,
            },
          ],
        },
      ],
    });
  });

  it("shows an error and keeps hooks unchanged when the target event cannot be merged", () => {
    const { onChange } = renderEditor({
      value: {
        PreToolUse: {
          matcher: "Bash",
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "添加乱码检查预设" }));

    expect(
      screen.getByText("当前 Hooks 结构不支持一键添加，请切换到 JSON 手动处理。"),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
