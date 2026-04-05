import { memo } from "react";
import { Provider } from "../types";
import { useI18n } from "../i18n";
import { TrashIcon } from "./Icons";
import "./ProviderItem.css";

interface ProviderItemProps {
  provider: Provider;
  isEditing: boolean;
  onEdit: (provider: Provider) => void;
  onDelete: (id: string) => void;
  onReset: (id: string) => void;
}

const ProviderItem = memo(function ProviderItem({
  provider,
  isEditing,
  onEdit,
  onDelete,
  onReset,
}: ProviderItemProps) {
  const { t } = useI18n();

  return (
    <div
      className={`provider-item ${isEditing ? "editing" : ""}`}
      onClick={() => onEdit(provider)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onEdit(provider)}
    >
      <div className="provider-item-main">
        <div className="provider-item-header">
          <span className="provider-item-name">{provider.name}</span>
          <span className={`provider-item-badge ${provider.isBuiltin ? "builtin" : "custom"}`}>
            {provider.isBuiltin ? t("providers.builtin") : t("providers.custom")}
          </span>
        </div>
        <div className="provider-item-slug">{provider.slug}</div>
        {provider.apiUrl && (
          <div className="provider-item-url">{provider.apiUrl}</div>
        )}
      </div>
      <div className="provider-item-actions" onClick={(e) => e.stopPropagation()}>
        {provider.isBuiltin && (
          <button
            className="provider-action-btn"
            onClick={() => onReset(provider.id)}
            title={t("providers.reset")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-3.27"/>
            </svg>
          </button>
        )}
        {!provider.isBuiltin && (
          <button
            className="provider-action-btn danger"
            onClick={() => onDelete(provider.id)}
            title={t("providers.delete")}
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </div>
  );
});

export default ProviderItem;
