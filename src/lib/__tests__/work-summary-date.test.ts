import { describe, expect, it } from "vitest";
import { localDateKey } from "../work-summary-date";

describe("localDateKey", () => {
  it("formats local date as YYYY-MM-DD", () => {
    const d = new Date(2026, 5, 23, 8, 30); // 本地 2026-06-23
    expect(localDateKey(d)).toBe("2026-06-23");
  });
  it("pads month and day", () => {
    const d = new Date(2026, 0, 5);
    expect(localDateKey(d)).toBe("2026-01-05");
  });
});
