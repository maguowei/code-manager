import { ClaudeConfig } from "../types";
import "./ConfigItem.css";

interface ConfigItemProps {
  config: ClaudeConfig;
  isActive: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function ConfigItem({ config, isActive, onActivate, onEdit, onDelete, onDuplicate }: ConfigItemProps) {
  return (
    <div className={`config-item ${isActive ? "active" : ""}`}>
      <div className="config-drag-handle">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="4" cy="3" r="1.5"/>
          <circle cx="4" cy="8" r="1.5"/>
          <circle cx="4" cy="13" r="1.5"/>
          <circle cx="10" cy="3" r="1.5"/>
          <circle cx="10" cy="8" r="1.5"/>
          <circle cx="10" cy="13" r="1.5"/>
        </svg>
      </div>

      <div className="config-badge">
        <span className="badge-text">CC</span>
      </div>

      <div className="config-info">
        <h3 className="config-name">{config.name}</h3>
        <p className="config-description">
          {config.description || config.apiUrl || "Claude API"}
        </p>
      </div>

      <div className="config-actions">
        {!isActive && (
          <button className="action-btn activate-btn" onClick={onActivate} title="启用此配置">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>启用</span>
          </button>
        )}

        <button className="action-btn icon-only" onClick={onEdit} title="编辑">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>

        <button className="action-btn icon-only" onClick={onDuplicate} title="复制">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>

        <button className="action-btn icon-only delete" onClick={onDelete} title="删除">
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
