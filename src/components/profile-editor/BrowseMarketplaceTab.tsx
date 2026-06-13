import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleCheck,
  ExternalLink,
  Plus,
  RefreshCw,
  Settings2,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n";
import { ipc } from "../../ipc";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "../ui/empty";
import { InputGroup, InputGroupInput } from "../ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import type { MarketplacePluginEntry } from "./marketplace-catalog";
import { loadPluginInstallCounts, type PluginInstallCounts } from "./plugin-install-counts";
import type { PluginEntry } from "./useEnabledPluginsState";
import type { MarketplaceSourceInput } from "./useMarketplaceCatalog";
import { useMarketplaceCatalog } from "./useMarketplaceCatalog";

interface BrowseMarketplaceTabProps {
  sources: MarketplaceSourceInput[];
  plugins: PluginEntry[];
  active: boolean;
  onAddPlugin: (pluginId: string) => boolean;
  onManagePlugin: (pluginId: string) => void;
}

function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

const FILTER_CONTROL_CLASS =
  "flex h-10 min-w-[160px] items-center gap-2 rounded-md border border-border bg-card px-2.5 transition-[border-color,box-shadow,transform] focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-muted-foreground";
const FILTER_TRIGGER_CLASS =
  "h-full min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus:ring-0";
const DETAILS_COLLAPSE_THRESHOLD = 150;
const MIN_REFRESH_FEEDBACK_MS = 500;

type MarketplaceSortMode = "pluginId" | "installCount";
type SortDirection = "asc" | "desc";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAriaSort(direction: SortDirection): "ascending" | "descending" {
  return direction === "asc" ? "ascending" : "descending";
}

export default function BrowseMarketplaceTab({
  sources,
  plugins,
  active,
  onAddPlugin,
  onManagePlugin,
}: BrowseMarketplaceTabProps) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const { byMarketplace, refreshAll, refreshOne } = useMarketplaceCatalog({ sources, active });
  const [searchQuery, setSearchQuery] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState<"all" | string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | string>("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<"all" | string>("all");
  const [sortMode, setSortMode] = useState<MarketplaceSortMode>("installCount");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [installCounts, setInstallCounts] = useState<PluginInstallCounts>({});
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [expandedPluginIds, setExpandedPluginIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!active || sources.length === 0) return;
    let cancelled = false;
    void loadPluginInstallCounts().then((counts) => {
      if (!cancelled) {
        setInstallCounts(counts);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active, sources.length]);

  const enabledMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const plugin of plugins) {
      map.set(plugin.pluginId, plugin.enabled);
    }
    return map;
  }, [plugins]);

  const allPlugins = useMemo<MarketplacePluginEntry[]>(
    () => Object.values(byMarketplace).flatMap((entry) => entry.plugins),
    [byMarketplace],
  );

  const failures = useMemo(
    () => Object.values(byMarketplace).filter((entry) => entry.status === "error"),
    [byMarketplace],
  );

  const unsupportedCount = useMemo(
    () => Object.values(byMarketplace).filter((entry) => entry.unsupported === true).length,
    [byMarketplace],
  );

  const categoryOptions = useMemo(
    () => Array.from(new Set(allPlugins.map((p) => p.category).filter(Boolean))).sort(),
    [allPlugins],
  );

  const sourceTypeOptions = useMemo(
    () => Array.from(new Set(allPlugins.map((p) => p.sourceType).filter(Boolean))).sort(),
    [allPlugins],
  );

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-US"),
    [language],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const comparePluginId = (a: MarketplacePluginEntry, b: MarketplacePluginEntry) =>
      a.pluginId.localeCompare(b.pluginId, undefined, { sensitivity: "base" });
    return allPlugins
      .filter((plugin) => {
        if (marketplaceFilter !== "all" && plugin.marketplaceId !== marketplaceFilter) return false;
        if (statusFilter === "enabled" && !enabledMap.get(plugin.pluginId)) return false;
        if (statusFilter === "disabled" && enabledMap.get(plugin.pluginId)) return false;
        if (categoryFilter !== "all" && plugin.category !== categoryFilter) return false;
        if (sourceTypeFilter !== "all" && plugin.sourceType !== sourceTypeFilter) return false;
        if (q.length === 0) return true;
        return [plugin.pluginId, plugin.description, plugin.authorName].some((field) =>
          field.toLowerCase().includes(q),
        );
      })
      .sort((a, b) => {
        if (sortMode === "installCount") {
          const aCount = installCounts[a.pluginId];
          const bCount = installCounts[b.pluginId];
          const aKnown = typeof aCount === "number";
          const bKnown = typeof bCount === "number";
          if (aKnown !== bKnown) {
            return aKnown ? -1 : 1;
          }
          if (typeof aCount === "number" && typeof bCount === "number" && aCount !== bCount) {
            return sortDirection === "desc" ? bCount - aCount : aCount - bCount;
          }
          return comparePluginId(a, b);
        }
        const idComparison = comparePluginId(a, b);
        return sortDirection === "desc" ? -idComparison : idComparison;
      });
  }, [
    allPlugins,
    categoryFilter,
    enabledMap,
    installCounts,
    marketplaceFilter,
    searchQuery,
    sortDirection,
    sortMode,
    sourceTypeFilter,
    statusFilter,
  ]);

  if (sources.length === 0) {
    return (
      <Empty>
        <EmptyTitle>{t("profileEditor.plugins.browse.emptyNoMarketplace")}</EmptyTitle>
        <EmptyDescription>
          {t("profileEditor.plugins.browse.emptyNoMarketplaceHint")}
        </EmptyDescription>
      </Empty>
    );
  }

  const enabledCount = plugins.filter((p) => p.enabled).length;
  const summary = formatTemplate(t("profileEditor.plugins.browse.statusBarSummary"), {
    total: allPlugins.length,
    enabled: enabledCount,
    sources: sources.length,
  });
  const failureSummary = formatTemplate(t("profileEditor.plugins.browse.failureSummary"), {
    count: failures.length,
  });
  const refreshButtonLabel = refreshingAll
    ? t("profileEditor.plugins.browse.refreshing")
    : t("profileEditor.plugins.browse.refreshAll");
  const sortHintLabel =
    sortMode === "installCount"
      ? sortDirection === "desc"
        ? t("profileEditor.plugins.browse.sortByInstallCountDescDescription")
        : t("profileEditor.plugins.browse.sortByInstallCountAscDescription")
      : sortDirection === "desc"
        ? t("profileEditor.plugins.browse.sortByPluginIdDescDescription")
        : t("profileEditor.plugins.browse.sortByPluginIdAscDescription");

  function getSortButtonLabel(mode: MarketplaceSortMode): string {
    if (mode === "installCount") {
      if (sortMode !== "installCount" || sortDirection === "asc") {
        return t("profileEditor.plugins.browse.sortInstallCountDescAriaLabel");
      }
      return t("profileEditor.plugins.browse.sortInstallCountAscAriaLabel");
    }
    if (sortMode !== "pluginId" || sortDirection === "desc") {
      return t("profileEditor.plugins.browse.sortPluginIdAscAriaLabel");
    }
    return t("profileEditor.plugins.browse.sortPluginIdDescAriaLabel");
  }

  function handleSort(mode: MarketplaceSortMode) {
    if (sortMode !== mode) {
      setSortMode(mode);
      setSortDirection(mode === "installCount" ? "desc" : "asc");
      return;
    }
    setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
  }

  function renderSortIcon(mode: MarketplaceSortMode) {
    if (sortMode !== mode) {
      return <ArrowUpDown className="size-3.5 opacity-60" aria-hidden="true" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="size-3.5" aria-hidden="true" />
    ) : (
      <ArrowDown className="size-3.5" aria-hidden="true" />
    );
  }

  function formatInstallCount(pluginId: string): string {
    const count = installCounts[pluginId];
    return typeof count === "number"
      ? numberFormatter.format(count)
      : t("profileEditor.plugins.browse.installCountUnknown");
  }

  function formatRefreshSuccessDescription(
    summaries: Awaited<ReturnType<typeof refreshAll>>,
  ): string {
    return summaries
      .map((summary) =>
        formatTemplate(t("profileEditor.plugins.browse.refreshSuccessItem"), {
          marketplace: summary.marketplaceId,
          count: summary.pluginCount,
        }),
      )
      .join("\n");
  }

  async function handleRefreshAll() {
    if (refreshingAll) return;
    const startedAt = Date.now();
    setRefreshingAll(true);
    let summaries: Awaited<ReturnType<typeof refreshAll>> = [];
    let installCountsError: string | null = null;
    try {
      // GitHub 插件列表刷新与 claude catalog 重拉并发；后者失败降级，不拖垮列表刷新
      [summaries] = await Promise.all([
        refreshAll(),
        ipc.refreshPluginInstallCounts().catch((error) => {
          installCountsError = error instanceof Error ? error.message : String(error);
        }),
      ]);
      // catalog 缓存重拉后重读安装数（本地读取，廉价）
      const counts = await loadPluginInstallCounts();
      setInstallCounts(counts);
    } finally {
      const remainingMs = MIN_REFRESH_FEEDBACK_MS - (Date.now() - startedAt);
      if (remainingMs > 0) {
        await delay(remainingMs);
      }
      setRefreshingAll(false);
    }
    if (installCountsError) {
      showToast(t("profileEditor.plugins.browse.installCountsRefreshFailed"), "error", {
        description: installCountsError,
      });
    } else {
      showToast(t("profileEditor.plugins.browse.refreshSuccess"), "success", {
        description: formatRefreshSuccessDescription(summaries),
      });
    }
  }

  function toggleDetails(pluginId: string) {
    setExpandedPluginIds((current) => {
      const next = new Set(current);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      return next;
    });
  }

  function handleDetailsKeyDown(event: KeyboardEvent, pluginId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleDetails(pluginId);
  }

  return (
    <div className="flex flex-col gap-3 pt-3">
      {/* 筛选栏 */}
      <div className="flex flex-col gap-2.5">
        <div className="flex w-full items-stretch gap-2.5 max-[640px]:flex-col">
          <InputGroup className="h-10 min-w-0 flex-1 bg-card px-2.5 hover:border-muted-foreground">
            <InputGroupInput
              type="text"
              value={searchQuery}
              placeholder={t("profileEditor.plugins.browse.searchPlaceholder")}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-full px-0 py-0"
              aria-label={t("profileEditor.plugins.browse.searchPlaceholder")}
            />
          </InputGroup>

          <Button
            type="button"
            variant="outline"
            className="h-10 min-w-24 shrink-0"
            disabled={refreshingAll}
            aria-busy={refreshingAll}
            onClick={() => void handleRefreshAll()}
          >
            <RefreshCw
              className={cn("size-3.5", refreshingAll && "animate-spin")}
              aria-hidden="true"
            />
            {refreshButtonLabel}
          </Button>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5 max-[640px]:grid-cols-1">
          {/* Marketplace 筛选 */}
          <div className={FILTER_CONTROL_CLASS}>
            <span
              className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground"
              aria-hidden="true"
            >
              {t("profileEditor.plugins.browse.marketplaceFilterLabel")}
            </span>
            <Select value={marketplaceFilter} onValueChange={setMarketplaceFilter}>
              <SelectTrigger
                aria-label={t("profileEditor.plugins.browse.marketplaceFilterLabel")}
                className={FILTER_TRIGGER_CLASS}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">
                    {t("profileEditor.plugins.browse.marketplaceFilterAll")}
                  </SelectItem>
                  {sources.map((s) => (
                    <SelectItem key={s.marketplaceId} value={s.marketplaceId}>
                      {s.marketplaceId}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* 状态筛选 */}
          <div className={FILTER_CONTROL_CLASS}>
            <span
              className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground"
              aria-hidden="true"
            >
              {t("profileEditor.plugins.statusFilterFieldLabel")}
            </span>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger
                aria-label={t("profileEditor.plugins.statusFilterLabel")}
                className={FILTER_TRIGGER_CLASS}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("profileEditor.plugins.statusFilterAll")}</SelectItem>
                  <SelectItem value="enabled">
                    {t("profileEditor.plugins.statusFilterEnabled")}
                  </SelectItem>
                  <SelectItem value="disabled">
                    {t("profileEditor.plugins.statusFilterDisabled")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* 类别筛选 */}
          {categoryOptions.length > 0 && (
            <div className={FILTER_CONTROL_CLASS}>
              <span
                className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground"
                aria-hidden="true"
              >
                {t("profileEditor.plugins.categoryFilterFieldLabel")}
              </span>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger
                  aria-label={t("profileEditor.plugins.categoryFilterLabel")}
                  className={FILTER_TRIGGER_CLASS}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">
                      {t("profileEditor.plugins.metadataFilterAll")}
                    </SelectItem>
                    {categoryOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 来源类型筛选 */}
          {sourceTypeOptions.length > 0 && (
            <div className={FILTER_CONTROL_CLASS}>
              <span
                className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground"
                aria-hidden="true"
              >
                {t("profileEditor.plugins.sourceTypeFilterFieldLabel")}
              </span>
              <Select value={sourceTypeFilter} onValueChange={setSourceTypeFilter}>
                <SelectTrigger
                  aria-label={t("profileEditor.plugins.sourceTypeFilterLabel")}
                  className={FILTER_TRIGGER_CLASS}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">
                      {t("profileEditor.plugins.metadataFilterAll")}
                    </SelectItem>
                    {sourceTypeOptions.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt === "unknown"
                          ? t("profileEditor.plugins.sourceTypeUnknown")
                          : opt === "path"
                            ? t("profileEditor.plugins.sourceTypePath")
                            : opt}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* 状态栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{summary}</span>
        <div className="flex flex-wrap items-center gap-3">
          {unsupportedCount > 0 && (
            <span>
              {formatTemplate(t("profileEditor.plugins.browse.unsupportedSourceHint"), {
                count: unsupportedCount,
              })}
            </span>
          )}
          {failures.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto cursor-pointer p-0 text-xs text-primary hover:bg-transparent hover:underline"
                >
                  {failureSummary}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="mb-2 text-sm font-semibold">
                  {t("profileEditor.plugins.browse.failurePopoverTitle")}
                </div>
                {failures.map((failure) => (
                  <div
                    key={failure.marketplaceId}
                    className="flex items-center justify-between border-t border-border py-2 text-sm"
                  >
                    <div>
                      <div>{failure.marketplaceId}</div>
                      {failure.error && (
                        <div className="text-xs text-muted-foreground">{failure.error}</div>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void refreshOne(failure.marketplaceId)}
                    >
                      {t("profileEditor.plugins.browse.failureRetry")}
                    </Button>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* 插件列表 */}
      {filtered.length === 0 ? (
        <Empty>
          <EmptyTitle>
            {failures.length > 0 &&
            failures.length === Object.values(byMarketplace).filter((e) => !e.unsupported).length
              ? t("profileEditor.plugins.browse.emptyAllFailed")
              : t("profileEditor.plugins.browse.emptyNoMatch")}
          </EmptyTitle>
        </Empty>
      ) : (
        <div
          className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
          data-slot="browse-list"
        >
          <p className="m-0 hidden border-b border-border px-3.5 py-2 text-xs text-muted-foreground max-[640px]:block">
            {formatTemplate(t("profileEditor.plugins.browse.currentSortHint"), {
              sort: sortHintLabel,
            })}
          </p>
          <div className="grid grid-cols-[32px_minmax(0,1fr)_minmax(88px,104px)_clamp(152px,16vw,190px)] items-center gap-x-3 border-b border-border px-3.5 py-2.5 text-xs font-semibold text-muted-foreground max-[640px]:hidden">
            <span className="inline-flex items-center justify-center tabular-nums">
              {t("profileEditor.common.index")}
            </span>
            <span
              className="inline-flex min-w-0 items-center"
              role="columnheader"
              tabIndex={-1}
              aria-sort={sortMode === "pluginId" ? getAriaSort(sortDirection) : "none"}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={getSortButtonLabel("pluginId")}
                className={cn(
                  "-mx-2 h-7 justify-start gap-1.5 px-2 text-xs font-semibold text-muted-foreground hover:bg-transparent hover:text-foreground",
                  sortMode === "pluginId" && "text-foreground",
                )}
                onClick={() => handleSort("pluginId")}
              >
                {t("profileEditor.plugins.columnId")}
                {renderSortIcon("pluginId")}
              </Button>
            </span>
            <span
              className="inline-flex min-w-0 items-center justify-end"
              role="columnheader"
              tabIndex={-1}
              aria-sort={sortMode === "installCount" ? getAriaSort(sortDirection) : "none"}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={getSortButtonLabel("installCount")}
                className={cn(
                  "-mx-2 h-7 justify-end gap-1.5 px-2 text-xs font-semibold text-muted-foreground hover:bg-transparent hover:text-foreground",
                  sortMode === "installCount" && "text-foreground",
                )}
                onClick={() => handleSort("installCount")}
              >
                {t("profileEditor.plugins.browse.columnInstallCount")}
                {renderSortIcon("installCount")}
              </Button>
            </span>
            <span className="text-right">{t("profileEditor.common.actions")}</span>
          </div>

          {filtered.map((plugin, index) => {
            const configured = enabledMap.has(plugin.pluginId);
            const subTitle = [plugin.authorName, plugin.marketplaceId].filter(Boolean).join(" · ");
            const details = [plugin.description, subTitle].filter(Boolean).join(" · ");
            const expanded = expandedPluginIds.has(plugin.pluginId);
            const canExpandDetails = details.length > DETAILS_COLLAPSE_THRESHOLD;
            const detailsTooltip = expanded
              ? t("profileEditor.plugins.browse.collapseDetailsTooltip")
              : t("profileEditor.plugins.browse.expandDetailsTooltip");
            const rowLabel = plugin.pluginId;
            const displayName = plugin.pluginId.split("@")[0];

            return (
              <div
                key={plugin.pluginId}
                data-slot="browse-row"
                className="grid grid-cols-[32px_minmax(0,1fr)_minmax(88px,104px)_clamp(152px,16vw,190px)] items-start gap-x-3 border-t border-border px-3.5 py-3 text-sm font-medium leading-[1.4] first:border-t-0 max-[640px]:grid-cols-[32px_minmax(0,1fr)] max-[640px]:gap-y-2"
              >
                <span className="inline-flex items-start justify-center pt-0.5 text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {plugin.homepage ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="group h-auto min-w-0 max-w-full justify-start whitespace-normal bg-transparent p-0 text-left text-[inherit] font-[inherit] hover:bg-transparent hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        aria-label={`${t("profileEditor.plugins.openHomepageAriaLabel")} ${rowLabel}`}
                        title={plugin.homepage}
                        onClick={() => {
                          void openUrl(plugin.homepage);
                        }}
                      >
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 break-words">{displayName}</span>
                          <ExternalLink
                            className="size-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                            aria-hidden="true"
                          />
                        </span>
                      </Button>
                    ) : (
                      <span className="min-w-0 break-words">{displayName}</span>
                    )}
                    {plugin.isOfficial && (
                      <span
                        className="inline-flex shrink-0 items-center text-chart-2 opacity-80"
                        role="img"
                        aria-label={t("profileEditor.plugins.verifiedBadgeAriaLabel")}
                      >
                        <CircleCheck className="size-[13px]" aria-hidden="true" />
                      </span>
                    )}
                    {plugin.category && (
                      <Badge variant="outline" className="max-w-full whitespace-normal break-words">
                        {plugin.category}
                      </Badge>
                    )}
                  </div>
                  {details && (
                    <div className="mt-1.5 min-w-0">
                      {canExpandDetails ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              asChild
                              variant="ghost"
                              className={cn(
                                "h-auto w-full cursor-pointer justify-start whitespace-normal rounded-md bg-transparent p-0 text-left text-xs font-[inherit] leading-relaxed text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                                !expanded && "line-clamp-3",
                              )}
                            >
                              <span
                                role="button"
                                tabIndex={0}
                                title={detailsTooltip}
                                aria-expanded={expanded}
                                aria-label={`${expanded ? t("profileEditor.plugins.browse.collapseDetailsAriaLabel") : t("profileEditor.plugins.browse.expandDetailsAriaLabel")} ${rowLabel}`}
                                data-expanded={expanded ? "true" : "false"}
                                data-testid={`marketplace-plugin-details-${plugin.pluginId}`}
                                onClick={() => toggleDetails(plugin.pluginId)}
                                onKeyDown={(event) => handleDetailsKeyDown(event, plugin.pluginId)}
                              >
                                {details}
                              </span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={6}>
                            {detailsTooltip}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <div
                          className="min-w-0 whitespace-normal break-words text-xs leading-relaxed text-muted-foreground"
                          data-expanded="true"
                          data-testid={`marketplace-plugin-details-${plugin.pluginId}`}
                        >
                          {details}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 items-start justify-end pt-0.5 text-xs font-medium text-muted-foreground tabular-nums max-[640px]:col-start-2 max-[640px]:justify-start max-[640px]:pt-0">
                  <span className="hidden shrink-0 text-muted-foreground max-[640px]:inline">
                    {t("profileEditor.plugins.browse.columnInstallCount")}:
                  </span>
                  <span className="max-[640px]:ml-1">{formatInstallCount(plugin.pluginId)}</span>
                </div>
                <div className="flex justify-end max-[640px]:col-start-2 max-[640px]:justify-start">
                  {configured ? (
                    <div className="flex flex-wrap items-center justify-end gap-2 max-[640px]:justify-start">
                      <Badge variant="secondary">
                        <CircleCheck className="size-3" aria-hidden="true" />
                        {t("profileEditor.plugins.browse.actionConfigured")}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onManagePlugin(plugin.pluginId)}
                      >
                        <Settings2 className="size-3.5" aria-hidden="true" />
                        {t("profileEditor.plugins.browse.actionManage")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      onClick={() => onAddPlugin(plugin.pluginId)}
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      {t("profileEditor.plugins.browse.actionEnable")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="m-0 text-center text-xs text-muted-foreground">
          {formatTemplate(t("profileEditor.plugins.browse.sortHint"), {
            start: 1,
            end: filtered.length,
            total: allPlugins.length,
            sort: sortHintLabel,
          })}
        </p>
      )}
    </div>
  );
}
