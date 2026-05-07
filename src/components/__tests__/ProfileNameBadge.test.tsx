import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProfileNameBadge from "../ProfileNameBadge";

describe("ProfileNameBadge", () => {
  it("maps badge color seeds across twelve friendly color slots", () => {
    render(<ProfileNameBadge name="Alpha" colorSeedScope="anthropic" />);

    expect(screen.getByText("A").closest("[data-slot='profile-name-badge']")).toHaveAttribute(
      "data-color-index",
      "11",
    );
  });

  it("defines twelve badge color tokens", () => {
    const source = readFileSync(`${process.cwd()}/src/components/ProfileNameBadge.tsx`, "utf8");

    expect(source).toContain("const BADGE_COLOR_COUNT = 12");
    expect(source.match(/background:\s*"linear-gradient/g) ?? []).toHaveLength(12);
  });
});
