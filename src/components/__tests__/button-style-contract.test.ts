import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src", "components");
const runtimeExtensions = new Set([".ts", ".tsx"]);
const ignoredPathParts = new Set(["__tests__"]);
const allowedNativeButtonFiles = new Set([join("ui", "button.tsx")]);

const legacyButtonPatterns = [
  /add-config-btn/,
  /file-btn/,
  /icon-only/,
  /bg-\[var\(--primary\)\][^"\n]*text-white/,
  /text-white[^"\n]*bg-\[var\(--primary\)\]/,
  /bg-\[linear-gradient\(135deg,var\(--primary\),var\(--primary\)\)\]/,
];

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

describe("button style contract", () => {
  it("keeps runtime UI on the shared Button primitives", () => {
    const violations = collectRuntimeFiles(sourceRoot).flatMap((filePath) => {
      const relativePath = relative(sourceRoot, filePath);
      const source = readFileSync(filePath, "utf8");
      const messages: string[] = [];

      if (!allowedNativeButtonFiles.has(relativePath) && /<button\b/.test(source)) {
        messages.push(`${relativePath}: uses native <button>`);
      }

      for (const pattern of legacyButtonPatterns) {
        if (pattern.test(source)) {
          messages.push(`${relativePath}: uses legacy button styling ${pattern.source}`);
        }
      }

      return messages;
    });

    expect(violations).toEqual([]);
  });
});
