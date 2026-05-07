import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("StatsPage responsive header", () => {
  it("keeps title, note, and actions compact on narrow screens", () => {
    const source = readFileSync("src/components/StatsPage.tsx", "utf8");

    expect(source).toContain(
      'className="page-header max-[900px]:grid max-[900px]:h-auto max-[900px]:min-h-[52px] max-[900px]:grid-cols-[minmax(0,1fr)_auto]',
    );
    expect(source).toContain("stats-page-heading flex min-w-0 items-center gap-3");
    expect(source).toContain("stats-staleness-note min-w-0 max-w-[min(52vw,560px)] truncate");
    expect(source).toContain(
      "page-header-actions flex gap-2 max-[900px]:grid max-[900px]:grid-cols-[repeat(2,2rem)]",
    );
    expect(source).toContain(
      "stats-refresh-btn max-[900px]:size-8 max-[900px]:gap-0 max-[900px]:p-0",
    );
    expect(source).toContain('className="max-[900px]:sr-only"');
    expect(source).toContain("<Pencil");
    expect(source).toContain("<RefreshCw");
  });
});
