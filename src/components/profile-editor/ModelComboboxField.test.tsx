import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import ModelComboboxField from "./ModelComboboxField";

const SUGGESTIONS = ["deepseek-v4-pro[1m]", "deepseek-v4-flash"];

function renderField(props: Partial<React.ComponentProps<typeof ModelComboboxField>> = {}) {
  const onChange = props.onChange ?? vi.fn();
  render(
    <I18nProvider>
      <ModelComboboxField
        ariaLabel="默认模型"
        value={props.value ?? ""}
        suggestions={props.suggestions ?? SUGGESTIONS}
        onChange={onChange}
        {...props}
      />
    </I18nProvider>,
  );
  return { onChange };
}

describe("ModelComboboxField", () => {
  it("无候选时退化为纯文本输入,不渲染下拉触发按钮", () => {
    renderField({ suggestions: [] });
    expect(screen.getByRole("textbox", { name: "默认模型" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择模型" })).not.toBeInTheDocument();
  });

  it("自由输入直接透传 onChange", () => {
    const { onChange } = renderField({ value: "" });
    fireEvent.change(screen.getByRole("textbox", { name: "默认模型" }), {
      target: { value: "custom-model" },
    });
    expect(onChange).toHaveBeenCalledWith("custom-model");
  });

  it("点击触发按钮展开候选并可选中回填", () => {
    const { onChange } = renderField({ value: "" });
    fireEvent.click(screen.getByRole("button", { name: "选择模型" }));
    const option = screen.getByText("deepseek-v4-flash");
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith("deepseek-v4-flash");
  });

  it("按当前输入值过滤候选", () => {
    renderField({ value: "flash" });
    fireEvent.click(screen.getByRole("button", { name: "选择模型" }));
    expect(screen.getByText("deepseek-v4-flash")).toBeInTheDocument();
    expect(screen.queryByText("deepseek-v4-pro[1m]")).not.toBeInTheDocument();
  });
});
