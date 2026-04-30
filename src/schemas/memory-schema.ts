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

export function buildMemoryDefaultValues(memory: Memory | null): MemoryFormData {
  return {
    id: memory?.id ?? "",
    name: memory?.name ?? "",
    content: memory?.content ?? "",
    targetType: memory?.targetType ?? "claude",
    rulePath: memory?.rulePath ?? "",
  };
}

export function toMemoryPayload(data: MemoryFormData) {
  const payload: {
    id?: string;
    name: string;
    content: string;
    targetType: MemoryTargetType;
    rulePath?: string;
  } = {
    name: data.name,
    content: data.content,
    targetType: data.targetType,
    rulePath: data.targetType === "rule" ? trimToUndefined(data.rulePath) : undefined,
  };
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
