import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import QuickActionChips from "../QuickActionChips";

function renderC(props: Partial<ComponentProps<typeof QuickActionChips>> = {}) {
  render(
    <I18nProvider>
      <QuickActionChips disabled={false} onQuick={vi.fn()} {...props} />
    </I18nProvider>,
  );
}

describe("QuickActionChips", () => {
  it("点击触发对应 kind", () => {
    const onQuick = vi.fn();
    renderC({ onQuick });
    fireEvent.click(screen.getByRole("button", { name: "总结昨日" }));
    expect(onQuick).toHaveBeenCalledWith("day");
    fireEvent.click(screen.getByRole("button", { name: "生成本周" }));
    expect(onQuick).toHaveBeenCalledWith("week");
  });

  it("disabled 时按钮禁用", () => {
    renderC({ disabled: true });
    expect(screen.getByRole("button", { name: "总结昨日" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "生成本周" })).toBeDisabled();
  });
});
