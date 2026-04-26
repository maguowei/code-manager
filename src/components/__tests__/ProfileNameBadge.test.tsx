import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProfileNameBadge from "../ProfileNameBadge";

describe("ProfileNameBadge", () => {
  it("maps badge color seeds across twelve friendly color slots", () => {
    render(<ProfileNameBadge name="Alpha" colorSeedScope="anthropic" />);

    expect(screen.getByText("A").closest(".profile-name-badge")).toHaveClass(
      "profile-name-badge--color-11",
    );
  });

  it("defines twelve badge color classes", () => {
    const css = readFileSync(`${process.cwd()}/src/components/ProfileNameBadge.css`, "utf8");

    for (let colorIndex = 0; colorIndex < 12; colorIndex += 1) {
      expect(css).toContain(`.profile-name-badge--color-${colorIndex}`);
    }
    expect(css).not.toContain(".profile-name-badge--color-12");
  });
});
