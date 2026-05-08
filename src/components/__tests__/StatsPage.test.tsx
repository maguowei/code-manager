import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("StatsPage responsive header", () => {
  it("keeps title, note, and actions compact on narrow screens", () => {
    const source = readFileSync("src/components/StatsPage.tsx", "utf8");
    const headerSource = readFileSync("src/components/PageHeader.tsx", "utf8");

    expect(source).toContain("import PageHeader from");
    expect(source).toContain("<PageHeader");
    expect(source).toContain('description={t("stats.stalenessNotice")}');
    expect(source).toContain('mainClassName="stats-page-heading"');
    expect(source).toContain('descriptionClassName="stats-staleness-note"');
    expect(source).toContain(
      'actionsClassName="max-[900px]:grid max-[900px]:grid-cols-[repeat(2,2rem)]',
    );
    expect(headerSource).toContain("page-header sticky top-0 z-10 shrink-0 border-b");
    expect(headerSource).toContain("max-[900px]:grid-cols-[minmax(0,1fr)_auto]");
    expect(source).toContain(
      "stats-refresh-btn max-[900px]:size-8 max-[900px]:gap-0 max-[900px]:p-0",
    );
    expect(source).toContain('className="max-[900px]:sr-only"');
    expect(source).toContain("<Pencil");
    expect(source).toContain("<RefreshCw");
  });
});
