import { useState } from "react";
import {
  UseFormRegister,
  Control,
  Controller,
  FieldError,
} from "react-hook-form";
import { useI18n, type TranslationKey } from "../i18n";
import type { ClaudeConfigFormData } from "../schemas/config-schema";
import type { FieldConfig } from "../schemas/field-groups";

interface SchemaFormFieldProps {
  field: FieldConfig;
  register: UseFormRegister<ClaudeConfigFormData>;
  control: Control<ClaudeConfigFormData>;
  error?: FieldError;
  /** combobox 专用：对应的 datalist 元素 id */
  datalistId?: string;
}

export default function SchemaFormField({
  field,
  register,
  control,
  error,
  datalistId,
}: SchemaFormFieldProps) {
  const { t } = useI18n();
  const [showPassword, setShowPassword] = useState(false);

  const errorEl = error ? (
    <span className="field-error">{t((error.message ?? "") as TranslationKey)}</span>
  ) : null;

  if (field.inputType === "checkbox") {
    return (
      <div className="checkbox-group">
        <Controller
          name={field.name}
          control={control}
          render={({ field: f }) => (
            <label className="checkbox-label">
              <input
                type="checkbox"
                id={field.name}
                checked={!!f.value}
                onChange={(e) => f.onChange(e.target.checked)}
              />
              <span className="checkbox-custom" />
              <span>{t(field.labelKey as TranslationKey)}</span>
            </label>
          )}
        />
        {field.descriptionKey && (
          <p className="form-hint">{t(field.descriptionKey as TranslationKey)}</p>
        )}
        {errorEl}
      </div>
    );
  }

  if (field.inputType === "select") {
    return (
      <div className="form-group">
        <label htmlFor={field.name}>{t(field.labelKey as TranslationKey)}</label>
        <select id={field.name} {...register(field.name)}>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey as TranslationKey)}
            </option>
          ))}
        </select>
        {errorEl}
      </div>
    );
  }

  if (field.inputType === "password") {
    return (
      <div className="form-group">
        <label htmlFor={field.name} className="label-required">
          <span>{t(field.labelKey as TranslationKey)}</span>
          <span className="required-badge">{t("form.required")}</span>
        </label>
        <div className="input-with-toggle">
          <input
            id={field.name}
            type={showPassword ? "text" : "password"}
            placeholder={field.placeholderKey ? t(field.placeholderKey as TranslationKey) : undefined}
            {...register(field.name)}
          />
          <button
            type="button"
            className="toggle-visibility"
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        {errorEl}
      </div>
    );
  }

  // text, url, combobox
  const isRequired = field.name === "name" || field.name === "apiKey";
  return (
    <div className="form-group">
      <label
        htmlFor={field.name}
        className={isRequired ? "label-required" : undefined}
      >
        <span>{t(field.labelKey as TranslationKey)}</span>
        {isRequired && (
          <span className="required-badge">{t("form.required")}</span>
        )}
      </label>
      <input
        id={field.name}
        type={field.inputType === "url" ? "url" : "text"}
        list={datalistId}
        placeholder={field.placeholderKey ? t(field.placeholderKey as TranslationKey) : undefined}
        {...register(field.name)}
      />
      {errorEl}
    </div>
  );
}
