import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import DocumentEditorSection from "../DocumentEditorSection";

vi.mock("../../ConfigPreview", () => ({
  default: ({
    content,
    onChange,
    jsonError,
    actions,
  }: {
    content: string;
    onChange?: (value: string) => void;
    jsonError?: string;
    actions?: ReactNode;
  }) => (
    <div>
      {actions}
      {onChange ? (
        <textarea
          aria-label="config-preview-input"
          value={content}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <pre data-testid="config-preview-output">{content}</pre>
      )}
      {jsonError ? <span>{jsonError}</span> : null}
    </div>
  ),
}));

describe("DocumentEditorSection", () => {
  it("switches between preview and json edit modes with shared metadata", () => {
    const handleEditChange = vi.fn();
    const handleFormat = vi.fn();
    const handleClear = vi.fn();
    const getEditContent = vi.fn(() => '{"env":{"ANTHROPIC_AUTH_TOKEN":"token"}}');

    render(
      <I18nProvider>
        <DocumentEditorSection
          title="最终配置"
          previewContent={`{\n  "$schema": "https://json.schemastore.org/claude-code-settings.json"\n}`}
          getEditContent={getEditContent}
          editError="settings 必须是 JSON 对象"
          hasAppliedDraft={false}
          onEditChange={handleEditChange}
          onFormat={handleFormat}
          onClear={handleClear}
          previewModeLabel="预览"
          editModeLabel="编辑源 JSON"
          editHint="预览展示合成结果，编辑作用于源配置。"
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "预览" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("config-preview-output")).toHaveTextContent('"$schema"');
    expect(getEditContent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "编辑源 JSON" }));

    expect(getEditContent).toHaveBeenCalledTimes(1);
    expect(screen.getByText("预览展示合成结果，编辑作用于源配置。")).toBeInTheDocument();
    expect(screen.getByText("当前草稿未生效，仍使用上一次合法 JSON。")).toBeInTheDocument();
    expect(screen.getByText("settings 必须是 JSON 对象")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("config-preview-input"), {
      target: {
        value: '{"env":{"ANTHROPIC_AUTH_TOKEN":"next-token"}}',
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "格式化 JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "清空 JSON" }));

    expect(handleEditChange).toHaveBeenCalledWith('{"env":{"ANTHROPIC_AUTH_TOKEN":"next-token"}}');
    expect(handleFormat).toHaveBeenCalledTimes(1);
    expect(handleClear).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog", { name: "清空 JSON" });
    expect(within(dialog).getByText("清空后 JSON 将保留为空对象 {}。")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(handleClear).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "清空 JSON" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog", { name: "清空 JSON" })).getByRole("button", {
        name: "清空 JSON",
      }),
    );

    expect(handleClear).toHaveBeenCalledTimes(1);
  });
});
