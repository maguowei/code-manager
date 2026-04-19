import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import type { LocalizedText, SettingsPreset } from "../types";
import ConfigPreview from "./ConfigPreview";
import {
  applyEnvDefaults,
  applyPresetAutofill,
  cloneSettings,
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
import EnabledPluginsEditor from "./profile-editor/EnabledPluginsEditor";
import EnvEditor from "./profile-editor/EnvEditor";
import { readBoolean, readString } from "./profile-editor/editor-utils";
import HooksEditor from "./profile-editor/HooksEditor";
import MarketplaceEditor from "./profile-editor/MarketplaceEditor";
import PermissionsEditor from "./profile-editor/PermissionsEditor";
import SandboxEditor from "./profile-editor/SandboxEditor";
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
import "./PresetEditor.css";

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
  const [settingsPatch, setSettingsPatch] = useState<Record<string, unknown>>(
    applyEnvDefaults(cloneSettings(preset?.settingsPatch), BEHAVIOR_ENV_DEFAULTS),
  );
  const [rawJson, setRawJson] = useState(
    prettyJson(applyEnvDefaults(cloneSettings(preset?.settingsPatch), BEHAVIOR_ENV_DEFAULTS)),
  );
  const [rawJsonError, setRawJsonError] = useState("");
  const [expertOpen, setExpertOpen] = useState(false);
  const [sectionModes, setSectionModes] =
    useState<Record<PureSettingsSectionKey, SectionEditorMode>>(createInitialSectionModes);
  const [activeAccordionSection, setActiveAccordionSection] =
    useState<LowFrequencySectionKey | null>(null);
  const [editorErrors, setEditorErrors] = useState<Record<string, string>>({});
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
  const envObject = useMemo(() => readTopLevelObject(settingsPatch, "env"), [settingsPatch]);
  const hiddenAuthEnvEntries = useMemo(
    () => buildHiddenEnvEntries(envObject, AUTH_ENV_KEYS),
    [envObject],
  );
  const visibleEnvSettings = useMemo(() => buildEnvSubset(envObject, AUTH_ENV_KEYS), [envObject]);
  const envJsonEditor = useObjectJsonEditor({
    value: visibleEnvSettings,
    onChange: (next) => handleStructuredObjectChange("env", { ...hiddenAuthEnvEntries, ...next }),
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
  const supportedKeysInPatch = useMemo(
    () =>
      Object.keys(settingsPatch)
        .filter((key) => STRUCTURED_SETTINGS_KEYS.has(key))
        .sort(),
    [settingsPatch],
  );
  const enabledPluginsCount = useMemo(
    () => Object.keys(readTopLevelObject(settingsPatch, "enabledPlugins")).length,
    [settingsPatch],
  );
  const marketplaceCount = useMemo(
    () => Object.keys(readTopLevelObject(settingsPatch, "extraKnownMarketplaces")).length,
    [settingsPatch],
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

  function applyPatch(next: Record<string, unknown>) {
    const normalized = applyEnvDefaults(next, BEHAVIOR_ENV_DEFAULTS);
    const nextJson = prettyJson(normalized);
    if (nextJson === prettyJson(settingsPatch)) {
      setRawJson(nextJson);
      setRawJsonError("");
      return;
    }
    setSettingsPatch(normalized);
    setRawJson(nextJson);
    setRawJsonError("");
  }

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
        throw new Error(t("presets.editor.validation.settingsPatchObject"));
      }
      const normalized = applyEnvDefaults(parsed, BEHAVIOR_ENV_DEFAULTS);
      setSettingsPatch(normalized);
      setRawJson(prettyJson(normalized));
      setRawJsonError("");
    } catch (error) {
      setRawJsonError(error instanceof Error ? error.message : String(error));
    }
  }

  function toggleAccordionSection(section: LowFrequencySectionKey) {
    setActiveAccordionSection((current) => (current === section ? null : section));
  }

  function handleSimpleFieldChange(field: SettingsFieldDefinition, value: string | boolean) {
    const next =
      field.kind === "checkbox"
        ? setTopLevelBoolean(settingsPatch, field.key, value === true)
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

  function handleStructuredObjectChange(key: string, value: Record<string, unknown>) {
    applyPatch(setTopLevelObject(settingsPatch, key, value));
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

  function handleBasePresetChange(nextBasePresetId: string) {
    setBasePresetId(nextBasePresetId);
    applyPatch(applyPresetAutofill(settingsPatch, presets, nextBasePresetId || undefined));
  }

  async function handleSaveClick() {
    const localizedName = buildPresetLocalizedName(nameZh, nameEn);
    if (
      !localizedName ||
      rawJsonError ||
      behaviorJsonEditor.jsonError ||
      envJsonEditor.jsonError ||
      permissionsJsonEditor.jsonError ||
      sandboxJsonEditor.jsonError ||
      hooksJsonEditor.jsonError ||
      marketplacesJsonEditor.jsonError ||
      pluginsJsonEditor.jsonError ||
      Object.values(editorErrors).some(Boolean)
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
    baseUrl: t("presets.editor.fields.baseUrl"),
    modelSuggestions: t("presets.editor.fields.modelSuggestions"),
    modelSuggestionsHint: t("presets.editor.hints.modelSuggestions"),
    baseSuggestions: t("presets.editor.hints.baseSuggestions"),
    metadata: t("presets.editor.sections.metadata"),
    auth: t("presets.editor.sections.auth"),
    behavior: t("presets.editor.sections.behavior"),
    environment: t("presets.editor.sections.environment"),
    behaviorJsonHint: t("presets.editor.hints.behaviorJson"),
    permissions: t("presets.editor.sections.permissions"),
    sandbox: t("presets.editor.sections.sandbox"),
    hooks: t("presets.editor.sections.hooks"),
    marketplaces: t("presets.editor.sections.marketplaces"),
    plugins: t("presets.editor.sections.plugins"),
    preview: t("presets.editor.sections.preview"),
    expertOpen: t("presets.editor.expert.open"),
    expertClose: t("presets.editor.expert.close"),
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
              <label htmlFor="preset-name-zh">{messages.nameZh}</label>
              <input
                id="preset-name-zh"
                value={nameZh}
                onChange={(event) => setNameZh(event.target.value)}
                placeholder={messages.nameZhPlaceholder}
              />
            </div>
            <div className="form-group">
              <label htmlFor="preset-name-en">{messages.nameEn}</label>
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

          <div className="form-row">
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
              <label htmlFor="preset-auth-token">{messages.authToken}</label>
              <input
                id="preset-auth-token"
                value={readEnvString(settingsPatch, "ANTHROPIC_AUTH_TOKEN")}
                placeholder="sk-ant-..."
                onChange={(event) =>
                  applyPatch(
                    setEnvString(settingsPatch, "ANTHROPIC_AUTH_TOKEN", event.target.value),
                  )
                }
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="preset-base-url">{messages.baseUrl}</label>
              <input
                id="preset-base-url"
                value={readEnvString(settingsPatch, "ANTHROPIC_BASE_URL")}
                placeholder="https://api.anthropic.com"
                onChange={(event) =>
                  applyPatch(setEnvString(settingsPatch, "ANTHROPIC_BASE_URL", event.target.value))
                }
              />
            </div>
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

        <SettingsSectionModePanel
          title={messages.behavior}
          mode={sectionModes.behavior}
          onModeChange={(mode) => handleSectionModeChange("behavior", mode)}
          controls={
            <>
              {scalarFieldRows.map((row) => (
                <div
                  key={`preset-behavior-row-${row.map((field) => field.key).join("-")}`}
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
                          {renderBehaviorFieldHeader(field, label, `preset-field-${field.key}`)}
                          <select
                            id={`preset-field-${field.key}`}
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
                        {renderBehaviorFieldHeader(field, label, `preset-field-${field.key}`)}
                        <input
                          id={`preset-field-${field.key}`}
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
                  key={`preset-toggle-row-${row.map((field) => field.key).join("-")}`}
                  className="profile-toggle-grid"
                >
                  {row.map((field) => (
                    <label key={field.key} className="profile-toggle-item">
                      <input
                        type="checkbox"
                        checked={readBoolean(settingsPatch[field.key])}
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
        />

        <SettingsSectionModePanel
          title={messages.permissions}
          variant="accordion"
          mode={sectionModes.permissions}
          onModeChange={(mode) => handleSectionModeChange("permissions", mode)}
          controls={
            <PermissionsEditor
              value={settingsPatch.permissions}
              onChange={(value) => handleStructuredObjectChange("permissions", value)}
              onError={(message) => setSectionError("permissions", message)}
            />
          }
          jsonEditor={permissionsJsonEditor}
          jsonHint={t("common.sectionJsonHint")}
          error={editorErrors.permissions || permissionsJsonEditor.jsonError}
          expanded={activeAccordionSection === "permissions"}
          onToggleExpanded={() => toggleAccordionSection("permissions")}
        />

        <SettingsSectionModePanel
          title={messages.sandbox}
          variant="accordion"
          mode={sectionModes.sandbox}
          onModeChange={(mode) => handleSectionModeChange("sandbox", mode)}
          controls={
            <SandboxEditor
              value={settingsPatch.sandbox}
              onChange={(value) => handleStructuredObjectChange("sandbox", value)}
              onError={(message) => setSectionError("sandbox", message)}
            />
          }
          jsonEditor={sandboxJsonEditor}
          jsonHint={t("common.sectionJsonHint")}
          error={editorErrors.sandbox || sandboxJsonEditor.jsonError}
          expanded={activeAccordionSection === "sandbox"}
          onToggleExpanded={() => toggleAccordionSection("sandbox")}
        />

        <SettingsSectionModePanel
          title={messages.hooks}
          variant="accordion"
          mode={sectionModes.hooks}
          onModeChange={(mode) => handleSectionModeChange("hooks", mode)}
          controls={
            <HooksEditor
              value={settingsPatch.hooks}
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
              value={settingsPatch.extraKnownMarketplaces}
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
          badgeCount={enabledPluginsCount}
          mode={sectionModes.plugins}
          onModeChange={(mode) => handleSectionModeChange("plugins", mode)}
          controls={
            <EnabledPluginsEditor
              value={settingsPatch.enabledPlugins}
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
            <ConfigPreview content={prettyJson(settingsPatch)} />
          </div>

          {expertOpen && (
            <div className="profile-expert-panel">
              <p className="form-hint">{messages.expertHint}</p>
              {supportedKeysInPatch.length > 0 && (
                <div className="profile-supported-keys">
                  <span>{messages.expertStructuredKeys}</span>
                  <div className="profile-chip-list">
                    {supportedKeysInPatch.map((key) => (
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
        <span className="profile-field-label-meta" aria-hidden="true">
          (<code className="profile-field-label-key">{field.envKey}</code>)
        </span>
      ) : null}
    </div>
  );
}

export default PresetEditor;
