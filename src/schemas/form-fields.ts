import type { FieldValues, Path } from "react-hook-form";
import type { TranslationKey } from "../i18n";

export type FieldInputType =
  | "text"
  | "password"
  | "checkbox"
  | "select"
  | "combobox"
  | "url"
  | "textarea";

export interface FieldOption {
  value: string;
  labelKey: TranslationKey;
}

export interface FieldConfig<TFieldValues extends FieldValues> {
  name: Path<TFieldValues>;
  labelKey: TranslationKey;
  descriptionKey?: TranslationKey;
  placeholderKey?: TranslationKey;
  inputType: FieldInputType;
  required?: boolean;
  readOnly?: boolean;
  rows?: number;
  options?: FieldOption[];
  inputClassName?: string;
}

export interface FieldGroup<TFieldValues extends FieldValues> {
  id: string;
  labelKey: TranslationKey;
  collapsible: boolean;
  fields: FieldConfig<TFieldValues>[];
}
