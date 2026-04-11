import { z } from "zod";
import { isValidSkillFileName } from "./schema-helpers";

export const SkillFileSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "skills.validation.fileNameRequired")
    .refine((value) => isValidSkillFileName(value), {
      message: "skills.validation.fileNameInvalid",
    }),
  content: z.string().default(""),
});

export type SkillFileFormData = z.infer<typeof SkillFileSchema>;

export function buildSkillFileDefaultValues(
  file?: { name: string; content: string } | null,
): SkillFileFormData {
  return {
    fileName: file?.name ?? "",
    content: file?.content ?? "",
  };
}

export function toSkillFilePayload(data: SkillFileFormData) {
  return {
    fileName: data.fileName,
    content: data.content,
  };
}
