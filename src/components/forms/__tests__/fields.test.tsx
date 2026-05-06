import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderOpen } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";
import { KeyValueField } from "../KeyValueField";
import { StringListField } from "../StringListField";

interface StringListFormValues {
  directories: string[];
}

interface KeyValueFormValues {
  env: Array<{ key: string; value: string }>;
}

function StringListHarness({
  resolveAddValue,
  resolveRowActionValue,
}: {
  resolveAddValue: () => Promise<string | null>;
  resolveRowActionValue: (currentValue: string, index: number) => Promise<string | null>;
}) {
  const form = useForm<StringListFormValues>({
    defaultValues: {
      directories: ["/tmp/one"],
    },
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
        rowActionLabelKey="profileEditor.permissions.selectDirectory"
        rowActionIcon={<FolderOpen className="size-4" aria-hidden="true" />}
        buildRowActionAriaLabel={(itemLabel) => `选择 ${itemLabel}`}
      />
      <output data-testid="directories">{JSON.stringify(directories)}</output>
    </I18nProvider>
  );
}

function KeyValueHarness() {
  const form = useForm<KeyValueFormValues>({
    defaultValues: {
      env: [{ key: "ANTHROPIC_MODEL", value: "claude-sonnet-4-6" }],
    },
  });
  const env = useWatch({ control: form.control, name: "env" });

  return (
    <I18nProvider>
      <KeyValueField
        control={form.control}
        name="env"
        labelKey="profileEditor.env.title"
        keyPlaceholderKey="profileEditor.env.namePlaceholder"
        valuePlaceholderKey="profileEditor.env.valuePlaceholder"
        addLabelKey="profileEditor.env.addItem"
      />
      <output data-testid="env">{JSON.stringify(env)}</output>
    </I18nProvider>
  );
}

describe("StringListField", () => {
  it("keeps directory picker add and row action cancellation non-destructive", async () => {
    const user = userEvent.setup();
    const resolveAddValue = vi.fn().mockResolvedValueOnce("/tmp/two").mockResolvedValueOnce(null);
    const resolveRowActionValue = vi
      .fn()
      .mockResolvedValueOnce("/tmp/reselected")
      .mockResolvedValueOnce(null);

    render(
      <StringListHarness
        resolveAddValue={resolveAddValue}
        resolveRowActionValue={resolveRowActionValue}
      />,
    );

    await user.click(screen.getByRole("button", { name: "新增附加目录" }));
    expect(screen.getByTestId("directories")).toHaveTextContent('["/tmp/one","/tmp/two"]');

    await user.click(screen.getByRole("button", { name: "新增附加目录" }));
    expect(screen.getByTestId("directories")).toHaveTextContent('["/tmp/one","/tmp/two"]');

    const [firstRowAction, secondRowAction] = screen.getAllByRole("button", {
      name: /选择 附加目录/,
    });
    await user.click(firstRowAction);
    expect(resolveRowActionValue).toHaveBeenCalledWith("/tmp/one", 0);
    expect(screen.getByTestId("directories")).toHaveTextContent('["/tmp/reselected","/tmp/two"]');

    await user.click(secondRowAction);
    expect(screen.getByTestId("directories")).toHaveTextContent('["/tmp/reselected","/tmp/two"]');
  });
});

describe("KeyValueField", () => {
  it("edits, appends, and removes key-value rows", async () => {
    const user = userEvent.setup();
    render(<KeyValueHarness />);

    await user.clear(screen.getByDisplayValue("ANTHROPIC_MODEL"));
    await user.type(screen.getByPlaceholderText("例如：OPENAI_API_KEY"), "OPENAI_API_KEY");
    await user.clear(screen.getByDisplayValue("claude-sonnet-4-6"));
    await user.type(screen.getByPlaceholderText("填写变量值"), "sk-test");

    expect(screen.getByTestId("env")).toHaveTextContent(
      '[{"key":"OPENAI_API_KEY","value":"sk-test"}]',
    );

    await user.click(screen.getByRole("button", { name: "新增环境变量" }));
    const keyInputs = screen.getAllByPlaceholderText("例如：OPENAI_API_KEY");
    const valueInputs = screen.getAllByPlaceholderText("填写变量值");
    await user.type(keyInputs[1], "ANTHROPIC_BASE_URL");
    await user.type(valueInputs[1], "https://example.com");

    await user.click(screen.getAllByRole("button", { name: /删除/ })[0]);

    expect(screen.getByTestId("env")).toHaveTextContent(
      '[{"key":"ANTHROPIC_BASE_URL","value":"https://example.com"}]',
    );
  });
});
