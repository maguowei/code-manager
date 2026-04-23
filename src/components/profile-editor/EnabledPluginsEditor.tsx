import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import ConfirmDialog from "../ConfirmDialog";
import { createRowId, type PluginDraft, readObject } from "./editor-utils";
import { buildOfficialPluginId, OFFICIAL_MARKETPLACE_RAW_URL } from "./marketplace-presets";
import RequiredBadge from "./RequiredBadge";
import { SandboxSwitchControl } from "./SandboxEditor";
import "./EnabledPluginsEditor.css";

interface EnabledPluginsEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
  showTitle?: boolean;
  officialMarketplaceEnabled?: boolean;
}

interface PluginListItem extends PluginDraft {
  isDraft?: boolean;
}

type PluginStatusFilter = "all" | "enabled" | "disabled";

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

function readOfficialPluginIds(manifest: unknown): string[] {
  const manifestRecord = readObject(manifest);
  if (!Array.isArray(manifestRecord.plugins)) {
    throw new Error("invalid official marketplace manifest");
  }

  const pluginIds: string[] = [];
  const seen = new Set<string>();
  manifestRecord.plugins.forEach((entry) => {
    const pluginRecord = readObject(entry);
    const pluginName = typeof pluginRecord.name === "string" ? pluginRecord.name.trim() : "";
    if (!pluginName) {
      return;
    }
    const pluginId = buildOfficialPluginId(pluginName);
    if (seen.has(pluginId)) {
      return;
    }
    seen.add(pluginId);
    pluginIds.push(pluginId);
  });

  return pluginIds;
}

function createOfficialPluginDraft(pluginId: string): PluginDraft {
  return {
    id: `plugin:${pluginId}`,
    pluginId,
    enabled: false,
  };
}

function EnabledPluginsEditor({
  value,
  onChange,
  onError,
  showTitle = true,
  officialMarketplaceEnabled = false,
}: EnabledPluginsEditorProps) {
  const { t } = useI18n();
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const { sourceEntries, booleanEntries, preservedEntries } = useMemo(
    () => splitPluginEntries(value),
    [value],
  );
  const initialPlugins = useMemo(() => buildPluginDrafts(booleanEntries), [booleanEntries]);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [draft, setDraft] = useState<PluginDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [interactionError, setInteractionError] = useState("");
  const [loadingOfficialPlugins, setLoadingOfficialPlugins] = useState(false);
  const [pendingDeletePlugin, setPendingDeletePlugin] = useState<PluginDraft | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PluginStatusFilter>("all");

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

  const filteredPlugins = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return plugins.filter((plugin) => {
      const matchesQuery =
        normalizedQuery.length === 0 || plugin.pluginId.toLowerCase().includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "all" || (statusFilter === "enabled" ? plugin.enabled : !plugin.enabled);
      return matchesQuery && matchesStatus;
    });
  }, [plugins, searchQuery, statusFilter]);

  const visiblePlugins = useMemo<PluginListItem[]>(
    () => (draft ? [...filteredPlugins, { ...draft, isDraft: true }] : filteredPlugins),
    [draft, filteredPlugins],
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

  async function handleLoadOfficialPlugins() {
    if (draft) {
      setDraftError("");
      setInteractionError(switchBlockedMessage);
      return;
    }

    setDraftError("");
    setInteractionError("");
    setLoadingOfficialPlugins(true);

    try {
      const response = await fetch(OFFICIAL_MARKETPLACE_RAW_URL);
      if (!response.ok) {
        throw new Error("failed to load official plugins");
      }

      const manifest = await response.json();
      const officialPluginIds = readOfficialPluginIds(manifest);

      setPlugins((current) => {
        const existingIds = new Set([
          ...Object.keys(preservedEntries),
          ...current.map((plugin) => plugin.pluginId),
        ]);
        const nextPlugins = officialPluginIds
          .filter((pluginId) => !existingIds.has(pluginId))
          .map((pluginId) => createOfficialPluginDraft(pluginId));

        if (nextPlugins.length === 0) {
          return current;
        }

        return [...current, ...nextPlugins];
      });
    } catch {
      setInteractionError(t("profileEditor.plugins.loadOfficialError"));
    } finally {
      setLoadingOfficialPlugins(false);
    }
  }

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
          {showFilters ? (
            <div className="profile-plugin-filters">
              <input
                type="text"
                className="profile-plugin-filter-input"
                value={searchQuery}
                aria-label={searchLabel}
                placeholder={searchPlaceholder}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <select
                className="profile-plugin-filter-select"
                value={statusFilter}
                aria-label={statusFilterLabel}
                onChange={(event) => setStatusFilter(event.target.value as PluginStatusFilter)}
              >
                <option value="all">{t("profileEditor.plugins.statusFilterAll")}</option>
                <option value="enabled">{t("profileEditor.plugins.statusFilterEnabled")}</option>
                <option value="disabled">{t("profileEditor.plugins.statusFilterDisabled")}</option>
              </select>
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
                        <div className="profile-plugin-list-id" title={rowLabel}>
                          <span className="profile-plugin-list-key">
                            <span>{rowLabel}</span>
                            {isDraftRow ? (
                              <span className="profile-env-row-badge">{draftBadgeText}</span>
                            ) : null}
                          </span>
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
              {officialMarketplaceEnabled ? (
                <button
                  type="button"
                  className="profile-primary-btn"
                  onClick={handleLoadOfficialPlugins}
                  disabled={loadingOfficialPlugins}
                >
                  {loadingOfficialPlugins
                    ? t("profileEditor.plugins.loadingOfficial")
                    : t("profileEditor.plugins.loadOfficial")}
                </button>
              ) : null}
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
