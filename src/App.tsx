import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { ClaudeConfig } from "./types";
import { useI18n } from "./i18n";
import ConfigList from "./components/ConfigList";
import ConfigModal from "./components/ConfigModal";
import SettingsModal from "./components/SettingsModal";

// 检测是否在 Tauri 环境中运行
const isTauri = () => {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
};

function App() {
  const { t } = useI18n();
  const [configs, setConfigs] = useState<ClaudeConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ClaudeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    try {
      const result = await invoke<{ configs: ClaudeConfig[]; activeConfigId: string | null }>("get_configs");
      setConfigs(result.configs);
      setActiveConfigId(result.activeConfigId);
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

  async function handleSave(config: Omit<ClaudeConfig, "id" | "createdAt" | "updatedAt" | "isActive">) {
    if (!isTauri()) return;
    try {
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
      <div className="app">
        <div className="loading">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="app-title">{t("app.title")}</h1>
          <button className="icon-btn settings-btn" title={t("header.settings")} onClick={() => setIsSettingsOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
        <div className="header-center">
        </div>
        <div className="header-right">
          <button className="icon-btn add-btn" onClick={handleAdd} title={t("header.addConfig")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      <main className="main">
        <ConfigList
          configs={configs}
          activeConfigId={activeConfigId}
          onActivate={handleActivate}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
        />
      </main>

      {isModalOpen && (
        <ConfigModal
          config={editingConfig}
          onSave={handleSave}
          onClose={() => {
            setIsModalOpen(false);
            setEditingConfig(null);
          }}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  );
}

export default App;
