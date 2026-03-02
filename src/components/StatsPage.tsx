import { useI18n } from "../i18n";

function StatsPage() {
  const { t } = useI18n();

  return (
    <div className="stats-page">
      <div className="page-header">
        <h1 className="page-title">{t("stats.title")}</h1>
      </div>
      <div className="stats-loading">
        {t("loading")}
      </div>
    </div>
  );
}

export default StatsPage;
