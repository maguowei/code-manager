import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import { SandboxSwitchControl } from "../SandboxEditor";

describe("SandboxSwitchControl", () => {
  it("lets the whole labeled pill toggle the switch", () => {
    const onToggle = vi.fn();

    render(
      <I18nProvider>
        <SandboxSwitchControl
          enabled={true}
          ariaLabel="Sandbox 头部开关"
          visibleLabel="沙盒开关"
          variant="header"
          onToggle={onToggle}
        />
      </I18nProvider>,
    );

    const hitArea = screen.getByText("沙盒开关").closest('[data-slot="switch-hit-area"]');
    expect(hitArea).toBeInstanceOf(HTMLElement);
    expect(hitArea).toHaveClass("cursor-pointer");

    fireEvent.click(hitArea as HTMLElement);
    fireEvent.click(screen.getByRole("switch", { name: "Sandbox 头部开关" }));

    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
