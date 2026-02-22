import { Memory } from "../types";
import { useI18n } from "../i18n";
import "./MemoryItem.css";

interface MemoryItemProps {
  memory: Memory;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function MemoryItem({ memory, onToggle, onEdit, onDelete }: MemoryItemProps) {
  const { t } = useI18n();

  // 截取第一行作为预览
  const preview = memory.content.split("\n")[0] || "";

  return (
    <div className={`memory-item${memory.isActive ? " active" : ""}`}>
      <div className="memory-badge">
        <span className="badge-text">
          {memory.name ? memory.name.charAt(0).toUpperCase() : "M"}
        </span>
      </div>

      <div className="memory-info">
        <h3 className="memory-name">{memory.name}</h3>
        <p className="memory-preview">{preview}</p>
      </div>

      <div className="memory-actions">
        {/* 启用/禁用开关 */}
        <button
          className={`memory-toggle ${memory.isActive ? "enabled" : "disabled"}`}
          onClick={onToggle}
          title={memory.isActive ? t("memory.enabled") : t("memory.disabled")}
        >
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">
            {memory.isActive ? t("memory.enabled") : t("memory.disabled")}
          </span>
        </button>

        {/* 编辑按钮 */}
        <button className="action-btn icon-only" onClick={onEdit} title={t("memory.edit")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>

        {/* 删除按钮 */}
        <button className="action-btn icon-only delete" onClick={onDelete} title={t("memory.delete")}>
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
