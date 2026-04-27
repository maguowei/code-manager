import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useObjectJsonEditor } from "../useObjectJsonEditor";

function HookHarness() {
  const [value, setValue] = useState<Record<string, unknown>>({
    model: "claude-sonnet-4-6",
  });
  const editor = useObjectJsonEditor({
    value,
    onChange: setValue,
    label: "模型与行为",
    isZh: true,
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

function UnreadRawJsonHarness({ value }: { value: Record<string, unknown> }) {
  useObjectJsonEditor({
    value,
    onChange: () => {},
    label: "权限",
    isZh: true,
  });

  return <span>ready</span>;
}

describe("useObjectJsonEditor", () => {
  it("does not stringify the object until raw json is read", () => {
    const value: Record<string, unknown> = {};
    Object.defineProperty(value, "allow", {
      enumerable: true,
      get() {
        throw new Error("raw json was stringified");
      },
    });

    render(<UnreadRawJsonHarness value={value} />);

    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("keeps invalid drafts without mutating the last committed object", () => {
    render(<HookHarness />);

    fireEvent.change(screen.getByLabelText("json-input"), {
      target: {
        value: JSON.stringify(
          {
            model: "claude-haiku-4-5",
          },
          null,
          2,
        ),
      },
    });

    expect(screen.getByTestId("draft-status")).toHaveTextContent("applied");
    expect(screen.getByTestId("committed-model")).toHaveTextContent("claude-haiku-4-5");

    fireEvent.change(screen.getByLabelText("json-input"), {
      target: {
        value: "[]",
      },
    });

    expect(screen.getByTestId("json-error")).toHaveTextContent("模型与行为 JSON 必须是 JSON 对象");
    expect(screen.getByLabelText("json-input")).toHaveValue("[]");
    expect(screen.getByTestId("draft-status")).toHaveTextContent("pending");
    expect(screen.getByTestId("committed-model")).toHaveTextContent("claude-haiku-4-5");
  });

  it("formats valid json and resyncs the draft after external updates", () => {
    render(<HookHarness />);

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
