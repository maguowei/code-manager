import { useState } from "react";
import {
  type Control,
  Controller,
  type FieldError,
  type FieldValues,
  type UseFormRegister,
} from "react-hook-form";
import { type TranslationKey, useI18n } from "../i18n";
import type { FieldConfig } from "../schemas/form-fields";

interface SchemaFormFieldProps<TFieldValues extends FieldValues> {
  field: FieldConfig<TFieldValues>;
  register: UseFormRegister<TFieldValues>;
  control: Control<TFieldValues>;
  error?: FieldError;
  /** combobox 专用：对应的 datalist 元素 id */
  datalistId?: string;
}

export default function SchemaFormField<TFieldValues extends FieldValues>({
  field,
  register,
  control,
  error,
  datalistId,
}: SchemaFormFieldProps<TFieldValues>) {
  const { t } = useI18n();
  const [showPassword, setShowPassword] = useState(false);

  const errorEl = error?.message ? (
    <span className="field-error">{t(error.message as TranslationKey)}</span>
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
              <span>{t(field.labelKey)}</span>
            </label>
          )}
        />
        {field.descriptionKey && <p className="form-hint">{t(field.descriptionKey)}</p>}
        {errorEl}
      </div>
    );
  }

  if (field.inputType === "select") {
    return (
      <div className="form-group">
        <label htmlFor={field.name} className={field.required ? "label-required" : undefined}>
          <span>{t(field.labelKey)}</span>
          {field.required && <span className="required-badge">{t("form.required")}</span>}
        </label>
        <select
          id={field.name}
          className={error ? "input-error" : undefined}
          {...register(field.name)}
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
        {field.descriptionKey && <p className="form-hint">{t(field.descriptionKey)}</p>}
        {errorEl}
      </div>
    );
  }

  if (field.inputType === "password") {
    return (
      <div className="form-group">
        <label htmlFor={field.name} className={field.required ? "label-required" : undefined}>
          <span>{t(field.labelKey)}</span>
          {field.required && <span className="required-badge">{t("form.required")}</span>}
        </label>
        <div className="input-with-toggle">
          <input
            id={field.name}
            type={showPassword ? "text" : "password"}
            className={[error ? "input-error" : "", field.inputClassName ?? ""]
              .filter(Boolean)
              .join(" ")}
            placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
            readOnly={field.readOnly}
            {...register(field.name)}
          />
          <button
            type="button"
            className="toggle-visibility"
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        {field.descriptionKey && <p className="form-hint">{t(field.descriptionKey)}</p>}
        {errorEl}
      </div>
    );
  }

  if (field.inputType === "textarea") {
    const isRequired = !!field.required;

    return (
      <div className="form-group">
        <label htmlFor={field.name} className={isRequired ? "label-required" : undefined}>
          <span>{t(field.labelKey)}</span>
          {isRequired && <span className="required-badge">{t("form.required")}</span>}
        </label>
        <textarea
          id={field.name}
          rows={field.rows}
          className={[error ? "input-error" : "", field.inputClassName ?? ""]
            .filter(Boolean)
            .join(" ")}
          placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
          readOnly={field.readOnly}
          {...register(field.name)}
        />
        {field.descriptionKey && <p className="form-hint">{t(field.descriptionKey)}</p>}
        {errorEl}
      </div>
    );
  }

  // text, url, combobox
  const isRequired = !!field.required;
  return (
    <div className="form-group">
      <label htmlFor={field.name} className={isRequired ? "label-required" : undefined}>
        <span>{t(field.labelKey)}</span>
        {isRequired && <span className="required-badge">{t("form.required")}</span>}
      </label>
      <input
        id={field.name}
        type={field.inputType === "url" ? "url" : "text"}
        list={datalistId}
        className={[error ? "input-error" : "", field.inputClassName ?? ""]
          .filter(Boolean)
          .join(" ")}
        placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
        readOnly={field.readOnly}
        {...register(field.name)}
      />
      {field.descriptionKey && <p className="form-hint">{t(field.descriptionKey)}</p>}
      {errorEl}
    </div>
  );
}
