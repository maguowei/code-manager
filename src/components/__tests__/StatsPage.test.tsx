import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("StatsPage responsive header", () => {
  it("keeps title, note, and actions compact on narrow screens", () => {
    const css = readFileSync("src/components/StatsPage.css", "utf8");

    expect(css).toMatch(
      /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.stats-page \.page-header\s*\{[^}]*display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.page-header-actions\s*\{[^}]*display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(2,\s*32px\);/,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.stats-refresh-btn\s*\{[^}]*width:\s*32px;[\s\S]*?font-size:\s*0;/,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.stats-refresh-btn\s*\{[^}]*gap:\s*0;[\s\S]*?line-height:\s*0;/,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.page-header-actions\s*\{[^}]*align-items:\s*center;[\s\S]*?justify-items:\s*center;/,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.stats-refresh-btn svg\s*\{[^}]*display:\s*block;/,
    );
  });
});
