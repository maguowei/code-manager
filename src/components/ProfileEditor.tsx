import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import type { ConfigProfile, SettingsPreset } from "../types";
import ConfigPreview from "./ConfigPreview";
import {
  applyEnvDefaults,
  applyPresetAutofill,
  cloneSettings,
  getEnabledPluginsSummary,
  presetDisplayName,
  prettyJson,
  readEnvString,
  readScopedSettingsWithEnv,
  readTopLevelObject,
  replaceScopedSettingsWithEnv,
  setEnvString,
  setTopLevelBoolean,
  setTopLevelObject,
  setTopLevelString,
} from "./config-workspace-utils";
import { InfoIcon } from "./Icons";
import EnabledPluginsEditor from "./profile-editor/EnabledPluginsEditor";
import EnvEditor from "./profile-editor/EnvEditor";
import { readBoolean, readString } from "./profile-editor/editor-utils";
import HooksEditor from "./profile-editor/HooksEditor";
import MarketplaceEditor from "./profile-editor/MarketplaceEditor";
import PermissionsEditor, {
  PermissionDefaultModeSelect,
  readPermissionsDefaultMode,
  setPermissionsDefaultMode,
} from "./profile-editor/PermissionsEditor";
import RequiredBadge from "./profile-editor/RequiredBadge";
import SandboxEditor, {
  getSandboxPresentation,
  SandboxSwitchControl,
  setSandboxEnabled,
} from "./profile-editor/SandboxEditor";
import SettingsSectionModePanel, {
  type SectionEditorMode,
} from "./profile-editor/SettingsSectionModePanel";
import {
  BEHAVIOR_ENV_SETTINGS_KEYS,
  BEHAVIOR_JSON_ALLOWED_KEYS,
  BEHAVIOR_TOP_LEVEL_SETTINGS_KEYS,
  PROFILE_SETTINGS_FORM_REGISTRY,
  type SettingsFieldDefinition,
  STRUCTURED_SETTINGS_KEYS,
} from "./profile-editor/settings-form-registry";
import { useObjectJsonEditor } from "./profile-editor/useObjectJsonEditor";
import "./ConfigEditor.css";
import "./ProfileEditor.css";

const AUTH_ENV_KEYS = ["ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"] as const;
const PURE_SETTINGS_SECTION_KEYS = [
  "behavior",
  "env",
  "permissions",
  "sandbox",
  "hooks",
  "marketplaces",
  "plugins",
] as const;
const LOW_FREQUENCY_SECTION_ORDER = [
  "permissions",
  "sandbox",
  "hooks",
  "marketplaces",
  "plugins",
] as const;
const BEHAVIOR_ENV_DEFAULTS = PROFILE_SETTINGS_FORM_REGISTRY.flatMap((field) =>
  field.storage === "env-only" && field.envKey && field.defaultValue
    ? [{ envKey: field.envKey, defaultValue: field.defaultValue }]
    : [],
);
type PureSettingsSectionKey = (typeof PURE_SETTINGS_SECTION_KEYS)[number];
type LowFrequencySectionKey = (typeof LOW_FREQUENCY_SECTION_ORDER)[number];

interface ProfileEditorProps {
  profile: ConfigProfile | null;
  presets: SettingsPreset[];
  onSave: (data: {
    id?: string;
    name: string;
    description: string;
    presetId?: string;
    settings: Record<string, unknown>;
  }) => Promise<void> | void;
  onClose: () => void;
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function createInitialSectionModes(): Record<PureSettingsSectionKey, SectionEditorMode> {
  return {
    behavior: "controls",
    env: "controls",
    permissions: "controls",
    sandbox: "controls",
    hooks: "controls",
    marketplaces: "controls",
    plugins: "controls",
  };
}

function buildEnvSubset(
  env: Record<string, unknown>,
  hiddenKeys: readonly string[],
): Record<string, unknown> {
  const hiddenKeySet = new Set(hiddenKeys);
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !hiddenKeySet.has(key)),
  ) as Record<string, unknown>;
}

function buildHiddenEnvEntries(
  env: Record<string, unknown>,
  hiddenKeys: readonly string[],
): Record<string, unknown> {
  const hiddenKeySet = new Set(hiddenKeys);
  return Object.fromEntries(Object.entries(env).filter(([key]) => hiddenKeySet.has(key))) as Record<
    string,
    unknown
  >;
}

function ProfileEditor({ profile, presets, onSave, onClose }: ProfileEditorProps) {
  const { language, t } = useI18n();
  const [name, setName] = useState(profile?.name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [presetId, setPresetId] = useState(profile?.presetId ?? "");
  const [settings, setSettings] = useState<Record<string, unknown>>(
    applyEnvDefaults(cloneSettings(profile?.settings), BEHAVIOR_ENV_DEFAULTS),
  );
  const [rawJson, setRawJson] = useState(
    prettyJson(applyEnvDefaults(cloneSettings(profile?.settings), BEHAVIOR_ENV_DEFAULTS)),
  );
  const [rawJsonError, setRawJsonError] = useState("");
  const [previewJson, setPreviewJson] = useState("{}");
  const [previewError, setPreviewError] = useState("");
  const [expertOpen, setExpertOpen] = useState(false);
  const [sectionModes, setSectionModes] =
    useState<Record<PureSettingsSectionKey, SectionEditorMode>>(createInitialSectionModes);
  const [environmentExpanded, setEnvironmentExpanded] = useState(false);
  const [activeAccordionSection, setActiveAccordionSection] =
    useState<LowFrequencySectionKey | null>(null);
  const [editorErrors, setEditorErrors] = useState<Record<string, string>>({});
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === presetId) ?? null,
    [presetId, presets],
  );
  const behaviorSettings = useMemo(
    () =>
      readScopedSettingsWithEnv(
        settings,
        BEHAVIOR_TOP_LEVEL_SETTINGS_KEYS,
        BEHAVIOR_ENV_SETTINGS_KEYS,
      ),
    [settings],
  );
  const behaviorJsonEditor = useObjectJsonEditor({
    value: behaviorSettings,
    onChange: (next) =>
      applySettings(
        replaceScopedSettingsWithEnv(
          settings,
          BEHAVIOR_TOP_LEVEL_SETTINGS_KEYS,
          BEHAVIOR_ENV_SETTINGS_KEYS,
          next,
        ),
      ),
    label: t("profiles.editor.sections.behavior"),
    isZh: language === "zh",
    allowedKeys: BEHAVIOR_JSON_ALLOWED_KEYS,
  });
  const envObject = useMemo(() => readTopLevelObject(settings, "env"), [settings]);
  const hiddenAuthEnvEntries = useMemo(
    () => buildHiddenEnvEntries(envObject, AUTH_ENV_KEYS),
    [envObject],
  );
  const visibleEnvSettings = useMemo(() => buildEnvSubset(envObject, AUTH_ENV_KEYS), [envObject]);
  const envJsonEditor = useObjectJsonEditor({
    value: visibleEnvSettings,
    onChange: (next) => handleStructuredObjectChange("env", { ...hiddenAuthEnvEntries, ...next }),
    label: t("profiles.editor.sections.environment"),
    isZh: language === "zh",
  });
  const permissionsJsonEditor = useObjectJsonEditor({
    value: settings.permissions,
    onChange: (next) => handleStructuredObjectChange("permissions", next),
    label: t("profiles.editor.sections.permissions"),
    isZh: language === "zh",
  });
  const sandboxJsonEditor = useObjectJsonEditor({
    value: settings.sandbox,
    onChange: (next) => handleStructuredObjectChange("sandbox", next),
    label: t("profiles.editor.sections.sandbox"),
    isZh: language === "zh",
  });
  const hooksJsonEditor = useObjectJsonEditor({
    value: settings.hooks,
    onChange: (next) => handleStructuredObjectChange("hooks", next),
    label: t("profiles.editor.sections.hooks"),
    isZh: language === "zh",
  });
  const marketplacesJsonEditor = useObjectJsonEditor({
    value: settings.extraKnownMarketplaces,
    onChange: (next) => handleStructuredObjectChange("extraKnownMarketplaces", next),
    label: t("profiles.editor.sections.marketplaces"),
    isZh: language === "zh",
  });
  const pluginsJsonEditor = useObjectJsonEditor({
    value: settings.enabledPlugins,
    onChange: (next) => handleStructuredObjectChange("enabledPlugins", next),
    label: t("profiles.editor.sections.plugins"),
    isZh: language === "zh",
  });

  const supportedKeysInSettings = useMemo(
    () =>
      Object.keys(settings)
        .filter((key) => STRUCTURED_SETTINGS_KEYS.has(key))
        .sort(),
    [settings],
  );
  const enabledPluginsSummary = useMemo(
    () => getEnabledPluginsSummary(settings.enabledPlugins),
    [settings],
  );
  const visibleEnvCount = useMemo(
    () => Object.keys(visibleEnvSettings).length,
    [visibleEnvSettings],
  );
  const marketplaceCount = useMemo(
    () => Object.keys(readTopLevelObject(settings, "extraKnownMarketplaces")).length,
    [settings],
  );
  const permissionsDefaultMode = useMemo(
    () => readPermissionsDefaultMode(settings.permissions),
    [settings.permissions],
  );
  const hooksTypeCount = useMemo(
    () => Object.keys(readTopLevelObject(settings, "hooks")).length,
    [settings],
  );
  const sandboxPresentation = useMemo(
    () => getSandboxPresentation(settings.sandbox, language === "zh"),
    [settings.sandbox, language],
  );

  function setSectionError(section: string, message: string) {
    setEditorErrors((current) => {
      if (!message) {
        if (!current[section]) {
          return current;
        }
        const next = { ...current };
        delete next[section];
        return next;
      }
      if (current[section] === message) {
        return current;
      }
      return {
        ...current,
        [section]: message,
      };
    });
  }

  function applySettings(next: Record<string, unknown>) {
    const normalized = applyEnvDefaults(next, BEHAVIOR_ENV_DEFAULTS);
    const nextJson = prettyJson(normalized);
    if (nextJson === prettyJson(settings)) {
      setRawJson(nextJson);
      setRawJsonError("");
      return;
    }
    setSettings(normalized);
    setRawJson(nextJson);
    setRawJsonError("");
  }

  useEffect(() => {
    if (editorErrors.env || envJsonEditor.jsonError) {
      setEnvironmentExpanded(true);
    }
  }, [editorErrors.env, envJsonEditor.jsonError]);

  useEffect(() => {
    const firstErrorSection = LOW_FREQUENCY_SECTION_ORDER.find((section) => {
      switch (section) {
        case "permissions":
          return Boolean(editorErrors.permissions || permissionsJsonEditor.jsonError);
        case "sandbox":
          return Boolean(editorErrors.sandbox || sandboxJsonEditor.jsonError);
        case "hooks":
          return Boolean(editorErrors.hooks || hooksJsonEditor.jsonError);
        case "marketplaces":
          return Boolean(editorErrors.extraKnownMarketplaces || marketplacesJsonEditor.jsonError);
        case "plugins":
          return Boolean(editorErrors.enabledPlugins || pluginsJsonEditor.jsonError);
        default:
          return false;
      }
    });

    if (firstErrorSection) {
      setActiveAccordionSection(firstErrorSection);
    }
  }, [
    editorErrors.enabledPlugins,
    editorErrors.extraKnownMarketplaces,
    editorErrors.hooks,
    editorErrors.permissions,
    editorErrors.sandbox,
    hooksJsonEditor.jsonError,
    marketplacesJsonEditor.jsonError,
    permissionsJsonEditor.jsonError,
    pluginsJsonEditor.jsonError,
    sandboxJsonEditor.jsonError,
  ]);

  function handleRawJsonChange(value: string) {
    setRawJson(value);
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (Array.isArray(parsed) || parsed === null || typeof parsed !== "object") {
        throw new Error(t("profiles.editor.validation.settingsObject"));
      }
      const normalized = applyEnvDefaults(parsed, BEHAVIOR_ENV_DEFAULTS);
      setSettings(normalized);
      setRawJson(prettyJson(normalized));
      setRawJsonError("");
    } catch (error) {
      setRawJsonError(error instanceof Error ? error.message : String(error));
    }
  }

  function handleSimpleFieldChange(field: SettingsFieldDefinition, value: string | boolean) {
    const next =
      field.kind === "checkbox"
        ? setTopLevelBoolean(settings, field.key, value === true)
        : field.storage === "env-only" && field.envKey
          ? setEnvString(settings, field.envKey, typeof value === "string" ? value : "")
          : setTopLevelString(settings, field.key, typeof value === "string" ? value : "");
    applySettings(next);
  }

  function toggleAccordionSection(section: LowFrequencySectionKey) {
    setActiveAccordionSection((current) => (current === section ? null : section));
  }

  function readBehaviorFieldState(field: SettingsFieldDefinition) {
    if (field.envKey) {
      return {
        mappedToEnv: true,
        value: readEnvString(settings, field.envKey) || field.defaultValue || "",
      };
    }
    return {
      mappedToEnv: false,
      value: readString(settings[field.key]),
    };
  }

  function handleMappedFieldChange(
    field: SettingsFieldDefinition,
    value: string,
    _mappedToEnv: boolean,
  ) {
    if (field.envKey) {
      applySettings(setEnvString(settings, field.envKey, value));
      return;
    }
    handleSimpleFieldChange(field, value);
  }

  function resolveSelectOptions(
    field: SettingsFieldDefinition,
    currentValue: string,
    _mappedToEnv: boolean,
  ) {
    const filteredOptions = field.options ?? [];

    if (currentValue && !filteredOptions.some((option) => option.value === currentValue)) {
      return [
        ...filteredOptions,
        {
          value: currentValue,
          label: {
            zh: `自定义：${currentValue}`,
            en: `Custom: ${currentValue}`,
          },
        },
      ];
    }

    return filteredOptions;
  }

  function handleStructuredObjectChange(key: string, value: Record<string, unknown>) {
    applySettings(setTopLevelObject(settings, key, value));
  }

  function handleSectionModeChange(section: PureSettingsSectionKey, mode: SectionEditorMode) {
    setSectionModes((current) => {
      if (current[section] === mode) {
        return current;
      }
      return {
        ...current,
        [section]: mode,
      };
    });
  }

  function handlePresetChange(nextPresetId: string) {
    setPresetId(nextPresetId);
    applySettings(applyPresetAutofill(settings, presets, nextPresetId || undefined));
  }

  function handleSaveClick() {
    if (
      !name.trim() ||
      rawJsonError ||
      behaviorJsonEditor.jsonError ||
      envJsonEditor.jsonError ||
      permissionsJsonEditor.jsonError ||
      sandboxJsonEditor.jsonError ||
      hooksJsonEditor.jsonError ||
      marketplacesJsonEditor.jsonError ||
      pluginsJsonEditor.jsonError
    ) {
      return;
    }
    if (Object.values(editorErrors).some(Boolean)) {
      return;
    }

    void onSave({
      id: profile?.id,
      name: name.trim(),
      description: description.trim(),
      presetId: presetId || undefined,
      settings,
    });
  }

  useEffect(() => {
    let cancelled = false;
    void invoke<string>("preview_profile", {
      data: {
        id: profile?.id ?? null,
        name,
        description,
        presetId: presetId || null,
        settings,
      },
    })
      .then((value) => {
        if (cancelled) {
          return;
        }
        setPreviewJson(value);
        setPreviewError("");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setPreviewJson("{}");
        setPreviewError(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [description, name, presetId, profile?.id, settings]);

  const behaviorFields = PROFILE_SETTINGS_FORM_REGISTRY.filter(
    (field) => field.section === "behavior",
  );
  const scalarFields = behaviorFields.filter((field) => field.kind !== "checkbox");
  const toggleFields = behaviorFields.filter((field) => field.kind === "checkbox");
  const scalarFieldRows = useMemo(() => chunkItems(scalarFields, 2), [scalarFields]);
  const toggleFieldRows = useMemo(() => chunkItems(toggleFields, 2), [toggleFields]);
  const hasValidationError =
    !!rawJsonError ||
    !!behaviorJsonEditor.jsonError ||
    !!envJsonEditor.jsonError ||
    !!permissionsJsonEditor.jsonError ||
    !!sandboxJsonEditor.jsonError ||
    !!hooksJsonEditor.jsonError ||
    !!marketplacesJsonEditor.jsonError ||
    !!pluginsJsonEditor.jsonError ||
    Object.values(editorErrors).some(Boolean);

  const messages = {
    title: profile ? t("profiles.editor.title.edit") : t("profiles.editor.title.add"),
    save: t("profiles.editor.save"),
    name: t("profiles.editor.fields.name"),
    namePlaceholder: t("profiles.editor.placeholders.name"),
    description: t("profiles.editor.fields.description"),
    descriptionPlaceholder: t("profiles.editor.placeholders.description"),
    preset: t("profiles.editor.fields.preset"),
    authToken: t("profiles.editor.fields.authToken"),
    baseUrl: t("profiles.editor.fields.baseUrl"),
    presetHint: t("profiles.editor.hints.preset"),
    suggestedModels: t("profiles.editor.hints.suggestedModels"),
    basicInfo: t("profiles.editor.sections.basicInfo"),
    auth: t("profiles.editor.sections.auth"),
    behavior: t("profiles.editor.sections.behavior"),
    environment: t("profiles.editor.sections.environment"),
    behaviorJsonHint: t("profiles.editor.hints.behaviorJson"),
    permissions: t("profiles.editor.sections.permissions"),
    sandbox: t("profiles.editor.sections.sandbox"),
    hooks: t("profiles.editor.sections.hooks"),
    marketplaces: t("profiles.editor.sections.marketplaces"),
    plugins: t("profiles.editor.sections.plugins"),
    preview: t("profiles.editor.sections.preview"),
    expertOpen: t("profiles.editor.expert.open"),
    expertClose: t("profiles.editor.expert.close"),
    expertHint: t("profiles.editor.hints.expert"),
    expertStructuredKeys: t("profiles.editor.hints.expertStructuredKeys"),
  };

  return (
    <div className="editor-panel profile-editor-panel">
      <div className="editor-header">
        <button
          type="button"
          className="editor-back-btn"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          ←
        </button>
        <h2>{messages.title}</h2>
        <button
          type="button"
          className="editor-save-btn"
          disabled={!name.trim() || hasValidationError}
          onClick={handleSaveClick}
        >
          {messages.save}
        </button>
      </div>

      <div className="editor-body profile-editor-body">
        <section className="profile-editor-section">
          <div className="profile-section-heading">
            <h3>{messages.basicInfo}</h3>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="profile-name" className="label-required">
                <span>{messages.name}</span>
                <RequiredBadge />
              </label>
              <input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={messages.namePlaceholder}
              />
            </div>
            <div className="form-group">
              <label htmlFor="profile-description">{messages.description}</label>
              <input
                id="profile-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={messages.descriptionPlaceholder}
              />
            </div>
          </div>
        </section>

        <section className="profile-editor-section">
          <div className="profile-section-heading">
            <h3>{messages.auth}</h3>
          </div>

          <div className="form-group">
            <label htmlFor="profile-preset">{messages.preset}</label>
            <select
              id="profile-preset"
              className="form-select"
              value={presetId}
              onChange={(event) => handlePresetChange(event.target.value)}
            >
              <option value="">{t("profiles.editor.options.noPreset")}</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {presetDisplayName(preset, language)}
                </option>
              ))}
            </select>
            <p className="form-hint">{messages.presetHint}</p>
          </div>

          <div className="form-group">
            <label htmlFor="profile-base-url">{messages.baseUrl}</label>
            <input
              id="profile-base-url"
              value={readEnvString(settings, "ANTHROPIC_BASE_URL")}
              placeholder="https://api.anthropic.com"
              onChange={(event) =>
                applySettings(setEnvString(settings, "ANTHROPIC_BASE_URL", event.target.value))
              }
            />
          </div>

          <div className="form-group">
            <label htmlFor="profile-auth-token">{messages.authToken}</label>
            <input
              id="profile-auth-token"
              value={readEnvString(settings, "ANTHROPIC_AUTH_TOKEN")}
              placeholder="sk-ant-..."
              onChange={(event) =>
                applySettings(setEnvString(settings, "ANTHROPIC_AUTH_TOKEN", event.target.value))
              }
            />
          </div>

          {selectedPreset && selectedPreset.modelSuggestions.length > 0 && (
            <div className="form-group">
              <label>{messages.suggestedModels}</label>
              <div className="profile-chip-list">
                {selectedPreset.modelSuggestions.map((model) => (
                  <button
                    key={model}
                    type="button"
                    className="profile-chip"
                    onClick={() =>
                      handleSimpleFieldChange(scalarFields[0] as SettingsFieldDefinition, model)
                    }
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <SettingsSectionModePanel
          title={messages.behavior}
          mode={sectionModes.behavior}
          onModeChange={(mode) => handleSectionModeChange("behavior", mode)}
          controls={
            <>
              {scalarFieldRows.map((row) => (
                <div
                  key={`profile-behavior-row-${row.map((field) => field.key).join("-")}`}
                  className="form-row"
                >
                  {row.map((field) => {
                    const label = field.label[language];
                    const fieldState = readBehaviorFieldState(field);
                    if (field.kind === "select") {
                      const options = resolveSelectOptions(
                        field,
                        fieldState.value,
                        fieldState.mappedToEnv,
                      );
                      return (
                        <div key={field.key} className="form-group">
                          {renderBehaviorFieldHeader(field, label, `profile-field-${field.key}`)}
                          <select
                            id={`profile-field-${field.key}`}
                            className="form-select"
                            value={fieldState.value}
                            onChange={(event) =>
                              handleMappedFieldChange(
                                field,
                                event.target.value,
                                fieldState.mappedToEnv,
                              )
                            }
                          >
                            {options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label[language]}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    return (
                      <div key={field.key} className="form-group">
                        {renderBehaviorFieldHeader(field, label, `profile-field-${field.key}`)}
                        <input
                          id={`profile-field-${field.key}`}
                          value={fieldState.value}
                          placeholder={field.placeholder ? field.placeholder[language] : ""}
                          onChange={(event) =>
                            handleMappedFieldChange(
                              field,
                              event.target.value,
                              fieldState.mappedToEnv,
                            )
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              ))}

              {toggleFieldRows.map((row) => (
                <div
                  key={`profile-toggle-row-${row.map((field) => field.key).join("-")}`}
                  className="profile-toggle-grid"
                >
                  {row.map((field) => (
                    <label key={field.key} className="profile-toggle-item">
                      <input
                        type="checkbox"
                        checked={readBoolean(settings[field.key])}
                        onChange={(event) => handleSimpleFieldChange(field, event.target.checked)}
                      />
                      <span>{field.label[language]}</span>
                    </label>
                  ))}
                </div>
              ))}
            </>
          }
          jsonEditor={behaviorJsonEditor}
          jsonHint={messages.behaviorJsonHint}
          error={behaviorJsonEditor.jsonError}
        />

        <SettingsSectionModePanel
          title={messages.environment}
          variant="accordion"
          mode={sectionModes.env}
          onModeChange={(mode) => handleSectionModeChange("env", mode)}
          controls={
            <EnvEditor
              value={envObject}
              onChange={(value) => handleStructuredObjectChange("env", value)}
              onError={(message) => setSectionError("env", message)}
              showTitle={false}
              hiddenKeys={[...AUTH_ENV_KEYS]}
            />
          }
          jsonEditor={envJsonEditor}
          jsonHint={t("common.sectionJsonHint")}
          error={editorErrors.env || envJsonEditor.jsonError}
          expanded={environmentExpanded}
          onToggleExpanded={() => setEnvironmentExpanded((current) => !current)}
          badgeCount={visibleEnvCount}
        />

        <SettingsSectionModePanel
          title={messages.permissions}
          variant="accordion"
          mode={sectionModes.permissions}
          onModeChange={(mode) => handleSectionModeChange("permissions", mode)}
          controls={
            <PermissionsEditor
              value={settings.permissions}
              onChange={(value) => handleStructuredObjectChange("permissions", value)}
              onError={(message) => setSectionError("permissions", message)}
            />
          }
          jsonEditor={permissionsJsonEditor}
          jsonHint={t("common.sectionJsonHint")}
          error={editorErrors.permissions || permissionsJsonEditor.jsonError}
          expanded={activeAccordionSection === "permissions"}
          onToggleExpanded={() => toggleAccordionSection("permissions")}
          headerControl={
            <PermissionDefaultModeSelect
              variant="header"
              value={permissionsDefaultMode}
              ariaLabel={language === "zh" ? "权限头部默认模式" : "Permissions header default mode"}
              onChange={(value) =>
                handleStructuredObjectChange(
                  "permissions",
                  setPermissionsDefaultMode(settings.permissions, value),
                )
              }
            />
          }
        />

        <SettingsSectionModePanel
          title={messages.sandbox}
          variant="accordion"
          mode={sectionModes.sandbox}
          onModeChange={(mode) => handleSectionModeChange("sandbox", mode)}
          controls={
            <SandboxEditor
              value={settings.sandbox}
              onError={(message) => setSectionError("sandbox", message)}
            />
          }
          jsonEditor={sandboxJsonEditor}
          jsonHint={t("common.sectionJsonHint")}
          error={editorErrors.sandbox || sandboxJsonEditor.jsonError}
          expanded={activeAccordionSection === "sandbox"}
          onToggleExpanded={() => toggleAccordionSection("sandbox")}
          headerMeta={sandboxPresentation.headerSummary}
          headerControl={
            <SandboxSwitchControl
              enabled={sandboxPresentation.enabled}
              isZh={language === "zh"}
              ariaLabel={language === "zh" ? "Sandbox 头部开关" : "Sandbox header toggle"}
              variant="header"
              visibleLabel={language === "zh" ? "沙盒开关" : "Sandbox"}
              onToggle={() =>
                handleStructuredObjectChange(
                  "sandbox",
                  setSandboxEnabled(settings.sandbox, !sandboxPresentation.enabled),
                )
              }
            />
          }
        />

        <SettingsSectionModePanel
          title={messages.hooks}
          variant="accordion"
          badgeCount={hooksTypeCount}
          mode={sectionModes.hooks}
          onModeChange={(mode) => handleSectionModeChange("hooks", mode)}
          controls={
            <HooksEditor
              value={settings.hooks}
              onChange={(value) => handleStructuredObjectChange("hooks", value)}
              onError={(message) => setSectionError("hooks", message)}
            />
          }
          jsonEditor={hooksJsonEditor}
          jsonHint={t("common.sectionJsonHint")}
          error={editorErrors.hooks || hooksJsonEditor.jsonError}
          expanded={activeAccordionSection === "hooks"}
          onToggleExpanded={() => toggleAccordionSection("hooks")}
        />

        <SettingsSectionModePanel
          title={messages.marketplaces}
          variant="accordion"
          badgeCount={marketplaceCount}
          mode={sectionModes.marketplaces}
          onModeChange={(mode) => handleSectionModeChange("marketplaces", mode)}
          controls={
            <MarketplaceEditor
              value={settings.extraKnownMarketplaces}
              onChange={(value) => handleStructuredObjectChange("extraKnownMarketplaces", value)}
              onError={(message) => setSectionError("extraKnownMarketplaces", message)}
              showTitle={false}
            />
          }
          jsonEditor={marketplacesJsonEditor}
          jsonHint={t("common.sectionJsonHint")}
          error={editorErrors.extraKnownMarketplaces || marketplacesJsonEditor.jsonError}
          expanded={activeAccordionSection === "marketplaces"}
          onToggleExpanded={() => toggleAccordionSection("marketplaces")}
        />

        <SettingsSectionModePanel
          title={messages.plugins}
          variant="accordion"
          mode={sectionModes.plugins}
          onModeChange={(mode) => handleSectionModeChange("plugins", mode)}
          controls={
            <EnabledPluginsEditor
              value={settings.enabledPlugins}
              onChange={(value) => handleStructuredObjectChange("enabledPlugins", value)}
              onError={(message) => setSectionError("enabledPlugins", message)}
              showTitle={false}
            />
          }
          jsonEditor={pluginsJsonEditor}
          jsonHint={t("common.sectionJsonHint")}
          error={editorErrors.enabledPlugins || pluginsJsonEditor.jsonError}
          expanded={activeAccordionSection === "plugins"}
          onToggleExpanded={() => toggleAccordionSection("plugins")}
          headerMeta={`${t("common.pluginsEnabledSummaryLabel")} ${enabledPluginsSummary.enabledCount}/${enabledPluginsSummary.totalCount}`}
        />

        <section className="profile-editor-section">
          <div className="profile-section-heading">
            <h3>{messages.preview}</h3>
            <button
              type="button"
              className="profile-secondary-btn"
              onClick={() => setExpertOpen((current) => !current)}
            >
              {expertOpen ? messages.expertClose : messages.expertOpen}
            </button>
          </div>

          <div className="form-group">
            <ConfigPreview content={previewJson} jsonError={previewError} />
          </div>

          {expertOpen && (
            <div className="profile-expert-panel">
              <p className="form-hint">{messages.expertHint}</p>
              {supportedKeysInSettings.length > 0 && (
                <div className="profile-supported-keys">
                  <span>{messages.expertStructuredKeys}</span>
                  <div className="profile-chip-list">
                    {supportedKeysInSettings.map((key) => (
                      <span key={key} className="profile-key-badge">
                        {key}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <ConfigPreview
                content={rawJson}
                onChange={handleRawJsonChange}
                jsonError={rawJsonError}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function renderBehaviorFieldHeader(field: SettingsFieldDefinition, label: string, inputId: string) {
  return (
    <div className="profile-field-header">
      <label htmlFor={inputId} className="profile-field-label">
        {label}
      </label>
      {field.envKey ? (
        <button
          type="button"
          className="profile-field-help"
          aria-label={field.envKey}
          data-tooltip={field.envKey}
          title={field.envKey}
        >
          <InfoIcon />
        </button>
      ) : null}
    </div>
  );
}

export default ProfileEditor;
