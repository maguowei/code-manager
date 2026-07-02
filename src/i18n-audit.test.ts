import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("i18n audit", () => {
  it("reports the current catalog baseline without blocking", () => {
    const output = execFileSync("node", ["scripts/check-i18n.mjs", "--mode=audit"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    const catalogLine = output.match(/catalogs: zh=(\d+) en=(\d+)/);
    expect(catalogLine).not.toBeNull();
    expect(Number(catalogLine?.[1])).toBeGreaterThan(1500);
    expect(catalogLine?.[1]).toBe(catalogLine?.[2]);
    expect(output).toContain("placeholder mismatches: 0");
    expect(output).toContain("source warnings: 0");
  });
});
