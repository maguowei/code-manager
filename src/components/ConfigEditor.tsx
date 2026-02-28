import { useState, useMemo, useEffect } from "react";
import { ClaudeConfig, generateClaudeJson, deepMerge } from "../types";
import { useI18n } from "../i18n";
import "./ConfigEditor.css";
import PluginManager from "./PluginManager";
import DefaultsSection from "./DefaultsSection";
import ConfigPreview from "./ConfigPreview";

interface ConfigEditorProps {
  config: ClaudeConfig | null;
  defaults: string;
  onSave: (config: Omit<ClaudeConfig, "id" | "createdAt" | "updatedAt" | "isActive">, defaults?: string) => void;
  onClose: () => void;
}

function ConfigEditor({ config, defaults, onSave, onClose }: ConfigEditorProps) {
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
  const [enableLspTool, setEnableLspTool] = useState(config?.enableLspTool || false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(config?.hasCompletedOnboarding || false);
  const [enableExtraMarketplaces, setEnableExtraMarketplaces] = useState(config?.enableExtraMarketplaces || false);
  const [useDefaults, setUseDefaults] = useState(config?.useDefaults || false);
  const [enabledPlugins, setEnabledPlugins] = useState<Record<string, boolean>>(config?.enabledPlugins || {});
  const [preferredLanguage, setPreferredLanguage] = useState(config?.preferredLanguage || "english");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);
  const [defaultsContent, setDefaultsContent] = useState(defaults || "");

  // 当启用/禁用通用配置时，实时更新表单字段
  useEffect(() => {
    if (!useDefaults || !defaultsContent.trim()) {
      // 关闭通用配置时，恢复到初始值
      setEnabledPlugins(config?.enabledPlugins || {});
      return;
    }

    try {
      const defaultsObj = JSON.parse(defaultsContent.trim()) as Record<string, unknown>;

      // 从通用配置中提取并合并 enabledPlugins
      if (defaultsObj.enabledPlugins && typeof defaultsObj.enabledPlugins === 'object') {
        const defaultPlugins = defaultsObj.enabledPlugins as Record<string, boolean>;
        const currentPlugins = config?.enabledPlugins || {};
        // 合并：通用配置插件 + 当前配置插件（当前配置优先）
        const merged = { ...defaultPlugins, ...currentPlugins };
        setEnabledPlugins(merged);
      }
    } catch {
      // JSON 解析失败，忽略
    }
  }, [useDefaults, defaultsContent, config?.enabledPlugins]);

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
    enableLspTool,
    hasCompletedOnboarding,
    enableExtraMarketplaces,
    enabledPlugins: Object.keys(enabledPlugins).length > 0 ? enabledPlugins : undefined,
    preferredLanguage,
    useDefaults,
    isActive: config?.isActive || false,
    createdAt: config?.createdAt || 0,
    updatedAt: config?.updatedAt || 0,
  }), [name, description, apiKey, apiUrl, websiteUrl, model, thinkingModel, haikuModel, sonnetModel, opusModel, alwaysThinkingEnabled, disableNonessentialTraffic, skipWebFetchPreflight, enableLspTool, hasCompletedOnboarding, enableExtraMarketplaces, enabledPlugins, preferredLanguage, useDefaults, config]);

  /** 计算最终合并后的配置 JSON 字符串，供预览组件使用 */
  const previewJson = useMemo(() => {
    if (!apiKey) return "{}";
    const configJson = generateClaudeJson(currentConfig) as Record<string, unknown>;
    // 如果当前配置启用了通用配置且有内容，做深度合并
    if (useDefaults && defaultsContent.trim()) {
      try {
        const defaultsObj = JSON.parse(defaultsContent.trim()) as Record<string, unknown>;
        const merged = deepMerge(defaultsObj, configJson);
        return JSON.stringify(merged, null, 2);
      } catch {
        // 通用配置 JSON 非法时，仅展示当前配置
        return JSON.stringify(configJson, null, 2);
      }
    }
    return JSON.stringify(configJson, null, 2);
  }, [currentConfig, apiKey, defaultsContent, useDefaults]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !apiKey.trim()) {
      return;
    }
    // 校验通用配置 JSON 格式
    if (defaultsContent.trim()) {
      try {
        JSON.parse(defaultsContent.trim());
      } catch {
        // DefaultsSection 内部会显示错误，此处静默返回
        return;
      }
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
      enableLspTool,
      enableExtraMarketplaces,
      hasCompletedOnboarding,
      useDefaults,
      enabledPlugins: Object.keys(enabledPlugins).length > 0 ? enabledPlugins : undefined,
      preferredLanguage,
    }, defaultsContent);
  }

  return (
    <div className="drawer-modal-container">
      <div
        className="modal modal-large"
        role="dialog"
        aria-labelledby="config-modal-title"
        aria-modal="true"
      >
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <button type="button" className="back-btn" onClick={onClose} aria-label="关闭">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2 id="config-modal-title">{config ? t("configModal.editTitle") : t("configModal.addTitle")}</h2>
            <button
              type="submit"
              className="drawer-save-btn"
              disabled={!name.trim() || !apiKey.trim()}
            >
              {t("configModal.save")}
            </button>
          </div>
          <div className="modal-body">
            {/* 配置徽章 */}
            <div className="config-badge-large">
              <span>{name ? name.charAt(0).toUpperCase() : "A"}</span>
            </div>

            {/* 基本信息 */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name" className="label-required">
                  <span>{t("configModal.name")}</span>
                  <span className="required-badge">{t("form.required")}</span>
                </label>
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
              <label htmlFor="apiKey" className="label-required">
                <span>{t("configModal.apiKey")}</span>
                <span className="required-badge">{t("form.required")}</span>
              </label>
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
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-group form-group-compact">
              <div className="field-label-wrap">
                <label htmlFor="apiUrl">{t("configModal.apiUrl")}</label>
                <p className="form-hint warning form-hint-inline">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {t("configModal.apiUrlHint")}
                </p>
              </div>
              <input
                id="apiUrl"
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder={t("configModal.apiUrlPlaceholder")}
              />
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

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="opusModel">{t("configModal.opusModel")}</label>
                <input
                  id="opusModel"
                  type="text"
                  value={opusModel}
                  onChange={(e) => setOpusModel(e.target.value)}
                  placeholder={t("configModal.opusModelPlaceholder")}
                />
              </div>
            </div>
            <p className="form-hint">{t("configModal.modelHint")}</p>

            {/* Claude Code 响应语言 */}
            <div className="form-group">
              <label htmlFor="preferredLanguage">{t("configModal.preferredLanguage")}</label>
              <select
                id="preferredLanguage"
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
            </div>

            {/* 插件市场 */}
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
            <div className={`collapsible-section ${showPlugins ? "expanded" : ""}`}>
              <div className="collapsible-header" onClick={() => setShowPlugins(!showPlugins)}>
                <div className="collapsible-header-left">
                  <span className="collapsible-title">{t("configModal.enabledPlugins")}</span>
                  {Object.keys(enabledPlugins).length > 0 && (
                    <span className="collapsible-badge">
                      {Object.keys(enabledPlugins).length}
                    </span>
                  )}
                </div>
                <svg
                  className="collapsible-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              <div className="collapsible-content">
                <div className="collapsible-body">
                  {/* 使用 PluginManager 组件管理插件列表 */}
                  <PluginManager
                    plugins={enabledPlugins}
                    onChange={setEnabledPlugins}
                  />
                </div>
              </div>
            </div>

            {/* 高级选项 */}
            <div className={`collapsible-section ${showAdvanced ? "expanded" : ""}`}>
              <div className="collapsible-header" onClick={() => setShowAdvanced(!showAdvanced)}>
                <div className="collapsible-header-left">
                  <span className="collapsible-title">{t("configModal.advancedOptions")}</span>
                </div>
                <svg
                  className="collapsible-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              <div className="collapsible-content">
                <div className="collapsible-body">
                  <div className="checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={hasCompletedOnboarding}
                        onChange={(e) => setHasCompletedOnboarding(e.target.checked)}
                      />
                      <span className="checkbox-custom"></span>
                      <span>{t("configModal.hasCompletedOnboarding")}</span>
                    </label>
                    <p className="form-hint">{t("configModal.hasCompletedOnboardingDesc")}</p>
                  </div>
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
                  <div className="checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={enableLspTool}
                        onChange={(e) => setEnableLspTool(e.target.checked)}
                      />
                      <span className="checkbox-custom"></span>
                      <span>{t("configModal.enableLspTool")}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* 通用配置 - 使用独立的 DefaultsSection 组件 */}
            <DefaultsSection
              useDefaults={useDefaults}
              onUseDefaultsChange={setUseDefaults}
              defaults={defaultsContent}
              onDefaultsChange={setDefaultsContent}
            />

            {/* 配置预览 - 使用独立的 ConfigPreview 组件展示最终合并后的 JSON */}
            <div className={`collapsible-section ${showPreview ? "expanded" : ""}`}>
              <div className="collapsible-header" onClick={() => setShowPreview(!showPreview)}>
                <div className="collapsible-header-left">
                  <span className="collapsible-title">{t("configModal.jsonPreview")}</span>
                </div>
                <svg
                  className="collapsible-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              <div className="collapsible-content">
                <div className="collapsible-body">
                  <ConfigPreview content={previewJson} />
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ConfigEditor;
