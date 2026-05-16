import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleCheck, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n";
import ConfirmAlertDialog from "../ConfirmAlertDialog";
import { Button } from "../ui/button";
import { Empty, EmptyContent, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { InputGroup, InputGroupInput } from "../ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { createRowId, type PluginDraft } from "./editor-utils";
import type { MarketplacePluginEntry } from "./marketplace-catalog";
import { OFFICIAL_MARKETPLACE_ID } from "./marketplace-presets";
import RequiredBadge from "./RequiredBadge";
import { SandboxSwitchControl } from "./SandboxEditor";
import type { PluginEntry } from "./useEnabledPluginsState";

interface EnabledPluginsTabProps {
  plugins: PluginEntry[];
  metadataMap: Record<string, MarketplacePluginEntry>;
  onTogglePlugin: (pluginId: string) => void;
  onRemovePlugin: (pluginId: string) => void;
  onAddPlugin: (pluginId: string) => boolean;
  onGoBrowse: () => void;
  onError: (message: string) => void;
  manageTarget?: { pluginId: string; requestId: number } | null;
}

type PluginStatusFilter = "all" | "enabled" | "disabled";
type PluginMetadataFilterValue = "all" | string;
type PluginMetaItem = {
  kind: "author" | "category" | "marketplace";
  value: string;
};

interface PluginListItem extends PluginDraft {
  isDraft?: boolean;
  metadata?: MarketplacePluginEntry;
}

function isOfficialPlugin(pluginId: string): boolean {
  return pluginId.endsWith(`@${OFFICIAL_MARKETPLACE_ID}`);
}

function extractMarketplaceId(pluginId: string): string {
  const separatorIndex = pluginId.lastIndexOf("@");
  if (separatorIndex < 0 || separatorIndex === pluginId.length - 1) {
    return "";
  }
  return pluginId.slice(separatorIndex + 1).trim();
}

function buildPluginMetaItems(
  pluginId: string,
  metadata?: MarketplacePluginEntry,
): PluginMetaItem[] {
  const marketplaceId = metadata?.marketplaceId.trim() || extractMarketplaceId(pluginId);
  const metaItems: PluginMetaItem[] = [
    { kind: "author", value: metadata?.authorName.trim() ?? "" },
    { kind: "category", value: metadata?.category.trim() ?? "" },
    { kind: "marketplace", value: marketplaceId },
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
  onAddPlugin,
  onGoBrowse,
  onError,
  manageTarget,
}: EnabledPluginsTabProps) {
  const { t } = useI18n();
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const managedRowRef = useRef<HTMLDivElement | null>(null);
  const [draftActive, setDraftActive] = useState(false);
  const [draftPluginId, setDraftPluginId] = useState("");
  const [draftError, setDraftError] = useState("");
  const [pendingDeletePlugin, setPendingDeletePlugin] = useState<PluginEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PluginStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<PluginMetadataFilterValue>("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<PluginMetadataFilterValue>("all");

  const searchLabel = t("profileEditor.plugins.searchLabel");
  const searchPlaceholder = t("profileEditor.plugins.searchPlaceholder");
  const statusFilterLabel = t("profileEditor.plugins.statusFilterLabel");
  const statusFilterFieldLabel = t("profileEditor.plugins.statusFilterFieldLabel");
  const categoryFilterLabel = t("profileEditor.plugins.categoryFilterLabel");
  const categoryFilterFieldLabel = t("profileEditor.plugins.categoryFilterFieldLabel");
  const sourceTypeFilterLabel = t("profileEditor.plugins.sourceTypeFilterLabel");
  const sourceTypeFilterFieldLabel = t("profileEditor.plugins.sourceTypeFilterFieldLabel");
  const verifiedBadgeAriaLabel = t("profileEditor.plugins.verifiedBadgeAriaLabel");
  const rowStatusOnText = t("profileEditor.plugins.statusEnabled");
  const rowStatusOffText = t("profileEditor.plugins.statusNotEnabled");
  const deleteDialogTitle = t("profileEditor.plugins.deleteDialogTitle");
  const deleteDialogConfirmText = t("profileEditor.common.delete");
  const deleteDialogCancelText = t("profileEditor.common.cancel");
  const saveDraftAriaLabel = t("profileEditor.plugins.saveAriaLabel");
  const cancelEditAriaLabel = t("profileEditor.plugins.cancelEditAriaLabel");
  const draftRowLabel = t("profileEditor.plugins.newItem");
  const draftBadgeText = t("profileEditor.common.draft");
  const filteredEmptyHint = t("profileEditor.plugins.filteredEmptyHint");
  const managedPluginId = manageTarget?.pluginId;
  const manageRequestId = manageTarget?.requestId;

  // --- 错误聚合 ---
  useEffect(() => {
    if (draftError) {
      onError(draftError);
      return;
    }
    if (draftActive) {
      onError(t("profileEditor.plugins.errorPendingEdit"));
      return;
    }
    onError("");
  }, [draftActive, draftError, onError, t]);

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
  const sourceTypeOptions = useMemo(
    () =>
      buildFilterOptions(
        metadataEnabledPlugins.map((plugin) => plugin.sourceType),
        sourceTypeFilter,
      ),
    [metadataEnabledPlugins, sourceTypeFilter],
  );
  const hasMetadataFilters = categoryFilter !== "all" || sourceTypeFilter !== "all";

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
      const matchesSourceType =
        sourceTypeFilter === "all" || metadata?.sourceType === sourceTypeFilter;
      return matchesQuery && matchesStatus && matchesCategory && matchesSourceType;
    });
  }, [
    categoryFilter,
    hasMetadataFilters,
    metadataMap,
    plugins,
    searchQuery,
    sourceTypeFilter,
    statusFilter,
  ]);

  const visiblePlugins = useMemo<PluginListItem[]>(() => {
    const items: PluginListItem[] = filteredPlugins.map((plugin) => ({
      ...plugin,
      metadata: metadataMap[plugin.pluginId],
    }));
    if (draftActive) {
      items.push({
        id: createRowId("plugin-draft"),
        pluginId: draftPluginId,
        enabled: true,
        isDraft: true,
      });
    }
    return items;
  }, [draftActive, draftPluginId, filteredPlugins, metadataMap]);

  const managedTargetVisible = useMemo(
    () =>
      Boolean(
        manageTarget &&
          visiblePlugins.some(
            (plugin) => !plugin.isDraft && plugin.pluginId === manageTarget.pluginId,
          ),
      ),
    [manageTarget, visiblePlugins],
  );

  useEffect(() => {
    if (!manageTarget) return;
    setSearchQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setSourceTypeFilter("all");
  }, [manageTarget]);

  useEffect(() => {
    if (!manageTarget || !managedTargetVisible) return;
    const targetRow = managedRowRef.current;
    if (!targetRow) return;
    targetRow.scrollIntoView?.({ block: "center", behavior: "smooth" });
    targetRow.focus({ preventScroll: true });
  }, [manageTarget, managedTargetVisible]);

  // --- 草稿操作 ---
  useEffect(() => {
    if (draftActive) {
      draftInputRef.current?.focus();
    }
  }, [draftActive]);

  function handleAddPlugin() {
    if (draftActive) {
      return;
    }
    setDraftActive(true);
    setDraftPluginId("");
    setDraftError("");
  }

  function handleSaveDraft() {
    const pluginId = draftPluginId.trim();
    if (!pluginId) {
      setDraftError(t("profileEditor.plugins.errorIdEmpty"));
      return;
    }
    const success = onAddPlugin(pluginId);
    if (!success) {
      setDraftError(t("profileEditor.plugins.errorIdDuplicate"));
      return;
    }
    setDraftActive(false);
    setDraftPluginId("");
    setDraftError("");
  }

  function handleCancelDraft() {
    setDraftActive(false);
    setDraftPluginId("");
    setDraftError("");
  }

  const showFilters = plugins.length > 0 || draftActive;
  const showFilteredEmptyState = plugins.length > 0 && filteredPlugins.length === 0 && !draftActive;

  return (
    <div className="flex flex-col gap-3.5">
      {plugins.length === 0 && !draftActive ? (
        <Empty>
          <EmptyTitle>{t("profileEditor.plugins.emptyEnabled")}</EmptyTitle>
          <EmptyContent className="flex flex-row gap-2">
            <Button type="button" onClick={onGoBrowse}>
              {t("profileEditor.plugins.emptyEnabledGoBrowse")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setDraftActive(true)}>
              {t("profileEditor.plugins.emptyEnabledManualId")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-3">
            {showFilters ? (
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
                <div className="flex h-[42px] min-w-[150px] flex-[1_1_0] items-center gap-2 rounded-md border border-border bg-card px-2.5 transition-[border-color,box-shadow,transform] focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-muted-foreground max-[520px]:flex-auto">
                  <span
                    className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground"
                    aria-hidden="true"
                  >
                    {sourceTypeFilterFieldLabel}
                  </span>
                  <Select value={sourceTypeFilter} onValueChange={setSourceTypeFilter}>
                    <SelectTrigger
                      aria-label={sourceTypeFilterLabel}
                      className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus:ring-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">
                          {t("profileEditor.plugins.metadataFilterAll")}
                        </SelectItem>
                        {sourceTypeOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option === "unknown"
                              ? t("profileEditor.plugins.sourceTypeUnknown")
                              : option === "path"
                                ? t("profileEditor.plugins.sourceTypePath")
                                : option}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

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
                  const isDraftRow = plugin.isDraft === true;
                  const officialPlugin = isOfficialPlugin(plugin.pluginId);
                  const pluginMetaItems = buildPluginMetaItems(plugin.pluginId, plugin.metadata);
                  const verifiedBadgeIcon = officialPlugin ? (
                    <span
                      className="inline-flex shrink-0 items-center justify-center text-chart-2 opacity-70 transition-opacity group-hover:opacity-90 group-focus-visible:opacity-90"
                      role="img"
                      aria-label={verifiedBadgeAriaLabel}
                    >
                      <CircleCheck className="size-[13px]" aria-hidden="true" />
                    </span>
                  ) : null;
                  const rowLabel =
                    isDraftRow && draftPluginId.trim()
                      ? draftPluginId
                      : isDraftRow
                        ? draftRowLabel
                        : plugin.pluginId;
                  const isManagedTarget =
                    !isDraftRow &&
                    managedPluginId === plugin.pluginId &&
                    manageRequestId !== undefined;

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
                                    {isDraftRow ? (
                                      <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                                        {draftBadgeText}
                                      </span>
                                    ) : null}
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
                                  {isDraftRow ? (
                                    <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                                      {draftBadgeText}
                                    </span>
                                  ) : null}
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
                                        {item.kind === "marketplace"
                                          ? `${t("profileEditor.plugins.marketplaceMetaLabel")} ${item.value}`
                                          : item.value}
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
                              onToggle={() => {
                                if (!isDraftRow) {
                                  onTogglePlugin(plugin.pluginId);
                                }
                              }}
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
                              if (isDraftRow) {
                                handleCancelDraft();
                                return;
                              }
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
                      {isDraftRow ? (
                        <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-secondary p-3 pl-[calc(40px+0.875rem)] max-[520px]:mt-0 max-[520px]:pl-3">
                          <div>
                            <label className="grid gap-2 mb-0">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                                <span>{t("profileEditor.plugins.newIdLabel")}</span>
                                <RequiredBadge />
                              </span>
                              <Input
                                ref={draftInputRef}
                                aria-label={t("profileEditor.plugins.newIdLabel")}
                                value={draftPluginId}
                                placeholder="formatter@anthropic-tools"
                                onChange={(event) => {
                                  setDraftPluginId(event.target.value);
                                  setDraftError("");
                                }}
                              />
                            </label>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              aria-label={saveDraftAriaLabel}
                              onClick={handleSaveDraft}
                            >
                              {t("profileEditor.common.save")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              aria-label={cancelEditAriaLabel}
                              onClick={handleCancelDraft}
                            >
                              {t("profileEditor.common.cancel")}
                            </Button>
                          </div>
                          {draftError ? (
                            <p className="m-0 text-sm font-medium text-destructive">{draftError}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <div>
              <div className="flex flex-wrap gap-3 max-[520px]:w-full">
                <Button type="button" variant="outline" onClick={handleAddPlugin}>
                  <Plus className="size-4" aria-hidden="true" />
                  {t("profileEditor.plugins.addItem")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingDeletePlugin ? (
        <ConfirmAlertDialog
          title={deleteDialogTitle}
          message={t("profileEditor.plugins.deleteDialogMessage").replace(
            "{id}",
            pendingDeletePlugin.pluginId,
          )}
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
