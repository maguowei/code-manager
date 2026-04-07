import { DragEvent, memo, useCallback } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Provider } from "../types";
import { useI18n } from "../i18n";
import { TrashIcon } from "./Icons";
import "./ProviderItem.css";

interface ProviderItemProps {
  provider: Provider;
  index: number;
  isEditing: boolean;
  isDragging: boolean;
  dragOverPosition: "above" | "below" | null;
  onEdit: (provider: Provider) => void;
  onDelete: (id: string) => void;
  onReset: (id: string) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, index: number) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, index: number) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>, index: number) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, index: number) => void;
}

const ProviderItem = memo(function ProviderItem({
  provider,
  index,
  isEditing,
  isDragging,
  dragOverPosition,
  onEdit,
  onDelete,
  onReset,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: ProviderItemProps) {
  const { t } = useI18n();

  const handleDragStartWrap = useCallback((e: DragEvent<HTMLDivElement>) => onDragStart(e, index), [onDragStart, index]);
  const handleDragOverWrap = useCallback((e: DragEvent<HTMLDivElement>) => onDragOver(e, index), [onDragOver, index]);
  const handleDragLeaveWrap = useCallback((e: DragEvent<HTMLDivElement>) => onDragLeave(e, index), [onDragLeave, index]);
  const handleDropWrap = useCallback((e: DragEvent<HTMLDivElement>) => onDrop(e, index), [onDrop, index]);

  const classNames = [
    "provider-item",
    isEditing ? "editing" : "",
    isDragging ? "dragging" : "",
    dragOverPosition === "above" ? "drag-over-above" : "",
    dragOverPosition === "below" ? "drag-over-below" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classNames}
      draggable
      onClick={() => onEdit(provider)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onEdit(provider)}
      onDragStart={handleDragStartWrap}
      onDragEnd={onDragEnd}
      onDragOver={handleDragOverWrap}
      onDragLeave={handleDragLeaveWrap}
      onDrop={handleDropWrap}
    >
      <div className="provider-item-main">
        <div className="provider-item-header">
          <span className="provider-item-name">{provider.name}</span>
          <span className={`provider-item-badge ${provider.isBuiltin ? "builtin" : "custom"}`}>
            {provider.isBuiltin ? t("providers.builtin") : t("providers.custom")}
          </span>
        </div>
        <div className="provider-item-slug">{provider.slug}</div>
        {provider.baseUrl && (
          <div className="provider-item-url">{provider.baseUrl}</div>
        )}
        {provider.models.length > 0 && (
          <div className="provider-item-models">
            {provider.models.map((m) => (
              <span key={m.id} className={`provider-model-tag category-${m.category}`}>
                {m.id}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="provider-item-actions" onClick={(e) => e.stopPropagation()}>
        {provider.docUrl && (
          <button
            className="provider-action-btn"
            onClick={() => openUrl(provider.docUrl!)}
            title={t("providers.viewDocs")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
        )}
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
