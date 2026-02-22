import { useI18n } from "../i18n";
import "./MemoryPage.css";

function SkillsPage() {
  const { t } = useI18n();

  return (
    <div className="placeholder-page">
      <div className="placeholder-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </div>
      <h2 className="placeholder-title">{t("skills.title")}</h2>
      <p className="placeholder-description">{t("skills.description")}</p>
    </div>
  );
}

export default SkillsPage;
