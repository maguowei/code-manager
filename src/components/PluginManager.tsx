import { useState } from "react";
import { useI18n } from "../i18n";

// 插件管理组件的 props 接口
interface PluginManagerProps {
  // 当前启用的插件列表，key 为插件标识符，value 为是否启用
  plugins: Record<string, boolean>;
  // 插件列表变更回调
  onChange: (plugins: Record<string, boolean>) => void;
}

/**
 * 插件管理组件
 * 负责展示插件列表以及插件的添加、删除、启用/禁用操作
 */
function PluginManager({ plugins, onChange }: PluginManagerProps) {
  const { t } = useI18n();
  // 新插件输入框的值
  const [newPluginId, setNewPluginId] = useState("");

  // 添加新插件
  function handleAddPlugin() {
    const id = newPluginId.trim();
    // 为空或已存在时不添加
    if (!id || plugins[id] !== undefined) return;
    onChange({ ...plugins, [id]: true });
    setNewPluginId("");
  }

  // 删除插件
  function handleRemovePlugin(id: string) {
    const next = { ...plugins };
    delete next[id];
    onChange(next);
  }

  // 切换插件启用状态
  function handleTogglePlugin(id: string) {
    onChange({ ...plugins, [id]: !plugins[id] });
  }

  return (
    <>
      <p className="form-hint" style={{ marginTop: 0 }}>
        {t("configModal.enabledPluginsDesc")}
      </p>
      {/* 已添加的插件列表 */}
      {Object.keys(plugins).length > 0 && (
        <div className="plugin-list">
          {Object.entries(plugins).map(([id, enabled]) => (
            <div key={id} className="plugin-item">
              <span className="plugin-name" title={id}>{id}</span>
              <div className="plugin-actions">
                {/* 启用/禁用切换按钮 */}
                <button
                  type="button"
                  className={`plugin-toggle ${enabled ? "enabled" : "disabled"}`}
                  onClick={() => handleTogglePlugin(id)}
                  title={enabled ? t("configModal.pluginEnabled") : t("configModal.pluginDisabled")}
                >
                  {enabled ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                </button>
                {/* 删除插件按钮 */}
                <button
                  type="button"
                  className="plugin-remove"
                  onClick={() => handleRemovePlugin(id)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* 添加新插件的输入行 */}
      <div className="plugin-add-row">
        <input
          type="text"
          value={newPluginId}
          onChange={(e) => setNewPluginId(e.target.value)}
          placeholder={t("configModal.pluginIdPlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddPlugin();
            }
          }}
        />
        <button type="button" className="plugin-add-btn" onClick={handleAddPlugin}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t("configModal.addPlugin")}
        </button>
      </div>
    </>
  );
}

export default PluginManager;
