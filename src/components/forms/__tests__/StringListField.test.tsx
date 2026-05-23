import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sparkles } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";
import { StringListField } from "../StringListField";

// 业务字段类型：fields.test.tsx 已覆盖 picker 添加与 cancel 取消，
// 本文件聚焦边界：纯文本编辑、删除行、resolveAddValue 未提供时的默认行为、
// 非数组初始值降级、rowAction 不挂载时不渲染。

interface FormValues {
  directories: string[];
}

interface HarnessProps {
  defaultValue?: unknown;
  resolveAddValue?: () => Promise<string | null> | string | null;
  resolveRowActionValue?: (
    currentValue: string,
    index: number,
  ) => Promise<string | null> | string | null;
}

function Harness({
  defaultValue = ["/tmp/one"],
  resolveAddValue,
  resolveRowActionValue,
}: HarnessProps) {
  const form = useForm<FormValues>({
    defaultValues: { directories: defaultValue as string[] },
  });
  const directories = useWatch({ control: form.control, name: "directories" });

  return (
    <I18nProvider>
      <StringListField
        control={form.control}
        name="directories"
        labelKey="profileEditor.permissions.additionalDirsLabel"
        placeholderKey="profileEditor.permissions.additionalDirsTitle"
        addLabelKey="profileEditor.permissions.addDirectory"
        resolveAddValue={resolveAddValue}
        resolveRowActionValue={resolveRowActionValue}
        rowActionLabelKey={
          resolveRowActionValue ? "profileEditor.permissions.selectDirectory" : undefined
        }
        rowActionIcon={
          resolveRowActionValue ? <Sparkles className="size-4" aria-hidden="true" /> : undefined
        }
      />
      <output data-testid="value">{JSON.stringify(directories)}</output>
    </I18nProvider>
  );
}

describe("StringListField", () => {
  describe("初始渲染", () => {
    it("非数组初始值降级为空列表，不抛错", () => {
      render(<Harness defaultValue={null} />);

      // 列表项数为 0：没有删除按钮
      expect(screen.queryAllByRole("button", { name: /^删除/ })).toHaveLength(0);
      expect(screen.getByTestId("value")).toHaveTextContent("null");
    });

    it("初始 1 项时渲染 1 个输入框与 1 个删除按钮", () => {
      render(<Harness defaultValue={["/tmp/only"]} />);

      expect(screen.getByDisplayValue("/tmp/only")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /^删除/ })).toHaveLength(1);
    });

    it("未提供 resolveRowActionValue 时不渲染附加 action 按钮", () => {
      render(<Harness defaultValue={["/tmp/one"]} />);

      // 仅有"删除"与"新增附加目录"两类按钮，没有 row action 按钮
      const buttons = screen.getAllByRole("button");
      // 1 个删除 + 1 个新增 = 2
      expect(buttons).toHaveLength(2);
    });
  });

  describe("交互", () => {
    it("不传 resolveAddValue 时点击新增会插入空字符串", async () => {
      const user = userEvent.setup();
      render(<Harness defaultValue={[]} />);

      await user.click(screen.getByRole("button", { name: "新增附加目录" }));

      expect(screen.getByTestId("value")).toHaveTextContent('[""]');
      // 新增后渲染 1 个空 Input
      expect(screen.getAllByRole("textbox")).toHaveLength(1);
    });

    it("直接编辑 Input 文本会反映到表单值", async () => {
      const user = userEvent.setup();
      render(<Harness defaultValue={["/tmp/one"]} />);

      const input = screen.getByDisplayValue("/tmp/one");
      await user.clear(input);
      await user.type(input, "/tmp/edited");

      expect(screen.getByTestId("value")).toHaveTextContent('["/tmp/edited"]');
    });

    it("点击删除按钮移除对应行", async () => {
      const user = userEvent.setup();
      render(<Harness defaultValue={["/tmp/a", "/tmp/b", "/tmp/c"]} />);

      const removeButtons = screen.getAllByRole("button", { name: /^删除/ });
      await user.click(removeButtons[1]); // 删除中间项

      expect(screen.getByTestId("value")).toHaveTextContent('["/tmp/a","/tmp/c"]');
    });

    it("rowAction 返回 null 时不修改原值", async () => {
      const user = userEvent.setup();
      const resolveRowActionValue = vi.fn().mockResolvedValue(null);

      render(<Harness defaultValue={["/tmp/one"]} resolveRowActionValue={resolveRowActionValue} />);

      // aria-label 默认是 `${rowActionLabel} ${index + 1}`，即"选择目录 1"
      const rowActionButton = screen.getByRole("button", { name: "选择目录 1" });
      await user.click(rowActionButton);

      expect(resolveRowActionValue).toHaveBeenCalledWith("/tmp/one", 0);
      // 值未变
      expect(screen.getByTestId("value")).toHaveTextContent('["/tmp/one"]');
    });

    it("resolveAddValue 返回 Promise 时正确等待结果", async () => {
      const user = userEvent.setup();
      let resolveDeferred!: (value: string | null) => void;
      const deferred = new Promise<string | null>((res) => {
        resolveDeferred = res;
      });
      const resolveAddValue = vi.fn().mockReturnValue(deferred);

      render(<Harness defaultValue={[]} resolveAddValue={resolveAddValue} />);
      await user.click(screen.getByRole("button", { name: "新增附加目录" }));

      // 在 Promise 未 resolve 时不应有新行
      expect(screen.getByTestId("value")).toHaveTextContent("[]");

      await act(async () => {
        resolveDeferred("/tmp/async");
        await deferred;
      });

      expect(screen.getByTestId("value")).toHaveTextContent('["/tmp/async"]');
    });
  });
});
