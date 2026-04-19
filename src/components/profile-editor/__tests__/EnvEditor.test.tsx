import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import EnvEditor from "../EnvEditor";

function renderEditor() {
  const onChange = vi.fn();
  const onError = vi.fn();
  render(
    <I18nProvider>
      <EnvEditor
        value={{
          ANTHROPIC_AUTH_TOKEN: "token",
          OPENAI_API_KEY: "visible-token",
        }}
        hiddenKeys={["ANTHROPIC_AUTH_TOKEN"]}
        onChange={onChange}
        onError={onError}
        showTitle={false}
      />
    </I18nProvider>,
  );
  return { onChange, onError };
}

describe("EnvEditor", () => {
  it("hides configured keys from structured rows and preserves them on row edits", () => {
    const { onChange } = renderEditor();

    expect(screen.getByLabelText("环境变量 Key 1")).toHaveValue("OPENAI_API_KEY");
    expect(screen.queryByDisplayValue("ANTHROPIC_AUTH_TOKEN")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("环境变量 Value 1"), {
      target: { value: "updated-token" },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      ANTHROPIC_AUTH_TOKEN: "token",
      OPENAI_API_KEY: "updated-token",
    });
  });

  it("keeps hidden keys when visible rows are cleared", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "删除 环境变量 1" }));

    expect(onChange).toHaveBeenLastCalledWith({
      ANTHROPIC_AUTH_TOKEN: "token",
    });
  });
});
