import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, CircleAlert, CircleCheck, ExternalLink, Eye, TestTube } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { getUserFacingErrorReason, showOperationError } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import { ipc } from "../ipc";
import type { ConfigProfile, ModelTestResult, Provider } from "../types";
import {
  applyEnvDefaults,
  applyProviderAutofill,
  cloneSettings,
  getEnabledPluginsSummary,
  providerDisplayName,
  providerSlugFromId,
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
import { readObject, readString } from "./profile-editor/editor-utils";
import FieldHelpButton from "./profile-editor/FieldHelpButton";
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
import { Spinner } from "./ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

type ModelTestResultDialogComponent =
  typeof import("./profile-editor/ModelTestResultDialog").default;

let modelTestResultDialogPromise: Promise<{ default: ModelTestResultDialogComponent }> | null =
  null;

function loadModelTestResultDialog() {
  modelTestResultDialogPromise ??= import("./profile-editor/ModelTestResultDialog");
  return modelTestResultDialogPromise;
}

interface ProfileEditorSaveData {
  id?: string;
  name: string;
  description: string;
  providerId?: string;
  settings: Record<string, unknown>;
}

export interface ProfileEditorHandle {
  isDirty: () => boolean;
  canSave: () => boolean;
  save: () => Promise<boolean>;
}

interface ProfileEditorProps {
  profile: ConfigProfile | null;
  providers: Provider[];
  onSave: (data: ProfileEditorSaveData) => Promise<boolean> | boolean;
  onClose: () => void;
  /** 打开内置供应商只读一览（供应商选项区入口）。 */
  onViewBuiltinProviders?: () => void;
}

// 哨兵值：下拉里的「自定义」项（无内置 providerId，地址由用户手填）；保存前映射为 ""
const CUSTOM_PROVIDER_VALUE = "__none__";

function buildInitialProfileSettings(
  profile: ConfigProfile | null,
  language: "zh" | "en",
): Record<string, unknown> {
  const next = applyEnvDefaults(cloneSettings(profile?.settings), BEHAVIOR_ENV_DEFAULTS);
  return profile ? next : applyNewConfigDefaults(next, language);
}

function buildProfileSaveData(
  profileId: string | undefined,
  name: string,
  description: string,
  providerId: string,
  settings: Record<string, unknown>,
): ProfileEditorSaveData {
  return {
    id: profileId,
    name: name.trim(),
    description: description.trim(),
    providerId: providerId || undefined,
    settings,
  };
}

function profileSaveDataEquals(left: ProfileEditorSaveData, right: ProfileEditorSaveData) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const ProfileEditor = forwardRef<ProfileEditorHandle, ProfileEditorProps>(function ProfileEditor(
  { profile, providers, onSave, onClose, onViewBuiltinProviders },
  ref,
) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const initialDraftRef = useRef<ProfileEditorSaveData | null>(null);
  if (initialDraftRef.current === null) {
    initialDraftRef.current = buildProfileSaveData(
      profile?.id,
      profile?.name ?? "",
      profile?.description ?? "",
      profile?.providerId ?? "",
      buildInitialProfileSettings(profile, language),
    );
  }
  const [name, setName] = useState(initialDraftRef.current.name);
  const [description, setDescription] = useState(initialDraftRef.current.description);
  const [providerId, setProviderId] = useState(initialDraftRef.current.providerId ?? "");
  const [settings, setSettings] = useState<Record<string, unknown>>(() =>
    cloneSettings(initialDraftRef.current?.settings),
  );
  const [previewJson, setPreviewJson] = useState("{}");
  const [previewError, setPreviewError] = useState("");
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [latestModelTestResult, setLatestModelTestResult] = useState<ModelTestResult | null>(null);
  const [modelTestError, setModelTestError] = useState("");
  const [isModelTestDialogOpen, setIsModelTestDialogOpen] = useState(false);
  const [ModelTestResultDialog, setModelTestResultDialog] =
    useState<ModelTestResultDialogComponent | null>(null);
  const [isRawResponseExpanded, setIsRawResponseExpanded] = useState(false);
  const modelTestRunIdRef = useRef(0);
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === providerId) ?? null,
    [providerId, providers],
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
    () => getSandboxPresentation(settings.sandbox, t),
    [settings.sandbox, t],
  );
  const marketplaceSources = useMemo<MarketplaceSourceInput[]>(() => {
    return Object.entries(readObject(settings.extraKnownMarketplaces)).map(
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
  }, [settings.extraKnownMarketplaces]);

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

  function reopenLatestModelTestResult() {
    if (!latestModelTestResult && !modelTestError) {
      return;
    }
    setIsRawResponseExpanded(Boolean(latestModelTestResult?.rawResponse?.trim()));
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

  // 读取所选 provider 为某个 env 键提供的默认值（覆盖层之下的继承默认）
  function readProviderEnvDefault(envKey: string): string {
    const raw = selectedProvider?.env?.[envKey];
    return typeof raw === "string" ? raw.trim() : "";
  }

  function readBehaviorFieldState(field: SettingsFieldDefinition) {
    if (field.envKey) {
      // 覆盖层只存差异:value 是用户的显式覆盖(可能为空),
      // providerDefault 是 provider 提供的继承默认,effectiveValue 是最终生效值。
      const override = readEnvString(settings, field.envKey);
      const providerDefault = readProviderEnvDefault(field.envKey) || field.defaultValue || "";
      const source: "override" | "inherited" | "unset" = override
        ? "override"
        : providerDefault
          ? "inherited"
          : "unset";
      return {
        mappedToEnv: true,
        value: override,
        providerDefault,
        effectiveValue: override || providerDefault,
        source,
      };
    }
    const raw = readString(settings[field.key]);
    const source: "override" | "inherited" | "unset" = raw ? "override" : "unset";
    return {
      mappedToEnv: false,
      value: raw,
      providerDefault: "",
      effectiveValue: raw,
      source,
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

  function handleProviderChange(nextProviderId: string) {
    clearModelTestState();
    setProviderId(nextProviderId);
    applySettings(applyProviderAutofill(settings, providers, nextProviderId || undefined));
  }

  function handleOpenSelectedProviderDocs() {
    const docUrl = selectedProvider?.docUrl;
    if (!docUrl) {
      return;
    }
    void openUrl(docUrl);
  }

  async function handleSaveClick(): Promise<boolean> {
    if (!canSaveProfile) {
      return false;
    }

    const result = await onSave(
      buildProfileSaveData(profile?.id, name, description, providerId, settings),
    );
    return result;
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
      const result = await ipc.testProfileModel({
        id: profile?.id ?? null,
        name,
        description,
        providerId: providerId || null,
        settings,
        ...(promptText !== undefined ? { promptText } : {}),
      });
      if (modelTestRunIdRef.current === runId) {
        setLatestModelTestResult(result);
        setModelTestError("");
        setIsRawResponseExpanded(Boolean(result.rawResponse?.trim()));
        setIsModelTestDialogOpen(true);
      }
    } catch (error) {
      if (modelTestRunIdRef.current === runId) {
        setLatestModelTestResult(null);
        setModelTestError(
          getUserFacingErrorReason(error) ?? t("profiles.editor.modelTest.errorMessage"),
        );
        setIsModelTestDialogOpen(true);
      }
    } finally {
      if (modelTestRunIdRef.current === runId) {
        setIsTestingModel(false);
      }
    }
  }

  function renderTestModelButton() {
    return (
      <Button
        type="button"
        variant="outline"
        className={cn(
          "min-h-[34px] gap-1.5 px-3 text-xs font-semibold transition-transform active:scale-95",
          isTestingModel && "is-testing bg-primary/10 text-primary ring-1 ring-primary/20",
        )}
        aria-label={isTestingModel ? messages.testingModel : messages.testModel}
        title={isTestingModel ? messages.testingModel : messages.testModel}
        disabled={!canTestModel || isTestingModel}
        onClick={() => {
          void handleTestModelClick();
        }}
      >
        {isTestingModel ? (
          <Spinner
            data-testid="profile-editor-model-test-spinner"
            className="size-3.5"
            aria-hidden="true"
          />
        ) : (
          <TestTube className="size-3.5" aria-hidden="true" />
        )}
        <span>{isTestingModel ? messages.testingModel : messages.testModel}</span>
      </Button>
    );
  }

  async function handleCopySuggestedModel(model: string) {
    try {
      await navigator.clipboard.writeText(model);
      showToast(t("profiles.toast.modelCopied"));
    } catch (err) {
      showOperationError(showToast, t("profiles.toast.modelCopyError"), err);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void ipc
        .previewProfile({
          id: profile?.id ?? null,
          name,
          description,
          providerId: providerId || null,
          settings,
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
          setPreviewError(getUserFacingErrorReason(error) ?? t("profiles.toast.saveError"));
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [description, name, providerId, profile?.id, settings, t]);

  useEffect(() => {
    if (!isModelTestDialogOpen || ModelTestResultDialog) {
      return;
    }

    let cancelled = false;
    void loadModelTestResultDialog().then(({ default: DialogComponent }) => {
      if (!cancelled) {
        setModelTestResultDialog(() => DialogComponent);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isModelTestDialogOpen, ModelTestResultDialog]);

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
  const canSaveProfile = !!name.trim() && !hasValidationError;
  const currentSaveData = buildProfileSaveData(
    profile?.id,
    name,
    description,
    providerId,
    settings,
  );
  const isDirty = !profileSaveDataEquals(initialDraftRef.current, currentSaveData);
  // 认证密钥只可能来自 profile.settings.env（provider 不携带密钥），与后端 resolve_model_test_request 判断等价。
  const hasAuthKey =
    !!readEnvString(settings, "ANTHROPIC_AUTH_TOKEN").trim() ||
    !!readEnvString(settings, "ANTHROPIC_API_KEY").trim();
  const isOfficialProvider = providerSlugFromId(providerId) === "anthropic";
  const canTestModel = !!name.trim() && !hasValidationError && hasAuthKey;
  // 仅当缺认证密钥是唯一阻塞原因时给出提示，避免与名称/校验态混淆。
  const testModelDisabledHint =
    !hasAuthKey && name.trim().length > 0 && !hasValidationError
      ? isOfficialProvider
        ? t("profiles.editor.modelTest.officialNoKeyHint")
        : t("profiles.editor.modelTest.missingAuthHint")
      : undefined;

  useImperativeHandle(ref, () => ({
    isDirty: () => isDirty,
    canSave: () => canSaveProfile,
    save: handleSaveClick,
  }));

  const messages = {
    title: profile ? t("profiles.editor.title.edit") : t("profiles.editor.title.add"),
    save: t("profiles.editor.save"),
    testModel: t("profiles.editor.actions.testModel"),
    testingModel: t("profiles.editor.actions.testingModel"),
    reopenModelTest: t("profiles.editor.modelTest.reopenResult"),
    name: t("profiles.editor.fields.name"),
    namePlaceholder: t("profiles.editor.placeholders.name"),
    description: t("profiles.editor.fields.description"),
    descriptionPlaceholder: t("profiles.editor.placeholders.description"),
    provider: t("profiles.editor.fields.provider"),
    openProviderDocs: t("providers.actions.openDocs"),
    authToken: t("profiles.editor.fields.authToken"),
    authTokenEnv: t("profiles.editor.fields.authTokenEnv"),
    showAuthToken: t("common.showToken"),
    hideAuthToken: t("common.hideToken"),
    baseUrl: t("profiles.editor.fields.baseUrl"),
    baseUrlEnv: t("profiles.editor.fields.baseUrlEnv"),
    providerHint: t("profiles.editor.hints.provider"),
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
  const latestModelTestStatus = latestModelTestResult
    ? latestModelTestResult.ok
      ? "success"
      : "failed"
    : modelTestError
      ? "failed"
      : null;
  const latestModelTestLabel =
    latestModelTestStatus === "success" && latestModelTestResult
      ? `${t("profiles.editor.modelTest.status.success")} · ${latestModelTestResult.durationMs} ms`
      : latestModelTestStatus === "failed"
        ? t("profiles.editor.modelTest.status.error")
        : "";
  const latestModelTestAriaLabel = latestModelTestLabel
    ? t("profiles.editor.modelTest.reopenResultAriaLabel")
        .replace("{action}", messages.reopenModelTest)
        .replace("{result}", latestModelTestLabel)
    : messages.reopenModelTest;

  return (
    <div
      data-slot="profile-editor-panel"
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
        <h2 className={cn("min-w-0 flex-1 truncate", TYPOGRAPHY.drawerTitle)}>{messages.title}</h2>
        <Button
          type="button"
          disabled={!canSaveProfile}
          onClick={() => {
            void handleSaveClick();
          }}
        >
          {messages.save}
        </Button>
      </div>

      <div
        data-slot="profile-editor-body"
        className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto bg-secondary px-6 py-6 pb-6 [&>*]:shrink-0 [&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]"
      >
        <ProfileNameBadge
          name={name}
          colorSeedScope={providerSlugFromId(providerId)}
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
                className={EDITOR_CONTROL_SURFACE_CLASS}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={messages.namePlaceholder}
              />
            </EditorField>
            <EditorField>
              <Label htmlFor="profile-description">{messages.description}</Label>
              <Input
                id="profile-description"
                className={EDITOR_CONTROL_SURFACE_CLASS}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={messages.descriptionPlaceholder}
              />
            </EditorField>
          </EditorFieldGrid>
        </EditorSection>

        <EditorSection title={messages.auth}>
          <EditorField>
            <EditorLabelRow className="justify-between">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="profile-provider">{messages.provider}</Label>
                <FieldHelpButton helperKey={messages.providerHint} />
              </div>
              {onViewBuiltinProviders ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto gap-1.5 p-0 text-xs font-semibold text-primary hover:text-primary"
                  onClick={onViewBuiltinProviders}
                >
                  <Eye className="size-3.5" aria-hidden="true" />
                  <span>{t("profiles.editor.actions.viewBuiltinProviders")}</span>
                </Button>
              ) : null}
            </EditorLabelRow>
            <div className="grid max-w-full grid-cols-[minmax(0,520px)_max-content] items-center gap-3 max-[700px]:grid-cols-[minmax(0,1fr)] max-[700px]:items-stretch">
              <div className="min-w-0">
                <Select
                  value={providerId || CUSTOM_PROVIDER_VALUE}
                  onValueChange={(value) =>
                    handleProviderChange(value === CUSTOM_PROVIDER_VALUE ? "" : value)
                  }
                >
                  <SelectTrigger
                    id="profile-provider"
                    className={cn("w-full", EDITOR_CONTROL_SURFACE_CLASS)}
                    value={providerId}
                    data-value={providerId}
                    onChange={(event) =>
                      handleProviderChange((event.target as HTMLButtonElement).value)
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={CUSTOM_PROVIDER_VALUE}>
                        {t("profiles.editor.options.customProvider")}
                      </SelectItem>
                      {providers.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {providerDisplayName(provider, language)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {selectedProvider?.docUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-9 whitespace-nowrap max-[700px]:justify-self-start"
                  onClick={handleOpenSelectedProviderDocs}
                >
                  <span>{messages.openProviderDocs}</span>
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </EditorField>

          {/* 选中内置供应商时地址只读（来自供应商 env）；自定义模式下可编辑，写入 profile.settings.env */}
          <EditorField>
            <EditorLabelRow>
              <Label htmlFor="profile-base-url">{messages.baseUrl}</Label>
              <EditorEnvHint>{messages.baseUrlEnv}</EditorEnvHint>
            </EditorLabelRow>
            {selectedProvider ? (
              <Input
                id="profile-base-url"
                aria-label={messages.baseUrlEnv}
                className={EDITOR_CONTROL_SURFACE_CLASS}
                value={selectedProvider.env?.ANTHROPIC_BASE_URL ?? ""}
                placeholder="https://api.anthropic.com"
                readOnly
                disabled
                title={
                  selectedProvider.env?.ANTHROPIC_BASE_URL ? undefined : (messages.baseUrl ?? "")
                }
              />
            ) : (
              <Input
                id="profile-base-url"
                aria-label={messages.baseUrlEnv}
                className={EDITOR_CONTROL_SURFACE_CLASS}
                value={readEnvString(settings, "ANTHROPIC_BASE_URL")}
                placeholder="https://api.anthropic.com"
                onChange={(event) =>
                  applySettings(setEnvString(settings, "ANTHROPIC_BASE_URL", event.target.value))
                }
              />
            )}
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

          {selectedProvider && selectedProvider.modelSuggestions.length > 0 && (
            <EditorField>
              <Label>{messages.suggestedModels}</Label>
              <div className="flex flex-wrap gap-2">
                {selectedProvider.modelSuggestions.map((model) => (
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
              {testModelDisabledHint ? (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {/* 禁用按钮自身不触发 hover，外层 span 承接提示 */}
                      <span className="inline-flex">{renderTestModelButton()}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{testModelDisabledHint}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                renderTestModelButton()
              )}
              {latestModelTestStatus ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 rounded-full border px-2.5 text-xs font-semibold shadow-xs",
                    latestModelTestStatus === "success"
                      ? "border-chart-2/40 bg-chart-2/10 text-chart-2 hover:bg-chart-2/15 hover:text-chart-2"
                      : "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive",
                  )}
                  aria-label={latestModelTestAriaLabel}
                  title={latestModelTestAriaLabel}
                  onClick={reopenLatestModelTestResult}
                >
                  {latestModelTestStatus === "success" ? (
                    <CircleCheck className="size-4" aria-hidden="true" />
                  ) : (
                    <CircleAlert className="size-4" aria-hidden="true" />
                  )}
                  <span>{latestModelTestLabel}</span>
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
          marketplaceSources={marketplaceSources}
        />

        {isModelTestDialogOpen && ModelTestResultDialog ? (
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
        ) : null}
      </div>
    </div>
  );
});

export default ProfileEditor;
