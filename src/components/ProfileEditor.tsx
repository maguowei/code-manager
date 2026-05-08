import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, CircleCheck, ExternalLink, TestTube } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type { ConfigProfile, ModelTestResult, SettingsPreset } from "../types";
import {
  applyEnvDefaults,
  applyPresetAutofill,
  cloneSettings,
  getEnabledPluginsSummary,
  presetDisplayName,
  presetSlugFromId,
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
  EditorDescription,
  EditorEnvHint,
  EditorField,
  EditorFieldGrid,
  EditorLabelRow,
  EditorSection,
} from "./editor-layout";
import ProfileNameBadge from "./ProfileNameBadge";
import {
  AUTH_ENV_KEYS,
  applyNewConfigDefaults,
  BEHAVIOR_ENV_DEFAULTS,
  buildEnvSubset,
  buildHiddenEnvEntries,
  chunkItems,
  readAttributionDisabled,
  setAttributionDisabled,
} from "./profile-editor/editor-shared-constants";
import { readString } from "./profile-editor/editor-utils";
import ModelTestResultDialog from "./profile-editor/ModelTestResultDialog";
import { readPermissionsDefaultMode } from "./profile-editor/PermissionsEditor";
import RequiredBadge from "./profile-editor/RequiredBadge";
import { getSandboxPresentation } from "./profile-editor/SandboxEditor";
import SensitiveTextInput from "./profile-editor/SensitiveTextInput";
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
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

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

const NO_PRESET_VALUE = "__none__";

function ProfileEditor({ profile, presets, onSave, onClose }: ProfileEditorProps) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const [name, setName] = useState(profile?.name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [presetId, setPresetId] = useState(profile?.presetId ?? "");
  const [settings, setSettings] = useState<Record<string, unknown>>(() => {
    const next = applyEnvDefaults(cloneSettings(profile?.settings), BEHAVIOR_ENV_DEFAULTS);
    return profile ? next : applyNewConfigDefaults(next, language);
  });
  const [previewJson, setPreviewJson] = useState("{}");
  const [previewError, setPreviewError] = useState("");
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [latestModelTestResult, setLatestModelTestResult] = useState<ModelTestResult | null>(null);
  const [modelTestError, setModelTestError] = useState("");
  const [isModelTestDialogOpen, setIsModelTestDialogOpen] = useState(false);
  const [isRawResponseExpanded, setIsRawResponseExpanded] = useState(false);
  const modelTestRunIdRef = useRef(0);
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
  const commonSettings = useMemo(
    () =>
      readScopedSettingsWithEnv(settings, COMMON_TOP_LEVEL_SETTINGS_KEYS, COMMON_ENV_SETTINGS_KEYS),
    [settings],
  );
  const commonJsonEditor = useObjectJsonEditor({
    value: commonSettings,
    onChange: (next) =>
      applySettings(
        replaceScopedSettingsWithEnv(
          settings,
          COMMON_TOP_LEVEL_SETTINGS_KEYS,
          COMMON_ENV_SETTINGS_KEYS,
          next,
        ),
      ),
    label: t("profiles.editor.sections.common"),
    isZh: language === "zh",
    allowedKeys: COMMON_JSON_ALLOWED_KEYS,
  });
  const envObject = useMemo(() => readTopLevelObject(settings, "env"), [settings]);
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
  const statusLineJsonEditor = useObjectJsonEditor({
    value: settings.statusLine,
    onChange: (next) => handleStructuredObjectChange("statusLine", next),
    label: t("profiles.editor.sections.statusLine"),
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

  function clearModelTestState() {
    modelTestRunIdRef.current += 1;
    setLatestModelTestResult(null);
    setModelTestError("");
    setIsTestingModel(false);
    setIsModelTestDialogOpen(false);
    setIsRawResponseExpanded(false);
  }

  function closeModelTestDialog() {
    setIsModelTestDialogOpen(false);
    setIsRawResponseExpanded(false);
  }

  function reopenLatestSuccessfulModelTest() {
    if (!latestModelTestResult?.ok) {
      return;
    }
    setModelTestError("");
    setIsRawResponseExpanded(false);
    setIsModelTestDialogOpen(true);
  }

  function applySettings(next: Record<string, unknown>) {
    const normalized = applyEnvDefaults(next, BEHAVIOR_ENV_DEFAULTS);
    if (JSON.stringify(normalized) === JSON.stringify(settings)) {
      return;
    }

    clearModelTestState();
    setSettings(normalized);
  }

  function handleSimpleFieldChange(field: SettingsFieldDefinition, value: string | boolean) {
    if (field.kind === "checkbox" && field.key === "attribution") {
      applySettings(setAttributionDisabled(settings, value === true));
      return;
    }

    const next =
      field.kind === "checkbox"
        ? field.envKey
          ? setEnvString(settings, field.envKey, value === true ? (field.enabledValue ?? "1") : "")
          : setTopLevelBoolean(settings, field.key, value === true)
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

  function readSimpleFieldValue(field: SettingsFieldDefinition) {
    if (field.envKey) {
      return readEnvString(settings, field.envKey) || field.defaultValue || "";
    }
    return readString(settings[field.key]);
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

  function readToggleFieldEnabled(field: SettingsFieldDefinition) {
    if (field.key === "attribution") {
      return readAttributionDisabled(settings);
    }

    if (field.envKey) {
      const expectedValue = field.enabledValue ?? "1";
      return readEnvString(settings, field.envKey) === expectedValue;
    }

    return settings[field.key] === true;
  }

  function handleStructuredObjectChange(key: string, value: Record<string, unknown>) {
    applySettings(setTopLevelObject(settings, key, value));
  }

  function handlePresetChange(nextPresetId: string) {
    clearModelTestState();
    setPresetId(nextPresetId);
    applySettings(applyPresetAutofill(settings, presets, nextPresetId || undefined));
  }

  function handleOpenSelectedPresetDocs() {
    const docUrl = selectedPreset?.docUrl;
    if (!docUrl) {
      return;
    }
    void openUrl(docUrl);
  }

  function handleSaveClick() {
    if (
      !name.trim() ||
      documentJsonEditor.jsonError ||
      behaviorJsonEditor.jsonError ||
      commonJsonEditor.jsonError ||
      envJsonEditor.jsonError ||
      permissionsJsonEditor.jsonError ||
      sandboxJsonEditor.jsonError ||
      hooksJsonEditor.jsonError ||
      marketplacesJsonEditor.jsonError ||
      pluginsJsonEditor.jsonError ||
      statusLineJsonEditor.jsonError
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

  async function handleTestModelClick(promptText?: string, keepDialogOpen = false) {
    if (isTestingModel || !canTestModel) {
      return;
    }

    const runId = modelTestRunIdRef.current + 1;
    modelTestRunIdRef.current = runId;
    if (!keepDialogOpen) {
      setLatestModelTestResult(null);
      setIsModelTestDialogOpen(false);
    }
    setModelTestError("");
    setIsRawResponseExpanded(false);
    setIsTestingModel(true);
    try {
      const result = await invoke<ModelTestResult>("test_profile_model", {
        data: {
          id: profile?.id ?? null,
          name,
          description,
          presetId: presetId || null,
          settings,
          ...(promptText !== undefined ? { promptText } : {}),
        },
      });
      if (modelTestRunIdRef.current === runId) {
        setLatestModelTestResult(result);
        setModelTestError("");
        setIsModelTestDialogOpen(true);
      }
    } catch (error) {
      if (modelTestRunIdRef.current === runId) {
        setLatestModelTestResult(null);
        setModelTestError(String(error));
        setIsModelTestDialogOpen(true);
      }
    } finally {
      if (modelTestRunIdRef.current === runId) {
        setIsTestingModel(false);
      }
    }
  }

  async function handleCopySuggestedModel(model: string) {
    try {
      await navigator.clipboard.writeText(model);
      showToast(t("profiles.toast.modelCopied"));
    } catch {
      showToast(t("profiles.toast.modelCopyError"), "error");
    }
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
  const canTestModel = !!name.trim() && !hasValidationError;

  const messages = {
    title: profile ? t("profiles.editor.title.edit") : t("profiles.editor.title.add"),
    save: t("profiles.editor.save"),
    testModel: t("profiles.editor.actions.testModel"),
    testingModel: t("profiles.editor.actions.testingModel"),
    reopenModelTest: t("profiles.editor.modelTest.reopenSuccess"),
    name: t("profiles.editor.fields.name"),
    namePlaceholder: t("profiles.editor.placeholders.name"),
    description: t("profiles.editor.fields.description"),
    descriptionPlaceholder: t("profiles.editor.placeholders.description"),
    preset: t("profiles.editor.fields.preset"),
    openPresetDocs: t("presets.actions.openDocs"),
    authToken: t("profiles.editor.fields.authToken"),
    authTokenEnv: t("profiles.editor.fields.authTokenEnv"),
    showAuthToken: t("common.showToken"),
    hideAuthToken: t("common.hideToken"),
    baseUrl: t("profiles.editor.fields.baseUrl"),
    baseUrlEnv: t("profiles.editor.fields.baseUrlEnv"),
    presetHint: t("profiles.editor.hints.preset"),
    suggestedModels: t("profiles.editor.hints.suggestedModels"),
    basicInfo: t("profiles.editor.sections.basicInfo"),
    auth: t("profiles.editor.sections.auth"),
    behavior: t("profiles.editor.sections.behavior"),
    common: t("profiles.editor.sections.common"),
    environment: t("profiles.editor.sections.environment"),
    behaviorJsonHint: t("profiles.editor.hints.behaviorJson"),
    permissions: t("profiles.editor.sections.permissions"),
    sandbox: t("profiles.editor.sections.sandbox"),
    hooks: t("profiles.editor.sections.hooks"),
    marketplaces: t("profiles.editor.sections.marketplaces"),
    plugins: t("profiles.editor.sections.plugins"),
    statusLine: t("profiles.editor.sections.statusLine"),
    preview: t("profiles.editor.sections.preview"),
    previewMode: t("common.previewMode"),
    editSourceJson: t("profiles.editor.modes.editSourceJson"),
    expertHint: t("profiles.editor.hints.expert"),
    expertStructuredKeys: t("profiles.editor.hints.expertStructuredKeys"),
  };
  const hasSuccessfulModelTest = latestModelTestResult?.ok === true;

  return (
    <div
      data-slot="profile-editor-panel"
      className="flex h-full min-h-0 w-full min-w-[560px] flex-col overflow-hidden bg-card"
    >
      <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-6">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground">
          {messages.title}
        </h2>
        <Button
          type="button"
          disabled={!name.trim() || hasValidationError}
          onClick={handleSaveClick}
        >
          {messages.save}
        </Button>
      </div>

      <div
        data-slot="profile-editor-body"
        className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-6 py-6 pb-6 [&>*]:shrink-0 [&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]"
      >
        <ProfileNameBadge
          name={name}
          colorSeedScope={presetSlugFromId(presetId)}
          size="lg"
          fallbackChar="P"
        />

        <EditorSection title={messages.basicInfo}>
          <EditorFieldGrid>
            <EditorField>
              <Label htmlFor="profile-name" className="inline-flex items-center gap-2">
                <span>{messages.name}</span>
                <RequiredBadge />
              </Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={messages.namePlaceholder}
              />
            </EditorField>
            <EditorField>
              <Label htmlFor="profile-description">{messages.description}</Label>
              <Input
                id="profile-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={messages.descriptionPlaceholder}
              />
            </EditorField>
          </EditorFieldGrid>
        </EditorSection>

        <EditorSection title={messages.auth}>
          <EditorField>
            <Label htmlFor="profile-preset">{messages.preset}</Label>
            <div className="grid max-w-full grid-cols-[minmax(0,520px)_max-content] items-center gap-3 max-[700px]:grid-cols-[minmax(0,1fr)] max-[700px]:items-stretch">
              <div className="min-w-0">
                <Select
                  value={presetId || NO_PRESET_VALUE}
                  onValueChange={(value) =>
                    handlePresetChange(value === NO_PRESET_VALUE ? "" : value)
                  }
                >
                  <SelectTrigger
                    id="profile-preset"
                    className="w-full"
                    value={presetId}
                    data-value={presetId}
                    onChange={(event) =>
                      handlePresetChange((event.target as HTMLButtonElement).value)
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={NO_PRESET_VALUE}>
                        {t("profiles.editor.options.noPreset")}
                      </SelectItem>
                      {presets.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {presetDisplayName(preset, language)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {selectedPreset?.docUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-9 whitespace-nowrap max-[700px]:justify-self-start"
                  onClick={handleOpenSelectedPresetDocs}
                >
                  <span>{messages.openPresetDocs}</span>
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            <EditorDescription>{messages.presetHint}</EditorDescription>
          </EditorField>

          <EditorField>
            <EditorLabelRow>
              <Label htmlFor="profile-base-url">{messages.baseUrl}</Label>
              <EditorEnvHint>{messages.baseUrlEnv}</EditorEnvHint>
            </EditorLabelRow>
            <Input
              id="profile-base-url"
              aria-label={messages.baseUrlEnv}
              value={readEnvString(settings, "ANTHROPIC_BASE_URL")}
              placeholder="https://api.anthropic.com"
              onChange={(event) =>
                applySettings(setEnvString(settings, "ANTHROPIC_BASE_URL", event.target.value))
              }
            />
          </EditorField>

          <EditorField>
            <EditorLabelRow>
              <Label htmlFor="profile-auth-token">{messages.authToken}</Label>
              <EditorEnvHint>{messages.authTokenEnv}</EditorEnvHint>
            </EditorLabelRow>
            <SensitiveTextInput
              id="profile-auth-token"
              ariaLabel={messages.authTokenEnv}
              value={readEnvString(settings, "ANTHROPIC_AUTH_TOKEN")}
              placeholder="sk-ant-..."
              showLabel={messages.showAuthToken}
              hideLabel={messages.hideAuthToken}
              onChange={(value) =>
                applySettings(setEnvString(settings, "ANTHROPIC_AUTH_TOKEN", value))
              }
            />
          </EditorField>

          {selectedPreset && selectedPreset.modelSuggestions.length > 0 && (
            <EditorField>
              <Label>{messages.suggestedModels}</Label>
              <div className="flex flex-wrap gap-2">
                {selectedPreset.modelSuggestions.map((model) => (
                  <Button
                    key={model}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto rounded-full px-2.5 py-1 font-mono text-xs"
                    onClick={() => {
                      void handleCopySuggestedModel(model);
                    }}
                  >
                    <Badge variant="secondary" className="rounded-full font-mono">
                      {model}
                    </Badge>
                  </Button>
                ))}
              </div>
            </EditorField>
          )}
        </EditorSection>

        <StructuredSettingsSections
          scope="profiles"
          settings={settings}
          supportedKeys={supportedKeysInSettings}
          previewContent={previewJson}
          previewError={previewError}
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
          behaviorHeaderControl={
            <div className="inline-flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={isTestingModel ? messages.testingModel : messages.testModel}
                title={isTestingModel ? messages.testingModel : messages.testModel}
                disabled={!canTestModel || isTestingModel}
                onClick={() => {
                  void handleTestModelClick();
                }}
              >
                <TestTube className="size-4" aria-hidden="true" />
              </Button>
              {hasSuccessfulModelTest ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={messages.reopenModelTest}
                  title={messages.reopenModelTest}
                  onClick={reopenLatestSuccessfulModelTest}
                >
                  <CircleCheck className="size-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          }
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

        <ModelTestResultDialog
          isOpen={isModelTestDialogOpen}
          result={latestModelTestResult}
          profileName={name}
          errorMessage={modelTestError}
          rawResponseExpanded={isRawResponseExpanded}
          onClose={closeModelTestDialog}
          onToggleRawResponse={() => setIsRawResponseExpanded((value) => !value)}
          onRetest={(promptText) => {
            void handleTestModelClick(promptText, true);
          }}
          isRetesting={isTestingModel}
        />
      </div>
    </div>
  );
}

export default ProfileEditor;
