import { TabType } from "../types";
import { useI18n } from "../i18n";
import "./Sidebar.css";

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onSettingsClick: () => void;
}

function Sidebar({ activeTab, onTabChange, onSettingsClick }: SidebarProps) {
  const { t } = useI18n();
  return (
    <nav className="sidebar" aria-label={t("nav.ariaLabel")}>
      <div className="sidebar-logo">AI</div>

      <div className="sidebar-nav">
        <button
          className={`nav-item ${activeTab === "configs" ? "active" : ""}`}
          onClick={() => onTabChange("configs")}
          aria-label={t("nav.configs")}
          aria-current={activeTab === "configs" ? "page" : undefined}
          data-tooltip={t("nav.configs")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
        </button>

        <button
          className={`nav-item ${activeTab === "memory" ? "active" : ""}`}
          onClick={() => onTabChange("memory")}
          aria-label={t("nav.memory")}
          aria-current={activeTab === "memory" ? "page" : undefined}
          data-tooltip={t("nav.memory")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.07-4.35A3 3 0 0 1 3 12a3 3 0 0 1 1.5-2.6 2.5 2.5 0 0 1 1.07-4.35A2.5 2.5 0 0 1 9.5 2z"/>
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.07-4.35A3 3 0 0 0 21 12a3 3 0 0 0-1.5-2.6 2.5 2.5 0 0 0-1.07-4.35A2.5 2.5 0 0 0 14.5 2z"/>
          </svg>
        </button>

        <button
          className={`nav-item ${activeTab === "skills" ? "active" : ""}`}
          onClick={() => onTabChange("skills")}
          aria-label={t("nav.skills")}
          aria-current={activeTab === "skills" ? "page" : undefined}
          data-tooltip={t("nav.skills")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </button>

        <button
          className={`nav-item ${activeTab === "providers" ? "active" : ""}`}
          onClick={() => onTabChange("providers")}
          aria-label={t("nav.providers")}
          aria-current={activeTab === "providers" ? "page" : undefined}
          data-tooltip={t("nav.providers")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
        </button>

        <button
          className={`nav-item ${activeTab === "history" ? "active" : ""}`}
          onClick={() => onTabChange("history")}
          aria-label={t("nav.history")}
          aria-current={activeTab === "history" ? "page" : undefined}
          data-tooltip={t("nav.history")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </button>

        <button
          className={`nav-item ${activeTab === "stats" ? "active" : ""}`}
          onClick={() => onTabChange("stats")}
          aria-label={t("nav.stats")}
          aria-current={activeTab === "stats" ? "page" : undefined}
          data-tooltip={t("nav.stats")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </button>
      </div>

      <div className="sidebar-spacer" />

      <div className="sidebar-settings">
        <button
          className="nav-item"
          onClick={onSettingsClick}
          aria-label={t("header.settings")}
          data-tooltip={t("header.settings")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </nav>
  );
}

export default Sidebar;
