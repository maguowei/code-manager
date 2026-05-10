import { describe, expect, it } from "vitest";
import { TYPOGRAPHY } from "../typography-classes";

describe("typography classes", () => {
  it("defines the shared management-console text hierarchy", () => {
    expect(TYPOGRAPHY.pageTitle).toBe("text-lg leading-tight font-semibold text-foreground");
    expect(TYPOGRAPHY.pageDescription).toBe("text-sm leading-snug text-muted-foreground");
    expect(TYPOGRAPHY.sectionTitle).toBe("text-base leading-6 font-semibold text-foreground");
    expect(TYPOGRAPHY.dialogTitle).toBe("text-lg leading-none font-semibold");
    expect(TYPOGRAPHY.cardTitle).toBe("text-base leading-none font-semibold");
    expect(TYPOGRAPHY.fieldLabel).toBe("text-sm leading-none font-medium");
    expect(TYPOGRAPHY.auxiliary).toBe("text-xs leading-snug text-muted-foreground");
    expect(TYPOGRAPHY.metricValue).toBe("text-xl leading-tight font-bold");
  });
});
