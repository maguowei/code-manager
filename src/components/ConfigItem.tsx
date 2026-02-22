import { DragEvent } from "react";
import { ClaudeConfig } from "../types";
import { useI18n } from "../i18n";
import "./ConfigItem.css";

interface ConfigItemProps {
  config: ClaudeConfig;
  isActive: boolean;
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
    isDragging ? "dragging" : "",
    dragOverPosition === "above" ? "drag-over-above" : "",
    dragOverPosition === "below" ? "drag-over-below" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const pluginCount = Object.keys(config.enabledPlugins || {}).length;
  const modelDisplay = config.model && config.model.length > 30
    ? config.model.substring(0, 30) + '...'
    : config.model || 'claude-opus-4-6';

  return (
    <div
      className={classNames}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* 隐藏拖拽手柄 */}
      <div className="config-drag-handle" style={{ display: 'none' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="4" cy="3" r="1.5"/>
          <circle cx="4" cy="8" r="1.5"/>
          <circle cx="4" cy="13" r="1.5"/>
          <circle cx="10" cy="3" r="1.5"/>
          <circle cx="10" cy="8" r="1.5"/>
          <circle cx="10" cy="13" r="1.5"/>
        </svg>
      </div>

      {/* 头像徽章 */}
      <div className="config-badge">
        {config.name.charAt(0).toUpperCase()}
      </div>

      {/* 配置信息 */}
      <div className="config-info">
        <div className="config-header">
          <h3 className="config-name">{config.name}</h3>
          {isActive && (
            <span className="status-active">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {t("configItem.inUse")}
            </span>
          )}
        </div>
        <p className="config-description">
          {config.description || config.apiUrl || "Claude API"}
        </p>
        <div className="config-meta">
          <span className="meta-item">
            <svg className="config-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
            {modelDisplay}
          </span>
          <span className="meta-item">
            <svg className="config-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 7h-3a2 2 0 0 1-2-2V2"/>
              <path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/>
              <path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/>
            </svg>
            {pluginCount} {t("configItem.plugins")}
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="config-actions">
        {isActive ? (
          <span className="action-btn active-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>{t("configItem.inUse")}</span>
          </span>
        ) : (
          <button className="action-btn activate-btn" onClick={onActivate} title={t("configItem.activateTitle")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>{t("configItem.activate")}</span>
          </button>
        )}

        <button className="action-btn icon-only" onClick={onEdit} title={t("configItem.edit")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>

        <button className="action-btn icon-only" onClick={onDuplicate} title={t("configItem.duplicate")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>

        <button className="action-btn icon-only delete" onClick={onDelete} title={t("configItem.delete")}>
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
