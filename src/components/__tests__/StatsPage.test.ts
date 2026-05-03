import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("StatsPage collapsible sections", () => {
  it("keeps the whole collapsed section header clickable", () => {
    const css = readFileSync(`${process.cwd()}/src/components/StatsPage.css`, "utf8");

    expect(css).toMatch(/\.stats-section-collapsible\s*\{[^}]*padding:\s*0;/s);
    expect(css).toMatch(
      /\.stats-section-summary\s*\{[^}]*padding:\s*var\(--space-5\)\s+var\(--space-5\)\s+var\(--space-3\);/s,
    );
    expect(css).toMatch(
      /\.stats-section-collapsible:not\(\[open\]\)\s*>\s*\.stats-section-summary\s*\{[^}]*padding-bottom:\s*var\(--space-5\);/s,
    );
  });
});
