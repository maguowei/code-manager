import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useI18n } from "../i18n";
import { ipc } from "../ipc";
import { cn } from "../lib/utils";
import type { CodexApplyPreview, CodexProfile, CodexProfileInput, CodexProvider } from "../types";
import ConfigPreview from "./ConfigPreview";
import {
  EDITOR_CONTROL_SURFACE_CLASS,
  EditorDescription,
  EditorEnvHint,
  EditorField,
  EditorFieldGrid,
  EditorLabelRow,
  EditorSection,
} from "./editor-layout";
import ProfileNameBadge from "./ProfileNameBadge";
import SensitiveTextInput from "./profile-editor/SensitiveTextInput";
import { TYPOGRAPHY } from "./typography-classes";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";

const CODEX_BUILTIN_OPENAI_ID = "codex-builtin:openai";
const isChatGptLogin = (providerId: string) => providerId === CODEX_BUILTIN_OPENAI_ID;

const CUSTOM_PROVIDER_ID = "custom";

export interface CodexProfileEditorSaveData {
  id?: string | null;
  name: string;
  description: string;
  providerId: string;
  apiKey: string;
  model: string;
  modelReasoningEffort: string;
  customConfigToml: string;
  customModelsJson: string;
}

export interface CodexProfileEditorHandle {
  canSave: () => boolean;
  save: () => Promise<boolean>;
  isDirty: () => boolean;
}

interface CodexProfileEditorProps {
  profile: CodexProfile | null;
  providers: CodexProvider[];
  onSave: (data: CodexProfileEditorSaveData) => Promise<boolean> | boolean;
  onClose: () => void;
}

function profileToSaveData(
  profile: CodexProfile | null,
  providers: CodexProvider[],
): CodexProfileEditorSaveData {
  if (!profile) {
    return {
      id: null,
      name: "",
      description: "",
      providerId: CUSTOM_PROVIDER_ID,
      apiKey: "",
      model: "",
      modelReasoningEffort: "",
      customConfigToml: "",
      customModelsJson: "",
    };
  }

  const isCustom =
    profile.providerId === CUSTOM_PROVIDER_ID ||
    (!providers.some((p) => p.id === profile.providerId) &&
      (Boolean(profile.customConfigToml) || Boolean(profile.customModelsJson)));

  const matchedProvider = providers.find((p) => p.id === profile.providerId);

  return {
    id: profile.id,
    name: profile.name,
    description: profile.description ?? "",
    providerId: isCustom ? CUSTOM_PROVIDER_ID : (matchedProvider?.id ?? CUSTOM_PROVIDER_ID),
    apiKey: "", // 编辑时留空表示保留已有 key
    model: profile.model ?? (isCustom ? "" : (matchedProvider?.defaultModel ?? "")),
    modelReasoningEffort:
      profile.modelReasoningEffort ??
      (isCustom ? "" : (matchedProvider?.defaultReasoningEffort ?? "")),
    customConfigToml: profile.customConfigToml ?? "",
    customModelsJson: profile.customModelsJson ?? "",
  };
}

function saveDataEquals(a: CodexProfileEditorSaveData, b: CodexProfileEditorSaveData): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.description === b.description &&
    a.providerId === b.providerId &&
    a.apiKey === b.apiKey &&
    a.model === b.model &&
    a.modelReasoningEffort === b.modelReasoningEffort &&
    a.customConfigToml === b.customConfigToml &&
    a.customModelsJson === b.customModelsJson
  );
}

function saveDataToInput(data: CodexProfileEditorSaveData): CodexProfileInput {
  const isCustom = data.providerId === CUSTOM_PROVIDER_ID;
  if (isCustom) {
    return {
      id: data.id,
      name: data.name.trim(),
      description: data.description.trim() ? data.description.trim() : null,
      providerId: CUSTOM_PROVIDER_ID,
      apiKey: "",
      model: null,
      modelReasoningEffort: null,
      customConfigToml: data.customConfigToml.trim() ? data.customConfigToml : null,
      customModelsJson: data.customModelsJson.trim() ? data.customModelsJson : null,
    };
  }

  return {
    id: data.id,
    name: data.name.trim(),
    description: data.description.trim() ? data.description.trim() : null,
    providerId: data.providerId,
    apiKey: data.apiKey,
    model: data.model.trim() ? data.model.trim() : null,
    modelReasoningEffort: data.modelReasoningEffort.trim()
      ? data.modelReasoningEffort.trim()
      : null,
    customConfigToml: null,
    customModelsJson: null,
  };
}

const CodexProfileEditor = forwardRef<CodexProfileEditorHandle, CodexProfileEditorProps>(
  function CodexProfileEditor({ profile, providers, onSave, onClose }, ref) {
    const { t } = useI18n();

    const [draft, setDraft] = useState<CodexProfileEditorSaveData>(() =>
      profileToSaveData(profile, providers),
    );
    const initialDraftRef = useRef<CodexProfileEditorSaveData>(draft);
    const [saving, setSaving] = useState(false);

    // 实时预览状态
    const [livePreview, setLivePreview] = useState<CodexApplyPreview | null>(null);
    const [livePreviewError, setLivePreviewError] = useState<string | null>(null);

    const isCustom = draft.providerId === CUSTOM_PROVIDER_ID;

    // 选中预设供应商
    const currentProvider = useMemo(() => {
      if (isCustom) return undefined;
      return providers.find((p) => p.id === draft.providerId);
    }, [providers, isCustom, draft.providerId]);

    const canSave = useMemo(() => {
      const name = draft.name.trim();
      if (!name) return false;
      if (!isCustom) {
        const isChatGpt = isChatGptLogin(draft.providerId);
        if (!isChatGpt && !draft.id && !draft.apiKey.trim()) {
          return false;
        }
      }
      return true;
    }, [draft, isCustom]);

    const isDirty = useCallback(() => {
      return !saveDataEquals(draft, initialDraftRef.current);
    }, [draft]);

    const handleSave = useCallback(async (): Promise<boolean> => {
      if (!canSave || saving) return false;
      setSaving(true);
      try {
        const ok = await onSave(draft);
        if (ok) {
          initialDraftRef.current = draft;
        }
        return ok;
      } finally {
        setSaving(false);
      }
    }, [canSave, saving, onSave, draft]);

    useImperativeHandle(
      ref,
      () => ({
        canSave: () => canSave,
        save: handleSave,
        isDirty,
      }),
      [canSave, handleSave, isDirty],
    );

    // 实时预览防抖更新
    useEffect(() => {
      const timer = setTimeout(() => {
        const input = saveDataToInput(draft);
        ipc
          .previewCodexInput(input)
          .then((preview) => {
            setLivePreview(preview);
            setLivePreviewError(null);
          })
          .catch((err) => {
            setLivePreview(null);
            setLivePreviewError(err instanceof Error ? err.message : String(err));
          });
      }, 250);

      return () => clearTimeout(timer);
    }, [draft]);

    // 切换供应商联动
    const handleProviderChange = (providerId: string) => {
      if (providerId === CUSTOM_PROVIDER_ID) {
        setDraft((prev) => ({
          ...prev,
          providerId: CUSTOM_PROVIDER_ID,
        }));
        return;
      }

      const provider = providers.find((p) => p.id === providerId);
      if (!provider) return;

      const isPreviousDefaultName =
        !draft.name || providers.some((p) => draft.name === `${p.name} 快速起步`);

      setDraft((prev) => ({
        ...prev,
        providerId: provider.id,
        name: isPreviousDefaultName ? `${provider.name} 快速起步` : prev.name,
        model: provider.defaultModel ?? "",
        modelReasoningEffort: provider.defaultReasoningEffort ?? "",
      }));
    };

    return (
      <div
        data-slot="profile-editor-panel"
        className="flex h-full min-h-0 w-full min-w-[560px] flex-col overflow-hidden bg-secondary"
      >
        {/* 顶部粘性工具条 */}
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
            {draft.id ? t("codex.editProfile") : t("codex.createProfile")}
          </h2>
          <Button
            type="button"
            disabled={!canSave || saving}
            onClick={() => {
              void handleSave();
            }}
          >
            {saving ? t("codex.loading") : t("codex.save")}
          </Button>
        </div>

        {/* 抽屉主体 */}
        <div
          data-slot="profile-editor-body"
          className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto bg-secondary px-6 py-6 pb-6 [&>*]:shrink-0 [&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]"
        >
          <ProfileNameBadge name={draft.name || "C"} size="lg" fallbackChar="C" />

          {/* 基本信息 */}
          <EditorSection title={t("profiles.editor.sections.basicInfo")}>
            <EditorFieldGrid>
              <EditorField>
                <Label htmlFor="codex-profile-name">{t("codex.field.profileName")}</Label>
                <Input
                  id="codex-profile-name"
                  className={EDITOR_CONTROL_SURFACE_CLASS}
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={t("codex.field.profileNamePlaceholder")}
                />
              </EditorField>

              <EditorField>
                <Label htmlFor="codex-profile-description">{t("codex.field.description")}</Label>
                <Input
                  id="codex-profile-description"
                  className={EDITOR_CONTROL_SURFACE_CLASS}
                  value={draft.description}
                  onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder={t("codex.field.descriptionPlaceholder")}
                />
              </EditorField>
            </EditorFieldGrid>
          </EditorSection>

          {/* 认证与供应商 */}
          <EditorSection title={t("profiles.editor.sections.auth")}>
            <EditorField>
              <EditorLabelRow className="justify-between">
                <Label htmlFor="codex-profile-provider">
                  {t("profiles.editor.fields.provider")}
                </Label>
              </EditorLabelRow>
              <div className="grid max-w-full grid-cols-[minmax(0,520px)_max-content] items-center gap-3 max-[700px]:grid-cols-[minmax(0,1fr)] max-[700px]:items-stretch">
                <div className="min-w-0">
                  <Select
                    value={draft.providerId}
                    onValueChange={(val) => handleProviderChange(val)}
                  >
                    <SelectTrigger
                      id="codex-profile-provider"
                      className={cn("w-full", EDITOR_CONTROL_SURFACE_CLASS)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={CUSTOM_PROVIDER_ID}>
                          {t("codex.customBadge")} (自定义配置片段)
                        </SelectItem>
                        {providers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {currentProvider?.docUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-9 whitespace-nowrap max-[700px]:justify-self-start"
                    onClick={() => currentProvider.docUrl && void openUrl(currentProvider.docUrl)}
                  >
                    <span>{t("providers.actions.openDocs")}</span>
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </EditorField>

            {/* 选中预设供应商时展示 Base URL 与 API Key */}
            {!isCustom && currentProvider ? (
              <>
                <EditorField>
                  <EditorLabelRow>
                    <Label htmlFor="codex-base-url">{t("profiles.editor.fields.baseUrl")}</Label>
                    <EditorEnvHint>{`[model_providers.${currentProvider.slug}.base_url]`}</EditorEnvHint>
                  </EditorLabelRow>
                  <Input
                    id="codex-base-url"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={currentProvider.baseUrl}
                    readOnly
                    disabled
                  />
                </EditorField>

                {isChatGptLogin(draft.providerId) ? (
                  <div className="rounded-md border border-border/60 bg-card p-3 text-xs text-muted-foreground">
                    {t("codex.field.chatgptLoginHint")}
                  </div>
                ) : (
                  <EditorField>
                    <Label htmlFor="codex-profile-api-key">{t("codex.field.apiKey")}</Label>
                    <SensitiveTextInput
                      id="codex-profile-api-key"
                      ariaLabel={t("codex.field.apiKey")}
                      showLabel={t("codex.field.showApiKey")}
                      hideLabel={t("codex.field.hideApiKey")}
                      value={draft.apiKey}
                      onChange={(val) => setDraft((prev) => ({ ...prev, apiKey: val }))}
                      placeholder={
                        draft.id
                          ? t("codex.field.apiKeyKeepHint")
                          : t("codex.field.apiKeyPlaceholder")
                      }
                    />
                    <EditorDescription>{t("codex.field.apiKeyHint")}</EditorDescription>
                  </EditorField>
                )}
              </>
            ) : null}
          </EditorSection>

          {/* 预设模式: 模型与推理设置 */}
          {!isCustom && currentProvider ? (
            <EditorSection title={t("profiles.summary.modelTitle")}>
              <EditorFieldGrid>
                <EditorField>
                  <Label htmlFor="codex-target-model">{t("codex.field.model")}</Label>
                  <div className="flex flex-col gap-2">
                    {currentProvider.models.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {currentProvider.models.map((m) => {
                          const isCurrent = draft.model === m.id;
                          return (
                            <Button
                              key={m.id}
                              type="button"
                              variant={isCurrent ? "secondary" : "outline"}
                              size="xs"
                              onClick={() => setDraft((prev) => ({ ...prev, model: m.id }))}
                              className={cn(
                                "font-mono text-xs",
                                isCurrent &&
                                  "border-primary bg-primary/10 text-primary font-semibold",
                              )}
                            >
                              {m.name || m.id}
                            </Button>
                          );
                        })}
                      </div>
                    ) : null}
                    <Input
                      id="codex-target-model"
                      className={cn("font-mono text-xs", EDITOR_CONTROL_SURFACE_CLASS)}
                      value={draft.model}
                      onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
                      placeholder={t("codex.field.modelPlaceholder")}
                    />
                  </div>
                  <EditorDescription>{t("codex.field.modelHint")}</EditorDescription>
                </EditorField>

                <EditorField>
                  <Label htmlFor="codex-reasoning-effort">{t("codex.field.reasoningEffort")}</Label>
                  <Select
                    value={draft.modelReasoningEffort || "none"}
                    onValueChange={(val) =>
                      setDraft((prev) => ({
                        ...prev,
                        modelReasoningEffort: val === "none" ? "" : val,
                      }))
                    }
                  >
                    <SelectTrigger
                      id="codex-reasoning-effort"
                      className={EDITOR_CONTROL_SURFACE_CLASS}
                    >
                      <SelectValue placeholder={t("codex.field.reasoningEffortPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">默认 (Default)</SelectItem>
                      <SelectItem value="low">low</SelectItem>
                      <SelectItem value="medium">medium</SelectItem>
                      <SelectItem value="high">high</SelectItem>
                      <SelectItem value="max">max</SelectItem>
                    </SelectContent>
                  </Select>
                  <EditorDescription>{t("codex.field.reasoningEffortHint")}</EditorDescription>
                </EditorField>
              </EditorFieldGrid>
            </EditorSection>
          ) : null}

          {/* 自定义模式: config.toml 与 models.json 片段 */}
          {isCustom ? (
            <>
              <EditorSection title={t("codex.field.customToml")}>
                <EditorField>
                  <Textarea
                    id="codex-custom-toml"
                    value={draft.customConfigToml}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, customConfigToml: e.target.value }))
                    }
                    placeholder={t("codex.field.customTomlPlaceholder")}
                    className="font-mono text-xs min-h-[160px]"
                  />
                  <EditorDescription>{t("codex.field.customTomlHint")}</EditorDescription>
                </EditorField>
              </EditorSection>

              <EditorSection title={t("codex.field.customJson")}>
                <EditorField>
                  <Textarea
                    id="codex-custom-json"
                    value={draft.customModelsJson}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, customModelsJson: e.target.value }))
                    }
                    placeholder={t("codex.field.customJsonPlaceholder")}
                    className="font-mono text-xs min-h-[120px]"
                  />
                  <EditorDescription>{t("codex.field.customJsonHint")}</EditorDescription>
                </EditorField>
              </EditorSection>
            </>
          ) : null}

          {/* 实时配置预览 */}
          <EditorSection title={t("codex.previewLiveTitle")}>
            <EditorDescription>{t("codex.previewLiveHint")}</EditorDescription>

            {livePreviewError ? (
              <p className="text-xs text-destructive">{livePreviewError}</p>
            ) : livePreview ? (
              <Tabs defaultValue="toml" className="mt-1">
                <TabsList className="h-8">
                  <TabsTrigger value="toml" className="text-xs">
                    config.toml
                  </TabsTrigger>
                  {livePreview.modelsJsonPreview ? (
                    <TabsTrigger value="models" className="text-xs">
                      models.json
                    </TabsTrigger>
                  ) : null}
                </TabsList>
                <TabsContent value="toml" className="mt-2">
                  <ConfigPreview content={livePreview.configTomlPreview} />
                </TabsContent>
                {livePreview.modelsJsonPreview ? (
                  <TabsContent value="models" className="mt-2">
                    <ConfigPreview content={livePreview.modelsJsonPreview} />
                  </TabsContent>
                ) : null}
              </Tabs>
            ) : null}
          </EditorSection>
        </div>
      </div>
    );
  },
);

export default CodexProfileEditor;
