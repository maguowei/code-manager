import { openUrl } from "@tauri-apps/plugin-opener";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../i18n";
import ConfirmDialog from "../ConfirmDialog";
import { CheckCircleIcon, ExternalLinkIcon, RefreshIcon } from "../Icons";
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
import "./EnabledPluginsEditor.css";

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
      <button
        type="button"
        className={`profile-primary-btn profile-plugin-refresh-action${loadingOfficialPlugins ? " is-loading" : ""}`}
        title={officialActionTooltip}
        data-tooltip={officialActionTooltip}
        aria-label={officialLoadLabel}
        aria-busy={loadingOfficialPlugins}
        onClick={handleLoadOfficialPlugins}
        disabled={loadingOfficialPlugins}
      >
        <RefreshIcon className="profile-plugin-refresh-icon" />
        <span>{officialLoadLabel}</span>
      </button>
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

      <div className="profile-plugin-editor">
        <div className="profile-plugin-list-shell">
          {showOfficialToolbar && officialPluginAction ? (
            <div className="profile-plugin-toolbar">{officialPluginAction}</div>
          ) : null}

          {showFilters ? (
            <div className="profile-plugin-filters">
              <div className="profile-plugin-filter-field profile-plugin-filter-field-input profile-plugin-filter-field-search">
                <input
                  type="text"
                  className="profile-plugin-filter-input"
                  value={searchQuery}
                  aria-label={searchLabel}
                  placeholder={searchPlaceholder}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <div className="profile-plugin-filter-field profile-plugin-filter-field-select">
                <span className="profile-plugin-filter-prefix" aria-hidden="true">
                  {statusFilterFieldLabel}
                </span>
                <select
                  className="profile-plugin-filter-select"
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
              <div className="profile-plugin-filter-field profile-plugin-filter-field-select">
                <span className="profile-plugin-filter-prefix" aria-hidden="true">
                  {categoryFilterFieldLabel}
                </span>
                <select
                  className="profile-plugin-filter-select"
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
              <div className="profile-plugin-filter-field profile-plugin-filter-field-select">
                <span className="profile-plugin-filter-prefix" aria-hidden="true">
                  {sourceTypeFilterFieldLabel}
                </span>
                <select
                  className="profile-plugin-filter-select"
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
            <div className="profile-empty-state profile-plugin-empty-list">{emptyHint}</div>
          ) : showFilteredEmptyState ? (
            <div className="profile-empty-state profile-plugin-empty-list">{filteredEmptyHint}</div>
          ) : (
            <div className="profile-plugin-list">
              <div className="profile-plugin-list-header" aria-hidden="true">
                <span className="profile-plugin-list-header-index">
                  {t("profileEditor.common.index")}
                </span>
                <span>{t("profileEditor.plugins.columnId")}</span>
                <span className="profile-plugin-list-header-status">
                  {t("profileEditor.plugins.columnStatus")}
                </span>
                <span className="profile-plugin-list-header-actions">
                  {t("profileEditor.common.actions")}
                </span>
              </div>

              {visiblePlugins.map((plugin, index) => {
                const isDraftRow = plugin.isDraft === true;
                const officialPlugin = isOfficialPlugin(plugin.pluginId);
                const pluginMetaItems = buildOfficialPluginMetaItems(plugin.metadata);
                const verifiedBadgeIcon = officialPlugin ? (
                  <span
                    className="profile-plugin-verified-icon"
                    role="img"
                    aria-label={verifiedBadgeAriaLabel}
                  >
                    <CheckCircleIcon size={13} />
                  </span>
                ) : null;
                const rowLabel =
                  isDraftRow && plugin.pluginId.trim()
                    ? plugin.pluginId
                    : isDraftRow
                      ? draftRowLabel
                      : plugin.pluginId;

                return (
                  <div key={plugin.id} className="profile-plugin-list-row">
                    <div className="profile-plugin-list-main">
                      <span className="profile-plugin-index" aria-hidden="true">
                        {index + 1}
                      </span>
                      <div className="profile-plugin-list-content">
                        <div className="profile-plugin-list-id">
                          <div className="profile-plugin-list-identity">
                            {plugin.metadata?.homepage ? (
                              <button
                                type="button"
                                className="profile-plugin-link"
                                aria-label={`${t("profileEditor.plugins.openHomepageAriaLabel")} ${rowLabel}`}
                                data-description={plugin.metadata.description || undefined}
                                onClick={() => {
                                  void openUrl(plugin.metadata?.homepage ?? "");
                                }}
                              >
                                <span className="profile-plugin-list-key">
                                  <span>{rowLabel}</span>
                                  {isDraftRow ? (
                                    <span className="profile-env-row-badge">{draftBadgeText}</span>
                                  ) : null}
                                  {verifiedBadgeIcon}
                                  <ExternalLinkIcon className="profile-plugin-link-icon" />
                                </span>
                              </button>
                            ) : (
                              <span
                                className="profile-plugin-list-key profile-plugin-link-static"
                                data-description={plugin.metadata?.description || undefined}
                              >
                                <span>{rowLabel}</span>
                                {isDraftRow ? (
                                  <span className="profile-env-row-badge">{draftBadgeText}</span>
                                ) : null}
                                {verifiedBadgeIcon}
                              </span>
                            )}
                            {pluginMetaItems.length > 0 ? (
                              <div className="profile-plugin-meta">
                                {pluginMetaItems.map((item) => (
                                  <span
                                    key={`${plugin.id}:${item.kind}:${item.value}`}
                                    className="profile-plugin-meta-item"
                                  >
                                    {item.value}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="profile-plugin-status-cell">
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
                            className={`profile-plugin-status-text${plugin.enabled ? " is-on" : ""}`}
                          >
                            {plugin.enabled ? rowStatusOnText : rowStatusOffText}
                          </span>
                        </div>
                      </div>

                      <div className="profile-row-actions profile-plugin-row-actions">
                        <button
                          type="button"
                          className="profile-icon-btn danger"
                          aria-label={`${t("profileEditor.plugins.removeAriaLabel")} ${rowLabel}`}
                          onClick={() => {
                            if (isDraftRow) {
                              resetDraft(null);
                              return;
                            }
                            setPendingDeletePlugin(plugin);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {isDraftRow && draft ? (
                      <div className="profile-env-inline-editor profile-plugin-inline-editor">
                        <div className="profile-env-inline-fields">
                          <label className="form-group">
                            <span className="profile-inline-required-label profile-env-inline-label">
                              <span>{t("profileEditor.plugins.newIdLabel")}</span>
                              <RequiredBadge />
                            </span>
                            <input
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

                        <div className="profile-env-inline-actions">
                          <button
                            type="button"
                            className="profile-primary-btn"
                            aria-label={saveDraftAriaLabel}
                            onClick={handleSaveDraft}
                          >
                            {t("profileEditor.common.save")}
                          </button>
                          <button
                            type="button"
                            className="profile-secondary-btn"
                            aria-label={cancelEditAriaLabel}
                            onClick={() => resetDraft(null)}
                          >
                            {t("profileEditor.common.cancel")}
                          </button>
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
            <div className="profile-plugin-footer-actions">
              <button type="button" className="profile-secondary-btn" onClick={handleAddPlugin}>
                {t("profileEditor.plugins.addItem")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {pendingDeletePlugin ? (
        <ConfirmDialog
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
