import { fireEvent, render, screen, within } from "@testing-library/react";
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
          ANTHROPIC_MODEL: "claude-sonnet-4-6",
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
  it("renders a browsable env list with an empty editor state by default", () => {
    renderEditor();

    expect(screen.getByText("序号")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑环境变量 OPENAI_API_KEY" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑环境变量 ANTHROPIC_MODEL" }),
    ).toBeInTheDocument();
    const firstRow = screen
      .getByRole("button", { name: "编辑环境变量 OPENAI_API_KEY" })
      .closest(".profile-env-list-row");
    const secondRow = screen
      .getByRole("button", { name: "编辑环境变量 ANTHROPIC_MODEL" })
      .closest(".profile-env-list-row");
    expect(firstRow).not.toBeNull();
    expect(secondRow).not.toBeNull();
    expect(within(firstRow as HTMLElement).getByText("1")).toBeInTheDocument();
    expect(within(secondRow as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增环境变量" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "上移环境变量 OPENAI_API_KEY" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "下移环境变量 OPENAI_API_KEY" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("选择一个环境变量进行编辑。")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("环境变量名称")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("环境变量值")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("ANTHROPIC_AUTH_TOKEN")).not.toBeInTheDocument();
  });

  it("opens inline editor when the index area is clicked", () => {
    renderEditor();

    const row = screen
      .getByRole("button", { name: "编辑环境变量 OPENAI_API_KEY" })
      .closest(".profile-env-list-row");
    expect(row).not.toBeNull();

    fireEvent.click(within(row as HTMLElement).getByText("1"));

    expect(within(row as HTMLElement).getByLabelText("环境变量名称")).toHaveValue("OPENAI_API_KEY");
    expect(within(row as HTMLElement).getByLabelText("环境变量值")).toHaveValue("visible-token");
  });

  it("edits a selected variable inline and preserves hidden keys on save", () => {
    const { onChange } = renderEditor();

    const editButton = screen.getByRole("button", { name: "编辑环境变量 OPENAI_API_KEY" });
    fireEvent.click(editButton);

    const row = editButton.closest(".profile-env-list-row");
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLElement).queryByRole("heading", { name: "OPENAI_API_KEY" }),
    ).not.toBeInTheDocument();
    expect(
      within(row as HTMLElement).queryByText(
        "把没有官方 settings 键的能力放进 env，例如 API Key 或其它工具变量。",
      ),
    ).not.toBeInTheDocument();
    expect(within(row as HTMLElement).getByLabelText("环境变量名称")).toHaveValue("OPENAI_API_KEY");

    fireEvent.change(within(row as HTMLElement).getByLabelText("环境变量值"), {
      target: { value: "updated-token" },
    });
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "保存环境变量" }));

    expect(onChange).toHaveBeenLastCalledWith({
      ANTHROPIC_AUTH_TOKEN: "token",
      OPENAI_API_KEY: "updated-token",
      ANTHROPIC_MODEL: "claude-sonnet-4-6",
    });
  });

  it("collapses the current inline editor when the same variable is clicked again", () => {
    renderEditor();

    const editButton = screen.getByRole("button", { name: "编辑环境变量 OPENAI_API_KEY" });
    fireEvent.click(editButton);

    const row = editButton.closest(".profile-env-list-row");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByLabelText("环境变量名称")).toHaveValue("OPENAI_API_KEY");

    fireEvent.click(screen.getByRole("button", { name: "编辑环境变量 OPENAI_API_KEY" }));

    expect(screen.queryByLabelText("环境变量名称")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("环境变量值")).not.toBeInTheDocument();
  });

  it("blocks switching rows while the current draft has unsaved changes", () => {
    renderEditor();

    const openAiButton = screen.getByRole("button", { name: "编辑环境变量 OPENAI_API_KEY" });
    fireEvent.click(openAiButton);
    const row = openAiButton.closest(".profile-env-list-row");
    expect(row).not.toBeNull();

    fireEvent.change(within(row as HTMLElement).getByLabelText("环境变量值"), {
      target: { value: "pending-change" },
    });
    fireEvent.click(screen.getByRole("button", { name: "编辑环境变量 ANTHROPIC_MODEL" }));

    expect(within(row as HTMLElement).getByLabelText("环境变量名称")).toHaveValue("OPENAI_API_KEY");
    expect(within(row as HTMLElement).getByLabelText("环境变量值")).toHaveValue("pending-change");
    expect(screen.getByText("请先保存或取消当前环境变量编辑。")).toBeInTheDocument();
  });

  it("creates a new draft row from the footer action and removes it on cancel", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "新增环境变量" }));

    const draftButton = screen.getByRole("button", { name: "编辑环境变量 新环境变量" });
    const draftRow = draftButton.closest(".profile-env-list-row");
    expect(draftRow).not.toBeNull();
    expect(within(draftRow as HTMLElement).queryByRole("heading")).not.toBeInTheDocument();
    expect(
      within(draftRow as HTMLElement).queryByText("新增环境变量后，请先保存或取消。"),
    ).not.toBeInTheDocument();
    expect(within(draftRow as HTMLElement).getByLabelText("环境变量名称")).toHaveValue("");
    expect(within(draftRow as HTMLElement).getByLabelText("环境变量值")).toHaveValue("");

    fireEvent.click(
      within(draftRow as HTMLElement).getByRole("button", { name: "取消编辑环境变量" }),
    );

    expect(
      screen.queryByRole("button", { name: "编辑环境变量 新环境变量" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("选择一个环境变量进行编辑。")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("环境变量名称")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("环境变量值")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows deleting a new draft row directly without saving first", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "新增环境变量" }));

    const draftButton = screen.getByRole("button", { name: "删除环境变量 新环境变量" });
    const draftRow = draftButton.closest(".profile-env-list-row");
    expect(draftRow).not.toBeNull();

    fireEvent.change(within(draftRow as HTMLElement).getByLabelText("环境变量名称"), {
      target: { value: "OPENAI_BASE_URL" },
    });
    fireEvent.click(draftButton);

    expect(
      screen.queryByRole("button", { name: "编辑环境变量 OPENAI_BASE_URL" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("环境变量名称")).not.toBeInTheDocument();
    expect(screen.queryByText("请先保存或取消当前环境变量编辑。")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("saves a newly added variable and keeps hidden keys intact", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "新增环境变量" }));
    const draftButton = screen.getByRole("button", { name: "编辑环境变量 新环境变量" });
    const draftRow = draftButton.closest(".profile-env-list-row");
    expect(draftRow).not.toBeNull();

    fireEvent.change(within(draftRow as HTMLElement).getByLabelText("环境变量名称"), {
      target: { value: "OPENAI_BASE_URL" },
    });
    fireEvent.change(within(draftRow as HTMLElement).getByLabelText("环境变量值"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(within(draftRow as HTMLElement).getByRole("button", { name: "保存环境变量" }));

    expect(onChange).toHaveBeenLastCalledWith({
      ANTHROPIC_AUTH_TOKEN: "token",
      OPENAI_API_KEY: "visible-token",
      ANTHROPIC_MODEL: "claude-sonnet-4-6",
      OPENAI_BASE_URL: "https://example.com",
    });
  });

  it("keeps hidden keys when a visible row is deleted", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "删除环境变量 OPENAI_API_KEY" }));

    expect(screen.queryByLabelText("环境变量名称")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("环境变量值")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: "claude-sonnet-4-6",
    });
  });
});
