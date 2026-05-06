import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { I18nProvider } from "@/i18n";

function FormMessageHarness() {
  const form = useForm({
    defaultValues: {
      name: "",
    },
  });

  return (
    <I18nProvider>
      <Form {...form}>
        <form>
          <FormField
            control={form.control}
            name="name"
            rules={{ required: "form.required" }}
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input aria-label="name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <button type="button" onClick={() => void form.trigger("name")}>
            trigger
          </button>
        </form>
      </Form>
    </I18nProvider>
  );
}

describe("FormMessage", () => {
  it("renders react-hook-form TranslationKey errors with i18n text", async () => {
    const user = userEvent.setup();
    render(<FormMessageHarness />);

    await user.click(screen.getByRole("button", { name: "trigger" }));

    expect(await screen.findByText("必填")).toBeInTheDocument();
    expect(screen.queryByText("form.required")).not.toBeInTheDocument();
  });
});
