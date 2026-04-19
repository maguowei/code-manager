import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import EnabledPluginsEditor from "../EnabledPluginsEditor";

function renderEditor(options?: {
  value?: Record<string, boolean | string[]>;
  showTitle?: boolean;
  onChange?: (next: Record<string, boolean | string[]>) => void;
}) {
  const onChange = options?.onChange ?? vi.fn();
  const onError = vi.fn();
  const result = render(
    <I18nProvider>
      <EnabledPluginsEditor
        value={options?.value ?? {}}
        onChange={onChange}
        onError={onError}
        showTitle={options?.showTitle}
      />
    </I18nProvider>,
  );
  return { ...result, onChange, onError };
}

describe("EnabledPluginsEditor", () => {
  it("can hide its own title while keeping compact structured controls", () => {
    const { container } = renderEditor({
      value: {
        "formatter@anthropic-tools": true,
      },
      showTitle: false,
    });

    expect(screen.queryByRole("heading", { name: "插件", level: 4 })).not.toBeInTheDocument();
    expect(container.querySelector(".profile-plugin-table")).not.toBeNull();
    expect(container.querySelectorAll(".profile-plugin-item")).toHaveLength(1);
  });

  it("keeps compact structured editing working for plugin rows and tool lists", () => {
    const { container, onChange } = renderEditor({
      showTitle: false,
    });

    fireEvent.click(screen.getByRole("button", { name: "新增插件" }));
    expect(screen.getAllByText("序号")).toHaveLength(1);
    expect(screen.getAllByText("插件 ID")).toHaveLength(1);
    expect(screen.getAllByText("插件模式")).toHaveLength(1);
    expect(screen.getByText("1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("插件 ID 1"), {
      target: { value: "formatter@anthropic-tools" },
    });
    fireEvent.change(screen.getByLabelText("插件模式 1"), {
      target: { value: "tools" },
    });
    fireEvent.click(screen.getByRole("button", { name: "新增插件工具 1" }));
    fireEvent.change(screen.getByLabelText("插件工具 1-1"), {
      target: { value: "format" },
    });

    expect(container.querySelector(".profile-plugin-table")).not.toBeNull();
    expect(container.querySelectorAll(".profile-plugin-item")).toHaveLength(1);
    expect(container.querySelector(".profile-plugin-row")).not.toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({
      "formatter@anthropic-tools": ["format"],
    });
  });

  it("shows one-based row numbers and reindexes them after removal", () => {
    renderEditor({
      showTitle: false,
      value: {
        "formatter@anthropic-tools": true,
        "reviewer@anthropic-tools": false,
      },
    });

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除插件 1" }));

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
    expect(screen.getByLabelText("插件 ID 1")).toHaveValue("reviewer@anthropic-tools");
  });
});
