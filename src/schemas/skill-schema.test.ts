import { describe, expect, it } from "vitest";
import {
  composeSkillMarkdownDocument,
  parseSkillMarkdownDocument,
  type SkillFormData,
} from "./skill-schema";

const fallback: SkillFormData = {
  id: "code-review",
  name: "Code Review",
  description: "Review code changes",
  content: "Use repository conventions.",
  disableModelInvocation: false,
  userInvocable: true,
};

describe("skill markdown document helpers", () => {
  it("composes a complete SKILL.md document including frontmatter", () => {
    expect(composeSkillMarkdownDocument(fallback)).toBe(
      [
        "---",
        'name: "Code Review"',
        'description: "Review code changes"',
        "disable-model-invocation: false",
        "user-invocable: true",
        "---",
        "",
        "Use repository conventions.",
      ].join("\n"),
    );
  });

  it("parses frontmatter and body from a full SKILL.md document", () => {
    expect(
      parseSkillMarkdownDocument(
        [
          "---",
          'name: "GitHub CLI"',
          'description: "Use gh commands"',
          "disable-model-invocation: true",
          "user-invocable: false",
          "---",
          "",
          "# Usage",
          "",
          "Run `gh pr status`.",
        ].join("\n"),
        fallback,
      ),
    ).toEqual({
      id: "code-review",
      name: "GitHub CLI",
      description: "Use gh commands",
      content: "# Usage\n\nRun `gh pr status`.",
      disableModelInvocation: true,
      userInvocable: false,
    });
  });
});
