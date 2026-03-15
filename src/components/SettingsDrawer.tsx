import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n, Language, Theme } from "../i18n";
import useEscapeKey from "../hooks/useEscapeKey";
import { useToast } from "../hooks/useToast";
import "./SettingsDrawer.css";

interface SettingsDrawerProps {
  onClose: () => void;
}

function SettingsDrawer({ onClose }: SettingsDrawerProps) {
  const { t, language, theme, setLanguage, setTheme } = useI18n();
  const { showToast } = useToast();
  const [showTrayTitle, setShowTrayTitle] = useState(true);

  // 从后端加载设置
  useEffect(() => {
    invoke<{ showTrayTitle: boolean }>("get_configs").then((state) => {
      setShowTrayTitle(state.showTrayTitle);
    });
  }, []);

  const handleToggleTrayTitle = useCallback(async () => {
    const newValue = !showTrayTitle;
    setShowTrayTitle(newValue);
    try {
      await invoke("set_show_tray_title", { show: newValue });
    } catch {
      setShowTrayTitle(!newValue);
      showToast(t("toast.configSaveError"), "error");
    }
  }, [showTrayTitle, showToast, t]);

  const themeOptions: { value: Theme; labelKey: "settings.themeLight" | "settings.themeDark" | "settings.themeSystem"; icon: string }[] = [
    { value: "light", labelKey: "settings.themeLight", icon: "sun" },
    { value: "dark", labelKey: "settings.themeDark", icon: "moon" },
    { value: "system", labelKey: "settings.themeSystem", icon: "monitor" },
  ];

  // ESC 键关闭设置抽屉
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
          <button type="button" className="settings-back-btn" onClick={onClose} aria-label={t("common.close")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <h2 id="settings-drawer-title">{t("settings.title")}</h2>
        </div>

        <div className="settings-drawer-body">
          {/* 界面语言 */}
          <section className="settings-section-card">
            <div className="settings-section-head">
              <h3>{t("settings.language")}</h3>
              <p>{t("settings.languageDesc")}</p>
            </div>
            <div className="settings-item">
              <label className="sr-only" htmlFor="settings-language-select">{t("settings.language")}</label>
              <select
                id="settings-language-select"
                className="settings-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </div>
          </section>

          {/* 主题外观 */}
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
                      key={option.value}
                      className={`theme-card ${theme === option.value ? "active" : ""}`}
                      onClick={() => setTheme(option.value)}
                    >
                      <div className="theme-card-icon">
                        {option.icon === "sun" && (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="5"/>
                            <line x1="12" y1="1" x2="12" y2="3"/>
                            <line x1="12" y1="21" x2="12" y2="23"/>
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                            <line x1="1" y1="12" x2="3" y2="12"/>
                            <line x1="21" y1="12" x2="23" y2="12"/>
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                          </svg>
                        )}
                        {option.icon === "moon" && (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                          </svg>
                        )}
                        {option.icon === "monitor" && (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                            <line x1="8" y1="21" x2="16" y2="21"/>
                            <line x1="12" y1="17" x2="12" y2="21"/>
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

          {/* 托盘显示 */}
          <section className="settings-section-card">
            <div className="settings-section-head">
              <h3>{t("settings.showTrayTitle")}</h3>
              <p>{t("settings.showTrayTitleDesc")}</p>
            </div>
            <div className="settings-item">
              <button
                type="button"
                className={`toggle-switch${showTrayTitle ? " enabled" : ""}`}
                onClick={handleToggleTrayTitle}
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
        </div>
      </aside>
    </div>
  );
}

export default SettingsDrawer;
