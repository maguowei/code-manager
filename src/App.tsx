import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { showOperationError } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";
import type { EditorExitGuard } from "./components/editor-exit-guard";
import type { HistoryProjectRequest } from "./components/history-utils";
import {
  LIST_PANEL_COMPRESSED_WIDTH_CLASS,
  LIST_PANEL_WIDTH_CLASS,
} from "./components/layout-size-classes";
import type { ProfileProduct } from "./components/ProfileProductSwitcher";
import Sidebar from "./components/Sidebar";
import { UpdateBanner } from "./components/UpdateBanner";
import { UpdaterProvider } from "./components/UpdaterProvider";
import useTauriEvent from "./hooks/useTauriEvent";
import { useToast } from "./hooks/useToast";
import { useI18n } from "./i18n";
import { ipc } from "./ipc";
import {
  type ClaudeDirectoryChangedEvent,
  type ConfigWorkspace,
  isTauri,
  type TabType,
} from "./types";

const CheatSheetPage = lazy(() => import("./components/cheat-sheet/CheatSheetPage"));
const ClaudeOverviewPage = lazy(() => import("./components/ClaudeOverviewPage"));
const CodexProfilesPage = lazy(() => import("./components/CodexProfilesPage"));
const HistoryPage = lazy(() => import("./components/HistoryPage"));
const MemoryPage = lazy(() => import("./components/MemoryPage"));
const ProfilesPage = lazy(() => import("./components/ProfilesPage"));
const ProjectsPage = lazy(() => import("./components/ProjectsPage"));
const SettingsDrawer = lazy(() => import("./components/SettingsDrawer"));
const SkillsPage = lazy(() => import("./components/SkillsPage"));
const StatsPage = lazy(() => import("./components/StatsPage"));
const UsagePage = lazy(() => import("./components/UsagePage"));

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
    trayTitleMaxChars: null,
    sessionTrayCountStyle: "superscriptCompact",
    trayPulseWaiting: true,
    focusSessionShortcut: "Command+Control+J",
    floatingWidgetEnabled: false,
    floatingWidgetMetrics: ["cost", "totalTokens", "cacheHitRate"],
    floatingWidgetOpacity: 92,
    waitingSoundEnabled: false,
    waitingSound: "glass",
    // 与 Rust AppPreferences::default 对齐；缺省时保存可能误清用户防休眠偏好
    sleepPrevention: "off",
    keepDisplayAwake: false,
  },
  builtinProviders: [],
  profiles: [],
  bindings: {},
};

function isUserSettingsChangePath(path: string) {
  return path === "settings.json";
}

function PageLoadingFallback() {
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner className="size-4" aria-hidden="true" />
      <span>{t("loading")}</span>
    </div>
  );
}

function App() {
  const { t, setLanguage } = useI18n();
  const { showToast } = useToast();
  const [workspace, setWorkspace] = useState<ConfigWorkspace>(EMPTY_WORKSPACE);
  const [activeTab, setActiveTab] = useState<TabType>("configs");
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [hasVisitedClaudeOverview, setHasVisitedClaudeOverview] = useState(false);
  const [historyProjectRequest, setHistoryProjectRequest] = useState<HistoryProjectRequest | null>(
    null,
  );
  const [usageProjectRequest, setUsageProjectRequest] = useState<{
    project: string;
    requestId: number;
  } | null>(null);
  // 递增令牌：仅唤醒 ProfilesPage 去 peek 后端队列，URL 权威源在 Rust pending
  const [deepLinkWakeToken, setDeepLinkWakeToken] = useState(0);
  const previousContentTabRef = useRef<TabType>("configs");
  const lastProfilesTabRef = useRef<"configs" | "codex">("configs");
  const editorExitGuardRef = useRef<EditorExitGuard | null>(null);
  const historyProjectRequestIdRef = useRef(0);
  const usageProjectRequestIdRef = useRef(0);
  const workspaceRequestIdRef = useRef(0);
  const activateTabRef = useRef<(tab: TabType) => void>(() => {});
  const wakeProfileImportDeepLinksRef = useRef<(options?: { force?: boolean }) => Promise<void>>(
    async () => {},
  );
  const loadWorkspace = useCallback(async () => {
    if (!isTauri()) {
      setWorkspace(EMPTY_WORKSPACE);
      setLoading(false);
      return;
    }

    // 请求序号守卫：并发/乱序重拉时只应用最新一次结果，避免过期响应覆盖乐观更新
    workspaceRequestIdRef.current += 1;
    const requestId = workspaceRequestIdRef.current;
    try {
      const nextWorkspace = await ipc.getConfigWorkspace();
      if (requestId === workspaceRequestIdRef.current) {
        setWorkspace(nextWorkspace);
      }
    } catch (error) {
      if (requestId === workspaceRequestIdRef.current) {
        setWorkspace(EMPTY_WORKSPACE);
        showOperationError(showToast, t("toast.configWorkspaceLoadError"), error);
      }
    } finally {
      if (requestId === workspaceRequestIdRef.current) {
        setLoading(false);
      }
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

  // 后端偏好是 UI 语言的权威值：工作区刷新后同步 i18n（setLanguage 同值幂等）。
  // 首屏加载完成前不动本地缓存语言，避免 EMPTY_WORKSPACE 的 zh 兜底闪切。
  useEffect(() => {
    if (!isTauri() || loading) {
      return;
    }
    setLanguage(workspace.app.uiLanguage === "en" ? "en" : "zh");
  }, [loading, workspace.app.uiLanguage, setLanguage]);

  useTauriEvent<void>("config-workspace-changed", () => {
    void loadWorkspace();
  });

  useTauriEvent<ClaudeDirectoryChangedEvent>("claude-directory-changed", (event) => {
    if (event.paths.some(isUserSettingsChangePath)) {
      void loadWorkspace();
    }
  });

  // Toast/i18n 走 ref，避免语言切换重建 drain 回调并误触发冷启动 effect
  const showToastRef = useRef(showToast);
  const tRef = useRef(t);
  showToastRef.current = showToast;
  tRef.current = t;

  // 配置导入 deep link：peek 后端队列是否有待处理项，有则切到配置页并递增 wake token。
  // URL 始终留在后端直到 ProfilesPage ack；切页不丢链。
  // force=true 跳过 exit-guard（用户已确认离开，或 guard 刚解除后的重试）。
  // 脏编辑器时只 requestExit、**不** 切页唤醒；URL 仍在后端，guard 解除时再试。
  const wakeProfileImportDeepLinks = useCallback(async (options?: { force?: boolean }) => {
    if (!isTauri()) return;
    if (!options?.force && editorExitGuardRef.current) {
      editorExitGuardRef.current.requestExit(() => {
        void wakeProfileImportDeepLinksRef.current({ force: true });
      });
      return;
    }
    try {
      const head = await ipc.peekPendingProfileImportDeepLink();
      if (!head) return;
      setDeepLinkWakeToken((token) => token + 1);
      activateTabRef.current("configs");
    } catch (error) {
      showOperationError(
        showToastRef.current,
        tRef.current("profiles.import.deepLink.toast.resolveError"),
        error,
      );
    }
  }, []);
  wakeProfileImportDeepLinksRef.current = wakeProfileImportDeepLinks;

  const setEditorExitGuard = useCallback((guard: EditorExitGuard | null) => {
    const hadGuard = editorExitGuardRef.current != null;
    editorExitGuardRef.current = guard;
    // 编辑器关闭/解除保护后重试 pending deep link（覆盖「继续编辑」未唤醒的场景）
    if (hadGuard && guard == null) {
      void wakeProfileImportDeepLinksRef.current({ force: true });
    }
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
    if (nextTab === "configs" || nextTab === "codex") {
      lastProfilesTabRef.current = nextTab;
    }
    setActiveTab(nextTab);
    setIsDetailDrawerOpen(false);
  }, []);
  activateTabRef.current = activateTab;

  const handleProfileProductChange = useCallback(
    (product: ProfileProduct) => {
      const nextTab = product === "claude" ? "configs" : "codex";
      runWithEditorExitGuard(() => activateTab(nextTab));
    },
    [activateTab, runWithEditorExitGuard],
  );

  useEffect(() => {
    if (activeTab !== "history") {
      setHistoryProjectRequest(null);
    }
    if (activeTab !== "usage") {
      setUsageProjectRequest(null);
    }
    // deep link 权威源在后端 pending：离开 configs 不 ack、不清队列
  }, [activeTab]);

  useTauriEvent<string>("navigate-to-tab", (tab) => {
    const nextTab = tab as TabType;
    runWithEditorExitGuard(() => activateTab(nextTab));
  });

  // 抽屉内所有落盘操作都经 set_app_preferences 广播 config-workspace-changed，
  // App 已订阅并即时刷新，关闭时无需再兜底重拉。
  const closeSettingsDrawer = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

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

  const handleOpenSessionInHistory = useCallback(
    (project: string, sessionId: string) => {
      runWithEditorExitGuard(() => {
        historyProjectRequestIdRef.current += 1;
        setHistoryProjectRequest({
          project,
          sessionId,
          requestId: historyProjectRequestIdRef.current,
        });
        activateTab("history");
      });
    },
    [activateTab, runWithEditorExitGuard],
  );

  const handleOpenProjectUsage = useCallback(
    (project: string) => {
      runWithEditorExitGuard(() => {
        usageProjectRequestIdRef.current += 1;
        setUsageProjectRequest({
          project,
          requestId: usageProjectRequestIdRef.current,
        });
        activateTab("usage");
      });
    },
    [activateTab, runWithEditorExitGuard],
  );

  useEffect(() => {
    if (loading) return;
    void wakeProfileImportDeepLinks();
  }, [loading, wakeProfileImportDeepLinks]);

  useTauriEvent<void>("profile-import-deep-link", () => {
    void wakeProfileImportDeepLinks();
  });
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
    <UpdaterProvider>
      <TooltipProvider delayDuration={200}>
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
          <Sidebar
            activeTab={activeTab}
            collapseSidebarByDefault={workspace.app.collapseSidebarByDefault}
            onTabChange={(tab) => {
              const nextTab = tab === "configs" ? lastProfilesTabRef.current : tab;
              runWithEditorExitGuard(() => activateTab(nextTab));
            }}
            onClaudeOverviewClick={handleClaudeOverviewClick}
            onSettingsClick={handleSettingsClick}
          />

          <div className="flex flex-1 flex-col overflow-hidden">
            <UpdateBanner />
            <div className="relative flex flex-1 overflow-hidden">
              {activeTab === "claudeOverview" || hasVisitedClaudeOverview ? (
                <div
                  className={cn(
                    "absolute inset-0 min-w-0",
                    activeTab === "claudeOverview" ? "block" : "hidden",
                  )}
                  aria-hidden={activeTab !== "claudeOverview"}
                >
                  <Suspense fallback={<PageLoadingFallback />}>
                    <ClaudeOverviewPage active={activeTab === "claudeOverview"} />
                  </Suspense>
                </div>
              ) : null}
              <Suspense fallback={<PageLoadingFallback />}>
                {activeTab === "claudeOverview" ? null : activeTab === "cheatsheet" ? (
                  <CheatSheetPage />
                ) : activeTab === "stats" ? (
                  <StatsPage />
                ) : activeTab === "usage" ? (
                  <UsagePage
                    projectRequest={usageProjectRequest}
                    onOpenSessionInHistory={handleOpenSessionInHistory}
                  />
                ) : activeTab === "projects" ? (
                  <ProjectsPage
                    onOpenProjectHistory={handleOpenProjectHistory}
                    onOpenProjectUsage={handleOpenProjectUsage}
                    onOpenSessionInHistory={handleOpenSessionInHistory}
                  />
                ) : activeTab === "history" ? (
                  <HistoryPage projectRequest={historyProjectRequest} />
                ) : activeTab === "codex" ? (
                  <CodexProfilesPage
                    onEditorExitGuardChange={setEditorExitGuard}
                    onProductChange={handleProfileProductChange}
                  />
                ) : activeTab === "configs" ? (
                  <ProfilesPage
                    workspace={workspace}
                    onWorkspaceChange={loadWorkspace}
                    onEditorExitGuardChange={setEditorExitGuard}
                    onProductChange={handleProfileProductChange}
                    deepLinkWakeToken={deepLinkWakeToken}
                  />
                ) : (
                  <div
                    className={cn(
                      "flex shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-secondary transition-[width] duration-300 ease-out scrollbar-none max-[1000px]:fixed max-[1000px]:inset-y-0 max-[1000px]:right-0 max-[1000px]:left-[60px] max-[1000px]:z-50 max-[1000px]:w-auto max-[700px]:left-[48px]",
                      isDetailDrawerOpen
                        ? LIST_PANEL_COMPRESSED_WIDTH_CLASS
                        : LIST_PANEL_WIDTH_CLASS,
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
              </Suspense>
            </div>
          </div>

          {isSettingsOpen && (
            <Suspense fallback={null}>
              <SettingsDrawer onClose={closeSettingsDrawer} preferences={workspace.app} />
            </Suspense>
          )}
        </div>
        <Toaster richColors closeButton position="top-right" />
      </TooltipProvider>
    </UpdaterProvider>
  );
}

export default App;
