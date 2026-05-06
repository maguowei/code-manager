import { invoke } from "@tauri-apps/api/core";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "../hooks/useToast";
import { type Language, useI18n } from "../i18n";
import type {
  AppPreferences,
  ConfigWorkspace,
  DefaultEditorApp,
  DefaultTerminalApp,
} from "../types";
import LogViewer from "./LogViewer";
import SystemInfoDialog from "./SystemInfoDialog";
import { type Theme, useTheme } from "./theme-provider";
import { Sheet, SheetContent } from "./ui/sheet";

interface SettingsDrawerProps {
  onClose: () => void;
}

function SettingsDrawer({ onClose }: SettingsDrawerProps) {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  const [preferences, setPreferences] = useState<AppPreferences>({
    showTrayTitle: true,
    showTraySessions: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
  });
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);
  const [isSystemInfoOpen, setIsSystemInfoOpen] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);

  useEffect(() => {
    invoke<ConfigWorkspace>("get_config_workspace")
      .then((workspace) => {
        setPreferences(workspace.app);
        if (workspace.app.uiLanguage !== language) {
          setLanguage(workspace.app.uiLanguage as Language);
        }
      })
      .catch(() => {
        showToast(t("toast.configLoadError"), "error");
      });
  }, [language, setLanguage, showToast, t]);

  // 自启动真实状态由系统持久化（LaunchAgent / 注册表 / .desktop），打开抽屉时主动同步
  useEffect(() => {
    isAutostartEnabled()
      .then(setLaunchAtLogin)
      .catch(() => {
        showToast(t("toast.autostartQueryError"), "error");
      });
  }, [showToast, t]);

  const showTrayTitle = preferences.showTrayTitle;
  const showTraySessions = preferences.showTraySessions;
  const defaultTerminalApp = preferences.defaultTerminalApp;
  const defaultEditorApp = preferences.defaultEditorApp;

  const nextPreferences = useMemo(
    () => ({
      ...preferences,
      uiLanguage: language,
    }),
    [language, preferences],
  );

  async function persistPreferences(next: AppPreferences, rollback: AppPreferences) {
    setPreferences(next);
    try {
      await invoke<AppPreferences>("set_app_preferences", { data: next });
    } catch {
      setPreferences(rollback);
      if (rollback.uiLanguage !== language) {
        setLanguage(rollback.uiLanguage as Language);
      }
      showToast(t("toast.configSaveError"), "error");
    }
  }

  // 乐观切换：失败时回滚 UI 并提示
  async function toggleLaunchAtLogin(next: boolean) {
    setLaunchAtLogin(next);
    try {
      if (next) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
    } catch {
      setLaunchAtLogin(!next);
      showToast(t("toast.autostartSaveError"), "error");
    }
  }

  const themeOptions: {
    value: Theme;
    labelKey: "settings.themeLight" | "settings.themeDark" | "settings.themeSystem";
    icon: string;
  }[] = [
    { value: "light", labelKey: "settings.themeLight", icon: "sun" },
    { value: "dark", labelKey: "settings.themeDark", icon: "moon" },
    { value: "system", labelKey: "settings.themeSystem", icon: "monitor" },
  ];
  const settingsSelectClass =
    "w-[min(240px,100%)] rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-[9px] text-[length:var(--font-md)] text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:shadow-[0_0_0_3px_var(--accent-blue-bg)] focus:outline-none max-[700px]:w-full";

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-labelledby="settings-drawer-title"
        className="w-full max-w-[calc(100vw-var(--sidebar-width))] gap-0 border-l border-[var(--border-default)] bg-[var(--bg-elevated)] p-0 shadow-[-8px_0_28px_rgb(0_0_0_/_0.24)] sm:max-w-[520px] max-[700px]:max-w-[calc(100vw-var(--sidebar-width-small))]"
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-primary)] px-6">
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] border-0 bg-transparent text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <h2 id="settings-drawer-title" className="text-[length:var(--font-lg)] font-semibold">
            {t("settings.title")}
          </h2>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 max-[700px]:p-4">
          <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
            <div>
              <h3 className="text-[length:var(--font-md)] font-semibold text-[var(--text-primary)]">
                {t("settings.language")}
              </h3>
              <p className="mt-1 text-[length:var(--font-base)] leading-[1.45] text-[var(--text-secondary)]">
                {t("settings.languageDesc")}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 max-[700px]:flex-col max-[700px]:items-stretch">
              <label className="sr-only" htmlFor="settings-language-select">
                {t("settings.language")}
              </label>
              <select
                id="settings-language-select"
                className={settingsSelectClass}
                value={language}
                onChange={(e) => {
                  const nextLanguage = e.target.value as Language;
                  const rollback = nextPreferences;
                  setLanguage(nextLanguage);
                  void persistPreferences(
                    {
                      ...nextPreferences,
                      uiLanguage: nextLanguage,
                    },
                    rollback,
                  );
                }}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
            <div>
              <h3 className="text-[length:var(--font-md)] font-semibold text-[var(--text-primary)]">
                {t("settings.theme")}
              </h3>
              <p className="mt-1 text-[length:var(--font-base)] leading-[1.45] text-[var(--text-secondary)]">
                {t("settings.themeDesc")}
              </p>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-4 max-[700px]:flex-col max-[700px]:items-stretch">
                <div className="grid w-full grid-cols-3 gap-3 max-[700px]:grid-cols-1">
                  {themeOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={`flex flex-col items-center gap-2.5 rounded-[var(--radius-lg)] border p-[18px_10px] font-semibold transition-all duration-200 hover:-translate-y-px ${
                        theme === option.value
                          ? "border-[var(--accent-blue)] bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] shadow-[inset_0_0_0_1px_var(--accent-blue)]"
                          : "border-[var(--border-default)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                      onClick={() => setTheme(option.value)}
                    >
                      <div className="flex items-center justify-center">
                        {option.icon === "sun" && (
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="5" />
                            <line x1="12" y1="1" x2="12" y2="3" />
                            <line x1="12" y1="21" x2="12" y2="23" />
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                            <line x1="1" y1="12" x2="3" y2="12" />
                            <line x1="21" y1="12" x2="23" y2="12" />
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                          </svg>
                        )}
                        {option.icon === "moon" && (
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                          </svg>
                        )}
                        {option.icon === "monitor" && (
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                            <line x1="8" y1="21" x2="16" y2="21" />
                            <line x1="12" y1="17" x2="12" y2="21" />
                          </svg>
                        )}
                      </div>
                      <span className="text-[length:var(--font-sm)]">{t(option.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
            <div>
              <h3 className="text-[length:var(--font-md)] font-semibold text-[var(--text-primary)]">
                {t("settings.showTrayTitle")}
              </h3>
              <p className="mt-1 text-[length:var(--font-base)] leading-[1.45] text-[var(--text-secondary)]">
                {t("settings.showTrayTitleDesc")}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 max-[700px]:flex-col max-[700px]:items-stretch">
              <button
                type="button"
                className={`toggle-switch${showTrayTitle ? " enabled" : ""}`}
                onClick={() => {
                  void persistPreferences(
                    {
                      ...nextPreferences,
                      showTrayTitle: !showTrayTitle,
                    },
                    nextPreferences,
                  );
                }}
                role="switch"
                aria-checked={showTrayTitle}
                aria-label={t("settings.showTrayTitle")}
              >
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span className="toggle-label">
                  {showTrayTitle ? t("settings.enabled") : t("settings.disabled")}
                </span>
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
            <div>
              <h3 className="text-[length:var(--font-md)] font-semibold text-[var(--text-primary)]">
                {t("settings.showTraySessions")}
              </h3>
              <p className="mt-1 text-[length:var(--font-base)] leading-[1.45] text-[var(--text-secondary)]">
                {t("settings.showTraySessionsDesc")}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 max-[700px]:flex-col max-[700px]:items-stretch">
              <button
                type="button"
                className={`toggle-switch${showTraySessions ? " enabled" : ""}`}
                onClick={() => {
                  void persistPreferences(
                    {
                      ...nextPreferences,
                      showTraySessions: !showTraySessions,
                    },
                    nextPreferences,
                  );
                }}
                role="switch"
                aria-checked={showTraySessions}
                aria-label={t("settings.showTraySessions")}
              >
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span className="toggle-label">
                  {showTraySessions ? t("settings.enabled") : t("settings.disabled")}
                </span>
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
            <div>
              <h3 className="text-[length:var(--font-md)] font-semibold text-[var(--text-primary)]">
                {t("settings.launchAtLogin")}
              </h3>
              <p className="mt-1 text-[length:var(--font-base)] leading-[1.45] text-[var(--text-secondary)]">
                {t("settings.launchAtLoginDesc")}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 max-[700px]:flex-col max-[700px]:items-stretch">
              <button
                type="button"
                className={`toggle-switch${launchAtLogin ? " enabled" : ""}`}
                onClick={() => void toggleLaunchAtLogin(!launchAtLogin)}
                role="switch"
                aria-checked={launchAtLogin}
                aria-label={t("settings.launchAtLogin")}
              >
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span className="toggle-label">
                  {launchAtLogin ? t("settings.enabled") : t("settings.disabled")}
                </span>
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
            <div>
              <h3 className="text-[length:var(--font-md)] font-semibold text-[var(--text-primary)]">
                {t("settings.defaultTerminal")}
              </h3>
              <p className="mt-1 text-[length:var(--font-base)] leading-[1.45] text-[var(--text-secondary)]">
                {t("settings.defaultTerminalDesc")}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 max-[700px]:flex-col max-[700px]:items-stretch">
              <label className="sr-only" htmlFor="settings-terminal-select">
                {t("settings.defaultTerminal")}
              </label>
              <select
                id="settings-terminal-select"
                className={settingsSelectClass}
                value={defaultTerminalApp}
                onChange={(e) => {
                  void persistPreferences(
                    {
                      ...nextPreferences,
                      defaultTerminalApp: e.target.value as DefaultTerminalApp,
                    },
                    nextPreferences,
                  );
                }}
              >
                <option value="terminal">Terminal</option>
                <option value="iterm">iTerm</option>
                <option value="warp">Warp</option>
                <option value="ghostty">Ghostty</option>
              </select>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
            <div>
              <h3 className="text-[length:var(--font-md)] font-semibold text-[var(--text-primary)]">
                {t("settings.defaultEditor")}
              </h3>
              <p className="mt-1 text-[length:var(--font-base)] leading-[1.45] text-[var(--text-secondary)]">
                {t("settings.defaultEditorDesc")}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 max-[700px]:flex-col max-[700px]:items-stretch">
              <label className="sr-only" htmlFor="settings-editor-select">
                {t("settings.defaultEditor")}
              </label>
              <select
                id="settings-editor-select"
                className={settingsSelectClass}
                value={defaultEditorApp ?? ""}
                onChange={(e) =>
                  void persistPreferences(
                    {
                      ...nextPreferences,
                      defaultEditorApp: (e.target.value || null) as DefaultEditorApp | null,
                    },
                    nextPreferences,
                  )
                }
              >
                <option value="">{t("settings.editorUnset")}</option>
                <option value="vscode">VS Code</option>
                <option value="cursor">Cursor</option>
                <option value="windsurf">Windsurf</option>
                <option value="zed">Zed</option>
              </select>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
            <div>
              <h3 className="text-[length:var(--font-md)] font-semibold text-[var(--text-primary)]">
                {t("settings.diagnostics")}
              </h3>
              <p className="mt-1 text-[length:var(--font-base)] leading-[1.45] text-[var(--text-secondary)]">
                {t("settings.diagnosticsDesc")}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 max-[700px]:flex-col max-[700px]:items-stretch">
              <button
                type="button"
                className="h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3.5 text-[length:var(--font-base)] font-semibold text-[var(--text-primary)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                onClick={() => setIsLogViewerOpen(true)}
              >
                {t("settings.viewLogs")}
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
            <div>
              <h3 className="text-[length:var(--font-md)] font-semibold text-[var(--text-primary)]">
                {t("settings.systemInfo")}
              </h3>
              <p className="mt-1 text-[length:var(--font-base)] leading-[1.45] text-[var(--text-secondary)]">
                {t("settings.systemInfoDesc")}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 max-[700px]:flex-col max-[700px]:items-stretch">
              <button
                type="button"
                className="h-9 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3.5 text-[length:var(--font-base)] font-semibold text-[var(--text-primary)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                onClick={() => setIsSystemInfoOpen(true)}
              >
                {t("settings.viewSystemInfo")}
              </button>
            </div>
          </section>
        </div>
        {isLogViewerOpen ? <LogViewer onClose={() => setIsLogViewerOpen(false)} /> : null}
        {isSystemInfoOpen ? <SystemInfoDialog onClose={() => setIsSystemInfoOpen(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

export default SettingsDrawer;
