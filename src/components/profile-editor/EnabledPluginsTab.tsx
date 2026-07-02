import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleCheck, ExternalLink, Store, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n";
import ConfirmAlertDialog from "../ConfirmAlertDialog";
import { Button } from "../ui/button";
import { Empty, EmptyContent, EmptyTitle } from "../ui/empty";
import { InputGroup, InputGroupInput } from "../ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import type { PluginDraft } from "./editor-utils";
import type { MarketplacePluginEntry } from "./marketplace-catalog";
import { OFFICIAL_MARKETPLACE_ID } from "./marketplace-presets";
import { SandboxSwitchControl } from "./SandboxEditor";
import type { PluginEntry } from "./useEnabledPluginsState";

interface EnabledPluginsTabProps {
  plugins: PluginEntry[];
  metadataMap: Record<string, MarketplacePluginEntry>;
  onTogglePlugin: (pluginId: string) => void;
  onRemovePlugin: (pluginId: string) => void;
  onGoBrowse: () => void;
  onError: (message: string) => void;
  manageTarget?: { pluginId: string; requestId: number } | null;
}

type PluginStatusFilter = "all" | "enabled" | "disabled";
type PluginMetadataFilterValue = "all" | string;
type PluginMetaItem = {
  kind: "author" | "category";
  value: string;
};

interface PluginListItem extends PluginDraft {
  metadata?: MarketplacePluginEntry;
}

function isOfficialPlugin(pluginId: string): boolean {
  return pluginId.endsWith(`@${OFFICIAL_MARKETPLACE_ID}`);
}

function buildPluginMetaItems(metadata?: MarketplacePluginEntry): PluginMetaItem[] {
  const metaItems: PluginMetaItem[] = [
    { kind: "author", value: metadata?.authorName.trim() ?? "" },
    { kind: "category", value: metadata?.category.trim() ?? "" },
  ];
  return metaItems.filter((item) => item.value.length > 0);
}

function buildFilterOptions(values: string[], selectedValue: string): string[] {
  const uniqueValues = Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );
  if (selectedValue !== "all" && !uniqueValues.includes(selectedValue)) {
    return [selectedValue, ...uniqueValues];
  }
  return uniqueValues;
}

function EnabledPluginsTab({
  plugins,
  metadataMap,
  onTogglePlugin,
  onRemovePlugin,
  onGoBrowse,
  onError,
  manageTarget,
}: EnabledPluginsTabProps) {
  const { t } = useI18n();
  const managedRowRef = useRef<HTMLDivElement | null>(null);
  const [pendingDeletePlugin, setPendingDeletePlugin] = useState<PluginEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PluginStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<PluginMetadataFilterValue>("all");

  const searchLabel = t("profileEditor.plugins.searchLabel");
  const searchPlaceholder = t("profileEditor.plugins.searchPlaceholder");
  const statusFilterLabel = t("profileEditor.plugins.statusFilterLabel");
  const statusFilterFieldLabel = t("profileEditor.plugins.statusFilterFieldLabel");
  const categoryFilterLabel = t("profileEditor.plugins.categoryFilterLabel");
  const categoryFilterFieldLabel = t("profileEditor.plugins.categoryFilterFieldLabel");
  const verifiedBadgeAriaLabel = t("profileEditor.plugins.verifiedBadgeAriaLabel");
  const rowStatusOnText = t("profileEditor.plugins.statusEnabled");
  const rowStatusOffText = t("profileEditor.plugins.statusNotEnabled");
  const deleteDialogTitle = t("profileEditor.plugins.deleteDialogTitle");
  const deleteDialogConfirmText = t("profileEditor.common.delete");
  const deleteDialogCancelText = t("profileEditor.common.cancel");
  const filteredEmptyHint = t("profileEditor.plugins.filteredEmptyHint");
  const managedPluginId = manageTarget?.pluginId;
  const manageRequestId = manageTarget?.requestId;

  // 去掉手动添加后插件区不再产生编辑错误，清空可能残留的分区错误
  useEffect(() => {
    onError("");
  }, [onError]);

  // --- 筛选逻辑 ---
  const metadataEnabledPlugins = useMemo(
    () =>
      plugins
        .map((plugin) => metadataMap[plugin.pluginId])
        .filter((plugin): plugin is MarketplacePluginEntry => plugin !== undefined),
    [metadataMap, plugins],
  );

  const categoryOptions = useMemo(
    () =>
      buildFilterOptions(
        metadataEnabledPlugins.map((plugin) => plugin.category),
        categoryFilter,
      ),
    [categoryFilter, metadataEnabledPlugins],
  );
  const hasMetadataFilters = categoryFilter !== "all";

  const filteredPlugins = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return plugins.filter((plugin) => {
      const metadata = metadataMap[plugin.pluginId];
      const matchesQuery =
        normalizedQuery.length === 0 || plugin.pluginId.toLowerCase().includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "all" || (statusFilter === "enabled" ? plugin.enabled : !plugin.enabled);
      if (hasMetadataFilters && !metadata) {
        return false;
      }
      const matchesCategory = categoryFilter === "all" || metadata?.category === categoryFilter;
      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [categoryFilter, hasMetadataFilters, metadataMap, plugins, searchQuery, statusFilter]);

  const visiblePlugins = useMemo<PluginListItem[]>(
    () =>
      filteredPlugins.map((plugin) => ({
        ...plugin,
        metadata: metadataMap[plugin.pluginId],
      })),
    [filteredPlugins, metadataMap],
  );

  const managedTargetVisible = useMemo(
    () =>
      Boolean(
        manageTarget && visiblePlugins.some((plugin) => plugin.pluginId === manageTarget.pluginId),
      ),
    [manageTarget, visiblePlugins],
  );

  useEffect(() => {
    if (!manageTarget) return;
    setSearchQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
  }, [manageTarget]);

  useEffect(() => {
    if (!manageTarget || !managedTargetVisible) return;
    const targetRow = managedRowRef.current;
    if (!targetRow) return;
    targetRow.scrollIntoView?.({ block: "center", behavior: "smooth" });
    targetRow.focus({ preventScroll: true });
  }, [manageTarget, managedTargetVisible]);

  const showFilteredEmptyState = plugins.length > 0 && filteredPlugins.length === 0;

  return (
    <div className="flex flex-col gap-3.5">
      {plugins.length === 0 ? (
        <Empty>
          <EmptyTitle>{t("profileEditor.plugins.emptyEnabled")}</EmptyTitle>
          <EmptyContent>
            <Button type="button" onClick={onGoBrowse}>
              {t("profileEditor.plugins.emptyEnabledGoBrowse")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex w-full flex-nowrap items-stretch gap-3 max-[1120px]:flex-wrap max-[520px]:flex-col">
              <InputGroup className="h-[42px] min-w-0 flex-[2_1_0] bg-card px-2.5 hover:border-muted-foreground max-[520px]:flex-auto">
                <InputGroupInput
                  type="text"
                  className="h-full px-0 py-0"
                  value={searchQuery}
                  aria-label={searchLabel}
                  placeholder={searchPlaceholder}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </InputGroup>
              <div className="flex h-[42px] min-w-[150px] flex-[1_1_0] items-center gap-2 rounded-md border border-border bg-card px-2.5 transition-[border-color,box-shadow,transform] focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-muted-foreground max-[520px]:flex-auto">
                <span
                  className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground"
                  aria-hidden="true"
                >
                  {statusFilterFieldLabel}
                </span>
                <Select
                  value={statusFilter}
                  onValueChange={(nextValue) => setStatusFilter(nextValue as PluginStatusFilter)}
                >
                  <SelectTrigger
                    aria-label={statusFilterLabel}
                    className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus:ring-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">
                        {t("profileEditor.plugins.statusFilterAll")}
                      </SelectItem>
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
              <div className="flex h-[42px] min-w-[150px] flex-[1_1_0] items-center gap-2 rounded-md border border-border bg-card px-2.5 transition-[border-color,box-shadow,transform] focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-muted-foreground max-[520px]:flex-auto">
                <span
                  className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground"
                  aria-hidden="true"
                >
                  {categoryFilterFieldLabel}
                </span>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger
                    aria-label={categoryFilterLabel}
                    className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus:ring-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">
                        {t("profileEditor.plugins.metadataFilterAll")}
                      </SelectItem>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {showFilteredEmptyState ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-border px-4 text-center">
                {filteredEmptyHint}
              </div>
            ) : (
              <div
                className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
                data-slot="plugin-list"
              >
                <div
                  className="grid grid-cols-[40px_minmax(0,1fr)_clamp(118px,12vw,132px)_52px] items-center gap-x-3 border-b border-border px-3.5 py-3 text-xs font-semibold text-muted-foreground max-[520px]:hidden"
                  aria-hidden="true"
                >
                  <span className="inline-flex items-center justify-center text-muted-foreground tabular-nums">
                    {t("profileEditor.common.index")}
                  </span>
                  <span>{t("profileEditor.plugins.columnId")}</span>
                  <span className="justify-self-start">
                    {t("profileEditor.plugins.columnStatus")}
                  </span>
                  <span className="w-full text-right">{t("profileEditor.common.actions")}</span>
                </div>

                {visiblePlugins.map((plugin, index) => {
                  const officialPlugin = isOfficialPlugin(plugin.pluginId);
                  const pluginMetaItems = buildPluginMetaItems(plugin.metadata);
                  const verifiedBadgeIcon = officialPlugin ? (
                    <span
                      className="inline-flex shrink-0 items-center justify-center text-chart-2 opacity-70 transition-opacity group-hover:opacity-90 group-focus-visible:opacity-90"
                      role="img"
                      aria-label={verifiedBadgeAriaLabel}
                    >
                      <CircleCheck className="size-[13px]" aria-hidden="true" />
                    </span>
                  ) : null;
                  const rowLabel = plugin.pluginId;
                  const isManagedTarget =
                    managedPluginId === plugin.pluginId && manageRequestId !== undefined;

                  return (
                    <div
                      key={plugin.id}
                      ref={isManagedTarget ? managedRowRef : undefined}
                      tabIndex={isManagedTarget ? -1 : undefined}
                      className={cn(
                        "flex flex-col border-t border-border px-3.5 py-2.5 text-sm font-medium leading-[1.4] outline-none first:border-t-0 max-[520px]:gap-3 max-[520px]:py-3",
                        isManagedTarget && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                      )}
                      data-slot="plugin-list-row"
                      data-managed-target={isManagedTarget ? "true" : undefined}
                    >
                      <div
                        className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)_52px] items-center gap-x-3 max-[520px]:grid-cols-[32px_minmax(0,1fr)_auto] max-[520px]:items-start max-[520px]:gap-x-2.5 max-[520px]:gap-y-2"
                        data-slot="plugin-list-main"
                      >
                        <span
                          className="inline-flex items-center justify-center text-[inherit] font-[inherit] text-muted-foreground tabular-nums max-[520px]:items-start max-[520px]:pt-0.5"
                          aria-hidden="true"
                        >
                          {index + 1}
                        </span>
                        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_clamp(118px,12vw,132px)] items-center gap-x-3 max-[520px]:grid-cols-1 max-[520px]:gap-y-2">
                          <div className="flex min-h-[42px] min-w-0 items-center font-[inherit] max-[520px]:min-h-0">
                            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                              {plugin.metadata?.homepage ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="group relative h-auto min-w-0 max-w-full justify-start whitespace-normal rounded-md bg-transparent p-0 text-left font-[inherit] text-[inherit] hover:bg-transparent hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                  aria-label={`${t("profileEditor.plugins.openHomepageAriaLabel")} ${rowLabel}`}
                                  title={plugin.metadata.description || undefined}
                                  data-description={plugin.metadata.description || undefined}
                                  onClick={() => {
                                    void openUrl(plugin.metadata?.homepage ?? "");
                                  }}
                                >
                                  <span className="inline-flex min-w-0 items-center gap-2">
                                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap max-[520px]:whitespace-normal max-[520px]:break-words">
                                      {rowLabel}
                                    </span>
                                    {verifiedBadgeIcon}
                                    <ExternalLink className="size-3.5" aria-hidden="true" />
                                  </span>
                                </Button>
                              ) : (
                                <span
                                  className="relative inline-flex min-w-0 items-center gap-2 font-[inherit] text-[inherit]"
                                  title={plugin.metadata?.description || undefined}
                                  data-description={plugin.metadata?.description || undefined}
                                >
                                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap max-[520px]:whitespace-normal max-[520px]:break-words">
                                    {rowLabel}
                                  </span>
                                  {verifiedBadgeIcon}
                                </span>
                              )}
                              {pluginMetaItems.length > 0 ? (
                                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium leading-snug text-muted-foreground">
                                  {pluginMetaItems.map((item, itemIndex) => (
                                    <Fragment key={`${plugin.id}:${item.kind}:${item.value}`}>
                                      {itemIndex > 0 ? (
                                        <span className="text-muted-foreground" aria-hidden="true">
                                          ·
                                        </span>
                                      ) : null}
                                      <span className="inline-flex min-w-0 items-center whitespace-nowrap max-[520px]:whitespace-normal max-[520px]:break-words">
                                        {item.value}
                                      </span>
                                    </Fragment>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex min-w-0 items-center justify-start gap-2.5 justify-self-start max-[520px]:flex-wrap">
                            <SandboxSwitchControl
                              enabled={plugin.enabled}
                              ariaLabel={`${t("profileEditor.plugins.statusAriaLabel")} ${rowLabel}`}
                              onToggle={() => onTogglePlugin(plugin.pluginId)}
                              variant="header"
                            />
                            <span
                              className={`whitespace-nowrap text-xs font-medium leading-tight${plugin.enabled ? " is-on text-chart-2" : " text-muted-foreground"}`}
                            >
                              {plugin.enabled ? rowStatusOnText : rowStatusOffText}
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-center self-center justify-self-end max-[520px]:items-start max-[520px]:justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="danger text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`${t("profileEditor.plugins.removeAriaLabel")} ${rowLabel}`}
                            onClick={() => {
                              setPendingDeletePlugin({
                                id: plugin.id,
                                pluginId: plugin.pluginId,
                                enabled: plugin.enabled,
                                committed: true,
                              });
                            }}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 底部常驻：引导前往插件市场发现并启用更多插件 */}
            <div className="flex flex-col items-center gap-2.5 rounded-lg border border-dashed border-border bg-card/40 px-4 py-5 text-center">
              <span className="text-sm text-muted-foreground">
                {t("profileEditor.plugins.browseMoreHint")}
              </span>
              <Button type="button" className="gap-1.5" onClick={onGoBrowse}>
                <Store className="size-4" aria-hidden="true" />
                {t("profileEditor.plugins.browseMoreAction")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {pendingDeletePlugin ? (
        <ConfirmAlertDialog
          title={deleteDialogTitle}
          message={t("profileEditor.plugins.deleteDialogMessage", {
            id: pendingDeletePlugin.pluginId,
          })}
          confirmText={deleteDialogConfirmText}
          cancelText={deleteDialogCancelText}
          danger
          onConfirm={() => {
            onRemovePlugin(pendingDeletePlugin.pluginId);
            setPendingDeletePlugin(null);
          }}
          onCancel={() => setPendingDeletePlugin(null)}
        />
      ) : null}
    </div>
  );
}

export default EnabledPluginsTab;
export type { EnabledPluginsTabProps };
