import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import type { ConfigProfile, SettingsPreset } from "../types";
import {
  applyEnvDefaults,
  applyPresetAutofill,
  cloneSettings,
  getEnabledPluginsSummary,
  presetDisplayName,
  readEnvString,
  readScopedSettingsWithEnv,
  readTopLevelObject,
  replaceScopedSettingsWithEnv,
  setEnvString,
  setTopLevelBoolean,
  setTopLevelObject,
  setTopLevelString,
} from "./config-workspace-utils";
import ProfileNameBadge from "./ProfileNameBadge";
import {
  AUTH_ENV_KEYS,
  BEHAVIOR_ENV_DEFAULTS,
  buildEnvSubset,
  buildHiddenEnvEntries,
  chunkItems,
} from "./profile-editor/editor-shared-constants";
import { readString } from "./profile-editor/editor-utils";
import { readPermissionsDefaultMode } from "./profile-editor/PermissionsEditor";
import RequiredBadge from "./profile-editor/RequiredBadge";
import { getSandboxPresentation } from "./profile-editor/SandboxEditor";
import StructuredSettingsSections from "./profile-editor/StructuredSettingsSections";
import {
  BEHAVIOR_ENV_SETTINGS_KEYS,
  BEHAVIOR_JSON_ALLOWED_KEYS,
  BEHAVIOR_TOP_LEVEL_SETTINGS_KEYS,
  PROFILE_SETTINGS_FORM_REGISTRY,
  type SettingsFieldDefinition,
  STRUCTURED_SETTINGS_KEYS,
} from "./profile-editor/settings-form-registry";
import { useDocumentJsonEditor } from "./profile-editor/useDocumentJsonEditor";
import { useObjectJsonEditor } from "./profile-editor/useObjectJsonEditor";
import useStructuredSettingsSectionState from "./profile-editor/useStructuredSettingsSectionState";
import "./ConfigEditor.css";
import "./ProfileEditor.css";

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

function ProfileEditor({ profile, presets, onSave, onClose }: ProfileEditorProps) {
  const { language, t } = useI18n();
  const [name, setName] = useState(profile?.name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [presetId, setPresetId] = useState(profile?.presetId ?? "");
  const [settings, setSettings] = useState<Record<string, unknown>>(
    applyEnvDefaults(cloneSettings(profile?.settings), BEHAVIOR_ENV_DEFAULTS),
  );
  const [previewJson, setPreviewJson] = useState("{}");
  const [previewError, setPreviewError] = useState("");
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
  const sectionState = useStructuredSettingsSectionState({
    env: envJsonEditor.jsonError,
    permissions: permissionsJsonEditor.jsonError,
    sandbox: sandboxJsonEditor.jsonError,
    hooks: hooksJsonEditor.jsonError,
    marketplaces: marketplacesJsonEditor.jsonError,
    plugins: pluginsJsonEditor.jsonError,
  });

  const supportedKeysInSettings = useMemo(
    () =>
      Object.keys(settings)
        .filter((key) => STRUCTURED_SETTINGS_KEYS.has(key))
        .sort(),
    [settings],
  );
  const documentJsonEditor = useDocumentJsonEditor({
    value: settings,
    onApply: applySettings,
    validateMessage: t("profiles.editor.validation.settingsObject"),
    normalize: (next) => applyEnvDefaults(next, BEHAVIOR_ENV_DEFAULTS),
  });
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

  function applySettings(next: Record<string, unknown>) {
    const normalized = applyEnvDefaults(next, BEHAVIOR_ENV_DEFAULTS);
    if (JSON.stringify(normalized) === JSON.stringify(settings)) {
      return;
    }

    setSettings(normalized);
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

  function handlePresetChange(nextPresetId: string) {
    setPresetId(nextPresetId);
    applySettings(applyPresetAutofill(settings, presets, nextPresetId || undefined));
  }

  function handleSaveClick() {
    if (
      !name.trim() ||
      documentJsonEditor.jsonError ||
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
    if (sectionState.hasEditorErrors) {
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
    const timer = setTimeout(() => {
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
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [description, name, presetId, profile?.id, settings]);

  const behaviorFields = PROFILE_SETTINGS_FORM_REGISTRY.filter(
    (field) => field.section === "behavior",
  );
  const modelField = behaviorFields.find((field) => field.key === "model") ?? null;
  const scalarFields = behaviorFields.filter((field) => field.kind !== "checkbox");
  const toggleFields = behaviorFields.filter((field) => field.kind === "checkbox");
  const scalarFieldRows = useMemo(() => chunkItems(scalarFields, 2), [scalarFields]);
  const toggleFieldRows = useMemo(() => chunkItems(toggleFields, 2), [toggleFields]);
  const hasValidationError =
    !!documentJsonEditor.jsonError ||
    !!behaviorJsonEditor.jsonError ||
    !!envJsonEditor.jsonError ||
    !!permissionsJsonEditor.jsonError ||
    !!sandboxJsonEditor.jsonError ||
    !!hooksJsonEditor.jsonError ||
    !!marketplacesJsonEditor.jsonError ||
    !!pluginsJsonEditor.jsonError ||
    sectionState.hasEditorErrors;

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
    previewMode: t("common.previewMode"),
    editSourceJson: t("profiles.editor.modes.editSourceJson"),
    expertHint: t("profiles.editor.hints.expert"),
    expertStructuredKeys: t("profiles.editor.hints.expertStructuredKeys"),
  };
  const topBadgeSeed = profile?.id ?? (name.trim() || "profile");

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
        <ProfileNameBadge
          name={name}
          seed={topBadgeSeed}
          size="lg"
          fallbackChar="P"
          className="editor-badge-large"
        />

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
                    onClick={() => {
                      if (modelField) {
                        handleSimpleFieldChange(modelField, model);
                      }
                    }}
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <StructuredSettingsSections
          scope="profiles"
          settings={settings}
          supportedKeys={supportedKeysInSettings}
          previewContent={previewJson}
          previewError={previewError}
          hiddenAuthEnvKeys={AUTH_ENV_KEYS}
          visibleEnvCount={visibleEnvCount}
          marketplaceCount={marketplaceCount}
          permissionsDefaultMode={permissionsDefaultMode}
          hooksTypeCount={hooksTypeCount}
          sandboxPresentation={sandboxPresentation}
          enabledPluginsSummary={enabledPluginsSummary}
          scalarFieldRows={scalarFieldRows}
          toggleFieldRows={toggleFieldRows}
          readBehaviorFieldState={readBehaviorFieldState}
          resolveSelectOptions={resolveSelectOptions}
          onMappedFieldChange={handleMappedFieldChange}
          onSimpleFieldChange={handleSimpleFieldChange}
          onStructuredObjectChange={handleStructuredObjectChange}
          sectionState={sectionState}
          documentJsonEditor={documentJsonEditor}
          behaviorJsonEditor={behaviorJsonEditor}
          envJsonEditor={envJsonEditor}
          permissionsJsonEditor={permissionsJsonEditor}
          sandboxJsonEditor={sandboxJsonEditor}
          hooksJsonEditor={hooksJsonEditor}
          marketplacesJsonEditor={marketplacesJsonEditor}
          pluginsJsonEditor={pluginsJsonEditor}
        />
      </div>
    </div>
  );
}

export default ProfileEditor;
