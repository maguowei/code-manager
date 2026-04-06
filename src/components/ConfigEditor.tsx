import { useState, useEffect, useRef } from "react";
import { useForm, Controller, FieldError, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { invoke } from "@tauri-apps/api/core";
import { ClaudeConfig, Provider } from "../types";
import { useI18n } from "../i18n";
import { ClaudeConfigSchema, ClaudeConfigFormData } from "../schemas/config-schema";
import { FIELD_GROUPS } from "../schemas/field-groups";
import SchemaFormField from "./SchemaFormField";
import "./ConfigEditor.css";
import PluginManager from "./PluginManager";
import DefaultsSection from "./DefaultsSection";
import ConfigPreview from "./ConfigPreview";
import CollapsibleSection from "./CollapsibleSection";
import { ChevronLeftIcon } from "./Icons";

/** 将已有配置（或 null）映射为 react-hook-form 的初始值 */
function buildDefaultValues(config: ClaudeConfig | null, defaultLang: string): Partial<ClaudeConfigFormData> {
  const isNewConfig = config === null;

  return {
    name: config?.name ?? "",
    description: config?.description ?? "",
    apiKey: config?.apiKey ?? "",
    baseUrl: config?.baseUrl ?? "",
    websiteUrl: config?.websiteUrl ?? "",
    model: config?.model ?? "",
    haikuModel: config?.haikuModel ?? "",
    sonnetModel: config?.sonnetModel ?? "",
    opusModel: config?.opusModel ?? "",
    alwaysThinkingEnabled: config?.alwaysThinkingEnabled ?? isNewConfig,
    disableNonessentialTraffic: config?.disableNonessentialTraffic ?? isNewConfig,
    skipWebFetchPreflight: config?.skipWebFetchPreflight ?? isNewConfig,
    enableLspTool: config?.enableLspTool ?? isNewConfig,
    agentTeamsEnabled: config?.agentTeamsEnabled ?? false,
    hasCompletedOnboarding: config?.hasCompletedOnboarding ?? isNewConfig,
    enableExtraMarketplaces: config?.enableExtraMarketplaces ?? false,
    preferredLanguage: config?.preferredLanguage ?? defaultLang,
    useDefaults: config?.useDefaults ?? false,
    providerId: config?.providerId ?? "",
    enabledPlugins: config?.enabledPlugins,
  };
}

interface ConfigEditorProps {
  config: ClaudeConfig | null;
  defaults: string;
  providers?: Provider[];
  onSave: (
    config: Omit<ClaudeConfig, "id" | "createdAt" | "updatedAt" | "isActive">,
    defaults?: string
  ) => void;
  onClose: () => void;
}

function ConfigEditor({
  config,
  defaults,
  providers,
  onSave,
  onClose,
}: ConfigEditorProps) {
  const { t, language } = useI18n();
  const defaultPreferredLang = language === "zh" ? "chinese" : "english";

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ClaudeConfigFormData>({
    resolver: zodResolver(ClaudeConfigSchema) as Resolver<ClaudeConfigFormData>,
    defaultValues: buildDefaultValues(config, defaultPreferredLang),
    mode: "onBlur",
  });

  // 非 schema 管理的状态
  const [defaultsContent, setDefaultsContent] = useState(defaults ?? "");
  const [extraFields, setExtraFields] = useState<Record<string, unknown>>(
    config?.extraFields ?? {}
  );
  const [previewJson, setPreviewJson] = useState("{}");
  const [jsonError, setJsonError] = useState("");
  const isEditingPreview = useRef(false);
  const editingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 派生：当前选中的 Provider
  const providerId = watch("providerId");
  const selectedProvider =
    (providers ?? []).find((p) => p.id === providerId) ?? null;

  useEffect(() => {
    return () => {
      if (editingTimer.current) clearTimeout(editingTimer.current);
    };
  }, []);

  // 切换"使用通用配置"时，合并 enabledPlugins
  const useDefaultsVal = watch("useDefaults");
  useEffect(() => {
    if (!useDefaultsVal || !defaultsContent.trim()) {
      setValue("enabledPlugins", config?.enabledPlugins);
      return;
    }
    try {
      const obj = JSON.parse(defaultsContent.trim()) as Record<string, unknown>;
      if (obj.enabledPlugins && typeof obj.enabledPlugins === "object") {
        const merged = {
          ...(obj.enabledPlugins as Record<string, boolean>),
          ...(config?.enabledPlugins ?? {}),
        };
        setValue("enabledPlugins", merged);
      }
    } catch {
      // JSON 解析失败，忽略
    }
  }, [useDefaultsVal, defaultsContent, config?.enabledPlugins, setValue]);

  // 监听所有表单值生成预览（防抖 300ms）
  const formValues = watch();
  useEffect(() => {
    if (!formValues.apiKey) {
      setPreviewJson("{}");
      return;
    }
    if (isEditingPreview.current) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      const data = {
        name: formValues.name,
        description: formValues.description,
        apiKey: formValues.apiKey,
        baseUrl: formValues.baseUrl || null,
        websiteUrl: formValues.websiteUrl || null,
        model: formValues.model || null,
        haikuModel: formValues.haikuModel || null,
        sonnetModel: formValues.sonnetModel || null,
        opusModel: formValues.opusModel || null,
        alwaysThinkingEnabled: formValues.alwaysThinkingEnabled ?? null,
        disableNonessentialTraffic: formValues.disableNonessentialTraffic ?? null,
        skipWebFetchPreflight: formValues.skipWebFetchPreflight ?? null,
        enableLspTool: formValues.enableLspTool ?? null,
        agentTeamsEnabled: formValues.agentTeamsEnabled ?? null,
        hasCompletedOnboarding: formValues.hasCompletedOnboarding ?? null,
        enableExtraMarketplaces: formValues.enableExtraMarketplaces ?? null,
        preferredLanguage: formValues.preferredLanguage || null,
        useDefaults: formValues.useDefaults ?? null,
        enabledPlugins:
          formValues.enabledPlugins &&
          Object.keys(formValues.enabledPlugins).length > 0
            ? formValues.enabledPlugins
            : null,
        extraFields: Object.keys(extraFields).length > 0 ? extraFields : null,
        providerId: formValues.providerId || null,
      };
      const previewDefaults =
        formValues.useDefaults && defaultsContent.trim()
          ? defaultsContent.trim()
          : null;
      invoke<string>("preview_config", { data, defaults: previewDefaults })
        .then((result) => {
          if (!cancelled) {
            setPreviewJson(result);
            setJsonError("");
          }
        })
        .catch(() => {
          if (!cancelled) setPreviewJson("{}");
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formValues, defaultsContent, extraFields]);

  /** 从预览 JSON 反写表单字段（用于用户手动编辑 JSON 预览区） */
  function parseJsonToForm(jsonStr: string) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
      setJsonError("");
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "JSON 格式错误");
      return;
    }

    const remaining = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
    const env = (parsed.env ?? {}) as Record<string, string>;

    if (env.ANTHROPIC_AUTH_TOKEN !== undefined) setValue("apiKey", env.ANTHROPIC_AUTH_TOKEN);
    if (env.ANTHROPIC_BASE_URL !== undefined) setValue("baseUrl", env.ANTHROPIC_BASE_URL);
    if (env.ANTHROPIC_MODEL !== undefined) setValue("model", env.ANTHROPIC_MODEL);
    if (env.ANTHROPIC_DEFAULT_HAIKU_MODEL !== undefined) setValue("haikuModel", env.ANTHROPIC_DEFAULT_HAIKU_MODEL);
    if (env.ANTHROPIC_DEFAULT_SONNET_MODEL !== undefined) setValue("sonnetModel", env.ANTHROPIC_DEFAULT_SONNET_MODEL);
    if (env.ANTHROPIC_DEFAULT_OPUS_MODEL !== undefined) setValue("opusModel", env.ANTHROPIC_DEFAULT_OPUS_MODEL);
    setValue("disableNonessentialTraffic", env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC === "1");
    setValue("enableLspTool", env.ENABLE_LSP_TOOL === "1");
    setValue("agentTeamsEnabled", env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1");

    const knownEnvKeys = [
      "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
      "ANTHROPIC_DEFAULT_OPUS_MODEL", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
      "ENABLE_LSP_TOOL", "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
    ];
    if (remaining.env && typeof remaining.env === "object") {
      const remEnv = remaining.env as Record<string, unknown>;
      knownEnvKeys.forEach((k) => delete remEnv[k]);
      if (Object.keys(remEnv).length === 0) delete remaining.env;
    }

    if (typeof parsed.language === "string") setValue("preferredLanguage", parsed.language);
    else if (!("language" in parsed)) setValue("preferredLanguage", "english");
    delete remaining.language;

    setValue("alwaysThinkingEnabled", parsed.alwaysThinkingEnabled === true);
    delete remaining.alwaysThinkingEnabled;
    setValue("skipWebFetchPreflight", parsed.skipWebFetchPreflight === true);
    delete remaining.skipWebFetchPreflight;
    setValue("hasCompletedOnboarding", parsed.hasCompletedOnboarding === true);
    delete remaining.hasCompletedOnboarding;
    setValue("enableExtraMarketplaces", "extraKnownMarketplaces" in parsed);
    delete remaining.extraKnownMarketplaces;

    if (parsed.enabledPlugins && typeof parsed.enabledPlugins === "object") {
      setValue("enabledPlugins", parsed.enabledPlugins as Record<string, boolean>);
    }
    delete remaining.enabledPlugins;

    setExtraFields(remaining);
  }

  function handlePreviewChange(value: string) {
    isEditingPreview.current = true;
    if (editingTimer.current) clearTimeout(editingTimer.current);
    editingTimer.current = setTimeout(() => {
      isEditingPreview.current = false;
    }, 1000);
    setPreviewJson(value);
    parseJsonToForm(value);
  }

  /** 切换 Provider 时自动填充 baseUrl 及各 category 的默认模型 */
  function handleProviderChange(newProviderId: string) {
    setValue("providerId", newProviderId);
    const p = (providers ?? []).find((pv) => pv.id === newProviderId);
    if (p) {
      const find = (...cats: string[]) => {
        for (const cat of cats) {
          const m = p.models.find((m) => m.category === cat);
          if (m) return m.id;
        }
        return p.models[0]?.id ?? "";
      };
      setValue("baseUrl", p.baseUrl);
      setValue("model",       find("sonnet", "opus"));
      setValue("haikuModel",  find("haiku", "sonnet", "opus"));
      setValue("sonnetModel", find("sonnet", "opus"));
      setValue("opusModel",   find("opus"));
    } else {
      setValue("baseUrl", "");
      setValue("model", "");
      setValue("haikuModel", "");
      setValue("sonnetModel", "");
      setValue("opusModel", "");
    }
  }

  const onSubmit = (data: ClaudeConfigFormData) => {
    if (defaultsContent.trim()) {
      try {
        JSON.parse(defaultsContent.trim());
      } catch {
        return;
      }
    }
    // 若 baseUrl 与选中 Provider 预设相同，则不保存（让后端从 Provider 读取）
    const providerDefaultBaseUrl = selectedProvider?.baseUrl ?? "";
    const effectiveBaseUrl =
      data.baseUrl === providerDefaultBaseUrl ? undefined : data.baseUrl || undefined;

    onSave(
      {
        name: data.name,
        description: data.description,
        apiKey: data.apiKey,
        baseUrl: effectiveBaseUrl,
        websiteUrl: data.websiteUrl || undefined,
        model: data.model || undefined,
        haikuModel: data.haikuModel || undefined,
        sonnetModel: data.sonnetModel || undefined,
        opusModel: data.opusModel || undefined,
        alwaysThinkingEnabled: data.alwaysThinkingEnabled,
        disableNonessentialTraffic: data.disableNonessentialTraffic,
        skipWebFetchPreflight: data.skipWebFetchPreflight,
        enableLspTool: data.enableLspTool,
        agentTeamsEnabled: data.agentTeamsEnabled,
        enableExtraMarketplaces: data.enableExtraMarketplaces,
        hasCompletedOnboarding: data.hasCompletedOnboarding,
        useDefaults: data.useDefaults,
        enabledPlugins:
          data.enabledPlugins && Object.keys(data.enabledPlugins).length > 0
            ? data.enabledPlugins
            : undefined,
        extraFields:
          Object.keys(extraFields).length > 0 ? extraFields : undefined,
        providerId: data.providerId || undefined,
        preferredLanguage: data.preferredLanguage,
      },
      defaultsContent
    );
  };

  const watchName = watch("name");
  const watchApiKey = watch("apiKey");
  const advancedGroup = FIELD_GROUPS.find((g) => g.id === "advanced");

  return (
    <div className="editor-drawer-container">
      <div
        className="editor-panel modal-large"
        role="dialog"
        aria-labelledby="config-modal-title"
        aria-modal="true"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="editor-header">
            <button
              type="button"
              className="editor-back-btn"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <ChevronLeftIcon />
            </button>
            <h2 id="config-modal-title">
              {config ? t("configModal.editTitle") : t("configModal.addTitle")}
            </h2>
            <button
              type="submit"
              className="editor-save-btn"
              disabled={!watchName?.trim() || !watchApiKey?.trim() || !!jsonError}
            >
              {t("configModal.save")}
            </button>
          </div>

          <div className="editor-body">
            <div className="editor-badge-large">
              <span>{watchName ? watchName.charAt(0).toUpperCase() : "A"}</span>
            </div>

            {/* 基本信息：name + description（schema 驱动） */}
            <div className="form-row">
              <SchemaFormField
                field={FIELD_GROUPS[0].fields[0]}
                register={register}
                control={control}
                error={errors.name as FieldError | undefined}
              />
              <SchemaFormField
                field={FIELD_GROUPS[0].fields[1]}
                register={register}
                control={control}
                error={errors.description as FieldError | undefined}
              />
            </div>

            {/* websiteUrl */}
            <div className="form-group">
              <label htmlFor="websiteUrl">{t("configModal.websiteUrl")}</label>
              <input
                id="websiteUrl"
                type="url"
                className={errors.websiteUrl ? "input-error" : undefined}
                placeholder={t("configModal.websiteUrlPlaceholder")}
                {...register("websiteUrl")}
              />
              {errors.websiteUrl?.message && (
                <span className="field-error">{t(errors.websiteUrl.message as import("../i18n").TranslationKey)}</span>
              )}
            </div>

            {/* Provider 选择（自定义：含文档链接） */}
            <div className="form-row">
              <div className="form-group full-width">
                <label className="form-label">{t("configModal.provider")}</label>
                <div className="provider-select-row">
                  <select
                    className="form-select"
                    value={watch("providerId")}
                    onChange={(e) => handleProviderChange(e.target.value)}
                  >
                    <option value="">{t("configModal.providerNone")}</option>
                    {(providers ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
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
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  )}
                </div>
                <span className="form-hint">{t("configModal.providerHint")}</span>
              </div>
            </div>

            {/* API Key（schema 驱动，SchemaFormField password 类型含 show/hide） */}
            <SchemaFormField
              field={FIELD_GROUPS[0].fields[2]}
              register={register}
              control={control}
              error={errors.apiKey as FieldError | undefined}
            />

            {/* baseUrl（自定义：含提示文案） */}
            <div className="form-group form-group-compact">
              <div className="field-label-wrap">
                <label htmlFor="baseUrl">{t("configModal.baseUrl")}</label>
                <p className="form-hint warning form-hint-inline">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {t("configModal.baseUrlHint")}
                </p>
              </div>
              <input
                id="baseUrl"
                type="url"
                className={errors.baseUrl ? "input-error" : undefined}
                placeholder={t("configModal.baseUrlPlaceholder")}
                {...register("baseUrl")}
              />
              {errors.baseUrl?.message && (
                <span className="field-error">{t(errors.baseUrl.message as import("../i18n").TranslationKey)}</span>
              )}
            </div>

            {/* 模型配置（自定义：datalist 从 Provider 动态注入） */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="model">{t("configModal.model")}</label>
                <input
                  id="model"
                  type="text"
                  list={selectedProvider ? "model-list-main" : undefined}
                  placeholder={t("configModal.modelPlaceholder")}
                  {...register("model")}
                />
                {selectedProvider && (
                  <datalist id="model-list-main">
                    {selectedProvider.models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </datalist>
                )}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="haikuModel">{t("configModal.haikuModel")}</label>
                <input
                  id="haikuModel"
                  type="text"
                  list={selectedProvider ? "model-list-haiku" : undefined}
                  placeholder={t("configModal.haikuModelPlaceholder")}
                  {...register("haikuModel")}
                />
                {selectedProvider && (
                  <datalist id="model-list-haiku">
                    {selectedProvider.models
                      .filter((m) => m.category === "haiku" || m.category === "other")
                      .map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </datalist>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="sonnetModel">{t("configModal.sonnetModel")}</label>
                <input
                  id="sonnetModel"
                  type="text"
                  list={selectedProvider ? "model-list-sonnet" : undefined}
                  placeholder={t("configModal.sonnetModelPlaceholder")}
                  {...register("sonnetModel")}
                />
                {selectedProvider && (
                  <datalist id="model-list-sonnet">
                    {selectedProvider.models
                      .filter((m) => m.category === "sonnet" || m.category === "other")
                      .map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
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
                  placeholder={t("configModal.opusModelPlaceholder")}
                  {...register("opusModel")}
                />
                {selectedProvider && (
                  <datalist id="model-list-opus">
                    {selectedProvider.models
                      .filter((m) => m.category === "opus" || m.category === "other")
                      .map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </datalist>
                )}
              </div>
            </div>
            <p className="form-hint">{t("configModal.modelHint")}</p>

            {/* preferredLanguage */}
            <div className="form-group">
              <label htmlFor="preferredLanguage">{t("configModal.preferredLanguage")}</label>
              <select id="preferredLanguage" {...register("preferredLanguage")}>
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

            {/* enableExtraMarketplaces */}
            <div className="checkbox-group">
              <Controller
                name="enableExtraMarketplaces"
                control={control}
                render={({ field }) => (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={!!field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                    <span className="checkbox-custom" />
                    <span>{t("configModal.enableExtraMarketplaces")}</span>
                  </label>
                )}
              />
              <p className="form-hint">{t("configModal.enableExtraMarketplacesDesc")}</p>
            </div>

            {/* 已启用插件（Controller + PluginManager） */}
            <CollapsibleSection
              title={t("configModal.enabledPlugins")}
              badge={Object.values(watch("enabledPlugins") ?? {}).filter(Boolean).length}
            >
              <Controller
                name="enabledPlugins"
                control={control}
                render={({ field }) => (
                  <PluginManager
                    plugins={field.value ?? {}}
                    onChange={field.onChange}
                  />
                )}
              />
            </CollapsibleSection>

            {/* 高级选项（schema 驱动的 6 个 checkbox 字段） */}
            <CollapsibleSection title={t("configModal.advancedOptions")}>
              {advancedGroup?.fields.map((field) => (
                <SchemaFormField
                  key={field.name}
                  field={field}
                  register={register}
                  control={control}
                  error={errors[field.name as keyof ClaudeConfigFormData] as FieldError | undefined}
                />
              ))}
            </CollapsibleSection>

            {/* 通用配置 */}
            <DefaultsSection
              useDefaults={watch("useDefaults") ?? false}
              onUseDefaultsChange={(v) => setValue("useDefaults", v)}
              defaults={defaultsContent}
              onDefaultsChange={setDefaultsContent}
            />

            {/* 配置预览 */}
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
