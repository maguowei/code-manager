import { describe, expect, it } from "vitest";
import { buildMemoryDefaultValues, MemorySchema, toMemoryPayload } from "./memory-schema";

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

  it("serializes rule path match patterns as trimmed lines", () => {
    const result = MemorySchema.safeParse({
      id: "",
      name: "前端规则",
      content: "使用组件级样式",
      targetType: "rule",
      rulePath: "frontend/style.md",
      pathPatternsText: " src/**/*.tsx \n\nsrc/**/*.css ",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(toMemoryPayload(result.data)).toEqual({
      name: "前端规则",
      content: "使用组件级样式",
      targetType: "rule",
      rulePath: "frontend/style.md",
      pathPatterns: ["src/**/*.tsx", "src/**/*.css"],
    });
  });

  it("stores the editor content as body text when the user includes a top-level title", () => {
    const result = MemorySchema.safeParse({
      id: "",
      name: "前端规则",
      content: "# 旧标题\n\n使用组件级样式",
      targetType: "rule",
      rulePath: "frontend/style.md",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(toMemoryPayload(result.data)).toEqual({
      name: "前端规则",
      content: "使用组件级样式",
      targetType: "rule",
      rulePath: "frontend/style.md",
      pathPatterns: [],
    });
  });

  it("shows the memory name as the editor top-level title", () => {
    expect(
      buildMemoryDefaultValues({
        id: "frontend-rule",
        name: "前端规则",
        content: "使用组件级样式",
        targetType: "rule",
        rulePath: "frontend/style.md",
        pathPatterns: [],
        isActive: false,
        createdAt: 1767225600000,
        updatedAt: 1767225600000,
      }).content,
    ).toBe("# 前端规则\n\n使用组件级样式");
  });
});
