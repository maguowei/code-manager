import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";
import ProfileProductSwitcher from "../ProfileProductSwitcher";

describe("ProfileProductSwitcher", () => {
  it("renders branded product choices and reports product changes", () => {
    const handleChange = vi.fn();

    render(
      <I18nProvider>
        <ProfileProductSwitcher value="claude" onValueChange={handleChange} />
      </I18nProvider>,
    );

    const switcher = screen.getByRole("group", { name: "配置类型" });
    const claudeButton = within(switcher).getByRole("button", { name: "Claude Code" });
    const codexButton = within(switcher).getByRole("button", { name: "Codex" });

    expect(claudeButton).toHaveAttribute("aria-pressed", "true");
    expect(codexButton).toHaveAttribute("aria-pressed", "false");
    expect(claudeButton.querySelector("svg[data-icon='inline-start']")).toBeInTheDocument();
    expect(codexButton.querySelector("svg[data-icon='inline-start']")).toBeInTheDocument();

    fireEvent.click(codexButton);

    expect(handleChange).toHaveBeenCalledWith("codex");
  });
});
