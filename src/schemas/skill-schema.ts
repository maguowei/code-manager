import { z } from "zod";
import type { Skill } from "../types";
import type { FieldConfig } from "./form-fields";
import { isValidSkillId } from "./schema-helpers";

export const SkillSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, "skills.validation.idRequired")
    .refine((value) => isValidSkillId(value), {
      message: "skills.validation.idInvalid",
    }),
  name: z.string().trim().default(""),
  description: z.string().trim().default(""),
  content: z.string().default(""),
  disableModelInvocation: z.boolean().default(false),
  userInvocable: z.boolean().default(true),
});

export type SkillFormData = z.infer<typeof SkillSchema>;

export function buildSkillPrimaryFields(isEditing: boolean): FieldConfig<SkillFormData>[] {
  return [
    {
      name: "id",
      labelKey: "skills.name",
      placeholderKey: "skills.namePlaceholder",
      descriptionKey: "skills.nameHint",
      inputType: "text",
      required: true,
      readOnly: isEditing,
      inputClassName: isEditing ? "input-readonly" : undefined,
    },
    {
      name: "name",
      labelKey: "skills.displayName",
      placeholderKey: "skills.displayNamePlaceholder",
      descriptionKey: "skills.displayNameHint",
      inputType: "text",
    },
    {
      name: "description",
      labelKey: "skills.descriptionLabel",
      placeholderKey: "skills.descriptionPlaceholder",
      inputType: "textarea",
      rows: 3,
    },
  ];
}

export const SKILL_BOOLEAN_FIELDS: FieldConfig<SkillFormData>[] = [
  {
    name: "disableModelInvocation",
    labelKey: "skills.disableModelInvocation",
    descriptionKey: "skills.disableModelInvocationHint",
    inputType: "checkbox",
  },
  {
    name: "userInvocable",
    labelKey: "skills.userInvocable",
    descriptionKey: "skills.userInvocableHint",
    inputType: "checkbox",
  },
];

export function buildSkillDefaultValues(skill: Skill | null): SkillFormData {
  return {
    id: skill?.id ?? "",
    name: skill?.name ?? "",
    description: skill?.description ?? "",
    content: skill?.content ?? "",
    disableModelInvocation: skill?.disableModelInvocation ?? false,
    userInvocable: skill?.userInvocable ?? true,
  };
}

export function toSkillPayload(data: SkillFormData) {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    content: data.content,
    disableModelInvocation: data.disableModelInvocation,
    userInvocable: data.userInvocable,
  };
}

export function composeSkillMarkdownDocument(data: SkillFormData): string {
  const name = JSON.stringify(data.name || data.id);
  const description = JSON.stringify(data.description);

  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    `disable-model-invocation: ${data.disableModelInvocation}`,
    `user-invocable: ${data.userInvocable}`,
    "---",
    "",
    data.content,
  ].join("\n");
}

export function parseSkillMarkdownDocument(raw: string, fallback: SkillFormData): SkillFormData {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    return {
      ...fallback,
      content: raw,
    };
  }

  const prefixLength = raw.startsWith("---\r\n") ? 5 : 4;
  const rest = raw.slice(prefixLength);
  let searchIndex = 0;
  let frontmatterEnd = -1;
  let bodyStart = -1;

  while (true) {
    const relativeIndex = rest.slice(searchIndex).indexOf("\n---");
    if (relativeIndex === -1) break;

    const absoluteIndex = searchIndex + relativeIndex;
    const suffix = rest.slice(absoluteIndex + 4);
    if (suffix.length === 0) {
      frontmatterEnd = absoluteIndex;
      bodyStart = rest.length;
      break;
    }
    if (suffix.startsWith("\n")) {
      frontmatterEnd = absoluteIndex;
      bodyStart = absoluteIndex + 5;
      break;
    }
    if (suffix.startsWith("\r\n")) {
      frontmatterEnd = absoluteIndex;
      bodyStart = absoluteIndex + 6;
      break;
    }

    searchIndex = absoluteIndex + 1;
  }

  if (frontmatterEnd === -1 || bodyStart === -1) {
    return {
      ...fallback,
      content: raw,
    };
  }

  const parsed = { ...fallback };
  const frontmatter = rest.slice(0, frontmatterEnd);
  for (const line of frontmatter.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    let value = rawValue;
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      try {
        value = JSON.parse(rawValue) as string;
      } catch {
        value = rawValue.slice(1, -1);
      }
    }

    if (key === "name") {
      parsed.name = value;
    } else if (key === "description") {
      parsed.description = value;
    } else if (key === "disable-model-invocation") {
      parsed.disableModelInvocation = value === "true";
    } else if (key === "user-invocable") {
      parsed.userInvocable = value !== "false";
    }
  }

  parsed.content = rest.slice(bodyStart).trimStart();
  return parsed;
}
