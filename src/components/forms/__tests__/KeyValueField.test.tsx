import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, useWatch } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n";
import { KeyValueField } from "../KeyValueField";

// 业务字段类型：fields.test.tsx 已覆盖单行编辑/添加/删除的常规交互，
// 本文件聚焦边界：空列表新增、删除最后一行回到空、normalize 非数组降级、
// 多行交错编辑、未传 placeholderKey 时 aria-label 退到 label。

interface FormValues {
  env: Array<{ key: string; value: string }>;
}

function Harness({
  defaultValue = [{ key: "ANTHROPIC_MODEL", value: "claude-sonnet-4-6" }],
  withPlaceholders = true,
}: {
  defaultValue?: unknown;
  withPlaceholders?: boolean;
}) {
  const form = useForm<FormValues>({
    defaultValues: { env: defaultValue as FormValues["env"] },
  });
  const env = useWatch({ control: form.control, name: "env" });

  return (
    <I18nProvider>
      <KeyValueField
        control={form.control}
        name="env"
        labelKey="profileEditor.env.title"
        keyPlaceholderKey={withPlaceholders ? "profileEditor.env.namePlaceholder" : undefined}
        valuePlaceholderKey={withPlaceholders ? "profileEditor.env.valuePlaceholder" : undefined}
        addLabelKey="profileEditor.env.addItem"
      />
      <output data-testid="env">{JSON.stringify(env)}</output>
    </I18nProvider>
  );
}

describe("KeyValueField", () => {
  describe("初始渲染", () => {
    it("非数组默认值降级为空列表，仅渲染新增按钮", () => {
      render(<Harness defaultValue={null} />);

      expect(screen.queryAllByRole("textbox")).toHaveLength(0);
      // 仅 1 个"新增环境变量"按钮
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveAccessibleName("新增环境变量");
    });

    it("初始有 1 行时渲染 2 个 Input（key + value）+ 1 个删除", () => {
      render(<Harness />);

      expect(screen.getAllByRole("textbox")).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: /^删除/ })).toHaveLength(1);
    });
  });

  describe("交互", () => {
    it("空列表点击新增产生一对空 input", async () => {
      const user = userEvent.setup();
      render(<Harness defaultValue={[]} />);

      await user.click(screen.getByRole("button", { name: "新增环境变量" }));

      expect(screen.getByTestId("env")).toHaveTextContent('[{"key":"","value":""}]');
      // 两个空 input 渲染出来
      expect(screen.getAllByRole("textbox")).toHaveLength(2);
    });

    it("删除唯一行后回到空数组", async () => {
      const user = userEvent.setup();
      render(<Harness />);

      await user.click(screen.getByRole("button", { name: /^删除/ }));

      expect(screen.getByTestId("env")).toHaveTextContent("[]");
      expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    });

    it("多行交错编辑：修改第二行 key 不影响第一行", async () => {
      const user = userEvent.setup();
      render(
        <Harness
          defaultValue={[
            { key: "K1", value: "V1" },
            { key: "K2", value: "V2" },
          ]}
        />,
      );

      const keyInputs = screen.getAllByPlaceholderText("例如：OPENAI_API_KEY");
      await user.clear(keyInputs[1]);
      await user.type(keyInputs[1], "RENAMED");

      expect(screen.getByTestId("env")).toHaveTextContent(
        '[{"key":"K1","value":"V1"},{"key":"RENAMED","value":"V2"}]',
      );
    });

    it("删除中间行：保留前后两行且顺序稳定", async () => {
      const user = userEvent.setup();
      render(
        <Harness
          defaultValue={[
            { key: "A", value: "1" },
            { key: "B", value: "2" },
            { key: "C", value: "3" },
          ]}
        />,
      );

      const removeButtons = screen.getAllByRole("button", { name: /^删除/ });
      await user.click(removeButtons[1]); // 删除 B

      expect(screen.getByTestId("env")).toHaveTextContent(
        '[{"key":"A","value":"1"},{"key":"C","value":"3"}]',
      );
    });

    it("非字符串字段会被 normalize 为字符串后渲染", () => {
      // 模拟 form value 字段类型异常的边界（例如旧版本数据残留 number/null）
      render(
        <Harness
          defaultValue={[{ key: 123 as unknown as string, value: null as unknown as string }]}
        />,
      );

      const rows = screen.getAllByRole("textbox");
      // key 渲染为字符串 "123"
      expect((rows[0] as HTMLInputElement).value).toBe("123");
      // value 渲染为空字符串（null → ""）
      expect((rows[1] as HTMLInputElement).value).toBe("");
    });
  });

  describe("无 placeholder 时的可访问性回退", () => {
    it("未传 placeholder key 时 input aria-label 回退使用 label 文案", () => {
      render(<Harness withPlaceholders={false} />);

      // 每个 input 仍有可访问的名字，便于辅助技术
      const inputs = screen.getAllByRole("textbox");
      for (const input of inputs) {
        // aria-label 不应为空字符串
        const accessibleName = input.getAttribute("aria-label") ?? "";
        expect(accessibleName.length).toBeGreaterThan(0);
        // 形如 "环境变量 1"，应包含 label 文案
        expect(accessibleName).toContain("环境变量");
      }
    });
  });

  describe("行 ID 稳定性", () => {
    it("先删除中间行再编辑剩余行，react-hook-form key 不串行", async () => {
      const user = userEvent.setup();
      render(
        <Harness
          defaultValue={[
            { key: "A", value: "1" },
            { key: "B", value: "2" },
            { key: "C", value: "3" },
          ]}
        />,
      );

      const removeButtons = screen.getAllByRole("button", { name: /^删除/ });
      await user.click(removeButtons[1]); // 删除中间 B

      // 余下两行：A / C；现在编辑余下的第一行 value
      const valueInputs = within(
        screen.getByTestId("env").parentElement as HTMLElement,
      ).getAllByPlaceholderText("填写变量值");
      await user.clear(valueInputs[0]);
      await user.type(valueInputs[0], "X");

      expect(screen.getByTestId("env")).toHaveTextContent(
        '[{"key":"A","value":"X"},{"key":"C","value":"3"}]',
      );
    });
  });
});
