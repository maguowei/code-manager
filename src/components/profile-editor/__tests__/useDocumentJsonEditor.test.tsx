import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useDocumentJsonEditor } from "../useDocumentJsonEditor";

function HookHarness() {
  const [value, setValue] = useState<Record<string, unknown>>({
    model: "claude-sonnet-4-6",
  });
  const editor = useDocumentJsonEditor({
    value,
    onApply: setValue,
    validateMessage: "完整设置 JSON 必须是 JSON 对象",
  });

  return (
    <div>
      <textarea
        aria-label="json-input"
        value={editor.rawJson}
        onChange={(event) => editor.handleJsonChange(event.target.value)}
      />
      <span data-testid="json-error">{editor.jsonError}</span>
      <span data-testid="draft-status">{editor.hasAppliedDraft ? "applied" : "pending"}</span>
      <span data-testid="committed-model">{String(value.model ?? "")}</span>
      <button type="button" onClick={editor.formatJson}>
        format
      </button>
      <button
        type="button"
        onClick={() =>
          setValue({
            model: "claude-opus-4-1",
          })
        }
      >
        external-update
      </button>
    </div>
  );
}

describe("useDocumentJsonEditor", () => {
  it("keeps valid drafts unformatted while applying them immediately", () => {
    render(<HookHarness />);

    fireEvent.change(screen.getByLabelText("json-input"), {
      target: {
        value: '{"model":"claude-haiku-4-5"}',
      },
    });

    expect(screen.getByLabelText("json-input")).toHaveValue('{"model":"claude-haiku-4-5"}');
    expect(screen.getByTestId("draft-status")).toHaveTextContent("applied");
    expect(screen.getByTestId("committed-model")).toHaveTextContent("claude-haiku-4-5");
  });

  it("keeps invalid drafts without mutating the last committed object and can format or resync later", () => {
    render(<HookHarness />);

    fireEvent.change(screen.getByLabelText("json-input"), {
      target: {
        value: '{"model":"claude-haiku-4-5"}',
      },
    });
    fireEvent.change(screen.getByLabelText("json-input"), {
      target: {
        value: "[]",
      },
    });

    expect(screen.getByTestId("json-error")).toHaveTextContent("完整设置 JSON 必须是 JSON 对象");
    expect(screen.getByLabelText("json-input")).toHaveValue("[]");
    expect(screen.getByTestId("draft-status")).toHaveTextContent("pending");
    expect(screen.getByTestId("committed-model")).toHaveTextContent("claude-haiku-4-5");

    fireEvent.change(screen.getByLabelText("json-input"), {
      target: {
        value: '{"model":"claude-haiku-4-5"}',
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "format" }));

    expect(screen.getByLabelText("json-input")).toHaveValue(`{\n  "model": "claude-haiku-4-5"\n}`);

    fireEvent.click(screen.getByRole("button", { name: "external-update" }));

    expect(screen.getByLabelText("json-input")).toHaveValue(`{\n  "model": "claude-opus-4-1"\n}`);
    expect(screen.getByTestId("draft-status")).toHaveTextContent("applied");
    expect(screen.getByTestId("committed-model")).toHaveTextContent("claude-opus-4-1");
  });
});
