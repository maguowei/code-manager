import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import DocumentEditorSection from "../DocumentEditorSection";

vi.mock("../../ConfigPreview", () => ({
  default: ({
    content,
    onChange,
    jsonError,
  }: {
    content: string;
    onChange?: (value: string) => void;
    jsonError?: string;
  }) => (
    <div>
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

    render(
      <I18nProvider>
        <DocumentEditorSection
          title="最终配置"
          previewContent={`{\n  "$schema": "https://json.schemastore.org/claude-code-settings.json"\n}`}
          editContent='{"env":{"ANTHROPIC_AUTH_TOKEN":"token"}}'
          editError="settings 必须是 JSON 对象"
          hasAppliedDraft={false}
          onEditChange={handleEditChange}
          onFormat={handleFormat}
          previewModeLabel="预览"
          editModeLabel="编辑源 JSON"
          editHint="预览展示合成结果，编辑作用于源配置。"
          supportedKeys={["env", "permissions"]}
          supportedKeysLabel="当前已由控件覆盖的字段"
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "预览" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("config-preview-output")).toHaveTextContent('"$schema"');

    fireEvent.click(screen.getByRole("button", { name: "编辑源 JSON" }));

    expect(screen.getByText("预览展示合成结果，编辑作用于源配置。")).toBeInTheDocument();
    expect(screen.getByText("当前已由控件覆盖的字段")).toBeInTheDocument();
    expect(screen.getByText("env")).toBeInTheDocument();
    expect(screen.getByText("permissions")).toBeInTheDocument();
    expect(screen.getByText("当前草稿未生效，仍使用上一次合法 JSON。")).toBeInTheDocument();
    expect(screen.getByText("settings 必须是 JSON 对象")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("config-preview-input"), {
      target: {
        value: '{"env":{"ANTHROPIC_AUTH_TOKEN":"next-token"}}',
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "格式化 JSON" }));

    expect(handleEditChange).toHaveBeenCalledWith('{"env":{"ANTHROPIC_AUTH_TOKEN":"next-token"}}');
    expect(handleFormat).toHaveBeenCalledTimes(1);
  });
});
