import { ClaudeConfig } from "../types";
import ConfigItem from "./ConfigItem";
import "./ConfigList.css";

interface ConfigListProps {
  configs: ClaudeConfig[];
  activeConfigId: string | null;
  onActivate: (id: string) => void;
  onEdit: (config: ClaudeConfig) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

function ConfigList({ configs, activeConfigId, onActivate, onEdit, onDelete, onDuplicate }: ConfigListProps) {
  if (configs.length === 0) {
    return (
      <div className="config-list-empty">
        <div className="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
        </div>
        <p className="empty-text">暂无配置</p>
        <p className="empty-hint">点击右上角 + 按钮添加新的 Claude Code 配置</p>
      </div>
    );
  }

  return (
    <div className="config-list">
      {configs.map((config) => (
        <ConfigItem
          key={config.id}
          config={config}
          isActive={config.id === activeConfigId}
          onActivate={() => onActivate(config.id)}
          onEdit={() => onEdit(config)}
          onDelete={() => onDelete(config.id)}
          onDuplicate={() => onDuplicate(config.id)}
        />
      ))}
    </div>
  );
}

export default ConfigList;
