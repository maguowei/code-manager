import { z } from "zod";
import type { Memory } from "../types";
import type { FieldConfig } from "./form-fields";
import { trimToUndefined } from "./schema-helpers";

export const MemorySchema = z.object({
  id: z.string().default(""),
  name: z.string().trim().min(1, "memory.validation.nameRequired"),
  content: z.string().default(""),
});

export type MemoryFormData = z.infer<typeof MemorySchema>;

export const MEMORY_NAME_FIELD: FieldConfig<MemoryFormData> = {
  name: "name",
  labelKey: "memory.name",
  placeholderKey: "memory.namePlaceholder",
  inputType: "text",
  required: true,
};

export function buildMemoryDefaultValues(memory: Memory | null): MemoryFormData {
  return {
    id: memory?.id ?? "",
    name: memory?.name ?? "",
    content: memory?.content ?? "",
  };
}

export function toMemoryPayload(data: MemoryFormData) {
  return {
    id: trimToUndefined(data.id),
    name: data.name,
    content: data.content,
  };
}
