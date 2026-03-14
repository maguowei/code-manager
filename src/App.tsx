import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import "./App.css";
import { ClaudeConfig, TabType, isTauri } from "./types";
import { useI18n } from "./i18n";
import { useToast } from "./hooks/useToast";
import ConfigList from "./components/ConfigList";
import ConfigEditor from "./components/ConfigEditor";
import Drawer from "./components/Drawer";
import SettingsDrawer from "./components/SettingsDrawer";
import MemoryPage from "./components/MemoryPage";
import SkillsPage from "./components/SkillsPage";
import StatsPage from "./components/StatsPage";
import HistoryPage from "./components/HistoryPage";
import Sidebar from "./components/Sidebar";
import ConfirmDialog from "./components/ConfirmDialog";
import { PlusIcon } from "./components/Icons";
import useEscapeKey from "./hooks/useEscapeKey";

/** 将表单数据转换为后端 ConfigData 格式 */
function buildConfigData(config: Omit<ClaudeConfig, "id" | "createdAt" | "updatedAt" | "isActive">) {
  return {
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
    // 布尔字段使用 ?? null，避免 false 被错误清除
    alwaysThinkingEnabled: config.alwaysThinkingEnabled ?? null,
    disableNonessentialTraffic: config.disableNonessentialTraffic ?? null,
    skipWebFetchPreflight: config.skipWebFetchPreflight ?? null,
    enableLspTool: config.enableLspTool ?? null,
    agentTeamsEnabled: config.agentTeamsEnabled ?? null,
    hasCompletedOnboarding: config.hasCompletedOnboarding ?? null,
    enableExtraMarketplaces: config.enableExtraMarketplaces ?? null,
    preferredLanguage: config.preferredLanguage || null,
    useDefaults: config.useDefaults ?? null,
    enabledPlugins: config.enabledPlugins && Object.keys(config.enabledPlugins).length > 0 ? config.enabledPlugins : null,
  };
}

function App() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [configs, setConfigs] = useState<ClaudeConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ClaudeConfig | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("configs");
  const [loading, setLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  // 监听来自系统托盘的配置切换事件
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen("config-changed", () => {
      loadConfigs();
    });
    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // 监听来自系统托盘的页面导航事件
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen<string>("navigate-to-tab", (event) => {
      setActiveTab(event.payload as TabType);
      setIsDetailDrawerOpen(false);
    });
    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  // 键盘快捷键支持（Cmd/Ctrl + N 新建配置）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        if (activeTab === 'configs') {
          handleAdd();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // handleAdd 是稳定的函数引用，不需要添加到依赖数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ESC 键关闭配置编辑抽屉
  useEscapeKey(useCallback(() => {
    setIsModalOpen(false);
    setEditingConfig(null);
  }, []), isModalOpen);

  const loadConfigs = useCallback(async () => {
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
      showToast(t("toast.configLoadError"), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  const handleActivate = useCallback(async (id: string) => {
    if (!isTauri()) return;
    try {
      await invoke("activate_config", { id });
      setActiveConfigId(id);
      setConfigs(prev => prev.map(c => ({ ...c, isActive: c.id === id })));
      showToast(t("toast.configActivated"));
    } catch (error) {
      showToast(t("toast.configActivateError"), "error");
    }
  }, [showToast, t]);

  async function handleSave(config: Omit<ClaudeConfig, "id" | "createdAt" | "updatedAt" | "isActive">, newDefaults?: string) {
    if (!isTauri()) return;
    try {
      // 如果通用配置有变化，先保存通用配置
      if (newDefaults !== undefined && newDefaults !== defaults) {
        await invoke("update_defaults", { content: newDefaults });
        setDefaults(newDefaults);
      }

      if (editingConfig) {
        await invoke<ClaudeConfig>("update_config", {
          id: editingConfig.id,
          data: buildConfigData(config),
        });
      } else {
        await invoke<ClaudeConfig>("add_config", {
          data: buildConfigData(config),
        });
      }
      await loadConfigs();
      setIsModalOpen(false);
      setEditingConfig(null);
      showToast(t("toast.configSaved"));
    } catch (error) {
      showToast(t("toast.configSaveError"), "error");
    }
  }

  const handleDelete = useCallback(async (id: string) => {
    if (!isTauri()) return;
    try {
      await invoke("delete_config", { id });
      setConfigs(prev => prev.filter(c => c.id !== id));
      setActiveConfigId(prev => prev === id ? null : prev);
      showToast(t("toast.configDeleted"));
    } catch (error) {
      showToast(t("toast.configDeleteError"), "error");
    }
  }, [showToast, t]);

  const handleDuplicate = useCallback(async (id: string) => {
    if (!isTauri()) return;
    try {
      const duplicated = await invoke<ClaudeConfig>("duplicate_config", { id });
      setConfigs(prev => {
        const index = prev.findIndex(c => c.id === id);
        if (index === -1) return [...prev, duplicated];
        const next = [...prev];
        next.splice(index + 1, 0, duplicated);
        return next;
      });
      showToast(t("toast.configDuplicated"));
    } catch (error) {
      showToast(t("toast.configDuplicateError"), "error");
    }
  }, [showToast, t]);

  const handleReorder = useCallback(async (ids: string[]) => {
    if (!isTauri()) return;
    // 先更新前端状态，避免拖拽视觉延迟
    setConfigs(prev => {
      const map = new Map(prev.map(c => [c.id, c]));
      return ids.map(id => map.get(id)!).filter(Boolean);
    });
    try {
      await invoke("reorder_configs", { ids });
    } catch (error) {
      showToast(t("toast.configReorderError"), "error");
      loadConfigs();
    }
  }, [showToast, t, loadConfigs]);

  // 打开抽屉时确保窗口宽度足够展示详情
  // sidebar(60) + 压缩列表(280) + 抽屉最小(600) = 940
  const MIN_DRAWER_WIDTH = 940;
  const MIN_DRAWER_HEIGHT = 700;
  const ensureWindowSize = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const win = getCurrentWindow();
      const size = await win.innerSize();
      const factor = await win.scaleFactor();
      const logicalW = size.width / factor;
      const logicalH = size.height / factor;
      if (logicalW < MIN_DRAWER_WIDTH || logicalH < MIN_DRAWER_HEIGHT) {
        const newW = Math.max(logicalW, MIN_DRAWER_WIDTH);
        const newH = Math.max(logicalH, MIN_DRAWER_HEIGHT);
        await win.setSize(new LogicalSize(newW, newH));
      }
    } catch {
      // 非 Tauri 环境忽略
    }
  }, []);

  const handleEdit = useCallback((config: ClaudeConfig) => {
    setEditingConfig(config);
    setIsModalOpen(true);
    ensureWindowSize();
  }, [ensureWindowSize]);

  const handleAdd = useCallback(() => {
    setEditingConfig(null);
    setIsModalOpen(true);
    ensureWindowSize();
  }, [ensureWindowSize]);

  const handleRequestDelete = useCallback((id: string) => setPendingDeleteId(id), []);

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
        onTabChange={(tab) => { setActiveTab(tab); setIsDetailDrawerOpen(false); }}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      <div className="content-area">
        {activeTab === "stats" ? (
          <StatsPage />
        ) : activeTab === "history" ? (
          <HistoryPage />
        ) : (
        <div className={`list-section ${isModalOpen || isDetailDrawerOpen ? "compressed" : ""}`}>
          {activeTab === "configs" && (
            <>
              <div className="page-header">
                <h1 className="page-title">{t("nav.configs")}</h1>
              </div>
              <button className="add-config-btn" onClick={handleAdd}>
                <PlusIcon />
                <span>{t("header.addConfig")}</span>
              </button>
              <ConfigList
                configs={configs}
                activeConfigId={activeConfigId}
                editingConfigId={isModalOpen ? editingConfig?.id ?? null : null}
                onActivate={handleActivate}
                onEdit={handleEdit}
                onDelete={handleRequestDelete}
                onDuplicate={handleDuplicate}
                onReorder={handleReorder}
              />
            </>
          )}
          {activeTab === "memory" && <MemoryPage onDrawerChange={setIsDetailDrawerOpen} />}
          {activeTab === "skills" && <SkillsPage onDrawerChange={setIsDetailDrawerOpen} />}
        </div>
        )}

        {isModalOpen && (
          <Drawer onClose={() => {
            setIsModalOpen(false);
            setEditingConfig(null);
          }}>
            <ConfigEditor
              config={editingConfig}
              defaults={defaults}
              onSave={handleSave}
              onClose={() => {
                setIsModalOpen(false);
                setEditingConfig(null);
              }}
            />
          </Drawer>
        )}
      </div>

      {pendingDeleteId && (
        <ConfirmDialog
          title={t("confirm.deleteConfigTitle")}
          message={t("confirm.deleteConfigMessage")}
          confirmText={t("confirm.delete")}
          cancelText={t("confirm.cancel")}
          danger
          onConfirm={() => {
            handleDelete(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {isSettingsOpen && (
        <SettingsDrawer onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  );
}

export default App;
