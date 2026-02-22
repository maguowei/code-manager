import { MouseEvent } from "react";
import { Memory } from "../types";
import { useI18n } from "../i18n";
import "./MemoryItem.css";

interface MemoryItemProps {
  memory: Memory;
  isEditing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function MemoryItem({ memory, isEditing, onToggle, onEdit, onDelete }: MemoryItemProps) {
  const { t } = useI18n();

  // 截取第一行作为预览
  const preview = memory.content.split("\n")[0] || "";

  function handleActionClick(e: MouseEvent<HTMLButtonElement>, action: () => void) {
    e.stopPropagation();
    action();
  }

  return (
    <div className={`memory-item${memory.isActive ? " active" : ""}${isEditing ? " editing" : ""}`} onClick={onEdit}>
      <div className="memory-header">
        <div className="memory-badge">
          <span className="badge-text">
            {memory.name ? memory.name.charAt(0).toUpperCase() : "M"}
          </span>
        </div>

        <div className="memory-info">
          <h3 className="memory-name">{memory.name}</h3>
        </div>

        <div className="memory-header-actions">
          {isEditing && (
            <span className="memory-status editing">{t("memory.editing")}</span>
          )}
          {memory.isActive && (
            <span className="memory-status active">{t("memory.enabled")}</span>
          )}
        </div>
      </div>

      <p className="memory-preview">{preview}</p>

      <div className="memory-actions">
        <button
          className={`memory-toggle ${memory.isActive ? "enabled" : "disabled"}`}
          onClick={(e) => handleActionClick(e, onToggle)}
          title={memory.isActive ? t("memory.enabled") : t("memory.disabled")}
        >
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">
            {memory.isActive ? t("memory.enabled") : t("memory.disabled")}
          </span>
        </button>

        <button
          className="memory-action-btn delete"
          onClick={(e) => handleActionClick(e, onDelete)}
          title={t("memory.delete")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default MemoryItem;
