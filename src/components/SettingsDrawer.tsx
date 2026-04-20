import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import useEscapeKey from "../hooks/useEscapeKey";
import { useToast } from "../hooks/useToast";
import { type Language, type Theme, useI18n } from "../i18n";
import type {
  AppPreferences,
  ConfigWorkspace,
  DefaultEditorApp,
  DefaultTerminalApp,
} from "../types";
import "./SettingsDrawer.css";

interface SettingsDrawerProps {
  onClose: () => void;
}

function SettingsDrawer({ onClose }: SettingsDrawerProps) {
  const { t, language, theme, setLanguage, setTheme } = useI18n();
  const { showToast } = useToast();
  const [preferences, setPreferences] = useState<AppPreferences>({
    showTrayTitle: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
  });

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

  const showTrayTitle = preferences.showTrayTitle;
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

  const themeOptions: {
    value: Theme;
    labelKey: "settings.themeLight" | "settings.themeDark" | "settings.themeSystem";
    icon: string;
  }[] = [
    { value: "light", labelKey: "settings.themeLight", icon: "sun" },
    { value: "dark", labelKey: "settings.themeDark", icon: "moon" },
    { value: "system", labelKey: "settings.themeSystem", icon: "monitor" },
  ];

  useEscapeKey(onClose);

  return (
    <div className="settings-drawer-overlay" onClick={onClose}>
      <aside
        className="settings-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="settings-drawer-title"
        aria-modal="true"
      >
        <div className="settings-drawer-header">
          <button
            type="button"
            className="settings-back-btn"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h2 id="settings-drawer-title">{t("settings.title")}</h2>
        </div>

        <div className="settings-drawer-body">
          <section className="settings-section-card">
            <div className="settings-section-head">
              <h3>{t("settings.language")}</h3>
              <p>{t("settings.languageDesc")}</p>
            </div>
            <div className="settings-item">
              <label className="sr-only" htmlFor="settings-language-select">
                {t("settings.language")}
              </label>
              <select
                id="settings-language-select"
                className="settings-select"
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

          <section className="settings-section-card">
            <div className="settings-section-head">
              <h3>{t("settings.theme")}</h3>
              <p>{t("settings.themeDesc")}</p>
            </div>
            <div className="settings-section">
              <div className="settings-item">
                <div className="theme-cards">
                  {themeOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={`theme-card ${theme === option.value ? "active" : ""}`}
                      onClick={() => setTheme(option.value)}
                    >
                      <div className="theme-card-icon">
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
                      <span className="theme-card-label">{t(option.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="settings-section-card">
            <div className="settings-section-head">
              <h3>{t("settings.showTrayTitle")}</h3>
              <p>{t("settings.showTrayTitleDesc")}</p>
            </div>
            <div className="settings-item">
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

          <section className="settings-section-card">
            <div className="settings-section-head">
              <h3>{t("settings.defaultTerminal")}</h3>
              <p>{t("settings.defaultTerminalDesc")}</p>
            </div>
            <div className="settings-item">
              <label className="sr-only" htmlFor="settings-terminal-select">
                {t("settings.defaultTerminal")}
              </label>
              <select
                id="settings-terminal-select"
                className="settings-select"
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

          <section className="settings-section-card">
            <div className="settings-section-head">
              <h3>{t("settings.defaultEditor")}</h3>
              <p>{t("settings.defaultEditorDesc")}</p>
            </div>
            <div className="settings-item">
              <label className="sr-only" htmlFor="settings-editor-select">
                {t("settings.defaultEditor")}
              </label>
              <select
                id="settings-editor-select"
                className="settings-select"
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
        </div>
      </aside>
    </div>
  );
}

export default SettingsDrawer;
