import {
  BarChart3,
  Brain,
  Clock,
  DollarSign,
  FolderOpen,
  Server,
  Settings,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { useI18n } from "../i18n";
import type { TabType } from "../types";
import "./Sidebar.css";

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onClaudeOverviewClick: () => void;
  onSettingsClick: () => void;
}

function Sidebar({ activeTab, onTabChange, onClaudeOverviewClick, onSettingsClick }: SidebarProps) {
  const { t } = useI18n();
  return (
    <nav className="sidebar" aria-label={t("nav.ariaLabel")}>
      <button
        type="button"
        className={`sidebar-logo sidebar-logo-button ${
          activeTab === "claudeOverview" ? "active" : ""
        }`}
        onClick={onClaudeOverviewClick}
        aria-label={t("nav.claudeOverview")}
        aria-current={activeTab === "claudeOverview" ? "page" : undefined}
        data-tooltip={t("nav.claudeOverview")}
      >
        AI
      </button>

      <div className="sidebar-nav">
        <button
          type="button"
          className={`nav-item ${activeTab === "configs" ? "active" : ""}`}
          onClick={() => onTabChange("configs")}
          aria-label={t("nav.configs")}
          aria-current={activeTab === "configs" ? "page" : undefined}
          data-tooltip={t("nav.configs")}
        >
          <SlidersHorizontal className="size-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "memory" ? "active" : ""}`}
          onClick={() => onTabChange("memory")}
          aria-label={t("nav.memory")}
          aria-current={activeTab === "memory" ? "page" : undefined}
          data-tooltip={t("nav.memory")}
        >
          <Brain className="size-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "skills" ? "active" : ""}`}
          onClick={() => onTabChange("skills")}
          aria-label={t("nav.skills")}
          aria-current={activeTab === "skills" ? "page" : undefined}
          data-tooltip={t("nav.skills")}
        >
          <Zap className="size-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "providers" ? "active" : ""}`}
          onClick={() => onTabChange("providers")}
          aria-label={t("nav.providers")}
          aria-current={activeTab === "providers" ? "page" : undefined}
          data-tooltip={t("nav.providers")}
        >
          <Server className="size-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "projects" ? "active" : ""}`}
          onClick={() => onTabChange("projects")}
          aria-label={t("nav.projects")}
          aria-current={activeTab === "projects" ? "page" : undefined}
          data-tooltip={t("nav.projects")}
        >
          <FolderOpen className="size-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "history" ? "active" : ""}`}
          onClick={() => onTabChange("history")}
          aria-label={t("nav.history")}
          aria-current={activeTab === "history" ? "page" : undefined}
          data-tooltip={t("nav.history")}
        >
          <Clock className="size-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "stats" ? "active" : ""}`}
          onClick={() => onTabChange("stats")}
          aria-label={t("nav.stats")}
          aria-current={activeTab === "stats" ? "page" : undefined}
          data-tooltip={t("nav.stats")}
        >
          <BarChart3 className="size-5" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === "usage" ? "active" : ""}`}
          onClick={() => onTabChange("usage")}
          aria-label={t("nav.usage")}
          aria-current={activeTab === "usage" ? "page" : undefined}
          data-tooltip={t("nav.usage")}
        >
          <DollarSign data-testid="usage-dollar-icon" className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="sidebar-spacer" />

      <div className="sidebar-settings">
        <button
          type="button"
          className="nav-item"
          onClick={onSettingsClick}
          aria-label={t("header.settings")}
          data-tooltip={t("header.settings")}
        >
          <Settings className="size-5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export default Sidebar;
