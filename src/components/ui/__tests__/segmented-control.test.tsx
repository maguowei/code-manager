import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "../segmented-control";

describe("SegmentedControl", () => {
  it("renders a semantic button group and exposes the selected item", () => {
    const handleChange = vi.fn();

    render(
      <SegmentedControl
        ariaLabel="Chart style"
        value="area"
        onValueChange={handleChange}
        items={[
          { value: "area", label: "Area" },
          { value: "bar", label: "Bar" },
        ]}
      />,
    );

    expect(screen.getByRole("group", { name: "Chart style" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Area" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Bar" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Bar" }));

    expect(handleChange).toHaveBeenCalledWith("bar");
  });

  it("does not call onValueChange for the already selected item", () => {
    const handleChange = vi.fn();

    render(
      <SegmentedControl
        ariaLabel="Mode"
        value="json"
        onValueChange={handleChange}
        items={[
          { value: "json", label: "JSON" },
          { value: "form", label: "Form" },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "JSON" }));

    expect(handleChange).not.toHaveBeenCalled();
  });
});
