import { useI18n } from "../i18n";
import "./HistoryPage.css";

function HistoryPage() {
  const { t } = useI18n();
  return (
    <div className="history-page">
      <div className="page-header">
        <h1 className="page-title">{t("history.title")}</h1>
      </div>
      <div className="empty-state">{t("history.noData")}</div>
    </div>
  );
}

export default HistoryPage;
