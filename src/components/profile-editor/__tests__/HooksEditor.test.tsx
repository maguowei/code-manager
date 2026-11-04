import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import HooksEditor from "../HooksEditor";

// 已下线的乱码检查预设曾写入的命令；保留副本用于验证历史配置按普通自定义 hook 显示
const LEGACY_MOJIBAKE_PRE_TOOL_USE_COMMAND = String.raw`CMD=$(jq -r '.tool_input.command // empty' </dev/stdin) && echo "$CMD" | grep -q 'git commit' || exit 0 && G=$(printf '\xef\xbf\xbd') && echo "$CMD" | grep -qF "$G" && jq -nc '{"decision":"block","reason":"提交信息包含乱码字符 (U+FFFD)，请修复后再提交"}' || true`;

const LEGACY_MOJIBAKE_POST_TOOL_USE_COMMAND = String.raw`FILE=$(jq -r '.tool_input.file_path // empty' </dev/stdin) && [ -n "$FILE" ] && [ -f "$FILE" ] && G=$(printf '\xef\xbf\xbd') && RESULT=$(grep -FHn "$G" "$FILE" 2>/dev/null) && [ -n "$RESULT" ] && jq -nc --arg r "$RESULT" '{"decision":"block","reason":("检测到乱码字符 (U+FFFD)，请修复后再继续:\n" + $r)}' || true`;

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

function getHookActionSummary(text: string | ((content: string) => boolean)): HTMLElement {
  const action = screen
    .getByText(text)
    .closest('[data-slot="hook-action-summary"]') as HTMLElement | null;
  expect(action).not.toBeNull();
  return action as HTMLElement;
}

describe("HooksEditor", () => {
  it("does not offer a built-in hook preset action", () => {
    renderEditor();

    expect(screen.queryByRole("button", { name: /预设/ })).not.toBeInTheDocument();
  });

  it("shows legacy mojibake hooks as plain custom hooks that can still be deleted", () => {
    const { onChange } = renderEditor({
      value: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: LEGACY_MOJIBAKE_PRE_TOOL_USE_COMMAND }],
          },
        ],
        PostToolUse: [
          {
            matcher: "Edit|Write",
            hooks: [{ type: "command", command: LEGACY_MOJIBAKE_POST_TOOL_USE_COMMAND }],
          },
        ],
      },
    });

    const legacyAction = getHookActionSummary((content) => content.startsWith("command: FILE="));
    expect(legacyAction).not.toHaveAttribute("data-preset");
    expect(screen.queryByText("乱码检测")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除 Hook PostToolUse" }));
    const dialog = screen.getByRole("alertdialog", { name: "删除 Hook" });
    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));

    expect(onChange).toHaveBeenLastCalledWith({
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: LEGACY_MOJIBAKE_PRE_TOOL_USE_COMMAND }],
        },
      ],
    });
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
                command: LEGACY_MOJIBAKE_PRE_TOOL_USE_COMMAND,
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
                command: LEGACY_MOJIBAKE_POST_TOOL_USE_COMMAND,
              },
            ],
          },
        ],
      },
    });

    const presetAction = getHookActionSummary((content) => content.startsWith("command: FILE="));

    expect(
      within(presetAction).queryByText((content) => content.includes("检测到乱码字符")),
    ).not.toBeInTheDocument();

    const commandButton = within(presetAction).getByRole("button");
    expect(commandButton).not.toHaveAttribute("title");
    fireEvent.click(commandButton);
    expect(
      within(presetAction).getByText((content) => content.includes("检测到乱码字符")),
    ).toBeInTheDocument();

    fireEvent.click(commandButton);
    expect(
      within(presetAction).queryByText((content) => content.includes("检测到乱码字符")),
    ).not.toBeInTheDocument();
  });

  it("allows long expanded command actions to grow and wrap inside their container", () => {
    renderEditor({
      value: {
        PostToolUse: [
          {
            matcher: "Edit|Write",
            hooks: [
              {
                type: "command",
                command: LEGACY_MOJIBAKE_POST_TOOL_USE_COMMAND,
              },
            ],
          },
        ],
      },
    });

    const presetAction = getHookActionSummary((content) => content.startsWith("command: FILE="));
    const commandButton = within(presetAction).getByRole("button");

    fireEvent.click(commandButton);

    expect(presetAction).toHaveClass("min-w-0", "max-w-full");
    expect(commandButton).toHaveClass("h-auto", "min-w-0", "max-w-full", "whitespace-pre-wrap");
    expect(commandButton.className).toContain("[overflow-wrap:anywhere]");
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
                command: LEGACY_MOJIBAKE_PRE_TOOL_USE_COMMAND,
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
    const dialog = screen.getByRole("alertdialog", { name: "删除 Hook" });
    expect(within(dialog).getByText(dialogMessage)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.getByText("PostToolUse")).toBeInTheDocument();
    expect(screen.queryByText(dialogMessage)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "删除 Hook PostToolUse" }));
    const confirmDialog = screen.getByRole("alertdialog", { name: "删除 Hook" });
    expect(within(confirmDialog).getByText(dialogMessage)).toBeInTheDocument();
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "删除" }));

    expect(screen.queryByText("PostToolUse")).not.toBeInTheDocument();
    expect(screen.getByText("PreToolUse")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command",
              command: LEGACY_MOJIBAKE_PRE_TOOL_USE_COMMAND,
            },
          ],
        },
      ],
    });
  });
});
