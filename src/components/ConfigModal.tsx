import { useState, useMemo } from "react";
import { ClaudeConfig, generateClaudeJson } from "../types";
import { useI18n } from "../i18n";
import "./ConfigModal.css";

interface ConfigModalProps {
  config: ClaudeConfig | null;
  onSave: (config: Omit<ClaudeConfig, "id" | "createdAt" | "updatedAt" | "isActive">) => void;
  onClose: () => void;
}

function ConfigModal({ config, onSave, onClose }: ConfigModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState(config?.name || "");
  const [description, setDescription] = useState(config?.description || "");
  const [apiKey, setApiKey] = useState(config?.apiKey || "");
  const [apiUrl, setApiUrl] = useState(config?.apiUrl || "");
  const [websiteUrl, setWebsiteUrl] = useState(config?.websiteUrl || "");
  const [model, setModel] = useState(config?.model || "");
  const [thinkingModel, setThinkingModel] = useState(config?.thinkingModel || "");
  const [haikuModel, setHaikuModel] = useState(config?.haikuModel || "");
  const [sonnetModel, setSonnetModel] = useState(config?.sonnetModel || "");
  const [opusModel, setOpusModel] = useState(config?.opusModel || "");
  const [alwaysThinkingEnabled, setAlwaysThinkingEnabled] = useState(config?.alwaysThinkingEnabled || false);
  const [disableNonessentialTraffic, setDisableNonessentialTraffic] = useState(config?.disableNonessentialTraffic || false);
  const [skipWebFetchPreflight, setSkipWebFetchPreflight] = useState(config?.skipWebFetchPreflight || false);
  const [enableExtraMarketplaces, setEnableExtraMarketplaces] = useState(config?.enableExtraMarketplaces || false);
  const [enabledPlugins, setEnabledPlugins] = useState<Record<string, boolean>>(config?.enabledPlugins || {});
  const [newPluginId, setNewPluginId] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState(config?.preferredLanguage || "english");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);

  const currentConfig = useMemo(() => ({
    id: config?.id || "",
    name,
    description,
    apiKey,
    apiUrl: apiUrl || undefined,
    websiteUrl: websiteUrl || undefined,
    model: model || undefined,
    thinkingModel: thinkingModel || undefined,
    haikuModel: haikuModel || undefined,
    sonnetModel: sonnetModel || undefined,
    opusModel: opusModel || undefined,
    alwaysThinkingEnabled,
    disableNonessentialTraffic,
    skipWebFetchPreflight,
    enableExtraMarketplaces,
    enabledPlugins: Object.keys(enabledPlugins).length > 0 ? enabledPlugins : undefined,
    preferredLanguage,
    isActive: config?.isActive || false,
    createdAt: config?.createdAt || 0,
    updatedAt: config?.updatedAt || 0,
  }), [name, description, apiKey, apiUrl, websiteUrl, model, thinkingModel, haikuModel, sonnetModel, opusModel, alwaysThinkingEnabled, disableNonessentialTraffic, skipWebFetchPreflight, enableExtraMarketplaces, enabledPlugins, preferredLanguage, config]);

  const previewJson = useMemo(() => {
    if (!apiKey) return "{}";
    return JSON.stringify(generateClaudeJson(currentConfig), null, 2);
  }, [currentConfig, apiKey]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !apiKey.trim()) {
      return;
    }
    onSave({
      name: name.trim(),
      description: description.trim(),
      apiKey: apiKey.trim(),
      apiUrl: apiUrl.trim() || undefined,
      websiteUrl: websiteUrl.trim() || undefined,
      model: model.trim() || undefined,
      thinkingModel: thinkingModel.trim() || undefined,
      haikuModel: haikuModel.trim() || undefined,
      sonnetModel: sonnetModel.trim() || undefined,
      opusModel: opusModel.trim() || undefined,
      alwaysThinkingEnabled,
      disableNonessentialTraffic,
      skipWebFetchPreflight,
      enableExtraMarketplaces,
      enabledPlugins: Object.keys(enabledPlugins).length > 0 ? enabledPlugins : undefined,
      preferredLanguage,
    });
  }

  function handleAddPlugin() {
    const id = newPluginId.trim();
    if (!id || enabledPlugins[id] !== undefined) return;
    setEnabledPlugins({ ...enabledPlugins, [id]: true });
    setNewPluginId("");
  }

  function handleRemovePlugin(id: string) {
    const next = { ...enabledPlugins };
    delete next[id];
    setEnabledPlugins(next);
  }

  function handleTogglePlugin(id: string) {
    setEnabledPlugins({ ...enabledPlugins, [id]: !enabledPlugins[id] });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="back-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <h2>{config ? t("configModal.editTitle") : t("configModal.addTitle")}</h2>
          <div className="header-spacer"></div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* 配置徽章 */}
            <div className="config-badge-large">
              <span>{name ? name.charAt(0).toUpperCase() : "A"}</span>
            </div>

            {/* 基本信息 */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">{t("configModal.nameRequired")}</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("configModal.namePlaceholder")}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="description">{t("configModal.description")}</label>
                <input
                  id="description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("configModal.descriptionPlaceholder")}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="websiteUrl">{t("configModal.websiteUrl")}</label>
              <input
                id="websiteUrl"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder={t("configModal.websiteUrlPlaceholder")}
              />
            </div>

            <div className="form-group">
              <label htmlFor="apiKey">{t("configModal.apiKey")}</label>
              <div className="input-with-toggle">
                <input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t("configModal.apiKeyPlaceholder")}
                  required
                />
                <button
                  type="button"
                  className="toggle-visibility"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="apiUrl">{t("configModal.apiUrl")}</label>
              <input
                id="apiUrl"
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder={t("configModal.apiUrlPlaceholder")}
              />
              <p className="form-hint warning">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {t("configModal.apiUrlHint")}
              </p>
            </div>

            {/* 模型配置 */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="model">{t("configModal.model")}</label>
                <input
                  id="model"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={t("configModal.modelPlaceholder")}
                />
              </div>
              <div className="form-group">
                <label htmlFor="thinkingModel">{t("configModal.thinkingModel")}</label>
                <input
                  id="thinkingModel"
                  type="text"
                  value={thinkingModel}
                  onChange={(e) => setThinkingModel(e.target.value)}
                  placeholder=""
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="haikuModel">{t("configModal.haikuModel")}</label>
                <input
                  id="haikuModel"
                  type="text"
                  value={haikuModel}
                  onChange={(e) => setHaikuModel(e.target.value)}
                  placeholder={t("configModal.haikuModelPlaceholder")}
                />
              </div>
              <div className="form-group">
                <label htmlFor="sonnetModel">{t("configModal.sonnetModel")}</label>
                <input
                  id="sonnetModel"
                  type="text"
                  value={sonnetModel}
                  onChange={(e) => setSonnetModel(e.target.value)}
                  placeholder={t("configModal.sonnetModelPlaceholder")}
                />
              </div>
            </div>

            <div className="form-group half-width">
              <label htmlFor="opusModel">{t("configModal.opusModel")}</label>
              <input
                id="opusModel"
                type="text"
                value={opusModel}
                onChange={(e) => setOpusModel(e.target.value)}
                placeholder={t("configModal.opusModelPlaceholder")}
              />
            </div>
            <p className="form-hint">{t("configModal.modelHint")}</p>

            {/* Claude Code 响应语言 */}
            <div className="section-toggle" style={{ cursor: "default" }}>
              <span>{t("configModal.preferredLanguage")}</span>
            </div>
            <div className="form-group">
              <select
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
              >
                <option value="english">{t("configModal.langEnglish")}</option>
                <option value="chinese">{t("configModal.langChinese")}</option>
                <option value="japanese">{t("configModal.langJapanese")}</option>
                <option value="korean">{t("configModal.langKorean")}</option>
                <option value="spanish">{t("configModal.langSpanish")}</option>
                <option value="french">{t("configModal.langFrench")}</option>
                <option value="german">{t("configModal.langGerman")}</option>
                <option value="portuguese">{t("configModal.langPortuguese")}</option>
                <option value="russian">{t("configModal.langRussian")}</option>
                <option value="arabic">{t("configModal.langArabic")}</option>
                <option value="italian">{t("configModal.langItalian")}</option>
              </select>
              <p className="form-hint">{t("configModal.preferredLanguageDesc")}</p>
            </div>

            {/* 插件市场 */}
            <div className="section-toggle" style={{ cursor: "default" }}>
              <span>{t("configModal.pluginMarketplaces")}</span>
            </div>
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={enableExtraMarketplaces}
                  onChange={(e) => setEnableExtraMarketplaces(e.target.checked)}
                />
                <span className="checkbox-custom"></span>
                <span>{t("configModal.enableExtraMarketplaces")}</span>
              </label>
              <p className="form-hint">{t("configModal.enableExtraMarketplacesDesc")}</p>
            </div>

            {/* 已启用插件 */}
            <div className="section-toggle" onClick={() => setShowPlugins(!showPlugins)}>
              <span>{t("configModal.enabledPlugins")}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={showPlugins ? "expanded" : ""}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            {showPlugins && (
              <div className="plugin-section">
                <p className="form-hint" style={{ marginTop: 0 }}>{t("configModal.enabledPluginsDesc")}</p>
                {Object.keys(enabledPlugins).length > 0 && (
                  <div className="plugin-list">
                    {Object.entries(enabledPlugins).map(([id, enabled]) => (
                      <div key={id} className="plugin-item">
                        <span className="plugin-name" title={id}>{id}</span>
                        <div className="plugin-actions">
                          <button
                            type="button"
                            className={`plugin-toggle ${enabled ? "enabled" : "disabled"}`}
                            onClick={() => handleTogglePlugin(id)}
                            title={enabled ? t("configModal.pluginEnabled") : t("configModal.pluginDisabled")}
                          >
                            {enabled ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            )}
                          </button>
                          <button
                            type="button"
                            className="plugin-remove"
                            onClick={() => handleRemovePlugin(id)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="plugin-add-row">
                  <input
                    type="text"
                    value={newPluginId}
                    onChange={(e) => setNewPluginId(e.target.value)}
                    placeholder={t("configModal.pluginIdPlaceholder")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddPlugin();
                      }
                    }}
                  />
                  <button type="button" className="plugin-add-btn" onClick={handleAddPlugin}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    {t("configModal.addPlugin")}
                  </button>
                </div>
              </div>
            )}

            {/* 高级选项 */}
            <div className="section-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
              <span>{t("configModal.advancedOptions")}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={showAdvanced ? "expanded" : ""}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            {showAdvanced && (
              <div className="advanced-options">
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={alwaysThinkingEnabled}
                      onChange={(e) => setAlwaysThinkingEnabled(e.target.checked)}
                    />
                    <span className="checkbox-custom"></span>
                    <span>{t("configModal.alwaysThinking")}</span>
                  </label>
                </div>
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={disableNonessentialTraffic}
                      onChange={(e) => setDisableNonessentialTraffic(e.target.checked)}
                    />
                    <span className="checkbox-custom"></span>
                    <span>{t("configModal.disableTraffic")}</span>
                  </label>
                </div>
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={skipWebFetchPreflight}
                      onChange={(e) => setSkipWebFetchPreflight(e.target.checked)}
                    />
                    <span className="checkbox-custom"></span>
                    <span>{t("configModal.skipWebFetchPreflight")}</span>
                  </label>
                </div>
              </div>
            )}

            {/* 配置预览 */}
            <div className="section-toggle" onClick={() => setShowPreview(!showPreview)}>
              <span>{t("configModal.jsonPreview")}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={showPreview ? "expanded" : ""}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            {showPreview && (
              <div className="json-preview">
                <pre><code>{previewJson}</code></pre>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>
              {t("configModal.cancel")}
            </button>
            <button type="submit" className="btn-save">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              {t("configModal.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ConfigModal;
