import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PAGE_FILES = [
  "src/components/ProfilesPage.tsx",
  "src/components/PresetsPage.tsx",
  "src/components/MemoryPage.tsx",
  "src/components/SkillsPage.tsx",
  "src/components/ProjectsPage.tsx",
  "src/components/HistoryPage.tsx",
  "src/components/StatsPage.tsx",
  "src/components/UsagePage.tsx",
  "src/components/cheat-sheet/CheatSheetPage.tsx",
] as const;

describe("menu page headers", () => {
  it("renders every sidebar menu title area through the shared PageHeader component", () => {
    for (const file of PAGE_FILES) {
      const source = readFileSync(file, "utf8");

      expect(source, file).toContain("PageHeader");
      expect(source, file).toMatch(/<PageHeader[\s>]/);
    }
  });
});
