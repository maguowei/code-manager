import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ClaudeConfig, Provider } from "../types";
import { useI18n } from "../i18n";
import "./ConfigEditor.css";
import PluginManager from "./PluginManager";
import DefaultsSection from "./DefaultsSection";
import ConfigPreview from "./ConfigPreview";
import CollapsibleSection from "./CollapsibleSection";
import { ChevronLeftIcon } from "./Icons";

interface ConfigEditorProps {
  config: ClaudeConfig | null;
  defaults: string;
  /** Task 12: Provider 下拉选择，暂时声明以解除类型错误 */
  providers?: Provider[];
  onSave: (config: Omit<ClaudeConfig, "id" | "createdAt" | "updatedAt" | "isActive">, defaults?: string) => void;
  onClose: () => void;
}

function ConfigEditor({ config, defaults, providers, onSave, onClose }: ConfigEditorProps) {
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
  const [enableAgentTeams, setEnableAgentTeams] = useState(config?.agentTeamsEnabled || false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(config?.hasCompletedOnboarding || false);
  const [enableExtraMarketplaces, setEnableExtraMarketplaces] = useState(config?.enableExtraMarketplaces || false);
  const [useDefaults, setUseDefaults] = useState(config?.useDefaults || false);
  const [enabledPlugins, setEnabledPlugins] = useState<Record<string, boolean>>(config?.enabledPlugins || {});
  const [preferredLanguage, setPreferredLanguage] = useState(config?.preferredLanguage || "english");
  const [showApiKey, setShowApiKey] = useState(false);
  const [providerId, setProviderId] = useState(config?.providerId || "");
  const [defaultsContent, setDefaultsContent] = useState(defaults || "");

  // 额外字段：用户在 JSON 中手动添加的表单不支持的字段
  const [extraFields, setExtraFields] = useState<Record<string, unknown>>(config?.extraFields || {});
  // JSON 语法错误信息
  const [jsonError, setJsonError] = useState("");
  // 根据已选 providerId 派生当前 Provider 对象
  const selectedProvider = (providers ?? []).find((p) => p.id === providerId) ?? null;
  // 用户是否正在编辑预览区
  const isEditingPreview = useRef(false);
  // 防抖定时器，用于检测用户停止编辑预览
  const editingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 组件卸载时清理 editingTimer
  useEffect(() => {
    return () => {
      if (editingTimer.current) clearTimeout(editingTimer.current);
    };
  }, []);

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

  /** 通过后端实时生成预览 JSON，与 apply_config 使用相同逻辑 */
  const [previewJson, setPreviewJson] = useState("{}");
  useEffect(() => {
    if (!apiKey) {
      setPreviewJson("{}");
      return;
    }
    // 用户正在编辑预览时，不覆盖预览区内容
    if (isEditingPreview.current) return;
    // cancelled 必须在 effect 顶层声明，cleanup 时设为 true，防止过时 IPC 响应更新已卸载组件
    let cancelled = false;
    // 防抖 300ms，避免快速输入时高频 IPC 调用
    const timer = setTimeout(() => {
      const data = {
        name,
        description,
        apiKey,
        apiUrl: apiUrl || null,
        websiteUrl: websiteUrl || null,
        model: model || null,
        thinkingModel: thinkingModel || null,
        haikuModel: haikuModel || null,
        sonnetModel: sonnetModel || null,
        opusModel: opusModel || null,
        alwaysThinkingEnabled: alwaysThinkingEnabled ?? null,
        disableNonessentialTraffic: disableNonessentialTraffic ?? null,
        skipWebFetchPreflight: skipWebFetchPreflight ?? null,
        enableLspTool: enableLspTool ?? null,
        agentTeamsEnabled: enableAgentTeams ?? null,
        hasCompletedOnboarding: hasCompletedOnboarding ?? null,
        enableExtraMarketplaces: enableExtraMarketplaces ?? null,
        preferredLanguage: preferredLanguage || null,
        useDefaults: useDefaults ?? null,
        enabledPlugins: Object.keys(enabledPlugins).length > 0 ? enabledPlugins : null,
        extraFields: Object.keys(extraFields).length > 0 ? extraFields : null,
      };
      const previewDefaults = useDefaults && defaultsContent.trim() ? defaultsContent.trim() : null;
      invoke<string>("preview_config", { data, defaults: previewDefaults })
        .then((result) => {
          if (!cancelled) {
            setPreviewJson(result);
            setJsonError("");
          }
        })
        .catch(() => { if (!cancelled) setPreviewJson("{}"); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [apiKey, name, description, apiUrl, websiteUrl, model, thinkingModel, haikuModel, sonnetModel, opusModel, alwaysThinkingEnabled, disableNonessentialTraffic, skipWebFetchPreflight, enableLspTool, enableAgentTeams, hasCompletedOnboarding, enableExtraMarketplaces, preferredLanguage, useDefaults, enabledPlugins, defaultsContent, extraFields]);

  /** 从预览 JSON 中提取已知字段同步回表单，剩余字段存入 extraFields */
  function parseJsonToForm(jsonStr: string) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
      setJsonError("");
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "JSON 格式错误");
      return;
    }

    // 深拷贝，用于逐步移除已识别的字段，剩余的就是 extraFields
    const remaining = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;

    // 提取 env 子对象
    const env = (parsed.env ?? {}) as Record<string, string>;

    // 字符串字段：env 内
    if (env.ANTHROPIC_AUTH_TOKEN !== undefined) setApiKey(env.ANTHROPIC_AUTH_TOKEN);
    if (env.ANTHROPIC_BASE_URL !== undefined) setApiUrl(env.ANTHROPIC_BASE_URL);
    if (env.ANTHROPIC_MODEL !== undefined) setModel(env.ANTHROPIC_MODEL);
    if (env.ANTHROPIC_DEFAULT_HAIKU_MODEL !== undefined) setHaikuModel(env.ANTHROPIC_DEFAULT_HAIKU_MODEL);
    if (env.ANTHROPIC_DEFAULT_SONNET_MODEL !== undefined) setSonnetModel(env.ANTHROPIC_DEFAULT_SONNET_MODEL);
    if (env.ANTHROPIC_DEFAULT_OPUS_MODEL !== undefined) setOpusModel(env.ANTHROPIC_DEFAULT_OPUS_MODEL);

    // 布尔字段（env 内以 "1" 表示 true）
    setDisableNonessentialTraffic(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC === "1");
    setEnableLspTool(env.ENABLE_LSP_TOOL === "1");
    setEnableAgentTeams(env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1");

    // 清理 env 中的已知 key，保留未知 key
    const knownEnvKeys = [
      "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL",
      "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "ENABLE_LSP_TOOL", "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
    ];
    if (remaining.env && typeof remaining.env === "object") {
      const remainingEnv = remaining.env as Record<string, unknown>;
      for (const k of knownEnvKeys) delete remainingEnv[k];
      if (Object.keys(remainingEnv).length === 0) delete remaining.env;
    }

    // 顶层字段
    if (typeof parsed.language === "string") {
      setPreferredLanguage(parsed.language);
    } else if (!("language" in parsed)) {
      setPreferredLanguage("english");
    }
    delete remaining.language;

    if (typeof parsed.alwaysThinkingEnabled === "boolean") {
      setAlwaysThinkingEnabled(parsed.alwaysThinkingEnabled);
    } else if (!("alwaysThinkingEnabled" in parsed)) {
      setAlwaysThinkingEnabled(false);
    }
    delete remaining.alwaysThinkingEnabled;

    if (typeof parsed.skipWebFetchPreflight === "boolean") {
      setSkipWebFetchPreflight(parsed.skipWebFetchPreflight);
    } else if (!("skipWebFetchPreflight" in parsed)) {
      setSkipWebFetchPreflight(false);
    }
    delete remaining.skipWebFetchPreflight;

    if (typeof parsed.hasCompletedOnboarding === "boolean") {
      setHasCompletedOnboarding(parsed.hasCompletedOnboarding);
    } else if (!("hasCompletedOnboarding" in parsed)) {
      setHasCompletedOnboarding(false);
    }
    delete remaining.hasCompletedOnboarding;

    setEnableExtraMarketplaces("extraKnownMarketplaces" in parsed);
    delete remaining.extraKnownMarketplaces;

    if (parsed.enabledPlugins && typeof parsed.enabledPlugins === "object") {
      setEnabledPlugins(parsed.enabledPlugins as Record<string, boolean>);
    }
    delete remaining.enabledPlugins;

    // 剩余字段存入 extraFields
    setExtraFields(remaining);
  }

  /** 用户编辑预览 JSON 时的回调 */
  function handlePreviewChange(value: string) {
    // 标记用户正在编辑预览
    isEditingPreview.current = true;
    if (editingTimer.current) clearTimeout(editingTimer.current);
    editingTimer.current = setTimeout(() => {
      isEditingPreview.current = false;
    }, 1000);

    // 直接更新预览文本
    setPreviewJson(value);

    // 尝试解析并反写表单
    parseJsonToForm(value);
  }

  /** 切换 Provider 时自动填充 API URL 并重置模型字段 */
  function handleProviderChange(newProviderId: string) {
    setProviderId(newProviderId);
    const p = (providers ?? []).find((pv) => pv.id === newProviderId);
    if (p) {
      if (!apiUrl) setApiUrl(p.apiUrl);
      setModel("");
      setHaikuModel("");
      setSonnetModel("");
      setOpusModel("");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !apiKey.trim() || jsonError) {
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
      agentTeamsEnabled: enableAgentTeams,
      enableExtraMarketplaces,
      hasCompletedOnboarding,
      useDefaults,
      enabledPlugins: Object.keys(enabledPlugins).length > 0 ? enabledPlugins : undefined,
      extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
      providerId: providerId || undefined,
      preferredLanguage,
    }, defaultsContent);
  }

  return (
    <div className="editor-drawer-container">
      <div
        className="editor-panel modal-large"
        role="dialog"
        aria-labelledby="config-modal-title"
        aria-modal="true"
      >
        <form onSubmit={handleSubmit}>
          <div className="editor-header">
            <button type="button" className="editor-back-btn" onClick={onClose} aria-label="关闭">
              <ChevronLeftIcon />
            </button>
            <h2 id="config-modal-title">{config ? t("configModal.editTitle") : t("configModal.addTitle")}</h2>
            <button
              type="submit"
              className="editor-save-btn"
              disabled={!name.trim() || !apiKey.trim() || !!jsonError}
            >
              {t("configModal.save")}
            </button>
          </div>
          <div className="editor-body">
            {/* 配置徽章 */}
            <div className="editor-badge-large">
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

            {/* Provider 选择 */}
            <div className="form-row">
              <div className="form-group full-width">
                <label className="form-label">{t("configModal.provider")}</label>
                <div className="provider-select-row">
                  <select
                    className="form-select"
                    value={providerId}
                    onChange={(e) => handleProviderChange(e.target.value)}
                  >
                    <option value="">{t("configModal.providerNone")}</option>
                    {(providers ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {selectedProvider?.docUrl && (
                    <a
                      href={selectedProvider.docUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="provider-doc-link"
                      title={t("providers.viewDocs")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </a>
                  )}
                </div>
                <span className="form-hint">{t("configModal.providerHint")}</span>
              </div>
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
                  list={selectedProvider ? "model-list-main" : undefined}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={t("configModal.modelPlaceholder")}
                />
                {selectedProvider && (
                  <datalist id="model-list-main">
                    {selectedProvider.models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </datalist>
                )}
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
                  list={selectedProvider ? "model-list-haiku" : undefined}
                  value={haikuModel}
                  onChange={(e) => setHaikuModel(e.target.value)}
                  placeholder={t("configModal.haikuModelPlaceholder")}
                />
                {selectedProvider && (
                  <datalist id="model-list-haiku">
                    {selectedProvider.models
                      .filter((m) => m.category === "haiku" || m.category === "other")
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </datalist>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="sonnetModel">{t("configModal.sonnetModel")}</label>
                <input
                  id="sonnetModel"
                  type="text"
                  list={selectedProvider ? "model-list-sonnet" : undefined}
                  value={sonnetModel}
                  onChange={(e) => setSonnetModel(e.target.value)}
                  placeholder={t("configModal.sonnetModelPlaceholder")}
                />
                {selectedProvider && (
                  <datalist id="model-list-sonnet">
                    {selectedProvider.models
                      .filter((m) => m.category === "sonnet" || m.category === "other")
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </datalist>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="opusModel">{t("configModal.opusModel")}</label>
                <input
                  id="opusModel"
                  type="text"
                  list={selectedProvider ? "model-list-opus" : undefined}
                  value={opusModel}
                  onChange={(e) => setOpusModel(e.target.value)}
                  placeholder={t("configModal.opusModelPlaceholder")}
                />
                {selectedProvider && (
                  <datalist id="model-list-opus">
                    {selectedProvider.models
                      .filter((m) => m.category === "opus" || m.category === "other")
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </datalist>
                )}
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
            <CollapsibleSection
              title={t("configModal.enabledPlugins")}
              badge={Object.values(enabledPlugins).filter(Boolean).length}
            >
              <PluginManager
                plugins={enabledPlugins}
                onChange={setEnabledPlugins}
              />
            </CollapsibleSection>

            {/* 高级选项 */}
            <CollapsibleSection title={t("configModal.advancedOptions")}>
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
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={enableAgentTeams}
                    onChange={(e) => setEnableAgentTeams(e.target.checked)}
                  />
                  <span className="checkbox-custom"></span>
                  <span>{t("configModal.enableAgentTeams")}</span>
                </label>
                <p className="form-hint">{t("configModal.enableAgentTeamsDesc")}</p>
              </div>
            </CollapsibleSection>

            {/* 通用配置 - 使用独立的 DefaultsSection 组件 */}
            <DefaultsSection
              useDefaults={useDefaults}
              onUseDefaultsChange={setUseDefaults}
              defaults={defaultsContent}
              onDefaultsChange={setDefaultsContent}
            />

            {/* 配置预览 - 使用独立的 ConfigPreview 组件展示最终合并后的 JSON */}
            <CollapsibleSection title={t("configModal.jsonPreview")}>
              <ConfigPreview
                content={previewJson}
                onChange={handlePreviewChange}
                jsonError={jsonError}
              />
            </CollapsibleSection>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ConfigEditor;
