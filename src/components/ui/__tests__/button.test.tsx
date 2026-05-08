import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../button";

describe("Button", () => {
  it("uses semantic foreground tokens for primary and destructive actions", () => {
    render(
      <>
        <Button type="button">Save</Button>
        <Button type="button" variant="destructive">
          Delete
        </Button>
        <Button type="button" variant="destructive-outline">
          Remove
        </Button>
        <Button type="button" variant="destructive-ghost">
          Dismiss
        </Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Save" })).toHaveClass(
      "bg-primary",
      "text-primary-foreground",
    );
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "bg-destructive",
      "text-destructive-foreground",
    );
    expect(screen.getByRole("button", { name: "Remove" })).toHaveClass(
      "border-destructive/30",
      "text-destructive",
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveClass("text-destructive");
  });

  it("keeps icon-only buttons square and accessible by aria label", () => {
    render(
      <Button type="button" size="icon-sm" variant="outline" aria-label="Copy">
        <svg aria-hidden="true" />
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Copy" })).toHaveClass("size-8");
  });
});
