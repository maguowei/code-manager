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

  function handleActionClick(e: MouseEvent<HTMLElement>, action: () => void) {
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
          {memory.isActive ? (
            <span
              className="memory-status active"
              onClick={(e) => handleActionClick(e, onToggle)}
              title={t("memory.enabled")}
            >              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {t("memory.enabled")}
            </span>
          ) : (
            <button
              className="action-btn activate-btn compact"
              onClick={(e) => handleActionClick(e, onToggle)}
              title={t("memory.activateTitle")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              <span>{t("memory.activate")}</span>
            </button>
          )}
        </div>
      </div>

      <p className="memory-preview">{preview}</p>

      <div className="memory-actions">
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
