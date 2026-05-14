import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import SettingsSectionModePanel from "../SettingsSectionModePanel";

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
      <textarea
        aria-label="config-preview-input"
        value={content}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {jsonError ? <span>{jsonError}</span> : null}
    </div>
  ),
}));

describe("SettingsSectionModePanel", () => {
  it("shows the clear action in section json edit mode", () => {
    const handleClear = vi.fn();
    const handleFormat = vi.fn();

    render(
      <I18nProvider>
        <SettingsSectionModePanel
          title="Hooks"
          mode="json"
          onModeChange={vi.fn()}
          controls={<div>controls</div>}
          jsonEditor={{
            rawJson: `{\n  "PostToolUse": []\n}`,
            jsonError: "",
            hasAppliedDraft: true,
            handleJsonChange: vi.fn(),
            formatJson: handleFormat,
            clearJson: handleClear,
          }}
          jsonHint="在这里直接编辑当前区块对象的 JSON。"
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "格式化 JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "清空 JSON" }));

    expect(handleFormat).toHaveBeenCalledTimes(1);
    expect(handleClear).toHaveBeenCalledTimes(1);
  });
});
