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

function getEnvRow(label: string): HTMLElement {
  const row = screen
    .getByRole("button", { name: `编辑环境变量 ${label}` })
    .closest('[data-slot="env-list-row"]');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

function getEnvRowForButton(button: HTMLElement): HTMLElement {
  const row = button.closest('[data-slot="env-list-row"]');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

function getEnvRowHeadForButton(button: HTMLElement): HTMLElement {
  const rowHead = button.closest('[data-slot="env-row-head"]');
  expect(rowHead).not.toBeNull();
  return rowHead as HTMLElement;
}

describe("EnvEditor", () => {
  it("renders a browsable env list with an empty editor state by default", () => {
    renderEditor();

    expect(screen.getByText("序号")).toBeInTheDocument();
    const openAiButton = screen.getByRole("button", { name: "编辑环境变量 OPENAI_API_KEY" });
    expect(openAiButton).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑环境变量 ANTHROPIC_MODEL" }),
    ).toBeInTheDocument();
    const firstRow = getEnvRowForButton(openAiButton);
    const secondRow = getEnvRow("ANTHROPIC_MODEL");
    const firstRowHead = getEnvRowHeadForButton(openAiButton);
    expect(
      within(firstRowHead).getByRole("button", {
        name: "删除环境变量 OPENAI_API_KEY",
      }),
    ).toBeInTheDocument();
    expect(within(firstRow).getByText("1")).toBeInTheDocument();
    expect(within(secondRow).getByText("2")).toBeInTheDocument();
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

    const row = getEnvRow("OPENAI_API_KEY");

    fireEvent.click(within(row).getByText("1"));

    expect(within(row).getByLabelText("环境变量名称")).toHaveValue("OPENAI_API_KEY");
    expect(within(row).getByLabelText("环境变量值")).toHaveValue("visible-token");
  });

  it("edits a selected variable inline and preserves hidden keys on save", () => {
    const { onChange } = renderEditor();

    const editButton = screen.getByRole("button", { name: "编辑环境变量 OPENAI_API_KEY" });
    fireEvent.click(editButton);

    const row = getEnvRowForButton(editButton);
    expect(within(row).queryByRole("heading", { name: "OPENAI_API_KEY" })).not.toBeInTheDocument();
    expect(
      within(row).queryByText(
        "把没有官方 settings 键的能力放进 env，例如 API Key 或其它工具变量。",
      ),
    ).not.toBeInTheDocument();
    expect(within(row).getByLabelText("环境变量名称")).toHaveValue("OPENAI_API_KEY");

    fireEvent.change(within(row).getByLabelText("环境变量值"), {
      target: { value: "updated-token" },
    });
    fireEvent.click(within(row).getByRole("button", { name: "保存环境变量" }));

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

    const row = getEnvRowForButton(editButton);
    expect(within(row).getByLabelText("环境变量名称")).toHaveValue("OPENAI_API_KEY");

    fireEvent.click(screen.getByRole("button", { name: "编辑环境变量 OPENAI_API_KEY" }));

    expect(screen.queryByLabelText("环境变量名称")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("环境变量值")).not.toBeInTheDocument();
  });

  it("blocks switching rows while the current draft has unsaved changes", () => {
    renderEditor();

    const openAiButton = screen.getByRole("button", { name: "编辑环境变量 OPENAI_API_KEY" });
    fireEvent.click(openAiButton);
    const row = getEnvRowForButton(openAiButton);

    fireEvent.change(within(row).getByLabelText("环境变量值"), {
      target: { value: "pending-change" },
    });
    fireEvent.click(screen.getByRole("button", { name: "编辑环境变量 ANTHROPIC_MODEL" }));

    expect(within(row).getByLabelText("环境变量名称")).toHaveValue("OPENAI_API_KEY");
    expect(within(row).getByLabelText("环境变量值")).toHaveValue("pending-change");
    expect(screen.getByText("请先保存或取消当前环境变量编辑。")).toBeInTheDocument();
  });

  it("creates a new draft row from the footer action and removes it on cancel", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "新增环境变量" }));

    const draftButton = screen.getByRole("button", { name: "编辑环境变量 新环境变量" });
    const draftRow = getEnvRowForButton(draftButton);
    expect(within(draftRow).queryByRole("heading")).not.toBeInTheDocument();
    expect(
      within(draftRow).queryByText("新增环境变量后，请先保存或取消。"),
    ).not.toBeInTheDocument();
    expect(within(draftRow).getByLabelText("环境变量名称")).toHaveValue("");
    expect(within(draftRow).getByLabelText("环境变量值")).toHaveValue("");

    fireEvent.click(within(draftRow).getByRole("button", { name: "取消编辑环境变量" }));

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
    const draftRow = getEnvRowForButton(draftButton);

    fireEvent.change(within(draftRow).getByLabelText("环境变量名称"), {
      target: { value: "OPENAI_BASE_URL" },
    });
    fireEvent.click(draftButton);

    expect(
      screen.queryByRole("button", { name: "编辑环境变量 OPENAI_BASE_URL" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("环境变量名称")).not.toBeInTheDocument();
    expect(screen.queryByText("请先保存或取消当前环境变量编辑。")).not.toBeInTheDocument();
    expect(screen.queryByText("删除环境变量")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("saves a newly added variable and keeps hidden keys intact", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "新增环境变量" }));
    const draftButton = screen.getByRole("button", { name: "编辑环境变量 新环境变量" });
    const draftRow = getEnvRowForButton(draftButton);

    fireEvent.change(within(draftRow).getByLabelText("环境变量名称"), {
      target: { value: "OPENAI_BASE_URL" },
    });
    fireEvent.change(within(draftRow).getByLabelText("环境变量值"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(within(draftRow).getByRole("button", { name: "保存环境变量" }));

    expect(onChange).toHaveBeenLastCalledWith({
      ANTHROPIC_AUTH_TOKEN: "token",
      OPENAI_API_KEY: "visible-token",
      ANTHROPIC_MODEL: "claude-sonnet-4-6",
      OPENAI_BASE_URL: "https://example.com",
    });
  });

  it("shows a confirmation dialog before deleting a visible row and preserves hidden keys after confirm", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "删除环境变量 OPENAI_API_KEY" }));

    const dialogMessage = "确定要从当前设置中移除环境变量 OPENAI_API_KEY 吗？";
    const dialog = screen.getByRole("alertdialog", { name: "删除环境变量" });
    expect(within(dialog).getByText(dialogMessage)).toBeInTheDocument();
    expect(screen.queryByLabelText("环境变量名称")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("环境变量值")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));

    expect(onChange).toHaveBeenLastCalledWith({
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: "claude-sonnet-4-6",
    });
  });

  it("keeps the row when deletion is canceled", () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "删除环境变量 OPENAI_API_KEY" }));

    const dialogMessage = "确定要从当前设置中移除环境变量 OPENAI_API_KEY 吗？";
    const dialog = screen.getByRole("alertdialog", { name: "删除环境变量" });
    expect(within(dialog).getByText(dialogMessage)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));

    expect(screen.getByRole("button", { name: "编辑环境变量 OPENAI_API_KEY" })).toBeInTheDocument();
    expect(screen.queryByText(dialogMessage)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
