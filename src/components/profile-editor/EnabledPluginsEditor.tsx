import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import ConfirmDialog from "../ConfirmDialog";
import { createRowId, type PluginDraft, readObject } from "./editor-utils";
import RequiredBadge from "./RequiredBadge";
import { SandboxSwitchControl } from "./SandboxEditor";
import "./EnabledPluginsEditor.css";

interface EnabledPluginsEditorProps {
  value: unknown;
  onChange: (next: Record<string, boolean>) => void;
  onError: (message: string) => void;
  showTitle?: boolean;
}

interface PluginListItem extends PluginDraft {
  isDraft?: boolean;
}

function readBooleanPlugins(value: unknown): Record<string, boolean> {
  const pluginObject = readObject(value);
  return Object.fromEntries(
    Object.entries(pluginObject).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

function buildPluginDrafts(value: Record<string, boolean>): PluginDraft[] {
  return Object.entries(value).map(([pluginId, enabled]) => ({
    id: `plugin:${pluginId}`,
    pluginId,
    enabled,
  }));
}

function buildPluginRecord(plugins: PluginDraft[]): Record<string, boolean> {
  return plugins.reduce<Record<string, boolean>>((accumulator, plugin) => {
    accumulator[plugin.pluginId] = plugin.enabled;
    return accumulator;
  }, {});
}

function EnabledPluginsEditor({
  value,
  onChange,
  onError,
  showTitle = true,
}: EnabledPluginsEditorProps) {
  const { t } = useI18n();
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const booleanPlugins = useMemo(() => readBooleanPlugins(value), [value]);
  const initialPlugins = useMemo(() => buildPluginDrafts(booleanPlugins), [booleanPlugins]);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [draft, setDraft] = useState<PluginDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [interactionError, setInteractionError] = useState("");
  const [pendingDeletePlugin, setPendingDeletePlugin] = useState<PluginDraft | null>(null);

  const sectionPendingMessage = t("profileEditor.plugins.errorPendingEdit");
  const switchBlockedMessage = t("profileEditor.plugins.errorPendingEdit");
  const emptyHint = t("profileEditor.plugins.emptyHint");
  const draftRowLabel = t("profileEditor.plugins.newItem");
  const draftBadgeText = t("profileEditor.common.draft");
  const deleteDialogTitle = t("profileEditor.plugins.deleteDialogTitle");
  const deleteDialogConfirmText = t("profileEditor.common.delete");
  const deleteDialogCancelText = t("profileEditor.common.cancel");
  const saveDraftAriaLabel = t("profileEditor.plugins.saveAriaLabel");
  const cancelEditAriaLabel = t("profileEditor.plugins.cancelEditAriaLabel");

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
    const nextValue = buildPluginRecord(plugins);
    if (JSON.stringify(nextValue) !== JSON.stringify(booleanPlugins)) {
      onChange(nextValue);
    }
  }, [booleanPlugins, onChange, plugins]);

  useEffect(() => {
    onError(currentError);
  }, [currentError, onError]);

  useEffect(() => {
    if (!draft) {
      return;
    }
    draftInputRef.current?.focus();
  }, [draft]);

  const visiblePlugins = useMemo<PluginListItem[]>(
    () => (draft ? [...plugins, { ...draft, isDraft: true }] : plugins),
    [draft, plugins],
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

  function handleRemovePlugin(pluginId: string) {
    setInteractionError("");
    setPlugins((current) => current.filter((plugin) => plugin.id !== pluginId));
  }

  const rowStatusOnText = t("profileEditor.plugins.statusEnabled");
  const rowStatusOffText = t("profileEditor.plugins.statusNotEnabled");

  return (
    <div className="profile-subsection">
      <div className="profile-subsection-header">
        <div>{showTitle ? <h4>{t("profileEditor.plugins.title")}</h4> : null}</div>
      </div>

      <div className="profile-plugin-editor">
        <div className="profile-plugin-list-shell">
          {plugins.length === 0 && !draft ? (
            <div className="profile-empty-state profile-plugin-empty-list">{emptyHint}</div>
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
            <button type="button" className="profile-secondary-btn" onClick={handleAddPlugin}>
              {t("profileEditor.plugins.addItem")}
            </button>
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
