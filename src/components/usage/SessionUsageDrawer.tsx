import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { getUserFacingErrorReason } from "@/lib/user-facing-error";
import { useI18n } from "../../i18n";
import { ipc } from "../../ipc";
import { cn } from "../../lib/utils";
import { isTauri, type SessionUsageDetail } from "../../types";
import { LIST_DETAIL_DRAWER_OFFSET_CLASS } from "../layout-size-classes";
import { PANEL_SURFACE_CLASS, TOOLBAR_SURFACE_CLASS } from "../surface-classes";
import { TYPOGRAPHY } from "../typography-classes";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
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
    let cancelled = false;
    setLoading(true);
    ipc
      .getSessionUsageDetail(sessionId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(getUserFacingErrorReason(e) ?? t("usage.detailLoadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, t]);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn(
          "flex w-auto min-w-0 flex-col gap-0 border-l-0 bg-secondary p-0 sm:max-w-none",
          LIST_DETAIL_DRAWER_OFFSET_CLASS,
        )}
      >
        <div
          className={cn(
            "sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-3 border-b px-5",
            TOOLBAR_SURFACE_CLASS,
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            title={t("common.close")}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
          <SheetTitle asChild>
            <h2 className={cn("min-w-0 truncate", TYPOGRAPHY.drawerTitle)}>
              {t("usage.detail.title")} - {shortSessionId(sessionId)}
            </h2>
          </SheetTitle>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-secondary px-6 py-6">
          {loading ? (
            <div
              className={cn(
                "flex min-h-[120px] items-center justify-center rounded-lg border px-4 text-center text-muted-foreground",
                PANEL_SURFACE_CLASS,
              )}
            >
              {t("loading")}
            </div>
          ) : error ? (
            <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-destructive/30 px-4 text-center text-destructive">
              {error}
            </div>
          ) : detail ? (
            <>
              <div className="flex flex-col gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <span
                    className="min-w-0 truncate font-mono text-sm font-semibold text-foreground"
                    title={sessionId}
                  >
                    {sessionId}
                  </span>
                  <span
                    className="min-w-0 truncate text-sm text-muted-foreground"
                    title={detail.session.projectPath}
                  >
                    {projectDisplayName(detail.session.projectDir, detail.session.projectPath)}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                <div
                  className={cn(
                    "flex min-h-[120px] items-center justify-center rounded-lg border px-4 text-center text-muted-foreground",
                    PANEL_SURFACE_CLASS,
                  )}
                >
                  {t("usage.detail.empty")}
                </div>
              ) : (
                <div className={cn("overflow-x-auto rounded-lg border", PANEL_SURFACE_CLASS)}>
                  <table className="w-full min-w-[760px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/80 bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                        <th className="px-3 py-2">{t("usage.detail.timestamp")}</th>
                        <th className="px-3 py-2">{t("usage.detail.model")}</th>
                        <th className="px-3 py-2 text-right">{t("usage.table.input")}</th>
                        <th className="px-3 py-2 text-right">{t("usage.table.output")}</th>
                        <th className="px-3 py-2 text-right">{t("usage.table.cacheCreate")}</th>
                        <th className="px-3 py-2 text-right">{t("usage.table.cacheRead")}</th>
                        <th className="px-3 py-2 text-right">{t("usage.detail.cost")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.messages.map((m) => (
                        <tr
                          key={m.messageId || `${m.sessionId}-${m.timestampMs}`}
                          className="border-b border-border/70 last:border-0"
                        >
                          <td className="px-3 py-2 text-muted-foreground">
                            {formatShortDateTime(m.timestampMs)}
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-2 font-mono text-xs">
                            {m.model}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatTokens(m.inputTokens)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatTokens(m.outputTokens)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatTokens(m.cacheCreation5m + m.cacheCreation1h)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatTokens(m.cacheRead)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {formatCost(m.costUsd)}
                          </td>
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
    <div
      className={cn(
        "usage-summary-card grid gap-1 rounded-lg border p-3",
        PANEL_SURFACE_CLASS,
        wide && "sm:col-span-2 xl:col-span-3",
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-base font-semibold text-foreground",
          accent && "text-chart-2",
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export default SessionUsageDrawer;
