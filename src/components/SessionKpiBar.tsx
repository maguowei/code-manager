import { Clock3, Coins, Hash, ShieldAlert } from "lucide-react";
import type { TranslationKey } from "../i18n";
import type { SessionUsageDetail } from "../types";
import { formatCost, formatTokens } from "./usage/format";

/** 把毫秒时长格式化为 mm:ss / h m */
function formatElapsed(ms: number): string {
  if (ms <= 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

/** 会话级 KPI 条：成本 / Token / 时长 / hook 错误数。usage 来自 get_session_usage_detail */
export function SessionKpiBar({
  usage,
  hookErrorCount,
  t,
}: {
  usage: SessionUsageDetail | null;
  hookErrorCount: number;
  t: (k: TranslationKey) => string;
}) {
  // SessionUsage 字段为 camelCase
  const s = usage?.session;
  const tokens = s ? s.inputTokens + s.outputTokens : 0;
  const elapsed = s ? formatElapsed(s.lastActiveMs - s.startedAtMs) : "—";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <Kpi
        icon={<Coins className="size-3.5" />}
        label={t("history.kpiCost")}
        value={s ? formatCost(s.cost) : "—"}
      />
      <Kpi
        icon={<Hash className="size-3.5" />}
        label={t("history.kpiTokens")}
        value={s ? formatTokens(tokens) : "—"}
      />
      <Kpi
        icon={<Clock3 className="size-3.5" />}
        label={t("history.kpiDuration")}
        value={elapsed}
      />
      <Kpi
        icon={<ShieldAlert className="size-3.5" />}
        label={t("history.kpiHookErrors")}
        value={String(hookErrorCount)}
      />
    </div>
  );
}
