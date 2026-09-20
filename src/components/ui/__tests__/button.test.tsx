import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../button";

describe("Button", () => {
  // base-nova 基线：主按钮仍是主色实心，destructive 由实心改为淡色底 + 前景文字，
  // 项目自有的 destructive-outline / destructive-ghost 变体继续用描边与文字表达。
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
      "bg-destructive/10",
      "text-destructive",
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

    // base-nova 的 icon-sm 为 28px（原 32px）。
    expect(screen.getByRole("button", { name: "Copy" })).toHaveClass("size-7");
  });
});
