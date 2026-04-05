import { useState } from "react";
import { Provider, ProviderModel } from "../types";
import { useI18n } from "../i18n";
import { ChevronLeftIcon } from "./Icons";
import "./ProviderEditor.css";

interface ProviderEditorProps {
  provider: Provider | null;
  onSave: (data: {
    name: string;
    slug: string;
    apiUrl: string;
    docUrl: string;
    models: ProviderModel[];
  }) => void;
  onClose: () => void;
}

function ProviderEditor({ provider, onSave, onClose }: ProviderEditorProps) {
  const { t } = useI18n();
  const [name, setName] = useState(provider?.name || "");
  const [slug, setSlug] = useState(provider?.slug || "");
  const [apiUrl, setApiUrl] = useState(provider?.apiUrl || "");
  const [docUrl, setDocUrl] = useState(provider?.docUrl || "");
  const [models, setModels] = useState<ProviderModel[]>(provider?.models || []);

  function handleAddModel() {
    setModels((prev) => [
      ...prev,
      { id: "", name: "", category: "sonnet" },
    ]);
  }

  function handleModelChange(
    index: number,
    field: keyof ProviderModel,
    value: string
  ) {
    setModels((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  }

  function handleRemoveModel(index: number) {
    setModels((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      slug: slug.trim(),
      apiUrl: apiUrl.trim(),
      docUrl: docUrl.trim(),
      models: models.filter((m) => m.id.trim()),
    });
  }

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <button className="editor-back-btn" onClick={onClose}>
          <ChevronLeftIcon />
        </button>
        <h2>
          {provider ? t("providers.editTitle") : t("providers.addTitle")}
        </h2>
        <button className="editor-save-btn" onClick={handleSubmit}>
          {t("providers.save")}
        </button>
      </div>

      <div className="editor-body">
        <div className="form-group">
          <label className="form-label">{t("providers.name")}</label>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("providers.namePlaceholder")}
          />
        </div>

        <div className="form-group">
          <label className="form-label">{t("providers.slug")}</label>
          <input
            className="form-input"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={t("providers.slugPlaceholder")}
            disabled={provider?.isBuiltin}
          />
        </div>

        <div className="form-group">
          <label className="form-label">{t("providers.apiUrl")}</label>
          <input
            className="form-input"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder={t("providers.apiUrlPlaceholder")}
          />
          <span className="form-hint">{t("providers.apiUrlHint")}</span>
        </div>

        <div className="form-group">
          <label className="form-label">{t("providers.docUrl")}</label>
          <input
            className="form-input"
            value={docUrl}
            onChange={(e) => setDocUrl(e.target.value)}
            placeholder={t("providers.docUrlPlaceholder")}
          />
        </div>

        <div className="form-group">
          <div className="form-label-row">
            <label className="form-label">{t("providers.models")}</label>
            <button className="add-model-btn" onClick={handleAddModel}>
              + {t("providers.addModel")}
            </button>
          </div>
          {models.map((model, index) => (
            <div key={index} className="model-row">
              <input
                className="form-input model-id"
                value={model.id}
                onChange={(e) => handleModelChange(index, "id", e.target.value)}
                placeholder={t("providers.modelIdPlaceholder")}
              />
              <input
                className="form-input model-name"
                value={model.name}
                onChange={(e) => handleModelChange(index, "name", e.target.value)}
                placeholder={t("providers.modelNamePlaceholder")}
              />
              <select
                className="form-select model-category"
                value={model.category}
                onChange={(e) => handleModelChange(index, "category", e.target.value)}
              >
                <option value="opus">Opus</option>
                <option value="sonnet">Sonnet</option>
                <option value="haiku">Haiku</option>
                <option value="other">Other</option>
              </select>
              <button
                className="remove-model-btn"
                onClick={() => handleRemoveModel(index)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ProviderEditor;
