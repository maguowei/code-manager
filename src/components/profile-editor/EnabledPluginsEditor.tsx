import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import {
  buildStringListError,
  createRowId,
  type PluginDraft,
  readObject,
  rowsFromStringArray,
  stringArrayFromRows,
} from "./editor-utils";
import StringListEditor from "./StringListEditor";

interface EnabledPluginsEditorProps {
  value: unknown;
  onChange: (next: Record<string, boolean | string[]>) => void;
  onError: (message: string) => void;
  showTitle?: boolean;
}

function buildPluginDrafts(value: unknown): PluginDraft[] {
  const pluginObject = readObject(value);
  return Object.entries(pluginObject)
    .filter(([, entry]) => typeof entry === "boolean" || Array.isArray(entry))
    .map(([pluginId, entry]) => ({
      id: createRowId("plugin"),
      pluginId,
      mode: typeof entry === "boolean" ? (entry ? "enabled" : "disabled") : "tools",
      tools: rowsFromStringArray(Array.isArray(entry) ? (entry as string[]) : []),
    }));
}

function EnabledPluginsEditor({
  value,
  onChange,
  onError,
  showTitle = true,
}: EnabledPluginsEditorProps) {
  const { language } = useI18n();
  const isZh = language === "zh";
  const initialDrafts = useMemo(() => buildPluginDrafts(value), [value]);
  const [plugins, setPlugins] = useState(initialDrafts);
  const [structuredError, setStructuredError] = useState("");
  const skipStructuredSyncRef = useRef(false);

  useEffect(() => {
    skipStructuredSyncRef.current = true;
    setPlugins(initialDrafts);
  }, [initialDrafts]);

  useEffect(() => {
    if (skipStructuredSyncRef.current) {
      skipStructuredSyncRef.current = false;
      return;
    }
    const pluginIds = plugins.map((plugin) => plugin.pluginId.trim());
    if (pluginIds.some((pluginId) => !pluginId)) {
      setStructuredError(isZh ? "插件 ID 不能为空" : "Plugin ID cannot be empty");
      return;
    }
    if (new Set(pluginIds).size !== pluginIds.length) {
      setStructuredError(isZh ? "插件 ID 不能重复" : "Plugin IDs must be unique");
      return;
    }

    for (const plugin of plugins) {
      if (plugin.mode === "tools") {
        const error = buildStringListError(plugin.tools, isZh ? "插件工具" : "Plugin tools", isZh, {
          unique: true,
        });
        if (error) {
          setStructuredError(error);
          return;
        }
      }
    }

    setStructuredError("");
    const nextValue = plugins.reduce<Record<string, boolean | string[]>>((accumulator, plugin) => {
      if (plugin.mode === "tools") {
        accumulator[plugin.pluginId.trim()] = stringArrayFromRows(plugin.tools);
      } else {
        accumulator[plugin.pluginId.trim()] = plugin.mode === "enabled";
      }
      return accumulator;
    }, {});
    if (JSON.stringify(nextValue) !== JSON.stringify(value ?? {})) {
      onChange(nextValue);
    }
  }, [isZh, onChange, plugins, value]);

  useEffect(() => {
    onError(structuredError);
  }, [onError, structuredError]);

  function updatePlugin(pluginId: string, updater: (plugin: PluginDraft) => PluginDraft) {
    setPlugins((current) =>
      current.map((plugin) => (plugin.id === pluginId ? updater(plugin) : plugin)),
    );
  }

  function addToolRow(pluginId: string) {
    updatePlugin(pluginId, (plugin) => ({
      ...plugin,
      tools: [
        ...plugin.tools,
        {
          id: createRowId("plugin-tool"),
          value: "",
        },
      ],
    }));
  }

  return (
    <div className="profile-subsection">
      <div className="profile-subsection-header">
        <div>
          {showTitle ? <h4>{isZh ? "插件" : "Plugins"}</h4> : null}
          <p>
            {isZh
              ? "直接维护 enabledPlugins，支持布尔开关和工具白名单。"
              : "Maintain enabledPlugins with booleans or tool allowlists."}
          </p>
        </div>
        <div className="profile-subsection-actions">
          <button
            type="button"
            className="profile-secondary-btn"
            onClick={() =>
              setPlugins((current) => [
                ...current,
                {
                  id: createRowId("plugin"),
                  pluginId: "",
                  mode: "enabled",
                  tools: [],
                },
              ])
            }
          >
            {isZh ? "新增插件" : "Add plugin"}
          </button>
        </div>
      </div>

      {plugins.length === 0 ? (
        <div className="profile-empty-state">
          {isZh ? "没有额外插件配置，Claude 将使用默认插件启用状态。" : "No plugin overrides yet."}
        </div>
      ) : (
        <div className="profile-plugin-table">
          <div className="profile-plugin-list-header" aria-hidden="true">
            <span className="profile-plugin-list-header-index">{isZh ? "序号" : "Index"}</span>
            <span>{isZh ? "插件 ID" : "Plugin ID"}</span>
            <span>{isZh ? "插件模式" : "Plugin Mode"}</span>
            <span className="profile-plugin-list-header-actions" />
          </div>
          {plugins.map((plugin, index) => (
            <section key={plugin.id} className="profile-plugin-item">
              <div className="profile-plugin-row">
                <span className="profile-plugin-index" aria-hidden="true">
                  {index + 1}
                </span>

                <div className="form-group profile-plugin-id-group">
                  <input
                    id={`plugin-id-${plugin.id}`}
                    aria-label={`${isZh ? "插件 ID" : "Plugin ID"} ${index + 1}`}
                    value={plugin.pluginId}
                    placeholder="formatter@anthropic-tools"
                    onChange={(event) =>
                      updatePlugin(plugin.id, (current) => ({
                        ...current,
                        pluginId: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="form-group profile-plugin-mode-group">
                  <select
                    id={`plugin-mode-${plugin.id}`}
                    aria-label={`${isZh ? "插件模式" : "Plugin Mode"} ${index + 1}`}
                    className="form-select profile-plugin-mode-select"
                    value={plugin.mode}
                    onChange={(event) =>
                      updatePlugin(plugin.id, (current) => ({
                        ...current,
                        mode: event.target.value as PluginDraft["mode"],
                      }))
                    }
                  >
                    <option value="enabled">{isZh ? "启用" : "Enabled"}</option>
                    <option value="disabled">{isZh ? "禁用" : "Disabled"}</option>
                    <option value="tools">{isZh ? "工具列表" : "Tool list"}</option>
                  </select>
                </div>

                <div className="profile-row-actions profile-plugin-row-actions">
                  <button
                    type="button"
                    className="profile-icon-btn danger"
                    aria-label={`${isZh ? "删除插件" : "Remove plugin"} ${index + 1}`}
                    onClick={() =>
                      setPlugins((current) =>
                        current.filter((candidate) => candidate.id !== plugin.id),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              </div>

              {plugin.mode === "tools" ? (
                <div className="profile-plugin-tools">
                  <StringListEditor
                    label={isZh ? "插件工具" : "Plugin Tools"}
                    rows={plugin.tools}
                    onChange={(rows) =>
                      updatePlugin(plugin.id, (current) => ({
                        ...current,
                        tools: rows,
                      }))
                    }
                    onAdd={() => addToolRow(plugin.id)}
                    addLabel={`${isZh ? "新增插件工具" : "Add plugin tool"} ${index + 1}`}
                    itemLabelPrefix={`${isZh ? "插件工具" : "Plugin Tool"} ${index + 1}-`}
                    placeholder={isZh ? "例如：format" : "e.g. format"}
                  />
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default EnabledPluginsEditor;
