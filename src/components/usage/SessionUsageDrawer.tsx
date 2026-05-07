import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { isTauri, type SessionUsageDetail } from "../../types";
import { Sheet, SheetContent } from "../ui/sheet";
import {
  formatCost,
  formatShortDateTime,
  formatTokens,
  projectDisplayName,
  shortSessionId,
} from "./format";

interface Props {
  sessionId: string;
  onClose: () => void;
}

function SessionUsageDrawer({ sessionId, onClose }: Props) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<SessionUsageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-labelledby="session-usage-detail-title"
        className="left-[var(--sidebar-width)] w-auto min-w-0 gap-0 border-l-0 bg-[var(--bg-elevated)] p-0 sm:max-w-none max-[700px]:left-[var(--sidebar-width-small)]"
      >
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
          <h2 id="session-usage-detail-title" className="min-w-0 truncate">
            {t("usage.detail.title")} - {shortSessionId(sessionId)}
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
                <div className="session-usage-title-block">
                  <span className="session-usage-session-id" title={sessionId}>
                    {sessionId}
                  </span>
                  <span className="session-usage-project" title={detail.session.projectPath}>
                    {projectDisplayName(detail.session.projectDir, detail.session.projectPath)}
                  </span>
                </div>
                <div className="session-usage-summary-grid">
                  <SummaryItem
                    label={t("usage.cards.totalCost")}
                    value={formatCost(detail.session.cost)}
                    accent
                  />
                  <SummaryItem
                    label={t("usage.cards.totalMessages")}
                    value={String(detail.session.messages)}
                  />
                  <SummaryItem
                    label={t("usage.table.totalTokens")}
                    value={formatTokens(
                      detail.session.inputTokens +
                        detail.session.outputTokens +
                        detail.session.cacheCreationTokens +
                        detail.session.cacheReadTokens,
                    )}
                  />
                  <SummaryItem
                    label={t("usage.table.startedAt")}
                    value={formatShortDateTime(detail.session.startedAtMs)}
                  />
                  <SummaryItem
                    label={t("usage.table.lastActive")}
                    value={formatShortDateTime(detail.session.lastActiveMs)}
                  />
                  <SummaryItem
                    label={t("usage.table.models")}
                    value={detail.session.models.join(", ")}
                    wide
                  />
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
      </SheetContent>
    </Sheet>
  );
}

function SummaryItem({
  label,
  value,
  accent = false,
  wide = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`session-usage-summary-item ${wide ? "wide" : ""}`}>
      <span className="label">{label}</span>
      <span className={`value ${accent ? "accent-green" : ""}`} title={value}>
        {value}
      </span>
    </div>
  );
}

export default SessionUsageDrawer;
