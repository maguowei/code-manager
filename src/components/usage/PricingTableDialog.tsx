import { RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PANEL_SURFACE_CLASS, SUBTLE_SURFACE_CLASS } from "@/components/surface-classes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ModelUsageStat, PricingSource, PricingTable } from "@/types";
import { formatPricePerMillion, formatShortDateTime } from "./format";

interface PricingTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pricing: PricingTable;
  usedModels: ModelUsageStat[];
  thirdPartyProviderPricingEnabled: boolean;
  refreshing: boolean;
  onRefresh: () => void | Promise<void>;
}

interface PricingRow {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  used: boolean;
}

export default function PricingTableDialog({
  open,
  onOpenChange,
  pricing,
  usedModels,
  thirdPartyProviderPricingEnabled,
  refreshing,
  onRefresh,
}: PricingTableDialogProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const usedModelSet = useMemo(() => new Set(usedModels.map((model) => model.model)), [usedModels]);

  const rows = useMemo<PricingRow[]>(() => {
    return Object.entries(pricing.models)
      .map(([model, price]) => ({
        model,
        input: price.input,
        output: price.output,
        cacheRead: price.cache_read,
        cacheWrite: price.cache_write,
        used: usedModelSet.has(model),
      }))
      .sort((a, b) => {
        if (a.used !== b.used) return a.used ? -1 : 1;
        return a.model.localeCompare(b.model);
      });
  }, [pricing.models, usedModelSet]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!normalizedQuery) return rows;
    return rows.filter((row) => row.model.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, rows]);

  const fetchedAtLabel = pricing.fetchedAtMs
    ? `${t("usage.pricingFetched")} ${formatShortDateTime(pricing.fetchedAtMs)}`
    : t("usage.pricingTable.fetchedAtUnknown");

  const hasPricingRows = rows.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("usage.pricingTable.title")}</DialogTitle>
          <DialogDescription>{t("usage.pricingTable.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge
              variant="outline"
              className={cn(
                "rounded-md px-2 font-bold whitespace-nowrap",
                pricing.source === "network" && "border-chart-2/60 bg-chart-2/10 text-chart-2",
                pricing.source === "cache" && "border-chart-1/60 bg-chart-1/10 text-chart-1",
              )}
            >
              {pricingSourceLabel(pricing.source, t)}
            </Badge>
            <span>{fetchedAtLabel}</span>
            <span aria-hidden="true">/</span>
            <span>
              {thirdPartyProviderPricingEnabled
                ? t("usage.thirdPartyProviderPricing.enabled")
                : t("usage.pricingTable.thirdPartyDisabledDetailed")}
            </span>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("usage.pricingTable.searchLabel")}
              className="pl-9"
              placeholder={t("usage.pricingTable.searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          {!hasPricingRows ? (
            <PricingEmptyState
              title={t("usage.pricingTable.noPrices")}
              description={t("usage.pricingTable.noPricesDescription")}
            />
          ) : filteredRows.length === 0 ? (
            <PricingEmptyState
              title={t("usage.pricingTable.noMatches")}
              description={t("usage.pricingTable.noMatchesDescription")}
            />
          ) : (
            <div
              className={cn(
                "min-h-0 flex-1 overflow-x-auto overflow-y-auto rounded-lg border",
                PANEL_SURFACE_CLASS,
              )}
            >
              <table
                aria-label={t("usage.pricingTable.tableLabel")}
                className="w-full min-w-[820px] border-collapse text-sm [&_.model-cell]:max-w-[320px] [&_.model-cell]:truncate [&_.mono]:font-mono [&_.num]:text-right [&_.num]:tabular-nums [&_tbody_tr:last-child_td]:border-b-0 [&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:bg-muted/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-muted-foreground"
              >
                <thead>
                  <tr>
                    <th>{t("usage.pricingTable.model")}</th>
                    <th className="num">{t("usage.pricingTable.input")}</th>
                    <th className="num">{t("usage.pricingTable.output")}</th>
                    <th className="num">{t("usage.pricingTable.cacheWrite")}</th>
                    <th className="num">{t("usage.pricingTable.cacheRead")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.model}>
                      <td className="model-cell">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="mono truncate font-medium" title={row.model}>
                            {row.model}
                          </span>
                          {row.used ? (
                            <Badge variant="secondary" className="shrink-0 rounded-md">
                              {t("usage.pricingTable.currentUsage")}
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="num mono">{formatPricePerMillion(row.input)}</td>
                      <td className="num mono">{formatPricePerMillion(row.output)}</td>
                      <td className="num mono">{formatPricePerMillion(row.cacheWrite)}</td>
                      <td className="num mono">{formatPricePerMillion(row.cacheRead)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div
            className={cn(
              "rounded-md border px-3 py-2 text-xs text-muted-foreground",
              SUBTLE_SURFACE_CLASS,
            )}
          >
            {t("usage.pricingTable.unit")}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onRefresh()}
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            <span>{refreshing ? t("usage.refreshing") : t("usage.refresh")}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PricingEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Empty className="min-h-[240px] border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search className="size-5" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function pricingSourceLabel(source: PricingSource, t: ReturnType<typeof useI18n>["t"]) {
  switch (source) {
    case "network":
      return t("usage.pricing.network");
    case "cache":
      return t("usage.pricing.cache");
    case "builtin":
      return t("usage.pricing.builtin");
  }
}
