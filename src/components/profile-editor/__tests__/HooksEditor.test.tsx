import { fireEvent, render, screen } from "@testing-library/react";
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
