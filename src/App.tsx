import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { ClaudeConfig } from "./types";
import { useI18n } from "./i18n";
import ConfigList from "./components/ConfigList";
import ConfigModal from "./components/ConfigModal";
import SettingsModal from "./components/SettingsModal";
import MemoryPage from "./components/MemoryPage";
import SkillsPage from "./components/SkillsPage";
import Sidebar from "./components/Sidebar";

type TabType = "configs" | "memory" | "skills";

// 检测是否在 Tauri 环境中运行
const isTauri = () => {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
};

function App() {
  const { t } = useI18n();
  const [configs, setConfigs] = useState<ClaudeConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ClaudeConfig | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("configs");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfigs();
  }, []);

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + N: 新建配置
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        if (activeTab === 'configs') {
          handleAdd();
        }
      }

      // ESC: 关闭抽屉
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
        setEditingConfig(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // handleAdd 是稳定的函数引用，不需要添加到依赖数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isModalOpen]);

  async function loadConfigs() {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    try {
      const result = await invoke<{ configs: ClaudeConfig[]; activeConfigId: string | null; defaults?: string | null }>("get_configs");
      setConfigs(result.configs);
      setActiveConfigId(result.activeConfigId);
      setDefaults(result.defaults || "");
    } catch (error) {
      console.error("Failed to load configs:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleActivate(id: string) {
    if (!isTauri()) return;
    try {
      await invoke("activate_config", { id });
      setActiveConfigId(id);
      setConfigs(configs.map(c => ({ ...c, isActive: c.id === id })));
    } catch (error) {
      console.error("Failed to activate config:", error);
    }
  }

  async function handleSave(config: Omit<ClaudeConfig, "id" | "createdAt" | "updatedAt" | "isActive">, newDefaults?: string) {
    if (!isTauri()) return;
    try {
      // 如果通用配置有变化，先保存通用配置
      if (newDefaults !== undefined && newDefaults !== defaults) {
        await invoke("update_defaults", { content: newDefaults });
        setDefaults(newDefaults);
      }

      if (editingConfig) {
        await invoke("update_config", {
          id: editingConfig.id,
          name: config.name,
          description: config.description,
          apiKey: config.apiKey,
          apiUrl: config.apiUrl || null,
          websiteUrl: config.websiteUrl || null,
          model: config.model || null,
          thinkingModel: config.thinkingModel || null,
          haikuModel: config.haikuModel || null,
          sonnetModel: config.sonnetModel || null,
          opusModel: config.opusModel || null,
          alwaysThinkingEnabled: config.alwaysThinkingEnabled || null,
          disableNonessentialTraffic: config.disableNonessentialTraffic || null,
          skipWebFetchPreflight: config.skipWebFetchPreflight || null,
          hasCompletedOnboarding: config.hasCompletedOnboarding || null,
          enableExtraMarketplaces: config.enableExtraMarketplaces || null,
          preferredLanguage: config.preferredLanguage || null,
          useDefaults: config.useDefaults || null,
          enabledPlugins: config.enabledPlugins && Object.keys(config.enabledPlugins).length > 0 ? config.enabledPlugins : null,
        });
      } else {
        await invoke("add_config", {
          name: config.name,
          description: config.description,
          apiKey: config.apiKey,
          apiUrl: config.apiUrl || null,
          websiteUrl: config.websiteUrl || null,
          model: config.model || null,
          thinkingModel: config.thinkingModel || null,
          haikuModel: config.haikuModel || null,
          sonnetModel: config.sonnetModel || null,
          opusModel: config.opusModel || null,
          alwaysThinkingEnabled: config.alwaysThinkingEnabled || null,
          disableNonessentialTraffic: config.disableNonessentialTraffic || null,
          skipWebFetchPreflight: config.skipWebFetchPreflight || null,
          hasCompletedOnboarding: config.hasCompletedOnboarding || null,
          enableExtraMarketplaces: config.enableExtraMarketplaces || null,
          preferredLanguage: config.preferredLanguage || null,
          useDefaults: config.useDefaults || null,
          enabledPlugins: config.enabledPlugins && Object.keys(config.enabledPlugins).length > 0 ? config.enabledPlugins : null,
        });
      }
      await loadConfigs();
      setIsModalOpen(false);
      setEditingConfig(null);
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  }

  async function handleDelete(id: string) {
    if (!isTauri()) return;
    try {
      await invoke("delete_config", { id });
      await loadConfigs();
    } catch (error) {
      console.error("Failed to delete config:", error);
    }
  }

  async function handleDuplicate(id: string) {
    if (!isTauri()) return;
    try {
      await invoke("duplicate_config", { id });
      await loadConfigs();
    } catch (error) {
      console.error("Failed to duplicate config:", error);
    }
  }

  async function handleReorder(ids: string[]) {
    if (!isTauri()) return;
    // 先更新前端状态，避免拖拽视觉延迟
    const reordered = ids.map((id) => configs.find((c) => c.id === id)!).filter(Boolean);
    setConfigs(reordered);
    try {
      await invoke("reorder_configs", { ids });
    } catch (error) {
      console.error("Failed to reorder configs:", error);
      await loadConfigs();
    }
  }

  function handleEdit(config: ClaudeConfig) {
    setEditingConfig(config);
    setIsModalOpen(true);
  }

  function handleAdd() {
    setEditingConfig(null);
    setIsModalOpen(true);
  }

  if (loading) {
    return (
      <div className="app-container">
        <div className="loading">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      <div className="content-area">
        <div className={`list-section ${isModalOpen ? "compressed" : ""}`}>
          {activeTab === "configs" && (
            <>
              <div className="page-header">
                <h1 className="page-title">{t("nav.configs")}</h1>
              </div>
              <button className="add-config-btn" onClick={handleAdd}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span>{t("header.addConfig")}</span>
              </button>
              <ConfigList
                configs={configs}
                activeConfigId={activeConfigId}
                onActivate={handleActivate}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onReorder={handleReorder}
              />
            </>
          )}
          {activeTab === "memory" && <MemoryPage />}
          {activeTab === "skills" && <SkillsPage />}
        </div>

        {isModalOpen && (
          <>
            <div
              className={`drawer-overlay ${isModalOpen ? "visible" : ""}`}
              onClick={() => {
                setIsModalOpen(false);
                setEditingConfig(null);
              }}
            />
            <div className={`drawer ${isModalOpen ? "open" : ""}`}>
              <ConfigModal
                config={editingConfig}
                defaults={defaults}
                onSave={handleSave}
                onClose={() => {
                  setIsModalOpen(false);
                  setEditingConfig(null);
                }}
              />
            </div>
          </>
        )}
      </div>

      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  );
}

export default App;
