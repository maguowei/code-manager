import { type MouseEvent, memo } from "react";
import { useI18n } from "../i18n";
import type { Memory } from "../types";
import { TrashIcon } from "./Icons";
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
  const targetLabel =
    memory.targetType === "rule" ? t("memory.targetType.rule") : t("memory.targetType.claude");
  const targetPath =
    memory.targetType === "rule" && memory.rulePath ? `rules/${memory.rulePath}` : "CLAUDE.md";

  function handleActionClick(e: MouseEvent<HTMLElement>, action: () => void) {
    e.stopPropagation();
    action();
  }

  return (
    <div
      className={`memory-item${memory.isActive ? " active" : ""}${isEditing ? " editing" : ""}`}
      onClick={onEdit}
    >
      <div className="memory-header">
        <div className="memory-badge">
          <span className="badge-text">
            {memory.name ? memory.name.charAt(0).toUpperCase() : "M"}
          </span>
        </div>

        <div className="memory-info">
          <h3 className="memory-name">{memory.name}</h3>
          <div className="memory-target-row">
            <span className={`memory-target-badge memory-target-badge--${memory.targetType}`}>
              {targetLabel}
            </span>
            <span className="memory-target-path">{targetPath}</span>
          </div>
          <p className="memory-preview">{preview}</p>
        </div>

        <div className="memory-header-actions">
          {isEditing && <span className="memory-status editing">{t("memory.editing")}</span>}
          <button
            type="button"
            className={`toggle-switch${memory.isActive ? " enabled" : ""}`}
            onClick={(e) => handleActionClick(e, onToggle)}
            title={memory.isActive ? t("memory.enabled") : t("memory.activateTitle")}
          >
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
            <span className="toggle-label">
              {memory.isActive ? t("memory.enabled") : t("memory.activate")}
            </span>
          </button>
        </div>
      </div>

      <div className="memory-actions">
        <button
          type="button"
          className="memory-action-btn delete"
          onClick={(e) => handleActionClick(e, onDelete)}
          title={t("memory.delete")}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

export default memo(MemoryItem);
