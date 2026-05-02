import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("ProjectsPage layout", () => {
  it("keeps the status strip from shrinking inside the scroll column", () => {
    const css = readText("src/components/ProjectsPage.css");

    expect(css).toMatch(/\.projects-status-strip\s*\{[^}]*flex-shrink:\s*0;/s);
  });
});
