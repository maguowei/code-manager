import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { createRowId, type PluginDraft, readObject } from "./editor-utils";
import RequiredBadge from "./RequiredBadge";
import { SandboxSwitchControl } from "./SandboxEditor";

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
  const { language } = useI18n();
  const isZh = language === "zh";
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const booleanPlugins = useMemo(() => readBooleanPlugins(value), [value]);
  const initialPlugins = useMemo(() => buildPluginDrafts(booleanPlugins), [booleanPlugins]);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [draft, setDraft] = useState<PluginDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [interactionError, setInteractionError] = useState("");

  const sectionPendingMessage = isZh
    ? "当前插件编辑未保存，请先保存或取消。"
    : "Please save or cancel the current plugin edit first.";
  const switchBlockedMessage = isZh
    ? "请先保存或取消当前插件编辑。"
    : "Please save or cancel the current plugin edit first.";
  const emptyHint = isZh
    ? "暂无额外插件配置，可按需添加插件开关。"
    : "No plugin overrides yet. Add one when needed.";
  const draftRowLabel = isZh ? "新插件" : "New Plugin";
  const draftBadgeText = isZh ? "草稿" : "Draft";

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
      setDraftError(isZh ? "插件 ID 不能为空" : "Plugin ID cannot be empty");
      return;
    }
    if (plugins.some((plugin) => plugin.pluginId === pluginId)) {
      setDraftError(isZh ? "插件 ID 不能重复" : "Plugin IDs must be unique");
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

  const rowStatusOnText = isZh ? "已启用" : "Enabled";
  const rowStatusOffText = isZh ? "未启用" : "Not enabled";

  return (
    <div className="profile-subsection">
      <div className="profile-subsection-header">
        <div>{showTitle ? <h4>{isZh ? "插件" : "Plugins"}</h4> : null}</div>
      </div>

      <div className="profile-plugin-editor">
        <div className="profile-plugin-list-shell">
          {plugins.length === 0 && !draft ? (
            <div className="profile-empty-state profile-plugin-empty-list">{emptyHint}</div>
          ) : (
            <div className="profile-plugin-list">
              <div className="profile-plugin-list-header" aria-hidden="true">
                <span className="profile-plugin-list-header-index">{isZh ? "序号" : "Index"}</span>
                <span>{isZh ? "插件 ID" : "Plugin ID"}</span>
                <span className="profile-plugin-list-header-status">
                  {isZh ? "启用状态" : "Status"}
                </span>
                <span className="profile-plugin-list-header-actions">
                  {isZh ? "操作" : "Actions"}
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
                    <span className="profile-plugin-index" aria-hidden="true">
                      {index + 1}
                    </span>
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
                        isZh={isZh}
                        ariaLabel={`${isZh ? "插件状态" : "Plugin status"} ${rowLabel}`}
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

                    <div className="profile-row-actions profile-plugin-row-actions">
                      <button
                        type="button"
                        className="profile-icon-btn danger"
                        aria-label={`${isZh ? "删除插件" : "Remove plugin"} ${rowLabel}`}
                        onClick={() => {
                          if (isDraftRow) {
                            resetDraft(null);
                            return;
                          }
                          handleRemovePlugin(plugin.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                    {isDraftRow && draft ? (
                      <div className="profile-env-inline-editor profile-plugin-inline-editor">
                        <div className="profile-env-inline-fields">
                          <label className="form-group">
                            <span className="profile-inline-required-label profile-env-inline-label">
                              <span>{isZh ? "新插件 ID" : "New Plugin ID"}</span>
                              <RequiredBadge />
                            </span>
                            <input
                              ref={draftInputRef}
                              id={`plugin-draft-id-${draft.id}`}
                              aria-label={isZh ? "新插件 ID" : "New Plugin ID"}
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
                            onClick={handleSaveDraft}
                          >
                            {isZh ? "保存插件" : "Save Plugin"}
                          </button>
                          <button
                            type="button"
                            className="profile-secondary-btn"
                            onClick={() => resetDraft(null)}
                          >
                            {isZh ? "取消" : "Cancel"}
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
              {isZh ? "新增插件" : "Add plugin"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EnabledPluginsEditor;
