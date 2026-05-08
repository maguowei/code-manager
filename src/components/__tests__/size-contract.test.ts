import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src", "components");
const runtimeExtensions = new Set([".ts", ".tsx"]);
const ignoredPathParts = new Set(["__tests__"]);

const compactFontPattern = /text-\[(?:10|11)px\]/g;
const oversizedDisplayPattern = /\btext-4xl\b/g;
const compactFontAllowlist = new Set([join("HistoryHeatmap.tsx")]);

function extensionOf(path: string) {
  const match = /\.[^.]+$/.exec(path);
  return match?.[0] ?? "";
}

function collectRuntimeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (ignoredPathParts.has(entry)) {
        return [];
      }
      return collectRuntimeFiles(fullPath);
    }

    return runtimeExtensions.has(extensionOf(fullPath)) ? [fullPath] : [];
  });
}

describe("size contract", () => {
  it("keeps compact labels on the shared text scale", () => {
    const violations = collectRuntimeFiles(sourceRoot).flatMap((filePath) => {
      const relativePath = relative(sourceRoot, filePath);
      if (compactFontAllowlist.has(relativePath)) {
        return [];
      }

      const source = readFileSync(filePath, "utf8");
      return Array.from(source.matchAll(compactFontPattern), (match) => {
        return `${relativePath}: uses arbitrary compact font ${match[0]}`;
      });
    });

    expect(violations).toEqual([]);
  });

  it("keeps dashboard metrics below hero-scale typography", () => {
    const violations = collectRuntimeFiles(sourceRoot).flatMap((filePath) => {
      const relativePath = relative(sourceRoot, filePath);
      const source = readFileSync(filePath, "utf8");
      return Array.from(source.matchAll(oversizedDisplayPattern), (match) => {
        return `${relativePath}: uses hero-scale font ${match[0]}`;
      });
    });

    expect(violations).toEqual([]);
  });
});
