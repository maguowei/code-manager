import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import useEscapeKey from "../../hooks/useEscapeKey";
import { useI18n } from "../../i18n";
import { isTauri, type SessionUsageDetail } from "../../types";
import "../SessionDetailDrawer.css";
import "./SessionUsageDrawer.css";
import { formatCost, formatShortDateTime, formatTokens, shortPath, shortSessionId } from "./format";

interface Props {
  sessionId: string;
  onClose: () => void;
}

function SessionUsageDrawer({ sessionId, onClose }: Props) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<SessionUsageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(onClose);

  useEffect(() => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    invoke<SessionUsageDetail>("get_session_usage_detail", { sessionId })
      .then((d) => {
        setDetail(d);
        setError(null);
      })
      .catch((e) => setError(typeof e === "string" ? e : String(e)))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <>
      <div className="session-detail-overlay visible" onClick={onClose} />
      <div className="session-detail-drawer open">
        <div className="editor-header">
          <button
            type="button"
            className="editor-back-btn"
            onClick={onClose}
            title={t("common.close")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 4L4 12M4 4l8 8" />
            </svg>
          </button>
          <h2>
            {t("usage.detail.title")} — {shortSessionId(sessionId)}
          </h2>
        </div>

        <div className="session-usage-body">
          {loading ? (
            <div className="session-usage-empty">{t("loading")}</div>
          ) : error ? (
            <div className="session-usage-empty session-usage-error">{error}</div>
          ) : detail ? (
            <>
              <div className="session-usage-header">
                <div className="session-usage-meta">
                  <div className="session-usage-meta-row">
                    <span className="session-usage-meta-label">{t("usage.table.project")}</span>
                    <span className="session-usage-meta-value" title={detail.session.projectPath}>
                      {shortPath(detail.session.projectPath)}
                    </span>
                  </div>
                  <div className="session-usage-meta-row">
                    <span className="session-usage-meta-label">{t("usage.table.startedAt")}</span>
                    <span className="session-usage-meta-value">
                      {formatShortDateTime(detail.session.startedAtMs)}
                    </span>
                  </div>
                  <div className="session-usage-meta-row">
                    <span className="session-usage-meta-label">{t("usage.table.lastActive")}</span>
                    <span className="session-usage-meta-value">
                      {formatShortDateTime(detail.session.lastActiveMs)}
                    </span>
                  </div>
                  <div className="session-usage-meta-row">
                    <span className="session-usage-meta-label">{t("usage.table.models")}</span>
                    <span className="session-usage-meta-value">
                      {detail.session.models.join(", ")}
                    </span>
                  </div>
                </div>
                <div className="session-usage-totals">
                  <div className="session-usage-total">
                    <span className="label">{t("usage.cards.totalCost")}</span>
                    <span className="value accent-green">{formatCost(detail.session.cost)}</span>
                  </div>
                  <div className="session-usage-total">
                    <span className="label">{t("usage.cards.totalMessages")}</span>
                    <span className="value">{detail.session.messages}</span>
                  </div>
                </div>
              </div>

              {detail.messages.length === 0 ? (
                <div className="session-usage-empty">{t("usage.detail.empty")}</div>
              ) : (
                <div className="session-usage-table-wrap">
                  <table className="session-usage-table">
                    <thead>
                      <tr>
                        <th>{t("usage.detail.timestamp")}</th>
                        <th>{t("usage.detail.model")}</th>
                        <th className="num">{t("usage.table.input")}</th>
                        <th className="num">{t("usage.table.output")}</th>
                        <th className="num">{t("usage.table.cacheCreate")}</th>
                        <th className="num">{t("usage.table.cacheRead")}</th>
                        <th className="num">{t("usage.detail.cost")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.messages.map((m) => (
                        <tr key={m.messageId || `${m.sessionId}-${m.timestampMs}`}>
                          <td>{formatShortDateTime(m.timestampMs)}</td>
                          <td className="model-cell">{m.model}</td>
                          <td className="num">{formatTokens(m.inputTokens)}</td>
                          <td className="num">{formatTokens(m.outputTokens)}</td>
                          <td className="num">
                            {formatTokens(m.cacheCreation5m + m.cacheCreation1h)}
                          </td>
                          <td className="num">{formatTokens(m.cacheRead)}</td>
                          <td className="num">{formatCost(m.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default SessionUsageDrawer;
