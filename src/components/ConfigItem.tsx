import { DragEvent, MouseEvent } from "react";
import { ClaudeConfig } from "../types";
import { useI18n } from "../i18n";
import "./ConfigItem.css";

interface ConfigItemProps {
  config: ClaudeConfig;
  isActive: boolean;
  isEditing: boolean;
  isDragging: boolean;
  dragOverPosition: "above" | "below" | null;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}

function ConfigItem({
  config,
  isActive,
  isEditing,
  isDragging,
  dragOverPosition,
  onActivate,
  onEdit,
  onDelete,
  onDuplicate,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: ConfigItemProps) {
  const { t } = useI18n();

  const classNames = [
    "config-item",
    isActive ? "active" : "",
    isEditing ? "editing" : "",
    isDragging ? "dragging" : "",
    dragOverPosition === "above" ? "drag-over-above" : "",
    dragOverPosition === "below" ? "drag-over-below" : "",
  ]
    .filter(Boolean)
    .join(" ");

  function handleActionClick(e: MouseEvent<HTMLButtonElement>, action: () => void) {
    e.stopPropagation();
    action();
  }

  return (
    <div
      className={classNames}
      draggable
      onClick={onEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* 头部区域（右上角放置启用/状态与复制） */}
      <div className="config-header">
        <div className="config-badge">
          <span className="badge-text">{config.name?.charAt(0)?.toUpperCase() || 'C'}</span>
        </div>

        <div className="config-title">
          <div className="config-name">{config.name}</div>
          {config.description && (
            <div className="config-description">{config.description}</div>
          )}
        </div>

        <div className="config-header-actions">
          {isEditing && (
            <span className="status-editing">{t("configItem.editing")}</span>
          )}
          {isActive ? (
            <span className="status-active">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {t("configItem.inUse")}
            </span>
          ) : (
            <button
              className="action-btn activate-btn compact"
              onClick={(e) => handleActionClick(e, onActivate)}
              title={t("configItem.activateTitle")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              <span>{t("configItem.activate")}</span>
            </button>
          )}
        </div>
      </div>

      {/* 元信息区域 - 仅在有 model 或 plugins 时显示 */}
      {(config.model || config.enabledPlugins) && (
        <div className="config-meta">
          {config.model && (
            <div className="config-meta-item">
              <svg className="config-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <span>{config.model.substring(0, 30)}{config.model.length > 30 ? '...' : ''}</span>
            </div>
          )}
          {config.enabledPlugins && Object.keys(config.enabledPlugins).length > 0 && (
            <div className="config-meta-item">
              <svg className="config-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="9" y1="9" x2="15" y2="9"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
              <span>{Object.keys(config.enabledPlugins).length} {t("configItem.plugins")}</span>
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="config-actions">
        <button
          className="action-btn icon-only"
          onClick={(e) => handleActionClick(e, onDuplicate)}
          title={t("configItem.duplicate")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button
          className="action-btn icon-only delete"
          onClick={(e) => handleActionClick(e, onDelete)}
          title={t("configItem.delete")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default ConfigItem;
