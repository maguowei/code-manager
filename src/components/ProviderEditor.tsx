import { zodResolver } from "@hookform/resolvers/zod";
import { type FieldError, type Resolver, useFieldArray, useForm } from "react-hook-form";
import { type TranslationKey, useI18n } from "../i18n";
import {
  buildProviderDefaultValues,
  buildProviderPrimaryFields,
  createEmptyProviderModel,
  type ProviderFormData,
  ProviderSchema,
  toProviderPayload,
} from "../schemas/provider-schema";
import type { Provider } from "../types";
import { ChevronLeftIcon } from "./Icons";
import SchemaFormField from "./SchemaFormField";
import "./ProviderEditor.css";

interface ProviderEditorProps {
  provider: Provider | null;
  onSave: (data: {
    name: string;
    slug: string;
    baseUrl: string;
    docUrl: string | null;
    models: { id: string; name: string; category: "opus" | "sonnet" | "haiku" | "other" }[];
  }) => void;
  onClose: () => void;
}

function ProviderEditor({ provider, onSave, onClose }: ProviderEditorProps) {
  const { t } = useI18n();
  const topLevelFields = buildProviderPrimaryFields(provider?.isBuiltin ?? false);
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ProviderFormData>({
    resolver: zodResolver(ProviderSchema) as Resolver<ProviderFormData>,
    defaultValues: buildProviderDefaultValues(provider),
    mode: "onBlur",
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "models",
    keyName: "fieldKey",
  });
  const watchName = watch("name");
  const watchSlug = watch("slug");

  function handleAddModel() {
    append(createEmptyProviderModel());
  }

  function handleRemoveModel(index: number) {
    remove(index);
  }

  function handleFormSubmit(data: ProviderFormData) {
    onSave(toProviderPayload(data));
  }

  function getTopLevelError(name: (typeof topLevelFields)[number]["name"]) {
    switch (name) {
      case "name":
        return errors.name;
      case "slug":
        return errors.slug;
      case "baseUrl":
        return errors.baseUrl;
      case "docUrl":
        return errors.docUrl;
      default:
        return undefined;
    }
  }

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <button type="button" className="editor-back-btn" onClick={onClose}>
          <ChevronLeftIcon />
        </button>
        <h2>{provider ? t("providers.editTitle") : t("providers.addTitle")}</h2>
        <button
          type="button"
          className="editor-save-btn"
          onClick={handleSubmit(handleFormSubmit)}
          disabled={!watchName?.trim() || !watchSlug?.trim()}
        >
          {t("providers.save")}
        </button>
      </div>

      <div className="editor-body">
        {topLevelFields.map((field) => (
          <SchemaFormField
            key={field.name}
            field={field}
            register={register}
            control={control}
            error={getTopLevelError(field.name) as FieldError | undefined}
          />
        ))}

        <div className="form-group">
          <div className="form-label-row">
            <label className="form-label">{t("providers.models")}</label>
            <button type="button" className="add-model-btn" onClick={handleAddModel}>
              + {t("providers.addModel")}
            </button>
          </div>
          <p className="form-hint">{t("providers.modelIdHint")}</p>
          {fields.length > 0 && (
            <div className="model-header" aria-hidden="true">
              <span className="model-header-cell model-id">{t("providers.modelId")}</span>
              <span className="model-header-cell model-name">{t("providers.modelName")}</span>
              <span className="model-header-cell model-category">
                {t("providers.modelCategory")}
              </span>
              <span className="model-header-spacer" />
            </div>
          )}
          {fields.map((field, index) => {
            const modelError = Array.isArray(errors.models) ? errors.models[index] : undefined;

            return (
              <div key={field.fieldKey} className="form-group" style={{ gap: 4 }}>
                <div className="model-row">
                  <input
                    className="form-input model-id"
                    placeholder={t("providers.modelIdPlaceholder")}
                    {...register(`models.${index}.id` as const)}
                  />
                  <input
                    className="form-input model-name"
                    placeholder={t("providers.modelNamePlaceholder")}
                    {...register(`models.${index}.name` as const)}
                  />
                  <select
                    className="form-select model-category"
                    {...register(`models.${index}.category` as const)}
                  >
                    <option value="opus">Opus</option>
                    <option value="sonnet">Sonnet</option>
                    <option value="haiku">Haiku</option>
                    <option value="other">Other</option>
                  </select>
                  <button
                    type="button"
                    className="remove-model-btn"
                    onClick={() => handleRemoveModel(index)}
                  >
                    ×
                  </button>
                </div>
                {modelError?.id?.message && (
                  <span className="field-error">{t(modelError.id.message as TranslationKey)}</span>
                )}
                {modelError?.name?.message && (
                  <span className="field-error">
                    {t(modelError.name.message as TranslationKey)}
                  </span>
                )}
                {modelError?.category?.message && (
                  <span className="field-error">
                    {t(modelError.category.message as TranslationKey)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ProviderEditor;
