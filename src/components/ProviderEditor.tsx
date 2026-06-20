import { ArrowLeft } from "lucide-react";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils";
import { useI18n } from "../i18n";
import type { LocalizedText, Provider } from "../types";
import {
  applyEnvDefaults,
  applyProviderAutofill,
  cloneSettings,
  getEnabledPluginsSummary,
  normalizeLocalizedText,
  prettyJson,
  providerDisplayName,
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
  EDITOR_CONTROL_SURFACE_CLASS,
  EditorDescription,
  EditorEnvHint,
  EditorField,
  EditorFieldGrid,
  EditorLabelRow,
  EditorSection,
} from "./editor-layout";
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
import { readObject, readString } from "./profile-editor/editor-utils";
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
import type { MarketplaceSourceInput } from "./profile-editor/useMarketplaceCatalog";
import { useObjectJsonEditor } from "./profile-editor/useObjectJsonEditor";
import useStructuredSettingsSectionState from "./profile-editor/useStructuredSettingsSectionState";
import { TYPOGRAPHY } from "./typography-classes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Form } from "./ui/form";
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

interface ProviderEditorSaveData {
  id?: string;
  name: string;
  localizedName?: LocalizedText;
  description: string;
  basePresetId?: string;
  docUrl?: string;
  models?: Provider["models"];
  modelSuggestions: string[];
  settingsPatch: Record<string, unknown>;
}

export interface ProviderEditorHandle {
  isDirty: () => boolean;
  canSave: () => boolean;
  save: () => Promise<boolean>;
}

interface ProviderEditorProps {
  provider: Provider | null;
  providers: Provider[];
  onSave: (data: ProviderEditorSaveData) => Promise<boolean> | boolean;
  onClose: () => void;
}

const NO_BASE_PRESET_VALUE = "__none__";

function resolveProviderLocalizedName(provider: Provider | null): LocalizedText {
  return normalizeLocalizedText(provider?.localizedName, provider?.name ?? "");
}

function buildProviderLocalizedName(nameZh: string, nameEn: string): LocalizedText | undefined {
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

function buildInitialProviderSettingsPatch(
  provider: Provider | null,
  language: "zh" | "en",
): Record<string, unknown> {
  const next = applyEnvDefaults(cloneSettings(provider?.settingsPatch), BEHAVIOR_ENV_DEFAULTS);
  return provider ? next : applyNewConfigDefaults(next, language);
}

function buildProviderSaveData(
  provider: Provider | null,
  nameZh: string,
  nameEn: string,
  description: string,
  basePresetId: string,
  docUrl: string,
  modelSuggestions: string,
  settingsPatch: Record<string, unknown>,
): ProviderEditorSaveData | null {
  const localizedName = buildProviderLocalizedName(nameZh, nameEn);
  if (!localizedName) {
    return null;
  }

  return {
    id: provider?.id,
    name: localizedName.en || localizedName.zh,
    localizedName,
    description: description.trim(),
    basePresetId: basePresetId || undefined,
    docUrl: docUrl.trim() || undefined,
    models: provider?.models,
    modelSuggestions: modelSuggestions
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean),
    settingsPatch,
  };
}

function providerSaveDataEquals(
  left: ProviderEditorSaveData | null,
  right: ProviderEditorSaveData | null,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const ProviderEditor = forwardRef<ProviderEditorHandle, ProviderEditorProps>(
  function ProviderEditor({ provider, providers, onSave, onClose }, ref) {
    const { language, t } = useI18n();
    const form = useForm();
    const initialDraftRef = useRef<{
      nameZh: string;
      nameEn: string;
      settingsPatch: Record<string, unknown>;
      saveData: ProviderEditorSaveData | null;
    } | null>(null);
    if (initialDraftRef.current === null) {
      const initialLocalizedName = resolveProviderLocalizedName(provider);
      const initialSettingsPatch = buildInitialProviderSettingsPatch(provider, language);
      initialDraftRef.current = {
        nameZh: initialLocalizedName.zh,
        nameEn: initialLocalizedName.en,
        settingsPatch: initialSettingsPatch,
        saveData: buildProviderSaveData(
          provider,
          initialLocalizedName.zh,
          initialLocalizedName.en,
          provider?.description ?? "",
          provider?.basePresetId ?? "",
          provider?.docUrl ?? "",
          provider?.modelSuggestions.join(", ") ?? "",
          initialSettingsPatch,
        ),
      };
    }
    const [nameZh, setNameZh] = useState(initialDraftRef.current.nameZh);
    const [nameEn, setNameEn] = useState(initialDraftRef.current.nameEn);
    const [description, setDescription] = useState(provider?.description ?? "");
    const [basePresetId, setBasePresetId] = useState(provider?.basePresetId ?? "");
    const [docUrl, setDocUrl] = useState(provider?.docUrl ?? "");
    const [modelSuggestions, setModelSuggestions] = useState(
      provider?.modelSuggestions.join(", ") ?? "",
    );
    const [settingsPatch, setSettingsPatch] = useState<Record<string, unknown>>(() =>
      cloneSettings(initialDraftRef.current?.settingsPatch),
    );
    const selectableBaseProviders = useMemo(
      () => providers.filter((candidate) => candidate.id !== provider?.id),
      [provider?.id, providers],
    );
    const selectedBaseProvider = useMemo(
      () => providers.find((candidate) => candidate.id === basePresetId) ?? null,
      [basePresetId, providers],
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
      label: t("providers.editor.sections.behavior"),
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
      label: t("providers.editor.sections.common"),
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
      label: t("providers.editor.sections.environment"),
      isZh: language === "zh",
    });
    const permissionsJsonEditor = useObjectJsonEditor({
      value: settingsPatch.permissions,
      onChange: (next) => handleStructuredObjectChange("permissions", next),
      label: t("providers.editor.sections.permissions"),
      isZh: language === "zh",
    });
    const sandboxJsonEditor = useObjectJsonEditor({
      value: settingsPatch.sandbox,
      onChange: (next) => handleStructuredObjectChange("sandbox", next),
      label: t("providers.editor.sections.sandbox"),
      isZh: language === "zh",
    });
    const hooksJsonEditor = useObjectJsonEditor({
      value: settingsPatch.hooks,
      onChange: (next) => handleStructuredObjectChange("hooks", next),
      label: t("providers.editor.sections.hooks"),
      isZh: language === "zh",
    });
    const marketplacesJsonEditor = useObjectJsonEditor({
      value: settingsPatch.extraKnownMarketplaces,
      onChange: (next) => handleStructuredObjectChange("extraKnownMarketplaces", next),
      label: t("providers.editor.sections.marketplaces"),
      isZh: language === "zh",
    });
    const pluginsJsonEditor = useObjectJsonEditor({
      value: settingsPatch.enabledPlugins,
      onChange: (next) => handleStructuredObjectChange("enabledPlugins", next),
      label: t("providers.editor.sections.plugins"),
      isZh: language === "zh",
    });
    const statusLineJsonEditor = useObjectJsonEditor({
      value: settingsPatch.statusLine,
      onChange: (next) => handleStructuredObjectChange("statusLine", next),
      label: t("providers.editor.sections.statusLine"),
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
      validateMessage: t("providers.editor.validation.settingsPatchObject"),
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
      () => getSandboxPresentation(settingsPatch.sandbox, t),
      [settingsPatch.sandbox, t],
    );
    const marketplaceSources = useMemo<MarketplaceSourceInput[]>(() => {
      return Object.entries(readObject(settingsPatch.extraKnownMarketplaces)).map(
        ([marketplaceId, entry]) => {
          const record = readObject(entry);
          const source = readObject(record.source);
          return {
            marketplaceId,
            sourceType: typeof source.source === "string" ? source.source : "unknown",
            repo: typeof source.repo === "string" ? source.repo : "",
            ref: typeof source.ref === "string" ? source.ref : "",
            path: typeof source.path === "string" ? source.path : "",
          };
        },
      );
    }, [settingsPatch.extraKnownMarketplaces]);

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
      applyPatch(applyProviderAutofill(settingsPatch, providers, nextBasePresetId || undefined));
    }

    // 保存进行中闸门：用 useRef(同步)杜绝单次保存窗口内 onSave 被重复触发
    // (防用户双击重复 apply/upsert，也消除慢测试环境下点击被重复处理导致的多次 onSave)。
    const savingRef = useRef(false);

    async function handleSaveClick() {
      if (!canSavePreset || !currentSaveData || savingRef.current) {
        return false;
      }

      savingRef.current = true;
      try {
        return await onSave(currentSaveData);
      } finally {
        savingRef.current = false;
      }
    }

    const behaviorFields = useMemo(
      () => PROFILE_SETTINGS_FORM_REGISTRY.filter((field) => field.section === "behavior"),
      [],
    );
    const commonFields = useMemo(
      () => PROFILE_SETTINGS_FORM_REGISTRY.filter((field) => field.section === "common"),
      [],
    );
    const scalarFields = useMemo(
      () => behaviorFields.filter((field) => field.kind !== "checkbox"),
      [behaviorFields],
    );
    const behaviorToggleFields = useMemo(
      () => behaviorFields.filter((field) => field.kind === "checkbox"),
      [behaviorFields],
    );
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
    const currentSaveData = buildProviderSaveData(
      provider,
      nameZh,
      nameEn,
      description,
      basePresetId,
      docUrl,
      modelSuggestions,
      settingsPatch,
    );
    const canSavePreset = !!currentSaveData && !hasValidationError;
    const isDirty = !providerSaveDataEquals(initialDraftRef.current.saveData, currentSaveData);

    useImperativeHandle(ref, () => ({
      isDirty: () => isDirty,
      canSave: () => canSavePreset,
      save: handleSaveClick,
    }));

    const messages = {
      title: provider ? t("providers.editor.title.edit") : t("providers.editor.title.add"),
      save: t("providers.editor.save"),
      nameZh: t("providers.editor.fields.nameZh"),
      nameZhPlaceholder: t("providers.editor.placeholders.nameZh"),
      nameEn: t("providers.editor.fields.nameEn"),
      nameEnPlaceholder: t("providers.editor.placeholders.nameEn"),
      description: t("providers.editor.fields.description"),
      descriptionPlaceholder: t("providers.editor.placeholders.description"),
      docUrl: t("providers.editor.fields.docUrl"),
      basePreset: t("providers.editor.fields.basePreset"),
      authToken: t("providers.editor.fields.authToken"),
      authTokenEnv: t("providers.editor.fields.authTokenEnv"),
      showAuthToken: t("common.showToken"),
      hideAuthToken: t("common.hideToken"),
      baseUrl: t("providers.editor.fields.baseUrl"),
      baseUrlEnv: t("providers.editor.fields.baseUrlEnv"),
      modelSuggestions: t("providers.editor.fields.modelSuggestions"),
      modelSuggestionsHint: t("providers.editor.hints.modelSuggestions"),
      baseSuggestions: t("providers.editor.hints.baseSuggestions"),
      metadata: t("providers.editor.sections.metadata"),
      auth: t("providers.editor.sections.auth"),
      behavior: t("providers.editor.sections.behavior"),
      common: t("providers.editor.sections.common"),
      environment: t("providers.editor.sections.environment"),
      behaviorJsonHint: t("providers.editor.hints.behaviorJson"),
      permissions: t("providers.editor.sections.permissions"),
      sandbox: t("providers.editor.sections.sandbox"),
      hooks: t("providers.editor.sections.hooks"),
      marketplaces: t("providers.editor.sections.marketplaces"),
      plugins: t("providers.editor.sections.plugins"),
      statusLine: t("providers.editor.sections.statusLine"),
      preview: t("providers.editor.sections.preview"),
      previewMode: t("common.previewMode"),
      editJsonMode: t("common.editJsonMode"),
      expertHint: t("providers.editor.hints.expert"),
      expertStructuredKeys: t("providers.editor.hints.expertStructuredKeys"),
    };

    return (
      <Form {...form}>
        <div
          data-slot="preset-editor-panel"
          className="flex h-full min-h-0 w-full min-w-[560px] flex-col overflow-hidden bg-secondary"
        >
          <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-card/95 px-5 shadow-toolbar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>
            <h2 className={cn("min-w-0 flex-1 truncate", TYPOGRAPHY.drawerTitle)}>
              {messages.title}
            </h2>
            <Button
              type="button"
              disabled={!canSavePreset}
              onClick={() => {
                void handleSaveClick();
              }}
            >
              {messages.save}
            </Button>
          </div>

          <div
            data-slot="preset-editor-body"
            className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto bg-secondary px-6 py-6 pb-6 [&>*]:shrink-0 [&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]"
          >
            <EditorSection title={messages.metadata}>
              <EditorFieldGrid>
                <EditorField>
                  <Label htmlFor="preset-name-zh" className="inline-flex items-center gap-2">
                    <span>{messages.nameZh}</span>
                    <RequiredBadge text={t("form.oneRequired")} />
                  </Label>
                  <Input
                    id="preset-name-zh"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={nameZh}
                    onChange={(event) => setNameZh(event.target.value)}
                    placeholder={messages.nameZhPlaceholder}
                  />
                </EditorField>
                <EditorField>
                  <Label htmlFor="preset-name-en" className="inline-flex items-center gap-2">
                    <span>{messages.nameEn}</span>
                    <RequiredBadge text={t("form.oneRequired")} />
                  </Label>
                  <Input
                    id="preset-name-en"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={nameEn}
                    onChange={(event) => setNameEn(event.target.value)}
                    placeholder={messages.nameEnPlaceholder}
                  />
                </EditorField>
              </EditorFieldGrid>

              <EditorFieldGrid className="md:grid-cols-1">
                <EditorField>
                  <Label htmlFor="preset-doc-url">{messages.docUrl}</Label>
                  <Input
                    id="preset-doc-url"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={docUrl}
                    onChange={(event) => setDocUrl(event.target.value)}
                    placeholder="https://..."
                  />
                </EditorField>
              </EditorFieldGrid>

              <EditorFieldGrid className="md:grid-cols-1">
                <EditorField>
                  <Label htmlFor="preset-description">{messages.description}</Label>
                  <Input
                    id="preset-description"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={messages.descriptionPlaceholder}
                  />
                </EditorField>
              </EditorFieldGrid>

              <EditorField>
                <Label htmlFor="preset-model-suggestions">{messages.modelSuggestions}</Label>
                <Input
                  id="preset-model-suggestions"
                  className={EDITOR_CONTROL_SURFACE_CLASS}
                  value={modelSuggestions}
                  onChange={(event) => setModelSuggestions(event.target.value)}
                  placeholder={t("providers.editor.placeholders.modelSuggestions")}
                />
                <EditorDescription>{messages.modelSuggestionsHint}</EditorDescription>
              </EditorField>
            </EditorSection>

            <EditorSection title={messages.auth}>
              <EditorField>
                <Label htmlFor="preset-base-preset">{messages.basePreset}</Label>
                <Select
                  value={basePresetId || NO_BASE_PRESET_VALUE}
                  onValueChange={(value) =>
                    handleBasePresetChange(value === NO_BASE_PRESET_VALUE ? "" : value)
                  }
                >
                  <SelectTrigger
                    id="preset-base-preset"
                    className={cn("w-full", EDITOR_CONTROL_SURFACE_CLASS)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={NO_BASE_PRESET_VALUE}>
                        {t("providers.editor.options.none")}
                      </SelectItem>
                      {selectableBaseProviders.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {providerDisplayName(candidate, language)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </EditorField>

              <EditorField>
                <EditorLabelRow>
                  <Label htmlFor="preset-base-url">{messages.baseUrl}</Label>
                  <EditorEnvHint>{messages.baseUrlEnv}</EditorEnvHint>
                </EditorLabelRow>
                <Input
                  id="preset-base-url"
                  aria-label={messages.baseUrlEnv}
                  className={EDITOR_CONTROL_SURFACE_CLASS}
                  value={readEnvString(settingsPatch, "ANTHROPIC_BASE_URL")}
                  placeholder="https://api.anthropic.com"
                  onChange={(event) =>
                    applyPatch(
                      setEnvString(settingsPatch, "ANTHROPIC_BASE_URL", event.target.value),
                    )
                  }
                />
              </EditorField>

              <EditorField>
                <EditorLabelRow>
                  <Label htmlFor="preset-auth-token">{messages.authToken}</Label>
                  <EditorEnvHint>{messages.authTokenEnv}</EditorEnvHint>
                </EditorLabelRow>
                <SensitiveTextInput
                  id="preset-auth-token"
                  ariaLabel={messages.authTokenEnv}
                  value={readEnvString(settingsPatch, "ANTHROPIC_AUTH_TOKEN")}
                  placeholder="sk-ant-..."
                  showLabel={messages.showAuthToken}
                  hideLabel={messages.hideAuthToken}
                  onChange={(value) =>
                    applyPatch(setEnvString(settingsPatch, "ANTHROPIC_AUTH_TOKEN", value))
                  }
                />
              </EditorField>

              {selectedBaseProvider && selectedBaseProvider.modelSuggestions.length > 0 && (
                <EditorField>
                  <Label>{messages.baseSuggestions}</Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedBaseProvider.modelSuggestions.map((model) => (
                      <Button
                        key={model}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-auto rounded-full px-2.5 py-1 font-mono text-xs"
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
              scope="providers"
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
              marketplaceSources={marketplaceSources}
            />
          </div>
        </div>
      </Form>
    );
  },
);

export default ProviderEditor;
