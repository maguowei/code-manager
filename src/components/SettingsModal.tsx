import { useI18n, Language, Theme } from "../i18n";
import "./SettingsModal.css";

interface SettingsModalProps {
  onClose: () => void;
}

function SettingsModal({ onClose }: SettingsModalProps) {
  const { t, language, theme, setLanguage, setTheme } = useI18n();

  const themeOptions: { value: Theme; labelKey: "settings.themeLight" | "settings.themeDark" | "settings.themeSystem"; icon: string }[] = [
    { value: "light", labelKey: "settings.themeLight", icon: "sun" },
    { value: "dark", labelKey: "settings.themeDark", icon: "moon" },
    { value: "system", labelKey: "settings.themeSystem", icon: "monitor" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="back-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <h2>{t("settings.title")}</h2>
          <div className="header-spacer"></div>
        </div>

        <div className="settings-layout">
          {/* 左侧标签栏 */}
          <div className="settings-sidebar">
            <button className="settings-tab active">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <span>{t("settings.general")}</span>
            </button>
          </div>

          {/* 右侧内容区 */}
          <div className="settings-content">
            {/* 界面语言 */}
            <div className="settings-section">
              <div className="settings-item">
                <div className="settings-item-info">
                  <h3>{t("settings.language")}</h3>
                  <p>{t("settings.languageDesc")}</p>
                </div>
                <select
                  className="settings-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            {/* 主题外观 */}
            <div className="settings-section">
              <div className="settings-item">
                <div className="settings-item-info">
                  <h3>{t("settings.theme")}</h3>
                  <p>{t("settings.themeDesc")}</p>
                </div>
              </div>
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
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
