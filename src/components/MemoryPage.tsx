import { useI18n } from "../i18n";
import "./MemoryPage.css";

function MemoryPage() {
  const { t } = useI18n();

  return (
    <div className="placeholder-page">
      <div className="placeholder-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <line x1="8" y1="7" x2="16" y2="7" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </div>
      <h2 className="placeholder-title">{t("memory.title")}</h2>
      <p className="placeholder-description">{t("memory.description")}</p>
    </div>
  );
}

export default MemoryPage;
