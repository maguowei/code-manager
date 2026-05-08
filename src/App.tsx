import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import ClaudeOverviewPage from "./components/ClaudeOverviewPage";
import HistoryPage from "./components/HistoryPage";
import {
  LIST_PANEL_COMPRESSED_WIDTH_CLASS,
  LIST_PANEL_WIDTH_CLASS,
} from "./components/layout-size-classes";
import MemoryPage from "./components/MemoryPage";
import PresetsPage from "./components/PresetsPage";
import ProfilesPage from "./components/ProfilesPage";
import ProjectsPage from "./components/ProjectsPage";
import SettingsDrawer from "./components/SettingsDrawer";
import Sidebar from "./components/Sidebar";
import SkillsPage from "./components/SkillsPage";
import StatsPage from "./components/StatsPage";
import UsagePage from "./components/UsagePage";
import useTauriEvent from "./hooks/useTauriEvent";
import { useToast } from "./hooks/useToast";
import { useI18n } from "./i18n";
import { type ConfigWorkspace, isTauri, type TabType } from "./types";

const EMPTY_WORKSPACE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    showTraySessions: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
  },
  builtinPresets: [],
  customPresets: [],
  profiles: [],
  bindings: {},
};

function App() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [workspace, setWorkspace] = useState<ConfigWorkspace>(EMPTY_WORKSPACE);
  const [activeTab, setActiveTab] = useState<TabType>("configs");
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const previousContentTabRef = useRef<TabType>("configs");

  const loadWorkspace = useCallback(async () => {
    if (!isTauri()) {
      setWorkspace(EMPTY_WORKSPACE);
      setLoading(false);
      return;
    }

    try {
      const nextWorkspace = await invoke<ConfigWorkspace>("get_config_workspace");
      setWorkspace(nextWorkspace);
    } catch {
      setWorkspace(EMPTY_WORKSPACE);
      showToast("加载配置工作区失败", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useTauriEvent<void>("config-workspace-changed", () => {
    void loadWorkspace();
  });

  useTauriEvent<string>("navigate-to-tab", (tab) => {
    const nextTab = tab as TabType;
    if (nextTab !== "claudeOverview") {
      previousContentTabRef.current = nextTab;
    }
    setActiveTab(nextTab);
    setIsDetailDrawerOpen(false);
  });

  const closeSettingsDrawer = useCallback(() => {
    setIsSettingsOpen(false);
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleSettingsClick = useCallback(() => {
    if (isSettingsOpen) {
      closeSettingsDrawer();
      return;
    }
    setIsSettingsOpen(true);
  }, [closeSettingsDrawer, isSettingsOpen]);

  const handleClaudeOverviewClick = useCallback(() => {
    setIsSettingsOpen(false);
    setIsDetailDrawerOpen(false);
    if (activeTab === "claudeOverview") {
      setActiveTab(previousContentTabRef.current);
      return;
    }
    previousContentTabRef.current = activeTab;
    setActiveTab("claudeOverview");
  }, [activeTab]);

  if (loading) {
    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex h-screen items-center justify-center bg-background text-base text-muted-foreground">
          {t("loading")}
        </div>
        <Toaster richColors closeButton position="top-right" />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <Sidebar
          activeTab={activeTab}
          onTabChange={(tab) => {
            if (tab !== "claudeOverview") {
              previousContentTabRef.current = tab;
            }
            setActiveTab(tab);
            setIsDetailDrawerOpen(false);
          }}
          onClaudeOverviewClick={handleClaudeOverviewClick}
          onSettingsClick={handleSettingsClick}
        />

        <div className="relative flex flex-1 overflow-hidden">
          {activeTab === "stats" ? (
            <StatsPage />
          ) : activeTab === "usage" ? (
            <UsagePage />
          ) : activeTab === "claudeOverview" ? (
            <ClaudeOverviewPage />
          ) : activeTab === "projects" ? (
            <ProjectsPage />
          ) : activeTab === "history" ? (
            <HistoryPage />
          ) : activeTab === "providers" ? (
            <PresetsPage workspace={workspace} onWorkspaceChange={loadWorkspace} />
          ) : activeTab === "configs" ? (
            <ProfilesPage workspace={workspace} onWorkspaceChange={loadWorkspace} />
          ) : (
            <div
              className={cn(
                "flex shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-secondary transition-[width] duration-300 ease-out scrollbar-none max-[1000px]:fixed max-[1000px]:inset-y-0 max-[1000px]:right-0 max-[1000px]:left-[60px] max-[1000px]:z-50 max-[1000px]:w-auto max-[700px]:left-[48px]",
                isDetailDrawerOpen ? LIST_PANEL_COMPRESSED_WIDTH_CLASS : LIST_PANEL_WIDTH_CLASS,
              )}
            >
              {activeTab === "memory" && <MemoryPage onDrawerChange={setIsDetailDrawerOpen} />}
              {activeTab === "skills" && <SkillsPage onDrawerChange={setIsDetailDrawerOpen} />}
            </div>
          )}
        </div>

        {isSettingsOpen && <SettingsDrawer onClose={closeSettingsDrawer} />}
      </div>
      <Toaster richColors closeButton position="top-right" />
    </TooltipProvider>
  );
}

export default App;
