import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { showOperationError } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";
import ClaudeOverviewPage from "./components/ClaudeOverviewPage";
import type { EditorExitGuard } from "./components/editor-exit-guard";
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
import {
  type ClaudeDirectoryChangedEvent,
  type ConfigWorkspace,
  isTauri,
  type TabType,
} from "./types";

const EMPTY_WORKSPACE: ConfigWorkspace = {
  app: {
    showTrayTitle: true,
    showTraySessions: true,
    systemNotificationsEnabled: false,
    collapseSidebarByDefault: false,
    thirdPartyProviderPricingEnabled: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
  },
  builtinPresets: [],
  customPresets: [],
  profiles: [],
  bindings: {},
};

function isUserSettingsChangePath(path: string) {
  return path === "settings.json";
}

function App() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [workspace, setWorkspace] = useState<ConfigWorkspace>(EMPTY_WORKSPACE);
  const [activeTab, setActiveTab] = useState<TabType>("configs");
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [hasVisitedClaudeOverview, setHasVisitedClaudeOverview] = useState(false);
  const [historyProjectRequest, setHistoryProjectRequest] = useState<{
    project: string;
    requestId: number;
  } | null>(null);
  const previousContentTabRef = useRef<TabType>("configs");
  const editorExitGuardRef = useRef<EditorExitGuard | null>(null);
  const historyProjectRequestIdRef = useRef(0);

  const loadWorkspace = useCallback(async () => {
    if (!isTauri()) {
      setWorkspace(EMPTY_WORKSPACE);
      setLoading(false);
      return;
    }

    try {
      const nextWorkspace = await invoke<ConfigWorkspace>("get_config_workspace");
      setWorkspace(nextWorkspace);
    } catch (error) {
      setWorkspace(EMPTY_WORKSPACE);
      showOperationError(showToast, t("toast.configWorkspaceLoadError"), error);
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-sidebar-width",
      workspace.app.collapseSidebarByDefault ? "60px" : "168px",
    );

    return () => {
      document.documentElement.style.removeProperty("--app-sidebar-width");
    };
  }, [workspace.app.collapseSidebarByDefault]);

  useTauriEvent<void>("config-workspace-changed", () => {
    void loadWorkspace();
  });

  useTauriEvent<ClaudeDirectoryChangedEvent>("claude-directory-changed", (event) => {
    if (event.paths.some(isUserSettingsChangePath)) {
      void loadWorkspace();
    }
  });

  const setEditorExitGuard = useCallback((guard: EditorExitGuard | null) => {
    editorExitGuardRef.current = guard;
  }, []);

  const runWithEditorExitGuard = useCallback((action: () => void) => {
    const guard = editorExitGuardRef.current;
    if (guard) {
      guard.requestExit(action);
      return;
    }

    action();
  }, []);

  const activateTab = useCallback((nextTab: TabType) => {
    if (nextTab === "claudeOverview") {
      setHasVisitedClaudeOverview(true);
    } else {
      previousContentTabRef.current = nextTab;
    }
    setActiveTab(nextTab);
    setIsDetailDrawerOpen(false);
  }, []);

  useEffect(() => {
    if (activeTab !== "history") {
      setHistoryProjectRequest(null);
    }
  }, [activeTab]);

  useTauriEvent<string>("navigate-to-tab", (tab) => {
    const nextTab = tab as TabType;
    runWithEditorExitGuard(() => activateTab(nextTab));
  });

  const closeSettingsDrawer = useCallback(() => {
    setIsSettingsOpen(false);
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleSettingsClick = useCallback(() => {
    const toggleSettingsDrawer = () => {
      if (isSettingsOpen) {
        closeSettingsDrawer();
        return;
      }
      setIsSettingsOpen(true);
    };

    if (isSettingsOpen) {
      toggleSettingsDrawer();
      return;
    }

    runWithEditorExitGuard(toggleSettingsDrawer);
  }, [closeSettingsDrawer, isSettingsOpen, runWithEditorExitGuard]);

  const handleClaudeOverviewClick = useCallback(() => {
    runWithEditorExitGuard(() => {
      setIsSettingsOpen(false);
      setIsDetailDrawerOpen(false);
      if (activeTab === "claudeOverview") {
        setActiveTab(previousContentTabRef.current);
        return;
      }
      previousContentTabRef.current = activeTab;
      setHasVisitedClaudeOverview(true);
      setActiveTab("claudeOverview");
    });
  }, [activeTab, runWithEditorExitGuard]);

  const handleOpenProjectHistory = useCallback(
    (project: string) => {
      runWithEditorExitGuard(() => {
        historyProjectRequestIdRef.current += 1;
        setHistoryProjectRequest({
          project,
          requestId: historyProjectRequestIdRef.current,
        });
        activateTab("history");
      });
    },
    [activateTab, runWithEditorExitGuard],
  );

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
          collapseSidebarByDefault={workspace.app.collapseSidebarByDefault}
          onTabChange={(tab) => {
            runWithEditorExitGuard(() => activateTab(tab));
          }}
          onClaudeOverviewClick={handleClaudeOverviewClick}
          onSettingsClick={handleSettingsClick}
        />

        <div className="relative flex flex-1 overflow-hidden">
          {activeTab === "claudeOverview" || hasVisitedClaudeOverview ? (
            <div
              className={cn(
                "absolute inset-0 min-w-0",
                activeTab === "claudeOverview" ? "block" : "hidden",
              )}
              aria-hidden={activeTab !== "claudeOverview"}
            >
              <ClaudeOverviewPage />
            </div>
          ) : null}
          {activeTab === "claudeOverview" ? null : activeTab === "stats" ? (
            <StatsPage />
          ) : activeTab === "usage" ? (
            <UsagePage />
          ) : activeTab === "projects" ? (
            <ProjectsPage onOpenProjectHistory={handleOpenProjectHistory} />
          ) : activeTab === "history" ? (
            <HistoryPage projectRequest={historyProjectRequest} />
          ) : activeTab === "providers" ? (
            <PresetsPage
              workspace={workspace}
              onWorkspaceChange={loadWorkspace}
              onEditorExitGuardChange={setEditorExitGuard}
            />
          ) : activeTab === "configs" ? (
            <ProfilesPage
              workspace={workspace}
              onWorkspaceChange={loadWorkspace}
              onEditorExitGuardChange={setEditorExitGuard}
            />
          ) : (
            <div
              className={cn(
                "flex shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-secondary transition-[width] duration-300 ease-out scrollbar-none max-[1000px]:fixed max-[1000px]:inset-y-0 max-[1000px]:right-0 max-[1000px]:left-[60px] max-[1000px]:z-50 max-[1000px]:w-auto max-[700px]:left-[48px]",
                isDetailDrawerOpen ? LIST_PANEL_COMPRESSED_WIDTH_CLASS : LIST_PANEL_WIDTH_CLASS,
              )}
            >
              {activeTab === "memory" && (
                <MemoryPage
                  onDrawerChange={setIsDetailDrawerOpen}
                  onEditorExitGuardChange={setEditorExitGuard}
                />
              )}
              {activeTab === "skills" && (
                <SkillsPage
                  onDrawerChange={setIsDetailDrawerOpen}
                  onEditorExitGuardChange={setEditorExitGuard}
                />
              )}
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
