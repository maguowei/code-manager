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
