import { CircleCheck, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "../../i18n";
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
import type { MarketplacePluginEntry } from "./marketplace-catalog";
import type { PluginEntry } from "./useEnabledPluginsState";
import type { MarketplaceSourceInput } from "./useMarketplaceCatalog";
import { useMarketplaceCatalog } from "./useMarketplaceCatalog";

interface BrowseMarketplaceTabProps {
  sources: MarketplaceSourceInput[];
  plugins: PluginEntry[];
  active: boolean;
  onAddPlugin: (pluginId: string) => boolean;
  onTogglePlugin: (pluginId: string) => void;
}

function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

export default function BrowseMarketplaceTab({
  sources,
  plugins,
  active,
  onAddPlugin,
  onTogglePlugin,
}: BrowseMarketplaceTabProps) {
  const { t } = useI18n();
  const { byMarketplace, refreshAll, refreshOne } = useMarketplaceCatalog({ sources, active });
  const [searchQuery, setSearchQuery] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState<"all" | string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | string>("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<"all" | string>("all");
  const [hoverEnabledRow, setHoverEnabledRow] = useState<string | null>(null);

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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
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
      .sort((a, b) => a.pluginId.localeCompare(b.pluginId, undefined, { sensitivity: "base" }));
  }, [
    allPlugins,
    categoryFilter,
    enabledMap,
    marketplaceFilter,
    searchQuery,
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

  return (
    <div className="flex flex-col gap-3 pt-3">
      {/* 筛选栏 */}
      <div className="flex w-full flex-nowrap items-stretch gap-3 max-[1120px]:flex-wrap max-[520px]:flex-col">
        <InputGroup className="h-[42px] min-w-0 flex-[2.4_1_0] bg-card px-2.5 hover:border-muted-foreground">
          <InputGroupInput
            type="text"
            value={searchQuery}
            placeholder={t("profileEditor.plugins.browse.searchPlaceholder")}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-full px-0 py-0"
            aria-label={t("profileEditor.plugins.browse.searchPlaceholder")}
          />
        </InputGroup>

        {/* Marketplace 筛选 */}
        <div className="flex h-[42px] min-w-[150px] flex-[1_1_0] items-center gap-2 rounded-md border border-border bg-card px-2.5 transition-[border-color,box-shadow,transform] focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-muted-foreground max-[520px]:flex-auto">
          <span
            className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground"
            aria-hidden="true"
          >
            {t("profileEditor.plugins.browse.marketplaceFilterLabel")}
          </span>
          <Select value={marketplaceFilter} onValueChange={setMarketplaceFilter}>
            <SelectTrigger
              aria-label={t("profileEditor.plugins.browse.marketplaceFilterLabel")}
              className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus:ring-0"
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
        <div className="flex h-[42px] min-w-[150px] flex-[1_1_0] items-center gap-2 rounded-md border border-border bg-card px-2.5 transition-[border-color,box-shadow,transform] focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-muted-foreground max-[520px]:flex-auto">
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
              className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus:ring-0"
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
          <div className="flex h-[42px] min-w-[150px] flex-[1_1_0] items-center gap-2 rounded-md border border-border bg-card px-2.5 transition-[border-color,box-shadow,transform] focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-muted-foreground max-[520px]:flex-auto">
            <span
              className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground"
              aria-hidden="true"
            >
              {t("profileEditor.plugins.categoryFilterFieldLabel")}
            </span>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger
                aria-label={t("profileEditor.plugins.categoryFilterLabel")}
                className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus:ring-0"
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
          <div className="flex h-[42px] min-w-[150px] flex-[1_1_0] items-center gap-2 rounded-md border border-border bg-card px-2.5 transition-[border-color,box-shadow,transform] focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-muted-foreground max-[520px]:flex-auto">
            <span
              className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground"
              aria-hidden="true"
            >
              {t("profileEditor.plugins.sourceTypeFilterFieldLabel")}
            </span>
            <Select value={sourceTypeFilter} onValueChange={setSourceTypeFilter}>
              <SelectTrigger
                aria-label={t("profileEditor.plugins.sourceTypeFilterLabel")}
                className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus:ring-0"
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

        <Button
          type="button"
          variant="outline"
          className="h-[42px] shrink-0"
          onClick={() => void refreshAll()}
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {t("profileEditor.plugins.browse.refreshAll")}
        </Button>
      </div>

      {/* 状态栏 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{summary}</span>
        <div className="flex items-center gap-3">
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
          <div
            className="grid grid-cols-[32px_minmax(0,1fr)_80px] items-center gap-x-3 border-b border-border px-3.5 py-3 text-xs font-semibold text-muted-foreground"
            aria-hidden="true"
          >
            <span className="inline-flex items-center justify-center tabular-nums">
              {t("profileEditor.common.index")}
            </span>
            <span>{t("profileEditor.plugins.columnId")}</span>
            <span className="text-right">{t("profileEditor.common.actions")}</span>
          </div>

          {filtered.map((plugin, index) => {
            const enabled = enabledMap.get(plugin.pluginId) ?? false;
            const isHovering = hoverEnabledRow === plugin.pluginId;
            const subTitle = [plugin.authorName, plugin.category, plugin.marketplaceId]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={plugin.pluginId}
                data-slot="browse-row"
                className="grid grid-cols-[32px_minmax(0,1fr)_80px] items-center gap-x-3 border-t border-border px-3.5 py-2.5 text-sm font-medium leading-[1.4] first:border-t-0"
              >
                <span className="inline-flex items-center justify-center text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                      {plugin.pluginId.split("@")[0]}
                    </span>
                    {plugin.isOfficial && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-chart-2"
                        role="img"
                        aria-label={t("profileEditor.plugins.verifiedBadgeAriaLabel")}
                      >
                        <CircleCheck className="size-[13px]" aria-hidden="true" />
                        {t("profileEditor.plugins.browse.verifiedLabel")}
                      </span>
                    )}
                  </div>
                  {(plugin.description || subTitle) && (
                    <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">
                      {[plugin.description, subTitle].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  {enabled ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={isHovering ? "outline" : "default"}
                      className={
                        isHovering
                          ? "border-destructive text-destructive hover:bg-destructive/10"
                          : ""
                      }
                      onMouseEnter={() => setHoverEnabledRow(plugin.pluginId)}
                      onMouseLeave={() => setHoverEnabledRow(null)}
                      onClick={() => onTogglePlugin(plugin.pluginId)}
                    >
                      {isHovering
                        ? t("profileEditor.plugins.browse.actionDisable")
                        : t("profileEditor.plugins.browse.actionEnabled")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onAddPlugin(plugin.pluginId)}
                    >
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
          })}
        </p>
      )}
    </div>
  );
}
