import { z } from "zod";
import type { Provider } from "../types";
import type { FieldConfig } from "./form-fields";
import { isValidProviderSlug, optionalUrlStringSchema, trimToUndefined } from "./schema-helpers";

export const ProviderModelSchema = z.object({
  id: z.string().default(""),
  name: z.string().default(""),
  category: z.enum(["opus", "sonnet", "haiku", "other"]).default("sonnet"),
});

export const ProviderSchema = z.object({
  name: z.string().trim().min(1, "providers.validation.nameRequired"),
  slug: z
    .string()
    .trim()
    .refine((value) => isValidProviderSlug(value), {
      message: "providers.validation.slugInvalid",
    }),
  baseUrl: optionalUrlStringSchema.default(""),
  docUrl: optionalUrlStringSchema.default(""),
  models: z.array(ProviderModelSchema).default([]),
});

export type ProviderModelFormData = z.infer<typeof ProviderModelSchema>;
export type ProviderFormData = z.infer<typeof ProviderSchema>;

export function buildProviderPrimaryFields(
  isSlugReadOnly: boolean,
): FieldConfig<ProviderFormData>[] {
  return [
    {
      name: "name",
      labelKey: "providers.name",
      placeholderKey: "providers.namePlaceholder",
      inputType: "text",
      required: true,
    },
    {
      name: "slug",
      labelKey: "providers.slug",
      placeholderKey: "providers.slugPlaceholder",
      descriptionKey: "providers.slugHint",
      inputType: "text",
      readOnly: isSlugReadOnly,
      inputClassName: isSlugReadOnly ? "input-readonly" : undefined,
    },
    {
      name: "baseUrl",
      labelKey: "providers.baseUrl",
      placeholderKey: "providers.baseUrlPlaceholder",
      descriptionKey: "providers.baseUrlHint",
      inputType: "url",
    },
    {
      name: "docUrl",
      labelKey: "providers.docUrl",
      placeholderKey: "providers.docUrlPlaceholder",
      inputType: "url",
    },
  ];
}

export function createEmptyProviderModel(): ProviderModelFormData {
  return {
    id: "",
    name: "",
    category: "sonnet",
  };
}

export function buildProviderDefaultValues(provider: Provider | null): ProviderFormData {
  return {
    name: provider?.name ?? "",
    slug: provider?.slug ?? "",
    baseUrl: provider?.baseUrl ?? "",
    docUrl: provider?.docUrl ?? "",
    models: provider?.models.map((model) => ({ ...model })) ?? [],
  };
}

export function toProviderPayload(data: ProviderFormData) {
  return {
    name: data.name,
    slug: data.slug,
    baseUrl: data.baseUrl,
    docUrl: trimToUndefined(data.docUrl) ?? null,
    models: data.models.filter((model) => model.id.trim()),
  };
}
