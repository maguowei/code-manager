import { describe, expect, it } from "vitest";
import { MemorySchema, toMemoryPayload } from "./memory-schema";

describe("MemorySchema", () => {
  it("allows CLAUDE.md memories without a rule path", () => {
    const result = MemorySchema.safeParse({
      id: "",
      name: "全局偏好",
      content: "总是使用 pnpm",
      targetType: "claude",
      rulePath: "",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(toMemoryPayload(result.data)).toEqual({
      name: "全局偏好",
      content: "总是使用 pnpm",
      targetType: "claude",
      rulePath: undefined,
    });
  });

  it("requires rule memories to use a safe markdown relative path", () => {
    expect(
      MemorySchema.safeParse({
        id: "",
        name: "工作流",
        content: "工作流规则",
        targetType: "rule",
        rulePath: "workflow.md",
      }).success,
    ).toBe(true);

    for (const rulePath of ["", "workflow.txt", "/tmp/workflow.md", "../workflow.md"]) {
      expect(
        MemorySchema.safeParse({
          id: "",
          name: "工作流",
          content: "工作流规则",
          targetType: "rule",
          rulePath,
        }).success,
      ).toBe(false);
    }
  });
});
