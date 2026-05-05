import { z } from "zod";
import type { Memory, MemoryTargetType } from "../types";
import type { FieldConfig } from "./form-fields";
import { trimToUndefined } from "./schema-helpers";

export const MEMORY_TARGET_TYPES = [
  "claude",
  "rule",
] as const satisfies readonly MemoryTargetType[];

function isValidRulePath(path: string) {
  const trimmed = path.trim();
  if (trimmed.length === 0 || !trimmed.endsWith(".md")) {
    return false;
  }
  if (trimmed.startsWith("/") || trimmed.includes("\\") || trimmed.includes(":")) {
    return false;
  }
  return trimmed.split("/").every((part) => part && part !== "." && part !== "..");
}

export const MemorySchema = z
  .object({
    id: z.string().default(""),
    name: z.string().trim().min(1, "memory.validation.nameRequired"),
    content: z.string().default(""),
    targetType: z.enum(MEMORY_TARGET_TYPES).default("claude"),
    rulePath: z.string().default(""),
    pathPatternsText: z.string().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.targetType !== "rule") return;
    if (!isValidRulePath(data.rulePath)) {
      ctx.addIssue({
        code: "custom",
        path: ["rulePath"],
        message: "memory.validation.rulePathInvalid",
      });
    }
  });

export type MemoryFormData = z.infer<typeof MemorySchema>;

export const MEMORY_NAME_FIELD: FieldConfig<MemoryFormData> = {
  name: "name",
  labelKey: "memory.name",
  placeholderKey: "memory.namePlaceholder",
  inputType: "text",
  required: true,
};

export const MEMORY_TARGET_TYPE_FIELD: FieldConfig<MemoryFormData> = {
  name: "targetType",
  labelKey: "memory.targetType",
  inputType: "select",
  required: true,
  options: [
    {
      value: "claude",
      labelKey: "memory.targetType.claude",
    },
    {
      value: "rule",
      labelKey: "memory.targetType.rule",
    },
  ],
};

export const MEMORY_RULE_PATH_FIELD: FieldConfig<MemoryFormData> = {
  name: "rulePath",
  labelKey: "memory.rulePath",
  placeholderKey: "memory.rulePathPlaceholder",
  descriptionKey: "memory.rulePathHint",
  inputType: "text",
  required: true,
};

export const MEMORY_PATH_PATTERNS_FIELD: FieldConfig<MemoryFormData> = {
  name: "pathPatternsText",
  labelKey: "memory.pathPatterns",
  placeholderKey: "memory.pathPatternsPlaceholder",
  descriptionKey: "memory.pathPatternsHint",
  inputType: "textarea",
  rows: 3,
};

export function buildMemoryDefaultValues(memory: Memory | null): MemoryFormData {
  return {
    id: memory?.id ?? "",
    name: memory?.name ?? "",
    content: composeMemoryEditorContent(memory?.name ?? "", memory?.content ?? ""),
    targetType: memory?.targetType ?? "claude",
    rulePath: memory?.rulePath ?? "",
    pathPatternsText: (memory?.pathPatterns ?? []).join("\n"),
  };
}

function splitPathPatterns(text: string) {
  const patterns: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const pattern = line.trim();
    if (pattern && !patterns.includes(pattern)) {
      patterns.push(pattern);
    }
  }
  return patterns;
}

export function stripMemoryTitleHeading(content: string) {
  const { firstLine, rest } = splitMemoryFirstLine(content);
  if (!extractTitleFromHeadingLine(firstLine)) {
    return content;
  }
  return rest.replace(/^(?:\r?\n)(?:[ \t]*\r?\n)?/, "");
}

function stripLeadingBlankLines(content: string) {
  return content.replace(/^(?:[ \t]*\r?\n)+/, "");
}

function splitMemoryFirstLine(content: string) {
  const withoutLeadingBlankLines = stripLeadingBlankLines(content);
  const firstLineBreak = withoutLeadingBlankLines.search(/\r?\n/);
  return {
    firstLine:
      firstLineBreak >= 0
        ? withoutLeadingBlankLines.slice(0, firstLineBreak)
        : withoutLeadingBlankLines,
    rest: firstLineBreak >= 0 ? withoutLeadingBlankLines.slice(firstLineBreak) : "",
  };
}

function extractTitleFromHeadingLine(line: string) {
  const match = line.trimStart().match(/^#{1}(?!#)[ \t]+(.+)$/);
  if (!match) return undefined;

  const title = match[1].replace(/[ \t]+#+[ \t]*$/, "").trim();
  return title || undefined;
}

export function extractMemoryTitleHeading(content: string) {
  return extractTitleFromHeadingLine(splitMemoryFirstLine(content).firstLine);
}

export function composeMemoryEditorContent(name: string, content: string) {
  const title = name.trim();
  if (!title) {
    return content;
  }

  const body = stripLeadingBlankLines(stripMemoryTitleHeading(content));
  return body ? `# ${title}\n\n${body}` : `# ${title}`;
}

export function toMemoryPayload(data: MemoryFormData) {
  const payload: {
    id?: string;
    name: string;
    content: string;
    targetType: MemoryTargetType;
    rulePath?: string;
    pathPatterns?: string[];
  } = {
    name: data.name,
    content: stripMemoryTitleHeading(data.content),
    targetType: data.targetType,
    rulePath: data.targetType === "rule" ? trimToUndefined(data.rulePath) : undefined,
  };
  if (data.targetType === "rule") {
    payload.pathPatterns = splitPathPatterns(data.pathPatternsText);
  }
  const id = trimToUndefined(data.id);
  if (id) {
    payload.id = id;
  }
  return payload;
}

export function suggestRulePathFromName(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^\.+/, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${base || "rule"}.md`;
}
