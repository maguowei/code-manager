import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleCheck, ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../i18n";
import ConfirmAlertDialog from "../ConfirmAlertDialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { createRowId, type PluginDraft, readObject } from "./editor-utils";
import { OFFICIAL_MARKETPLACE_ID } from "./marketplace-presets";
import {
  createOfficialPluginMetadataMap,
  fetchOfficialPluginCatalog,
  loadOfficialPluginCache,
  type OfficialPluginMetadata,
  saveOfficialPluginCache,
} from "./official-plugin-catalog";
import RequiredBadge from "./RequiredBadge";
import { SandboxSwitchControl } from "./SandboxEditor";

interface EnabledPluginsEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
  showTitle?: boolean;
  officialMarketplaceEnabled?: boolean;
  showOfficialToolbar?: boolean;
  onOfficialActionChange?: (action: ReactNode | null) => void;
}

interface PluginListItem extends PluginDraft {
  isDraft?: boolean;
  metadata?: OfficialPluginMetadata;
}

type PluginStatusFilter = "all" | "enabled" | "disabled";
type PluginMetadataFilterValue = "all" | string;
type PluginMetaItem = {
  kind: "author" | "category";
  value: string;
};

const OFFICIAL_PLUGIN_MIN_LOADING_MS = 500;

function waitForOfficialPluginFeedback(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, OFFICIAL_PLUGIN_MIN_LOADING_MS);
  });
}

function buildPluginDrafts(value: Record<string, boolean>): PluginDraft[] {
  return Object.entries(value).map(([pluginId, enabled]) => ({
    id: `plugin:${pluginId}`,
    pluginId,
    enabled,
  }));
}

function buildPluginRecord(
  plugins: PluginDraft[],
  preservedEntries: Record<string, unknown>,
): Record<string, unknown> {
  return plugins.reduce<Record<string, unknown>>(
    (accumulator, plugin) => {
      accumulator[plugin.pluginId] = plugin.enabled;
      return accumulator;
    },
    { ...preservedEntries },
  );
}

function arePluginRecordsEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    (key) => rightKeys.includes(key) && JSON.stringify(left[key]) === JSON.stringify(right[key]),
  );
}

function splitPluginEntries(value: unknown): {
  sourceEntries: Record<string, unknown>;
  booleanEntries: Record<string, boolean>;
  preservedEntries: Record<string, unknown>;
} {
  const sourceEntries = readObject(value);
  const booleanEntries: Record<string, boolean> = {};
  const preservedEntries: Record<string, unknown> = {};

  Object.entries(sourceEntries).forEach(([pluginId, entry]) => {
    if (typeof entry === "boolean") {
      booleanEntries[pluginId] = entry;
      return;
    }
    preservedEntries[pluginId] = entry;
  });

  return {
    sourceEntries,
    booleanEntries,
    preservedEntries,
  };
}

function createOfficialPluginDraft(pluginId: string): PluginDraft {
  return {
    id: `plugin:${pluginId}`,
    pluginId,
    enabled: false,
  };
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

function isOfficialPlugin(pluginId: string): boolean {
  return pluginId.endsWith(`@${OFFICIAL_MARKETPLACE_ID}`);
}

function buildOfficialPluginMetaItems(metadata?: OfficialPluginMetadata): PluginMetaItem[] {
  if (!metadata) {
    return [];
  }

  const metaItems: PluginMetaItem[] = [
    { kind: "author", value: metadata.authorName.trim() },
    { kind: "category", value: metadata.category.trim() },
  ];
  return metaItems.filter((item) => item.value.length > 0);
}

function EnabledPluginsEditor({
  value,
  onChange,
  onError,
  showTitle = true,
  officialMarketplaceEnabled = false,
  showOfficialToolbar = true,
  onOfficialActionChange,
}: EnabledPluginsEditorProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const { sourceEntries, booleanEntries, preservedEntries } = useMemo(
    () => splitPluginEntries(value),
    [value],
  );
  const initialPlugins = useMemo(() => buildPluginDrafts(booleanEntries), [booleanEntries]);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [officialPluginCatalog, setOfficialPluginCatalog] = useState<OfficialPluginMetadata[]>(
    () => loadOfficialPluginCache()?.plugins ?? [],
  );
  const [draft, setDraft] = useState<PluginDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [interactionError, setInteractionError] = useState("");
  const [loadingOfficialPlugins, setLoadingOfficialPlugins] = useState(false);
  const [pendingDeletePlugin, setPendingDeletePlugin] = useState<PluginDraft | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PluginStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<PluginMetadataFilterValue>("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<PluginMetadataFilterValue>("all");

  const sectionPendingMessage = t("profileEditor.plugins.errorPendingEdit");
  const switchBlockedMessage = t("profileEditor.plugins.errorPendingEdit");
  const emptyHint = t("profileEditor.plugins.emptyHint");
  const filteredEmptyHint = t("profileEditor.plugins.filteredEmptyHint");
  const draftRowLabel = t("profileEditor.plugins.newItem");
  const draftBadgeText = t("profileEditor.common.draft");
  const deleteDialogTitle = t("profileEditor.plugins.deleteDialogTitle");
  const deleteDialogConfirmText = t("profileEditor.common.delete");
  const deleteDialogCancelText = t("profileEditor.common.cancel");
  const saveDraftAriaLabel = t("profileEditor.plugins.saveAriaLabel");
  const cancelEditAriaLabel = t("profileEditor.plugins.cancelEditAriaLabel");
  const searchLabel = t("profileEditor.plugins.searchLabel");
  const searchPlaceholder = t("profileEditor.plugins.searchPlaceholder");
  const statusFilterLabel = t("profileEditor.plugins.statusFilterLabel");
  const statusFilterFieldLabel = t("profileEditor.plugins.statusFilterFieldLabel");
  const categoryFilterLabel = t("profileEditor.plugins.categoryFilterLabel");
  const categoryFilterFieldLabel = t("profileEditor.plugins.categoryFilterFieldLabel");
  const sourceTypeFilterLabel = t("profileEditor.plugins.sourceTypeFilterLabel");
  const sourceTypeFilterFieldLabel = t("profileEditor.plugins.sourceTypeFilterFieldLabel");
  const officialLoadLabel = t("profileEditor.plugins.loadOfficial");
  const officialActionTooltip = t("profileEditor.plugins.loadOfficialTooltip");
  const verifiedBadgeAriaLabel = t("profileEditor.plugins.verifiedBadgeAriaLabel");

  const currentError = useMemo(() => {
    if (draftError) {
      return draftError;
    }
    if (interactionError) {
      return interactionError;
    }
    if (draft) {
      return sectionPendingMessage;
    }
    return "";
  }, [draft, draftError, interactionError, sectionPendingMessage]);

  useEffect(() => {
    setPlugins(initialPlugins);
  }, [initialPlugins]);

  useEffect(() => {
    const nextValue = buildPluginRecord(plugins, preservedEntries);
    if (!arePluginRecordsEqual(nextValue, sourceEntries)) {
      onChange(nextValue);
    }
  }, [onChange, plugins, preservedEntries, sourceEntries]);

  useEffect(() => {
    onError(currentError);
  }, [currentError, onError]);

  useEffect(() => {
    if (!draft) {
      return;
    }
    draftInputRef.current?.focus();
  }, [draft]);

  const officialPluginMetadataMap = useMemo(
    () => createOfficialPluginMetadataMap(officialPluginCatalog),
    [officialPluginCatalog],
  );

  const metadataEnabledPlugins = useMemo(
    () =>
      plugins
        .map((plugin) => officialPluginMetadataMap[plugin.pluginId])
        .filter((plugin): plugin is OfficialPluginMetadata => plugin !== undefined),
    [officialPluginMetadataMap, plugins],
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
      const metadata = officialPluginMetadataMap[plugin.pluginId];
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
    officialPluginMetadataMap,
    plugins,
    searchQuery,
    sourceTypeFilter,
    statusFilter,
  ]);

  const visiblePlugins = useMemo<PluginListItem[]>(
    () =>
      draft
        ? [
            ...filteredPlugins.map((plugin) => ({
              ...plugin,
              metadata: officialPluginMetadataMap[plugin.pluginId],
            })),
            { ...draft, isDraft: true },
          ]
        : filteredPlugins.map((plugin) => ({
            ...plugin,
            metadata: officialPluginMetadataMap[plugin.pluginId],
          })),
    [draft, filteredPlugins, officialPluginMetadataMap],
  );

  function resetDraft(nextDraft: PluginDraft | null) {
    setDraft(nextDraft);
    setDraftError("");
    setInteractionError("");
  }

  function updatePlugin(pluginId: string, updater: (plugin: PluginDraft) => PluginDraft) {
    setInteractionError("");
    setPlugins((current) =>
      current.map((plugin) => (plugin.id === pluginId ? updater(plugin) : plugin)),
    );
  }

  function handleAddPlugin() {
    if (draft) {
      setDraftError("");
      setInteractionError(switchBlockedMessage);
      return;
    }
    resetDraft({
      id: createRowId("plugin-draft"),
      pluginId: "",
      enabled: true,
    });
  }

  function handleDraftChange<K extends keyof PluginDraft>(field: K, nextValue: PluginDraft[K]) {
    setDraft((current) => (current ? { ...current, [field]: nextValue } : current));
    setDraftError("");
    setInteractionError("");
  }

  function handleSaveDraft() {
    if (!draft) {
      return;
    }
    const pluginId = draft.pluginId.trim();
    if (!pluginId) {
      setDraftError(t("profileEditor.plugins.errorIdEmpty"));
      return;
    }
    if (plugins.some((plugin) => plugin.pluginId === pluginId)) {
      setDraftError(t("profileEditor.plugins.errorIdDuplicate"));
      return;
    }

    setPlugins((current) => [
      ...current,
      {
        id: `plugin:${pluginId}`,
        pluginId,
        enabled: draft.enabled,
      },
    ]);
    resetDraft(null);
  }

  const appendOfficialPlugins = useCallback(
    (officialPlugins: OfficialPluginMetadata[]) => {
      setOfficialPluginCatalog(officialPlugins);
      setPlugins((current) => {
        const existingIds = new Set([
          ...Object.keys(preservedEntries),
          ...current.map((plugin) => plugin.pluginId),
        ]);
        const nextPlugins = officialPlugins
          .map((plugin) => plugin.pluginId)
          .filter((pluginId) => !existingIds.has(pluginId))
          .map((pluginId) => createOfficialPluginDraft(pluginId));

        if (nextPlugins.length === 0) {
          return current;
        }

        return [...current, ...nextPlugins];
      });
    },
    [preservedEntries],
  );

  const handleLoadOfficialPlugins = useCallback(async () => {
    if (draft) {
      setDraftError("");
      setInteractionError(switchBlockedMessage);
      return;
    }

    setDraftError("");
    setInteractionError("");
    setLoadingOfficialPlugins(true);
    const minimumLoadingDelay = waitForOfficialPluginFeedback();
    let successToastMessage = "";

    try {
      const officialPlugins = await fetchOfficialPluginCatalog();
      saveOfficialPluginCache(officialPlugins);
      appendOfficialPlugins(officialPlugins);
      successToastMessage = t("profileEditor.plugins.loadOfficialSuccess");
    } catch {
      const fallbackPlugins = loadOfficialPluginCache()?.plugins ?? officialPluginCatalog;
      if (fallbackPlugins.length > 0) {
        appendOfficialPlugins(fallbackPlugins);
        successToastMessage = t("profileEditor.plugins.loadOfficialFallbackSuccess");
      } else {
        setInteractionError(t("profileEditor.plugins.loadOfficialError"));
      }
    } finally {
      await minimumLoadingDelay;
      setLoadingOfficialPlugins(false);
      if (successToastMessage) {
        showToast(successToastMessage);
      }
    }
  }, [appendOfficialPlugins, draft, officialPluginCatalog, showToast, switchBlockedMessage, t]);

  const officialPluginAction = useMemo<ReactNode | null>(() => {
    if (!officialMarketplaceEnabled) {
      return null;
    }

    return (
      <Button
        type="button"
        className={`profile-primary-btn profile-plugin-refresh-action relative overflow-visible whitespace-nowrap${loadingOfficialPlugins ? " is-loading" : ""}`}
        title={officialActionTooltip}
        data-tooltip={officialActionTooltip}
        aria-label={officialLoadLabel}
        aria-busy={loadingOfficialPlugins}
        onClick={handleLoadOfficialPlugins}
        disabled={loadingOfficialPlugins}
      >
        <RefreshCw
          className={`profile-plugin-refresh-icon size-3.5${loadingOfficialPlugins ? " animate-spin" : ""}`}
          aria-hidden="true"
        />
        <span>{officialLoadLabel}</span>
      </Button>
    );
  }, [
    handleLoadOfficialPlugins,
    loadingOfficialPlugins,
    officialLoadLabel,
    officialActionTooltip,
    officialMarketplaceEnabled,
  ]);

  useEffect(() => {
    if (!onOfficialActionChange) {
      return;
    }

    onOfficialActionChange(officialPluginAction);
    return () => onOfficialActionChange(null);
  }, [officialPluginAction, onOfficialActionChange]);

  function handleRemovePlugin(pluginId: string) {
    setInteractionError("");
    setPlugins((current) => current.filter((plugin) => plugin.id !== pluginId));
  }

  const rowStatusOnText = t("profileEditor.plugins.statusEnabled");
  const rowStatusOffText = t("profileEditor.plugins.statusNotEnabled");
  const showFilters = plugins.length > 0 || draft !== null;
  const showEmptyState = plugins.length === 0 && !draft;
  const showFilteredEmptyState = plugins.length > 0 && filteredPlugins.length === 0 && !draft;

  return (
    <div className="profile-subsection">
      <div className="profile-subsection-header">
        <div>{showTitle ? <h4>{t("profileEditor.plugins.title")}</h4> : null}</div>
      </div>

      <div className="profile-plugin-editor flex flex-col gap-4">
        <div className="profile-plugin-list-shell flex min-w-0 flex-col gap-3">
          {showOfficialToolbar && officialPluginAction ? (
            <div className="profile-plugin-toolbar flex flex-wrap gap-3">
              {officialPluginAction}
            </div>
          ) : null}

          {showFilters ? (
            <div className="profile-plugin-filters flex w-full flex-nowrap items-stretch gap-3 max-[1120px]:flex-wrap max-[520px]:flex-col">
              <div className="profile-plugin-filter-field profile-plugin-filter-field-input profile-plugin-filter-field-search flex h-[42px] min-w-0 flex-[2_1_0] items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2.5 transition-[border-color,box-shadow,transform] focus-within:border-[var(--primary)] focus-within:shadow-[0_0_0_3px_var(--accent)] hover:border-[var(--text-muted)] max-[520px]:flex-auto">
                <Input
                  type="text"
                  className="profile-plugin-filter-input h-full border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                  value={searchQuery}
                  aria-label={searchLabel}
                  placeholder={searchPlaceholder}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <div className="profile-plugin-filter-field profile-plugin-filter-field-select flex h-[42px] min-w-[150px] flex-[1_1_0] items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2.5 transition-[border-color,box-shadow,transform] focus-within:border-[var(--primary)] focus-within:shadow-[0_0_0_3px_var(--accent)] hover:border-[var(--text-muted)] max-[520px]:flex-auto">
                <span
                  className="profile-plugin-filter-prefix shrink-0 whitespace-nowrap text-[11px] font-semibold text-[var(--text-secondary)]"
                  aria-hidden="true"
                >
                  {statusFilterFieldLabel}
                </span>
                <select
                  className="profile-plugin-filter-select h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 pr-5 text-[length:var(--font-base)] text-[var(--foreground)] outline-none"
                  value={statusFilter}
                  aria-label={statusFilterLabel}
                  onChange={(event) => setStatusFilter(event.target.value as PluginStatusFilter)}
                >
                  <option value="all">{t("profileEditor.plugins.statusFilterAll")}</option>
                  <option value="enabled">{t("profileEditor.plugins.statusFilterEnabled")}</option>
                  <option value="disabled">
                    {t("profileEditor.plugins.statusFilterDisabled")}
                  </option>
                </select>
              </div>
              <div className="profile-plugin-filter-field profile-plugin-filter-field-select flex h-[42px] min-w-[150px] flex-[1_1_0] items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2.5 transition-[border-color,box-shadow,transform] focus-within:border-[var(--primary)] focus-within:shadow-[0_0_0_3px_var(--accent)] hover:border-[var(--text-muted)] max-[520px]:flex-auto">
                <span
                  className="profile-plugin-filter-prefix shrink-0 whitespace-nowrap text-[11px] font-semibold text-[var(--text-secondary)]"
                  aria-hidden="true"
                >
                  {categoryFilterFieldLabel}
                </span>
                <select
                  className="profile-plugin-filter-select h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 pr-5 text-[length:var(--font-base)] text-[var(--foreground)] outline-none"
                  value={categoryFilter}
                  aria-label={categoryFilterLabel}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="all">{t("profileEditor.plugins.metadataFilterAll")}</option>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="profile-plugin-filter-field profile-plugin-filter-field-select flex h-[42px] min-w-[150px] flex-[1_1_0] items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--card)] px-2.5 transition-[border-color,box-shadow,transform] focus-within:border-[var(--primary)] focus-within:shadow-[0_0_0_3px_var(--accent)] hover:border-[var(--text-muted)] max-[520px]:flex-auto">
                <span
                  className="profile-plugin-filter-prefix shrink-0 whitespace-nowrap text-[11px] font-semibold text-[var(--text-secondary)]"
                  aria-hidden="true"
                >
                  {sourceTypeFilterFieldLabel}
                </span>
                <select
                  className="profile-plugin-filter-select h-full min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 pr-5 text-[length:var(--font-base)] text-[var(--foreground)] outline-none"
                  value={sourceTypeFilter}
                  aria-label={sourceTypeFilterLabel}
                  onChange={(event) => setSourceTypeFilter(event.target.value)}
                >
                  <option value="all">{t("profileEditor.plugins.metadataFilterAll")}</option>
                  {sourceTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === "unknown"
                        ? t("profileEditor.plugins.sourceTypeUnknown")
                        : option === "path"
                          ? t("profileEditor.plugins.sourceTypePath")
                          : option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {showEmptyState ? (
            <div className="profile-empty-state profile-plugin-empty-list flex min-h-[120px] items-center justify-center rounded-lg border border-[var(--border-default)] px-4 text-center">
              {emptyHint}
            </div>
          ) : showFilteredEmptyState ? (
            <div className="profile-empty-state profile-plugin-empty-list flex min-h-[120px] items-center justify-center rounded-lg border border-[var(--border-default)] px-4 text-center">
              {filteredEmptyHint}
            </div>
          ) : (
            <div className="profile-plugin-list flex flex-col overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--card)]">
              <div
                className="profile-plugin-list-header grid grid-cols-[40px_minmax(0,1fr)_clamp(118px,12vw,132px)_52px] items-center gap-x-3 border-b border-[var(--border-default)] px-3.5 py-3 text-xs font-semibold text-[var(--text-secondary)] max-[520px]:hidden"
                aria-hidden="true"
              >
                <span className="profile-plugin-list-header-index inline-flex items-center justify-center text-[var(--text-muted)] tabular-nums">
                  {t("profileEditor.common.index")}
                </span>
                <span>{t("profileEditor.plugins.columnId")}</span>
                <span className="profile-plugin-list-header-status justify-self-start">
                  {t("profileEditor.plugins.columnStatus")}
                </span>
                <span className="profile-plugin-list-header-actions w-full text-right">
                  {t("profileEditor.common.actions")}
                </span>
              </div>

              {visiblePlugins.map((plugin, index) => {
                const isDraftRow = plugin.isDraft === true;
                const officialPlugin = isOfficialPlugin(plugin.pluginId);
                const pluginMetaItems = buildOfficialPluginMetaItems(plugin.metadata);
                const verifiedBadgeIcon = officialPlugin ? (
                  <span
                    className="profile-plugin-verified-icon inline-flex shrink-0 items-center justify-center text-[color-mix(in_srgb,#79dca3_68%,var(--text-muted))] opacity-70 transition-opacity group-hover:opacity-90 group-focus-visible:opacity-90"
                    role="img"
                    aria-label={verifiedBadgeAriaLabel}
                  >
                    <CircleCheck className="size-[13px]" aria-hidden="true" />
                  </span>
                ) : null;
                const rowLabel =
                  isDraftRow && plugin.pluginId.trim()
                    ? plugin.pluginId
                    : isDraftRow
                      ? draftRowLabel
                      : plugin.pluginId;

                return (
                  <div
                    key={plugin.id}
                    className="profile-plugin-list-row flex flex-col border-t border-[var(--border-default)] px-3.5 py-2.5 text-sm font-medium leading-[1.4] first:border-t-0 max-[520px]:gap-3 max-[520px]:py-3"
                  >
                    <div className="profile-plugin-list-main grid min-w-0 grid-cols-[40px_minmax(0,1fr)_52px] items-center gap-x-3 max-[520px]:grid-cols-[32px_minmax(0,1fr)_auto] max-[520px]:items-start max-[520px]:gap-x-2.5 max-[520px]:gap-y-2">
                      <span
                        className="profile-plugin-index inline-flex items-center justify-center text-[inherit] font-[inherit] text-[var(--text-muted)] tabular-nums max-[520px]:items-start max-[520px]:pt-0.5"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <div className="profile-plugin-list-content grid min-w-0 grid-cols-[minmax(0,1fr)_clamp(118px,12vw,132px)] items-center gap-x-3 max-[520px]:grid-cols-1 max-[520px]:gap-y-2">
                        <div className="profile-plugin-list-id flex min-h-[42px] min-w-0 items-center font-[inherit] max-[520px]:min-h-0">
                          <div className="profile-plugin-list-identity flex min-w-0 flex-1 flex-col items-start gap-1">
                            {plugin.metadata?.homepage ? (
                              <button
                                type="button"
                                className="profile-plugin-link group relative min-w-0 max-w-full border-0 bg-transparent p-0 text-left font-[inherit] text-[inherit] hover:text-[var(--primary)] focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                                aria-label={`${t("profileEditor.plugins.openHomepageAriaLabel")} ${rowLabel}`}
                                title={plugin.metadata.description || undefined}
                                data-description={plugin.metadata.description || undefined}
                                onClick={() => {
                                  void openUrl(plugin.metadata?.homepage ?? "");
                                }}
                              >
                                <span className="profile-plugin-list-key inline-flex min-w-0 items-center gap-2">
                                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap max-[520px]:whitespace-normal max-[520px]:break-words">
                                    {rowLabel}
                                  </span>
                                  {isDraftRow ? (
                                    <span className="profile-env-row-badge">{draftBadgeText}</span>
                                  ) : null}
                                  {verifiedBadgeIcon}
                                  <ExternalLink
                                    className="profile-plugin-link-icon size-3.5"
                                    aria-hidden="true"
                                  />
                                </span>
                              </button>
                            ) : (
                              <span
                                className="profile-plugin-list-key profile-plugin-link-static relative inline-flex min-w-0 items-center gap-2 font-[inherit] text-[inherit]"
                                title={plugin.metadata?.description || undefined}
                                data-description={plugin.metadata?.description || undefined}
                              >
                                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap max-[520px]:whitespace-normal max-[520px]:break-words">
                                  {rowLabel}
                                </span>
                                {isDraftRow ? (
                                  <span className="profile-env-row-badge">{draftBadgeText}</span>
                                ) : null}
                                {verifiedBadgeIcon}
                              </span>
                            )}
                            {pluginMetaItems.length > 0 ? (
                              <div className="profile-plugin-meta flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium leading-snug text-[var(--text-muted)]">
                                {pluginMetaItems.map((item, itemIndex) => (
                                  <Fragment key={`${plugin.id}:${item.kind}:${item.value}`}>
                                    {itemIndex > 0 ? (
                                      <span
                                        className="text-[color-mix(in_srgb,var(--text-muted)_84%,transparent)]"
                                        aria-hidden="true"
                                      >
                                        ·
                                      </span>
                                    ) : null}
                                    <span className="profile-plugin-meta-item inline-flex min-w-0 items-center whitespace-nowrap max-[520px]:whitespace-normal max-[520px]:break-words">
                                      {item.value}
                                    </span>
                                  </Fragment>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="profile-plugin-status-cell flex min-w-0 items-center justify-start gap-2.5 justify-self-start max-[520px]:flex-wrap">
                          <SandboxSwitchControl
                            enabled={plugin.enabled}
                            ariaLabel={`${t("profileEditor.plugins.statusAriaLabel")} ${rowLabel}`}
                            onToggle={() => {
                              if (isDraftRow) {
                                handleDraftChange("enabled", !plugin.enabled);
                                return;
                              }
                              updatePlugin(plugin.id, (current) => ({
                                ...current,
                                enabled: !current.enabled,
                              }));
                            }}
                            variant="header"
                          />
                          <span
                            className={`profile-plugin-status-text whitespace-nowrap text-xs font-medium leading-tight${plugin.enabled ? " is-on text-[#3edc6d]" : " text-[var(--text-secondary)]"}`}
                          >
                            {plugin.enabled ? rowStatusOnText : rowStatusOffText}
                          </span>
                        </div>
                      </div>

                      <div className="profile-row-actions profile-plugin-row-actions flex justify-center self-center justify-self-end max-[520px]:items-start max-[520px]:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="profile-icon-btn danger text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`${t("profileEditor.plugins.removeAriaLabel")} ${rowLabel}`}
                          onClick={() => {
                            if (isDraftRow) {
                              resetDraft(null);
                              return;
                            }
                            setPendingDeletePlugin(plugin);
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    {isDraftRow && draft ? (
                      <div className="profile-env-inline-editor profile-plugin-inline-editor mt-2 flex flex-col gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--secondary)] p-3 pl-[calc(40px+0.875rem)] max-[520px]:mt-0 max-[520px]:pl-3">
                        <div className="profile-env-inline-fields">
                          <label className="form-group mb-0">
                            <span className="profile-inline-required-label profile-env-inline-label">
                              <span>{t("profileEditor.plugins.newIdLabel")}</span>
                              <RequiredBadge />
                            </span>
                            <Input
                              ref={draftInputRef}
                              id={`plugin-draft-id-${draft.id}`}
                              aria-label={t("profileEditor.plugins.newIdLabel")}
                              className="profile-plugin-draft-input"
                              value={draft.pluginId}
                              placeholder="formatter@anthropic-tools"
                              onChange={(event) =>
                                handleDraftChange("pluginId", event.target.value)
                              }
                            />
                          </label>
                        </div>

                        <div className="profile-env-inline-actions flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            className="profile-primary-btn"
                            aria-label={saveDraftAriaLabel}
                            onClick={handleSaveDraft}
                          >
                            {t("profileEditor.common.save")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="profile-secondary-btn"
                            aria-label={cancelEditAriaLabel}
                            onClick={() => resetDraft(null)}
                          >
                            {t("profileEditor.common.cancel")}
                          </Button>
                        </div>

                        {interactionError ? (
                          <p className="field-error">{interactionError}</p>
                        ) : null}
                        {draftError ? <p className="field-error">{draftError}</p> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {!draft && interactionError ? <p className="field-error">{interactionError}</p> : null}
          {!draft && draftError ? <p className="field-error">{draftError}</p> : null}

          <div className="profile-env-footer">
            <div className="profile-plugin-footer-actions flex flex-wrap gap-3 max-[520px]:w-full">
              <Button
                type="button"
                variant="outline"
                className="profile-secondary-btn"
                onClick={handleAddPlugin}
              >
                <Plus className="size-4" aria-hidden="true" />
                {t("profileEditor.plugins.addItem")}
              </Button>
            </div>
          </div>
        </div>
      </div>

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
            handleRemovePlugin(pendingDeletePlugin.id);
            setPendingDeletePlugin(null);
          }}
          onCancel={() => setPendingDeletePlugin(null)}
        />
      ) : null}
    </div>
  );
}

export default EnabledPluginsEditor;
