import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import type { LocalizedText, SettingsPreset } from "../types";
import {
  applyEnvDefaults,
  applyPresetAutofill,
  cloneSettings,
  getEnabledPluginsSummary,
  normalizeLocalizedText,
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
import {
  AUTH_ENV_KEYS,
  applyCommonToggleDefaults,
  BEHAVIOR_ENV_DEFAULTS,
  buildEnvSubset,
  buildHiddenEnvEntries,
  chunkItems,
  readAttributionDisabled,
  setAttributionDisabled,
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
  COMMON_ENV_SETTINGS_KEYS,
  COMMON_JSON_ALLOWED_KEYS,
  COMMON_TOP_LEVEL_SETTINGS_KEYS,
  PROFILE_SETTINGS_FORM_REGISTRY,
  type SettingsFieldDefinition,
  STRUCTURED_SETTINGS_KEYS,
} from "./profile-editor/settings-form-registry";
import {
  getStatusLineErrorKey,
  STATUS_LINE_JSON_ALLOWED_KEYS,
  validateStatusLineObject,
} from "./profile-editor/status-line-utils";
import { useDocumentJsonEditor } from "./profile-editor/useDocumentJsonEditor";
import { useObjectJsonEditor } from "./profile-editor/useObjectJsonEditor";
import useStructuredSettingsSectionState from "./profile-editor/useStructuredSettingsSectionState";
import "./ConfigEditor.css";
import "./PresetEditor.css";

interface PresetEditorProps {
  preset: SettingsPreset | null;
  presets: SettingsPreset[];
  onSave: (data: {
    id?: string;
    name: string;
    localizedName?: LocalizedText;
    description: string;
    basePresetId?: string;
    docUrl?: string;
    models?: SettingsPreset["models"];
    modelSuggestions: string[];
    settingsPatch: Record<string, unknown>;
  }) => Promise<void> | void;
  onClose: () => void;
}

function resolvePresetLocalizedName(preset: SettingsPreset | null): LocalizedText {
  return normalizeLocalizedText(preset?.localizedName, preset?.name ?? "");
}

function buildPresetLocalizedName(nameZh: string, nameEn: string): LocalizedText | undefined {
  const zh = nameZh.trim();
  const en = nameEn.trim();
  if (!zh && !en) {
    return undefined;
  }
  return normalizeLocalizedText(
    {
      zh,
      en,
    },
    en || zh,
  );
}

function PresetEditor({ preset, presets, onSave, onClose }: PresetEditorProps) {
  const { language, t } = useI18n();
  const initialLocalizedName = useMemo(() => resolvePresetLocalizedName(preset), [preset]);
  const [nameZh, setNameZh] = useState(initialLocalizedName.zh);
  const [nameEn, setNameEn] = useState(initialLocalizedName.en);
  const [description, setDescription] = useState(preset?.description ?? "");
  const [basePresetId, setBasePresetId] = useState(preset?.basePresetId ?? "");
  const [docUrl, setDocUrl] = useState(preset?.docUrl ?? "");
  const [modelSuggestions, setModelSuggestions] = useState(
    preset?.modelSuggestions.join(", ") ?? "",
  );
  const [settingsPatch, setSettingsPatch] = useState<Record<string, unknown>>(() => {
    const next = applyEnvDefaults(cloneSettings(preset?.settingsPatch), BEHAVIOR_ENV_DEFAULTS);
    return preset ? next : applyCommonToggleDefaults(next);
  });
  const selectableBasePresets = useMemo(
    () => presets.filter((candidate) => candidate.id !== preset?.id),
    [preset?.id, presets],
  );
  const selectedBasePreset = useMemo(
    () => presets.find((candidate) => candidate.id === basePresetId) ?? null,
    [basePresetId, presets],
  );
  const behaviorSettings = useMemo(
    () =>
      readScopedSettingsWithEnv(
        settingsPatch,
        BEHAVIOR_TOP_LEVEL_SETTINGS_KEYS,
        BEHAVIOR_ENV_SETTINGS_KEYS,
      ),
    [settingsPatch],
  );
  const behaviorJsonEditor = useObjectJsonEditor({
    value: behaviorSettings,
    onChange: (next) =>
      applyPatch(
        replaceScopedSettingsWithEnv(
          settingsPatch,
          BEHAVIOR_TOP_LEVEL_SETTINGS_KEYS,
          BEHAVIOR_ENV_SETTINGS_KEYS,
          next,
        ),
      ),
    label: t("presets.editor.sections.behavior"),
    isZh: language === "zh",
    allowedKeys: BEHAVIOR_JSON_ALLOWED_KEYS,
  });
  const commonSettings = useMemo(
    () =>
      readScopedSettingsWithEnv(
        settingsPatch,
        COMMON_TOP_LEVEL_SETTINGS_KEYS,
        COMMON_ENV_SETTINGS_KEYS,
      ),
    [settingsPatch],
  );
  const commonJsonEditor = useObjectJsonEditor({
    value: commonSettings,
    onChange: (next) =>
      applyPatch(
        replaceScopedSettingsWithEnv(
          settingsPatch,
          COMMON_TOP_LEVEL_SETTINGS_KEYS,
          COMMON_ENV_SETTINGS_KEYS,
          next,
        ),
      ),
    label: t("presets.editor.sections.common"),
    isZh: language === "zh",
    allowedKeys: COMMON_JSON_ALLOWED_KEYS,
  });
  const envObject = useMemo(() => readTopLevelObject(settingsPatch, "env"), [settingsPatch]);
  const hiddenEnvKeys = useMemo(() => [...AUTH_ENV_KEYS, ...COMMON_ENV_SETTINGS_KEYS], []);
  const hiddenEnvEntries = useMemo(
    () => buildHiddenEnvEntries(envObject, hiddenEnvKeys),
    [envObject, hiddenEnvKeys],
  );
  const visibleEnvSettings = useMemo(
    () => buildEnvSubset(envObject, hiddenEnvKeys),
    [envObject, hiddenEnvKeys],
  );
  const envJsonEditor = useObjectJsonEditor({
    value: visibleEnvSettings,
    onChange: (next) => handleStructuredObjectChange("env", { ...hiddenEnvEntries, ...next }),
    label: t("presets.editor.sections.environment"),
    isZh: language === "zh",
  });
  const permissionsJsonEditor = useObjectJsonEditor({
    value: settingsPatch.permissions,
    onChange: (next) => handleStructuredObjectChange("permissions", next),
    label: t("presets.editor.sections.permissions"),
    isZh: language === "zh",
  });
  const sandboxJsonEditor = useObjectJsonEditor({
    value: settingsPatch.sandbox,
    onChange: (next) => handleStructuredObjectChange("sandbox", next),
    label: t("presets.editor.sections.sandbox"),
    isZh: language === "zh",
  });
  const hooksJsonEditor = useObjectJsonEditor({
    value: settingsPatch.hooks,
    onChange: (next) => handleStructuredObjectChange("hooks", next),
    label: t("presets.editor.sections.hooks"),
    isZh: language === "zh",
  });
  const marketplacesJsonEditor = useObjectJsonEditor({
    value: settingsPatch.extraKnownMarketplaces,
    onChange: (next) => handleStructuredObjectChange("extraKnownMarketplaces", next),
    label: t("presets.editor.sections.marketplaces"),
    isZh: language === "zh",
  });
  const pluginsJsonEditor = useObjectJsonEditor({
    value: settingsPatch.enabledPlugins,
    onChange: (next) => handleStructuredObjectChange("enabledPlugins", next),
    label: t("presets.editor.sections.plugins"),
    isZh: language === "zh",
  });
  const statusLineJsonEditor = useObjectJsonEditor({
    value: settingsPatch.statusLine,
    onChange: (next) => handleStructuredObjectChange("statusLine", next),
    label: t("presets.editor.sections.statusLine"),
    isZh: language === "zh",
    allowedKeys: [...STATUS_LINE_JSON_ALLOWED_KEYS],
    validateObject: (next) => {
      const errorCode = validateStatusLineObject(next);
      return errorCode ? t(getStatusLineErrorKey(errorCode, "json")) : "";
    },
  });
  const sectionState = useStructuredSettingsSectionState({
    common: commonJsonEditor.jsonError,
    env: envJsonEditor.jsonError,
    permissions: permissionsJsonEditor.jsonError,
    sandbox: sandboxJsonEditor.jsonError,
    hooks: hooksJsonEditor.jsonError,
    marketplaces: marketplacesJsonEditor.jsonError,
    plugins: pluginsJsonEditor.jsonError,
    statusLine: statusLineJsonEditor.jsonError,
  });
  const supportedKeysInPatch = useMemo(
    () =>
      Object.keys(settingsPatch)
        .filter((key) => STRUCTURED_SETTINGS_KEYS.has(key))
        .sort(),
    [settingsPatch],
  );
  const documentJsonEditor = useDocumentJsonEditor({
    value: settingsPatch,
    onApply: applyPatch,
    validateMessage: t("presets.editor.validation.settingsPatchObject"),
    normalize: (next) => applyEnvDefaults(next, BEHAVIOR_ENV_DEFAULTS),
  });
  const enabledPluginsSummary = useMemo(
    () => getEnabledPluginsSummary(settingsPatch.enabledPlugins),
    [settingsPatch],
  );
  const visibleEnvCount = useMemo(
    () => Object.keys(visibleEnvSettings).length,
    [visibleEnvSettings],
  );
  const marketplaceCount = useMemo(
    () => Object.keys(readTopLevelObject(settingsPatch, "extraKnownMarketplaces")).length,
    [settingsPatch],
  );
  const permissionsDefaultMode = useMemo(
    () => readPermissionsDefaultMode(settingsPatch.permissions),
    [settingsPatch.permissions],
  );
  const hooksTypeCount = useMemo(
    () => Object.keys(readTopLevelObject(settingsPatch, "hooks")).length,
    [settingsPatch],
  );
  const sandboxPresentation = useMemo(
    () => getSandboxPresentation(settingsPatch.sandbox, language === "zh"),
    [settingsPatch.sandbox, language],
  );

  function applyPatch(next: Record<string, unknown>) {
    const normalized = applyEnvDefaults(next, BEHAVIOR_ENV_DEFAULTS);
    if (JSON.stringify(normalized) === JSON.stringify(settingsPatch)) {
      return;
    }

    setSettingsPatch(normalized);
  }

  function handleSimpleFieldChange(field: SettingsFieldDefinition, value: string | boolean) {
    if (field.kind === "checkbox" && field.key === "attribution") {
      applyPatch(setAttributionDisabled(settingsPatch, value === true));
      return;
    }

    const next =
      field.kind === "checkbox"
        ? field.envKey
          ? setEnvString(
              settingsPatch,
              field.envKey,
              value === true ? (field.enabledValue ?? "1") : "",
            )
          : setTopLevelBoolean(settingsPatch, field.key, value === true)
        : field.storage === "env-only" && field.envKey
          ? setEnvString(settingsPatch, field.envKey, typeof value === "string" ? value : "")
          : setTopLevelString(settingsPatch, field.key, typeof value === "string" ? value : "");
    applyPatch(next);
  }

  function readBehaviorFieldState(field: SettingsFieldDefinition) {
    if (field.envKey) {
      return {
        mappedToEnv: true,
        value: readEnvString(settingsPatch, field.envKey) || field.defaultValue || "",
      };
    }
    return {
      mappedToEnv: false,
      value: readString(settingsPatch[field.key]),
    };
  }

  function readSimpleFieldValue(field: SettingsFieldDefinition) {
    if (field.envKey) {
      return readEnvString(settingsPatch, field.envKey) || field.defaultValue || "";
    }
    return readString(settingsPatch[field.key]);
  }

  function handleMappedFieldChange(
    field: SettingsFieldDefinition,
    value: string,
    _mappedToEnv: boolean,
  ) {
    if (field.envKey) {
      applyPatch(setEnvString(settingsPatch, field.envKey, value));
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

  function readToggleFieldEnabled(field: SettingsFieldDefinition) {
    if (field.key === "attribution") {
      return readAttributionDisabled(settingsPatch);
    }

    if (field.envKey) {
      const expectedValue = field.enabledValue ?? "1";
      return readEnvString(settingsPatch, field.envKey) === expectedValue;
    }

    return settingsPatch[field.key] === true;
  }

  function handleStructuredObjectChange(key: string, value: Record<string, unknown>) {
    applyPatch(setTopLevelObject(settingsPatch, key, value));
  }

  function handleBasePresetChange(nextBasePresetId: string) {
    setBasePresetId(nextBasePresetId);
    applyPatch(applyPresetAutofill(settingsPatch, presets, nextBasePresetId || undefined));
  }

  async function handleSaveClick() {
    const localizedName = buildPresetLocalizedName(nameZh, nameEn);
    if (
      !localizedName ||
      documentJsonEditor.jsonError ||
      behaviorJsonEditor.jsonError ||
      commonJsonEditor.jsonError ||
      envJsonEditor.jsonError ||
      permissionsJsonEditor.jsonError ||
      sandboxJsonEditor.jsonError ||
      hooksJsonEditor.jsonError ||
      marketplacesJsonEditor.jsonError ||
      pluginsJsonEditor.jsonError ||
      statusLineJsonEditor.jsonError ||
      sectionState.hasEditorErrors
    ) {
      return;
    }

    await onSave({
      id: preset?.id,
      name: localizedName.en || localizedName.zh,
      localizedName,
      description: description.trim(),
      basePresetId: basePresetId || undefined,
      docUrl: docUrl.trim() || undefined,
      models: preset?.models,
      modelSuggestions: modelSuggestions
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean),
      settingsPatch,
    });
  }

  const behaviorFields = PROFILE_SETTINGS_FORM_REGISTRY.filter(
    (field) => field.section === "behavior",
  );
  const commonFields = PROFILE_SETTINGS_FORM_REGISTRY.filter((field) => field.section === "common");
  const scalarFields = behaviorFields.filter((field) => field.kind !== "checkbox");
  const behaviorToggleFields = behaviorFields.filter((field) => field.kind === "checkbox");
  const scalarFieldRows = useMemo(() => chunkItems(scalarFields, 2), [scalarFields]);
  const behaviorToggleFieldRows = useMemo(
    () => chunkItems(behaviorToggleFields, 2),
    [behaviorToggleFields],
  );
  const commonScalarFieldRows = useMemo(
    () =>
      chunkItems(
        commonFields.filter((field) => field.kind !== "checkbox"),
        2,
      ),
    [commonFields],
  );
  const commonToggleFields = useMemo(
    () => commonFields.filter((field) => field.kind === "checkbox"),
    [commonFields],
  );
  const hasValidationError =
    !!documentJsonEditor.jsonError ||
    !!behaviorJsonEditor.jsonError ||
    !!commonJsonEditor.jsonError ||
    !!envJsonEditor.jsonError ||
    !!permissionsJsonEditor.jsonError ||
    !!sandboxJsonEditor.jsonError ||
    !!hooksJsonEditor.jsonError ||
    !!marketplacesJsonEditor.jsonError ||
    !!pluginsJsonEditor.jsonError ||
    !!statusLineJsonEditor.jsonError ||
    sectionState.hasEditorErrors;

  const messages = {
    title: preset ? t("presets.editor.title.edit") : t("presets.editor.title.add"),
    save: t("presets.editor.save"),
    nameZh: t("presets.editor.fields.nameZh"),
    nameZhPlaceholder: t("presets.editor.placeholders.nameZh"),
    nameEn: t("presets.editor.fields.nameEn"),
    nameEnPlaceholder: t("presets.editor.placeholders.nameEn"),
    description: t("presets.editor.fields.description"),
    descriptionPlaceholder: t("presets.editor.placeholders.description"),
    docUrl: t("presets.editor.fields.docUrl"),
    basePreset: t("presets.editor.fields.basePreset"),
    authToken: t("presets.editor.fields.authToken"),
    authTokenEnv: t("presets.editor.fields.authTokenEnv"),
    baseUrl: t("presets.editor.fields.baseUrl"),
    baseUrlEnv: t("presets.editor.fields.baseUrlEnv"),
    modelSuggestions: t("presets.editor.fields.modelSuggestions"),
    modelSuggestionsHint: t("presets.editor.hints.modelSuggestions"),
    baseSuggestions: t("presets.editor.hints.baseSuggestions"),
    metadata: t("presets.editor.sections.metadata"),
    auth: t("presets.editor.sections.auth"),
    behavior: t("presets.editor.sections.behavior"),
    common: t("presets.editor.sections.common"),
    environment: t("presets.editor.sections.environment"),
    behaviorJsonHint: t("presets.editor.hints.behaviorJson"),
    permissions: t("presets.editor.sections.permissions"),
    sandbox: t("presets.editor.sections.sandbox"),
    hooks: t("presets.editor.sections.hooks"),
    marketplaces: t("presets.editor.sections.marketplaces"),
    plugins: t("presets.editor.sections.plugins"),
    statusLine: t("presets.editor.sections.statusLine"),
    preview: t("presets.editor.sections.preview"),
    previewMode: t("common.previewMode"),
    editJsonMode: t("common.editJsonMode"),
    expertHint: t("presets.editor.hints.expert"),
    expertStructuredKeys: t("presets.editor.hints.expertStructuredKeys"),
  };

  return (
    <div className="editor-panel preset-editor-panel">
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
          disabled={!buildPresetLocalizedName(nameZh, nameEn) || hasValidationError}
          onClick={() => {
            void handleSaveClick();
          }}
        >
          {messages.save}
        </button>
      </div>

      <div className="editor-body preset-editor-body">
        <section className="profile-editor-section">
          <div className="profile-section-heading">
            <h3>{messages.metadata}</h3>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="preset-name-zh" className="label-required">
                <span>{messages.nameZh}</span>
                <RequiredBadge text={t("form.oneRequired")} />
              </label>
              <input
                id="preset-name-zh"
                value={nameZh}
                onChange={(event) => setNameZh(event.target.value)}
                placeholder={messages.nameZhPlaceholder}
              />
            </div>
            <div className="form-group">
              <label htmlFor="preset-name-en" className="label-required">
                <span>{messages.nameEn}</span>
                <RequiredBadge text={t("form.oneRequired")} />
              </label>
              <input
                id="preset-name-en"
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
                placeholder={messages.nameEnPlaceholder}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="preset-doc-url">{messages.docUrl}</label>
              <input
                id="preset-doc-url"
                value={docUrl}
                onChange={(event) => setDocUrl(event.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="preset-description">{messages.description}</label>
              <input
                id="preset-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={messages.descriptionPlaceholder}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="preset-model-suggestions">{messages.modelSuggestions}</label>
            <input
              id="preset-model-suggestions"
              value={modelSuggestions}
              onChange={(event) => setModelSuggestions(event.target.value)}
              placeholder={t("presets.editor.placeholders.modelSuggestions")}
            />
            <p className="form-hint">{messages.modelSuggestionsHint}</p>
          </div>
        </section>

        <section className="profile-editor-section">
          <div className="profile-section-heading">
            <h3>{messages.auth}</h3>
          </div>

          <div className="form-group">
            <label htmlFor="preset-base-preset">{messages.basePreset}</label>
            <select
              id="preset-base-preset"
              className="form-select"
              value={basePresetId}
              onChange={(event) => handleBasePresetChange(event.target.value)}
            >
              <option value="">{t("presets.editor.options.none")}</option>
              {selectableBasePresets.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {presetDisplayName(candidate, language)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <div className="field-label-wrap">
              <label htmlFor="preset-base-url">{messages.baseUrl}</label>
              <span className="field-label-env">{messages.baseUrlEnv}</span>
            </div>
            <input
              id="preset-base-url"
              value={readEnvString(settingsPatch, "ANTHROPIC_BASE_URL")}
              placeholder="https://api.anthropic.com"
              onChange={(event) =>
                applyPatch(setEnvString(settingsPatch, "ANTHROPIC_BASE_URL", event.target.value))
              }
            />
          </div>

          <div className="form-group">
            <div className="field-label-wrap">
              <label htmlFor="preset-auth-token">{messages.authToken}</label>
              <span className="field-label-env">{messages.authTokenEnv}</span>
            </div>
            <input
              id="preset-auth-token"
              value={readEnvString(settingsPatch, "ANTHROPIC_AUTH_TOKEN")}
              placeholder="sk-ant-..."
              onChange={(event) =>
                applyPatch(setEnvString(settingsPatch, "ANTHROPIC_AUTH_TOKEN", event.target.value))
              }
            />
          </div>

          {selectedBasePreset && selectedBasePreset.modelSuggestions.length > 0 && (
            <div className="form-group">
              <label>{messages.baseSuggestions}</label>
              <div className="profile-chip-list">
                {selectedBasePreset.modelSuggestions.map((model) => (
                  <button
                    key={model}
                    type="button"
                    className="profile-chip"
                    onClick={() =>
                      setModelSuggestions((current) => {
                        const items = current
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean);
                        if (items.includes(model)) {
                          return current;
                        }
                        return [...items, model].join(", ");
                      })
                    }
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <StructuredSettingsSections
          scope="presets"
          settings={settingsPatch}
          supportedKeys={supportedKeysInPatch}
          previewContent={prettyJson(settingsPatch)}
          hiddenEnvKeys={hiddenEnvKeys}
          visibleEnvCount={visibleEnvCount}
          marketplaceCount={marketplaceCount}
          permissionsDefaultMode={permissionsDefaultMode}
          hooksTypeCount={hooksTypeCount}
          sandboxPresentation={sandboxPresentation}
          enabledPluginsSummary={enabledPluginsSummary}
          scalarFieldRows={scalarFieldRows}
          behaviorToggleFieldRows={behaviorToggleFieldRows}
          commonScalarFieldRows={commonScalarFieldRows}
          commonToggleFields={commonToggleFields}
          readBehaviorFieldState={readBehaviorFieldState}
          readSimpleFieldValue={readSimpleFieldValue}
          readToggleFieldEnabled={readToggleFieldEnabled}
          resolveSelectOptions={resolveSelectOptions}
          onMappedFieldChange={handleMappedFieldChange}
          onSimpleFieldChange={handleSimpleFieldChange}
          onStructuredObjectChange={handleStructuredObjectChange}
          sectionState={sectionState}
          documentJsonEditor={documentJsonEditor}
          behaviorJsonEditor={behaviorJsonEditor}
          commonJsonEditor={commonJsonEditor}
          envJsonEditor={envJsonEditor}
          permissionsJsonEditor={permissionsJsonEditor}
          sandboxJsonEditor={sandboxJsonEditor}
          hooksJsonEditor={hooksJsonEditor}
          marketplacesJsonEditor={marketplacesJsonEditor}
          pluginsJsonEditor={pluginsJsonEditor}
          statusLineJsonEditor={statusLineJsonEditor}
        />
      </div>
    </div>
  );
}

export default PresetEditor;
