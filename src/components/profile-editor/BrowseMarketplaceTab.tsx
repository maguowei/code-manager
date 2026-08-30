import { useVirtualizer } from "@tanstack/react-virtual";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowDown, ArrowUp, ArrowUpDown, CircleCheck, Info, RefreshCw, Store } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n";
import { ipc } from "../../ipc";
import { Button } from "../ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
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
import { formatShortDateTime } from "../usage/format";
import MarketplacePluginRow from "./MarketplacePluginRow";
import type { MarketplacePluginEntry } from "./marketplace-catalog";
import { getProviderAffiliation } from "./marketplace-catalog";
import { estimatePluginRowSize } from "./marketplace-plugin-row-utils";
import { OFFICIAL_MARKETPLACE_ID, OFFICIAL_MARKETPLACE_REPO } from "./marketplace-presets";
import {
  emptyPluginCatalog,
  loadPluginCatalog,
  type PluginCatalog,
  type PluginInstallCounts,
} from "./plugin-install-counts";
import type { PluginEntry } from "./useEnabledPluginsState";
import type { MarketplaceSourceInput } from "./useMarketplaceCatalog";
import { useMarketplaceCatalog } from "./useMarketplaceCatalog";

export interface AddMarketplaceInput {
  marketplaceId: string;
  repo: string;
  ref: string;
  path: string;
}

interface BrowseMarketplaceTabProps {
  sources: MarketplaceSourceInput[];
  plugins: PluginEntry[];
  active: boolean;
  onAddPlugin: (pluginId: string) => boolean;
  onManagePlugin: (pluginId: string) => void;
  existingMarketplaceIds?: string[];
  onAddMarketplace?: (input: AddMarketplaceInput) => void;
  onOpenAdvancedConfig?: () => void;
}

function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

const FILTER_CONTROL_CLASS =
  "flex h-10 min-w-[160px] items-center gap-2 rounded-md border border-border bg-card px-2.5 transition-[border-color,box-shadow,transform] focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-muted-foreground";
const FILTER_TRIGGER_CLASS =
  "h-full min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus:ring-0";
const MIN_REFRESH_FEEDBACK_MS = 500;
// 虚拟化列表可视区高度上限。插件分区嵌在 accordion 内的可滚动抽屉里，没有确定的可用高度可跟随，
// 故用固定上限而非 flex-1 min-h-0；类名契约在 BrowseMarketplaceTab.test.tsx 中断言。
const PLUGIN_LIST_SCROLL_CLASS = "max-h-[480px] overflow-y-auto overscroll-contain";

type MarketplaceSortMode = "pluginId" | "installCount";
type SortDirection = "asc" | "desc";
type ProviderFilter = "all" | "anthropic" | "partner";

// 官方 marketplace 仓库 commit 基址，用于 marketplace SHA 外链
const OFFICIAL_MARKETPLACE_COMMIT_BASE =
  "https://github.com/anthropics/claude-plugins-official/commit/";

// catalog 元信息的 ISO 时间 -> 本地短时间；空或非法返回占位符
function formatCatalogTime(iso: string | null): string {
  if (!iso) {
    return "-";
  }
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? "-" : formatShortDateTime(ms);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAriaSort(direction: SortDirection): "ascending" | "descending" {
  return direction === "asc" ? "ascending" : "descending";
}

// owner/repo 格式校验
const GITHUB_REPO_PATTERN = /^[^/\s]+\/[^/\s]+$/;

// 浏览页快速添加 github 插件市场的轻量 Popover：一键官方 + 自定义仓库
function AddMarketplacePopover({
  existingMarketplaceIds,
  onAddMarketplace,
  onOpenAdvancedConfig,
  trigger,
}: {
  existingMarketplaceIds: string[];
  onAddMarketplace: (input: AddMarketplaceInput) => void;
  onOpenAdvancedConfig?: () => void;
  trigger: ReactNode;
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [repo, setRepo] = useState("");
  const [error, setError] = useState("");

  const officialPresent = existingMarketplaceIds.includes(OFFICIAL_MARKETPLACE_ID);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setRepo("");
      setError("");
    }
  }

  function handleAddOfficial() {
    onAddMarketplace({
      marketplaceId: OFFICIAL_MARKETPLACE_ID,
      repo: OFFICIAL_MARKETPLACE_REPO,
      ref: "",
      path: "",
    });
    showToast(t("profileEditor.plugins.browse.addMarketplaceSuccess"), "success");
    handleOpenChange(false);
  }

  function handleSubmit() {
    const trimmedRepo = repo.trim();
    if (!trimmedRepo) {
      setError(t("profileEditor.plugins.browse.addMarketplaceErrorRepoEmpty"));
      return;
    }
    if (!GITHUB_REPO_PATTERN.test(trimmedRepo)) {
      setError(t("profileEditor.plugins.browse.addMarketplaceErrorRepoInvalid"));
      return;
    }
    // 名称默认取仓库末段；冲突时引导用高级配置自定义
    const marketplaceId = trimmedRepo.split("/")[1]?.trim() ?? "";
    if (existingMarketplaceIds.includes(marketplaceId)) {
      setError(t("profileEditor.plugins.browse.addMarketplaceErrorIdDuplicate"));
      return;
    }
    onAddMarketplace({ marketplaceId, repo: trimmedRepo, ref: "", path: "" });
    showToast(t("profileEditor.plugins.browse.addMarketplaceSuccess"), "success");
    handleOpenChange(false);
  }

  function handleOpenAdvanced() {
    handleOpenChange(false);
    onOpenAdvancedConfig?.();
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-3">
          <div className="text-sm font-semibold">
            {t("profileEditor.plugins.browse.addMarketplaceTitle")}
          </div>
          {!officialPresent && (
            <>
              <Button
                type="button"
                variant="secondary"
                className="justify-start gap-1.5"
                onClick={handleAddOfficial}
              >
                <CircleCheck className="size-3.5" aria-hidden="true" />
                {t("profileEditor.plugins.browse.addMarketplaceOfficial")}
              </Button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t("profileEditor.plugins.browse.addMarketplaceOr")}
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("profileEditor.plugins.browse.addMarketplaceRepoLabel")}
            </span>
            <Input
              value={repo}
              placeholder="owner/repo"
              aria-label={t("profileEditor.plugins.browse.addMarketplaceRepoLabel")}
              onChange={(event) => {
                setRepo(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </label>
          {error ? <p className="m-0 text-xs font-medium text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
            >
              {t("profileEditor.common.cancel")}
            </Button>
            <Button type="button" size="sm" onClick={handleSubmit}>
              {t("profileEditor.plugins.browse.addMarketplaceSubmit")}
            </Button>
          </div>
          {onOpenAdvancedConfig ? (
            <Button
              type="button"
              variant="link"
              className="h-auto justify-start p-0 text-xs font-normal text-muted-foreground hover:text-foreground"
              onClick={handleOpenAdvanced}
            >
              {t("profileEditor.plugins.browse.addMarketplaceAdvanced")}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function BrowseMarketplaceTab({
  sources,
  plugins,
  active,
  onAddPlugin,
  onManagePlugin,
  existingMarketplaceIds = [],
  onAddMarketplace,
  onOpenAdvancedConfig,
}: BrowseMarketplaceTabProps) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const { byMarketplace, refreshAll, refreshOne } = useMarketplaceCatalog({ sources, active });
  const [searchQuery, setSearchQuery] = useState("");
  // 输入即时回显，列表用延迟值：快速键入时 filter+sort 与重渲染不阻塞输入
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [marketplaceFilter, setMarketplaceFilter] = useState<"all" | string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | string>("all");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [sortMode, setSortMode] = useState<MarketplaceSortMode>("installCount");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [catalog, setCatalog] = useState<PluginCatalog>(() => emptyPluginCatalog());
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [expandedPluginIds, setExpandedPluginIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!active || sources.length === 0) return;
    let cancelled = false;
    void loadPluginCatalog().then((next) => {
      if (!cancelled) {
        setCatalog(next);
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

  // 从 catalog 派生安装数映射，供排序与展示复用
  const installCounts = useMemo<PluginInstallCounts>(() => {
    const counts: PluginInstallCounts = {};
    for (const [pluginId, entry] of Object.entries(catalog.entries)) {
      if (typeof entry.installCount === "number") {
        counts[pluginId] = entry.installCount;
      }
    }
    return counts;
  }, [catalog]);

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

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-US"),
    [language],
  );

  const filtered = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    const comparePluginId = (a: MarketplacePluginEntry, b: MarketplacePluginEntry) =>
      a.pluginId.localeCompare(b.pluginId, undefined, { sensitivity: "base" });
    return allPlugins
      .filter((plugin) => {
        if (marketplaceFilter !== "all" && plugin.marketplaceId !== marketplaceFilter) return false;
        if (statusFilter === "enabled" && !enabledMap.get(plugin.pluginId)) return false;
        if (statusFilter === "disabled" && enabledMap.get(plugin.pluginId)) return false;
        if (categoryFilter !== "all" && plugin.category !== categoryFilter) return false;
        if (providerFilter !== "all" && getProviderAffiliation(plugin) !== providerFilter)
          return false;
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
    deferredSearchQuery,
    enabledMap,
    installCounts,
    marketplaceFilter,
    providerFilter,
    sortDirection,
    sortMode,
    statusFilter,
  ]);

  // useCallback 稳定引用，行组件 memo 依赖回调不变化才拦截重渲染
  const toggleDetails = useCallback((pluginId: string) => {
    setExpandedPluginIds((current) => {
      const next = new Set(current);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      return next;
    });
  }, []);

  const handleDetailsKeyDown = useCallback(
    (event: KeyboardEvent<HTMLSpanElement>, pluginId: string) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleDetails(pluginId);
    },
    [toggleDetails],
  );

  // 稳定化父级传入的回调（父级内联箭头每次 render 新建引用，会击穿行组件 memo）
  const handleAddPlugin = useCallback(
    (pluginId: string) => {
      onAddPlugin(pluginId);
    },
    [onAddPlugin],
  );
  const handleManagePlugin = useCallback(
    (pluginId: string) => {
      onManagePlugin(pluginId);
    },
    [onManagePlugin],
  );

  // 虚拟化：只渲染可视行，292 行市场下把每行 7 个 Tooltip 的开销从 ~2000 个降到 ~100 个。
  // 代价是浏览器 Cmd+F 只能命中已渲染行；该场景由应用内搜索框覆盖，
  // 行数语义通过 role=list + aria-setsize/aria-posinset 暴露给辅助技术。
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const plugin = filtered[index];
      const containerWidth = scrollRef.current?.clientWidth || scrollRef.current?.offsetWidth;
      return estimatePluginRowSize(
        plugin,
        catalog,
        plugin ? expandedPluginIds.has(plugin.pluginId) : false,
        containerWidth,
      );
    },
    overscan: 8,
    // index 可能是 -1：virtual-core 的 indexFromElement 在 data-index 缺失时只 console.warn 并返回 -1，
    // 随后无条件调用 getItemKey，越界解引用会在 ref 回调内抛错卸载整个插件分区
    getItemKey: (index) => filtered[index]?.pluginId ?? String(index),
  });
  const virtualItems = virtualizer.getVirtualItems();

  // 筛选/排序条件变化后列表内容整体替换，保留旧 scrollOffset 会让虚拟化停在新结果集尾部
  // （calculateRange 用旧偏移对新 measurements 做二分查找，startIndex 被 clamp 到接近末尾）。
  // 直接写 DOM scrollTop：真实浏览器会派发 scroll 事件让 virtualizer 同步偏移，
  // 而 virtualizer.scrollToOffset 底层走 scrollElement.scrollTo，jsdom 未实现该方法。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 依赖表是刻意的触发器——只列筛选/排序输入，不含 filtered，否则启用插件导致 filtered 重算时列表会跳回顶部
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) {
      scroller.scrollTop = 0;
    }
  }, [
    deferredSearchQuery,
    marketplaceFilter,
    statusFilter,
    categoryFilter,
    providerFilter,
    sortMode,
    sortDirection,
  ]);

  if (sources.length === 0) {
    return (
      <Empty>
        <EmptyTitle>{t("profileEditor.plugins.browse.emptyNoMarketplace")}</EmptyTitle>
        <EmptyDescription>
          {t("profileEditor.plugins.browse.emptyNoMarketplaceHint")}
        </EmptyDescription>
        {onAddMarketplace ? (
          <EmptyContent>
            <AddMarketplacePopover
              existingMarketplaceIds={existingMarketplaceIds}
              onAddMarketplace={onAddMarketplace}
              onOpenAdvancedConfig={onOpenAdvancedConfig}
              trigger={
                <Button type="button" className="gap-1.5">
                  <Store className="size-3.5" aria-hidden="true" />
                  {t("profileEditor.plugins.browse.addMarketplace")}
                </Button>
              }
            />
          </EmptyContent>
        ) : null}
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
      // catalog 缓存重拉后重读完整 catalog（本地读取，廉价）
      const next = await loadPluginCatalog();
      setCatalog(next);
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

          {onAddMarketplace ? (
            <AddMarketplacePopover
              existingMarketplaceIds={existingMarketplaceIds}
              onAddMarketplace={onAddMarketplace}
              onOpenAdvancedConfig={onOpenAdvancedConfig}
              trigger={
                <Button type="button" variant="outline" className="h-10 shrink-0 gap-1.5">
                  <Store className="size-3.5" aria-hidden="true" />
                  {t("profileEditor.plugins.browse.addMarketplace")}
                </Button>
              }
            />
          ) : null}
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

          {/* 提供方筛选（Anthropic 第一方 / 其他） */}
          <div className={FILTER_CONTROL_CLASS}>
            <span
              className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground"
              aria-hidden="true"
            >
              {t("profileEditor.plugins.browse.providerFilterFieldLabel")}
            </span>
            <Select
              value={providerFilter}
              onValueChange={(value) => setProviderFilter(value as ProviderFilter)}
            >
              <SelectTrigger
                aria-label={t("profileEditor.plugins.browse.providerFilterLabel")}
                className={FILTER_TRIGGER_CLASS}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">
                    {t("profileEditor.plugins.metadataFilterAll")}
                  </SelectItem>
                  <SelectItem value="anthropic">
                    {t("profileEditor.plugins.browse.providerAnthropic")}
                  </SelectItem>
                  <SelectItem value="partner">
                    {t("profileEditor.plugins.browse.providerPartner")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* 状态栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{summary}</span>
        <div className="flex flex-wrap items-center gap-3">
          {catalog.meta.generatedAt && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto cursor-pointer gap-1 p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                  aria-label={t("profileEditor.plugins.browse.catalogMetaAriaLabel")}
                >
                  <Info className="size-3.5" aria-hidden="true" />
                  {t("profileEditor.plugins.browse.catalogMetaTrigger")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="mb-2 text-sm font-semibold">
                  {t("profileEditor.plugins.browse.catalogMetaTitle")}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">
                    {t("profileEditor.plugins.browse.catalogMetaGeneratedAt")}
                  </dt>
                  <dd className="text-right tabular-nums">
                    {formatCatalogTime(catalog.meta.generatedAt)}
                  </dd>
                  <dt className="text-muted-foreground">
                    {t("profileEditor.plugins.browse.catalogMetaFetchedAt")}
                  </dt>
                  <dd className="text-right tabular-nums">
                    {formatCatalogTime(catalog.meta.fetchedAt)}
                  </dd>
                  <dt className="text-muted-foreground">
                    {t("profileEditor.plugins.browse.catalogMetaInstallsGeneratedAt")}
                  </dt>
                  <dd className="text-right tabular-nums">
                    {formatCatalogTime(catalog.meta.installsGeneratedAt)}
                  </dd>
                  {catalog.meta.marketplaceSha && (
                    <>
                      <dt className="text-muted-foreground">
                        {t("profileEditor.plugins.browse.catalogMetaMarketplaceSha")}
                      </dt>
                      <dd className="text-right">
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 font-mono text-xs"
                          onClick={() =>
                            void openUrl(
                              `${OFFICIAL_MARKETPLACE_COMMIT_BASE}${catalog.meta.marketplaceSha}`,
                            )
                          }
                        >
                          {catalog.meta.marketplaceSha.slice(0, 7)}
                        </Button>
                      </dd>
                    </>
                  )}
                </dl>
              </PopoverContent>
            </Popover>
          )}
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
          <div ref={scrollRef} className={PLUGIN_LIST_SCROLL_CLASS} data-slot="browse-scroll">
            {/* 表头必须与行同处滚动容器内：否则滚动条宽度只从行网格里扣，两侧 grid 模板宽度不一致导致列错位。
                sticky 自带 bg-card 遮挡下方滚动的行；z-sticky 使用全局语义层级 token。 */}
            <div
              data-slot="browse-header"
              className="sticky top-0 z-sticky grid grid-cols-[32px_minmax(0,1fr)_minmax(88px,104px)_clamp(152px,16vw,190px)] items-center gap-x-3 border-b border-border bg-card px-3.5 py-2.5 text-xs font-semibold text-muted-foreground max-[640px]:hidden"
            >
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

            {/* 表头在流内占位使 spacer 起点下移约 37px，virtualizer 的 scrollOffset 与 item 坐标系
                因此有同等偏差。不设 scrollMargin：偏差只让 startIndex 晚 1 行以内，被 overscan: 8 完全吸收。 */}
            <div
              className="relative w-full"
              role="list"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualItems.map((virtualItem) => {
                const plugin = filtered[virtualItem.index];
                if (!plugin) return null;
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                    role="listitem"
                    aria-setsize={filtered.length}
                    aria-posinset={virtualItem.index + 1}
                  >
                    <MarketplacePluginRow
                      plugin={plugin}
                      index={virtualItem.index}
                      configured={enabledMap.has(plugin.pluginId)}
                      expanded={expandedPluginIds.has(plugin.pluginId)}
                      installCount={installCounts[plugin.pluginId] ?? null}
                      components={catalog.entries[plugin.pluginId]?.components}
                      numberFormatter={numberFormatter}
                      onToggleDetails={toggleDetails}
                      onDetailsKeyDown={handleDetailsKeyDown}
                      onAddPlugin={handleAddPlugin}
                      onManagePlugin={handleManagePlugin}
                    />
                  </div>
                );
              })}
            </div>
          </div>
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
