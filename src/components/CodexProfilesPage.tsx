import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, CircleCheck, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useTauriEvent from "../hooks/useTauriEvent";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import { ipc } from "../ipc";
import { showOperationError } from "../lib/user-facing-error";
import { cn } from "../lib/utils";
import type {
  CodexApplyPreview,
  CodexProfile,
  CodexProfileInput,
  CodexProvider,
  CodexWorkspace,
} from "../types";
import ConfigPreview from "./ConfigPreview";
import ConfirmAlertDialog from "./ConfirmAlertDialog";
import {
  CARD_ACTION_BAR_CLASS,
  CARD_ACTION_BUTTON_CLASS,
  INTERACTIVE_CARD_CLASS,
} from "./card-interaction-classes";
import EmptyState from "./EmptyState";
import type { EditorExitGuard } from "./editor-exit-guard";
import PageHeader from "./PageHeader";
import ProfileNameBadge from "./ProfileNameBadge";
import SensitiveTextInput from "./profile-editor/SensitiveTextInput";
import UnsavedChangesAlertDialog from "./UnsavedChangesAlertDialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Field, FieldContent, FieldDescription, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { SegmentedControl } from "./ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";

const CODEX_BUILTIN_OPENAI_ID = "codex-builtin:openai";
const isChatGptLogin = (providerId: string) => providerId === CODEX_BUILTIN_OPENAI_ID;

type ProfileMode = "preset" | "custom";

interface ProfileDraft {
  id: string | null;
  mode: ProfileMode;
  name: string;
  providerId: string;
  apiKey: string;
  model: string;
  modelReasoningEffort: string;
  customConfigToml: string;
  customModelsJson: string;
}

function createEmptyDraft(defaultProvider?: CodexProvider): ProfileDraft {
  const provider = defaultProvider;
  return {
    id: null,
    mode: "preset",
    name: provider ? `${provider.name} 快速起步` : "DeepSeek 快速起步",
    providerId: provider ? provider.id : "codex-builtin:deepseek",
    apiKey: "",
    model: provider?.defaultModel ?? "",
    modelReasoningEffort: provider?.defaultReasoningEffort ?? "",
    customConfigToml: "",
    customModelsJson: "",
  };
}

function profileToDraft(profile: CodexProfile, providers: CodexProvider[]): ProfileDraft {
  const matchedProvider = providers.find((p) => p.id === profile.providerId);
  const isCustom =
    profile.providerId === "custom" ||
    (!matchedProvider && (Boolean(profile.customConfigToml) || Boolean(profile.customModelsJson)));
  const mode: ProfileMode = isCustom ? "custom" : "preset";
  const fallbackProvider = providers.find((p) => p.id === "codex-builtin:deepseek") ?? providers[0];
  const activeProvider = matchedProvider ?? fallbackProvider;

  return {
    id: profile.id,
    mode,
    name: profile.name,
    providerId: isCustom
      ? "custom"
      : (matchedProvider?.id ?? activeProvider?.id ?? "codex-builtin:deepseek"),
    apiKey: "", // 编辑时留空表示保留已有 key
    model: profile.model ?? (isCustom ? "" : (activeProvider?.defaultModel ?? "")),
    modelReasoningEffort:
      profile.modelReasoningEffort ??
      (isCustom ? "" : (activeProvider?.defaultReasoningEffort ?? "")),
    customConfigToml: profile.customConfigToml ?? "",
    customModelsJson: profile.customModelsJson ?? "",
  };
}

function draftToInput(draft: ProfileDraft): CodexProfileInput {
  if (draft.mode === "custom") {
    return {
      id: draft.id,
      name: draft.name.trim(),
      providerId: "custom",
      apiKey: "",
      model: null,
      modelReasoningEffort: null,
      customConfigToml: draft.customConfigToml.trim() ? draft.customConfigToml : null,
      customModelsJson: draft.customModelsJson.trim() ? draft.customModelsJson : null,
    };
  }

  return {
    id: draft.id,
    name: draft.name.trim(),
    providerId: draft.providerId,
    apiKey: draft.apiKey,
    model: draft.model.trim() ? draft.model.trim() : null,
    modelReasoningEffort: draft.modelReasoningEffort.trim()
      ? draft.modelReasoningEffort.trim()
      : null,
    customConfigToml: null,
    customModelsJson: null,
  };
}

function isDraftEqual(a: ProfileDraft, b: ProfileDraft): boolean {
  return (
    a.id === b.id &&
    a.mode === b.mode &&
    a.name === b.name &&
    a.providerId === b.providerId &&
    a.apiKey === b.apiKey &&
    a.model === b.model &&
    a.modelReasoningEffort === b.modelReasoningEffort &&
    a.customConfigToml === b.customConfigToml &&
    a.customModelsJson === b.customModelsJson
  );
}

interface CodexProfilesPageProps {
  onEditorExitGuardChange?: (guard: EditorExitGuard | null) => void;
}

export default function CodexProfilesPage({
  onEditorExitGuardChange,
}: CodexProfilesPageProps = {}) {
  const { t } = useI18n();
  const { showToast } = useToast();

  const [workspace, setWorkspace] = useState<CodexWorkspace | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile 编辑抽屉状态
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const initialDraftRef = useRef<ProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);

  // 实时配置预览状态
  const [livePreview, setLivePreview] = useState<CodexApplyPreview | null>(null);
  const [livePreviewError, setLivePreviewError] = useState<string | null>(null);

  // 删除 Profile 确认对话框
  const [deleteTarget, setDeleteTarget] = useState<CodexProfile | null>(null);

  // Apply 预览对话框
  const [applyTarget, setApplyTarget] = useState<CodexProfile | null>(null);
  const [applyPreview, setApplyPreview] = useState<CodexApplyPreview | null>(null);
  const [applyPreviewLoading, setApplyPreviewLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  // 未保存更改拦截
  const [isUnsavedChangesAlertOpen, setIsUnsavedChangesAlertOpen] = useState(false);
  const pendingExitActionRef = useRef<(() => void) | null>(null);

  const fetchWorkspace = useCallback(async () => {
    try {
      const data = await ipc.getCodexWorkspace();
      setWorkspace(data);
    } catch (error) {
      showOperationError(showToast, t("codex.toast.loadFailed"), error);
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    void fetchWorkspace();
  }, [fetchWorkspace]);

  useTauriEvent("codex-workspace-changed", () => {
    void fetchWorkspace();
  });

  const isDraftDirty = useMemo(() => {
    if (!profileDraft || !initialDraftRef.current) return false;
    return !isDraftEqual(profileDraft, initialDraftRef.current);
  }, [profileDraft]);

  const requestExitGuard = useCallback(
    (onDiscard: () => void): boolean => {
      if (isDraftDirty) {
        pendingExitActionRef.current = onDiscard;
        setIsUnsavedChangesAlertOpen(true);
        return false;
      }
      onDiscard();
      return true;
    },
    [isDraftDirty],
  );

  useEffect(() => {
    if (!onEditorExitGuardChange) return;
    if (isEditorOpen && isDraftDirty) {
      onEditorExitGuardChange({
        id: "codex-profile-editor",
        canExit: () => requestExitGuard(() => setIsEditorOpen(false)),
      });
    } else {
      onEditorExitGuardChange(null);
    }
    return () => {
      onEditorExitGuardChange(null);
    };
  }, [isEditorOpen, isDraftDirty, onEditorExitGuardChange, requestExitGuard]);

  // 打开创建 Profile 抽屉
  const handleOpenCreate = useCallback(() => {
    const defaultProvider =
      workspace?.providers.find((p) => p.id === "codex-builtin:deepseek") ??
      workspace?.providers[0];
    const draft = createEmptyDraft(defaultProvider);
    initialDraftRef.current = draft;
    setProfileDraft(draft);
    setIsEditorOpen(true);
  }, [workspace]);

  // 打开编辑 Profile 抽屉
  const handleOpenEdit = useCallback(
    (profile: CodexProfile) => {
      if (!workspace) return;
      const draft = profileToDraft(profile, workspace.providers);
      initialDraftRef.current = draft;
      setProfileDraft(draft);
      setIsEditorOpen(true);
    },
    [workspace],
  );

  const handleCloseEditor = useCallback(() => {
    requestExitGuard(() => {
      setIsEditorOpen(false);
      setProfileDraft(null);
      initialDraftRef.current = null;
      setLivePreview(null);
      setLivePreviewError(null);
    });
  }, [requestExitGuard]);

  // 实时预览防抖更新
  useEffect(() => {
    if (!isEditorOpen || !profileDraft) {
      setLivePreview(null);
      setLivePreviewError(null);
      return;
    }

    const timer = setTimeout(() => {
      const input = draftToInput(profileDraft);
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
  }, [isEditorOpen, profileDraft]);

  // 保存 Profile
  const handleSaveProfile = async () => {
    if (!profileDraft) return;
    const name = profileDraft.name.trim();
    if (!name) return;

    if (profileDraft.mode === "preset") {
      const isChatGpt = isChatGptLogin(profileDraft.providerId);
      if (!isChatGpt && !profileDraft.id && !profileDraft.apiKey.trim()) {
        showToast(t("codex.field.apiKey"), "error");
        return;
      }
    }

    setSaving(true);
    try {
      const input = draftToInput(profileDraft);
      await ipc.upsertCodexProfile(input);
      showToast(
        profileDraft.id ? t("codex.toast.profileUpdated") : t("codex.toast.profileCreated"),
        "success",
      );
      setIsEditorOpen(false);
      setProfileDraft(null);
      initialDraftRef.current = null;
      await fetchWorkspace();
    } catch (error) {
      showOperationError(showToast, t("codex.toast.profileSaveFailed"), error);
    } finally {
      setSaving(false);
    }
  };

  // 删除 Profile
  const handleDeleteProfile = async () => {
    if (!deleteTarget) return;
    try {
      await ipc.deleteCodexProfile(deleteTarget.id);
      showToast(t("codex.toast.profileDeleted"), "success");
      setDeleteTarget(null);
      await fetchWorkspace();
    } catch (error) {
      showOperationError(showToast, t("codex.toast.profileDeleteFailed"), error);
    }
  };

  // 触发 Apply 预览
  const handleTriggerApply = async (profile: CodexProfile) => {
    setApplyTarget(profile);
    setApplyPreviewLoading(true);
    setApplyPreview(null);
    try {
      const preview = await ipc.previewCodexApply(profile.id);
      setApplyPreview(preview);
    } catch (error) {
      showOperationError(showToast, t("codex.toast.profileApplyFailed"), error);
      setApplyTarget(null);
    } finally {
      setApplyPreviewLoading(false);
    }
  };

  // 确认 Apply
  const handleConfirmApply = async () => {
    if (!applyTarget) return;
    setApplying(true);
    try {
      await ipc.applyCodexProfile(applyTarget.id);
      showToast(t("codex.toast.profileApplied"), "success");
      setApplyTarget(null);
      setApplyPreview(null);
      await fetchWorkspace();
    } catch (error) {
      showOperationError(showToast, t("codex.toast.profileApplyFailed"), error);
    } finally {
      setApplying(false);
    }
  };

  // 切换预设供应商时联动模型与名称
  const handleSelectPresetProvider = (provider: CodexProvider) => {
    if (!profileDraft) return;
    const isPreviousDefaultName = workspace?.providers.some(
      (p) => profileDraft.name === `${p.name} 快速起步`,
    );

    setProfileDraft((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        providerId: provider.id,
        name: isPreviousDefaultName || !prev.name ? `${provider.name} 快速起步` : prev.name,
        model: provider.defaultModel ?? "",
        modelReasoningEffort: provider.defaultReasoningEffort ?? "",
      };
    });
  };

  const activeProfileId = workspace?.bindings.codexProfileId;
  const currentSelectedPresetProvider = useMemo(() => {
    if (!workspace || !profileDraft || profileDraft.mode !== "preset") return undefined;
    return (
      workspace.providers.find((p) => p.id === profileDraft.providerId) ??
      workspace.providers.find((p) => p.id === "codex-builtin:deepseek") ??
      workspace.providers[0]
    );
  }, [workspace, profileDraft]);

  return (
    <div className="flex flex-col gap-6">
      {/* 页头 */}
      <PageHeader
        title={t("codex.pageTitle")}
        description={t("codex.pageDescription")}
        actions={
          <Button size="sm" onClick={handleOpenCreate} disabled={loading}>
            <Plus className="size-4" />
            {t("codex.addProfile")}
          </Button>
        }
      />

      {/* 主体列表 */}
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("codex.loading")}</p>
      ) : !workspace || workspace.profiles.length === 0 ? (
        <EmptyState
          title={t("codex.emptyProfileTitle")}
          description={t("codex.emptyProfileHint")}
          action={
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus className="size-4" />
              {t("codex.addProfile")}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workspace.profiles.map((profile) => {
            const isCustom = profile.providerId === "custom";
            const provider = workspace.providers.find((p) => p.id === profile.providerId);
            const isActive = activeProfileId === profile.id;
            const isEditing = isEditorOpen && profileDraft?.id === profile.id;
            const targetModel = profile.model || provider?.defaultModel;
            const targetEffort = profile.modelReasoningEffort || provider?.defaultReasoningEffort;

            return (
              <Card
                key={profile.id}
                role="button"
                tabIndex={0}
                data-slot="profile-card"
                onClick={() => {
                  requestExitGuard(() => handleOpenEdit(profile));
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    requestExitGuard(() => handleOpenEdit(profile));
                  }
                }}
                className={cn(
                  INTERACTIVE_CARD_CLASS,
                  "relative flex flex-col justify-between gap-4 p-5",
                  isActive && "border-primary/60 ring-1 ring-primary/40",
                  isEditing && "border-chart-3 ring-1 ring-chart-3/40",
                )}
              >
                {/* 顶部标题行 */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ProfileNameBadge name={profile.name} size="sm" />
                      <span className="text-sm font-semibold text-foreground">{profile.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {isCustom ? t("codex.customBadge") : (provider?.name ?? profile.providerId)}
                      </Badge>
                    </div>

                    {isActive ? (
                      <Badge
                        variant="default"
                        className="gap-1 bg-primary text-xs text-primary-foreground"
                      >
                        <CircleCheck className="size-3.5" />
                        {t("codex.activeBadge")}
                      </Badge>
                    ) : null}
                  </div>

                  {/* 属性信息 */}
                  <div className="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
                    {targetModel ? (
                      <div className="flex items-center justify-between gap-2">
                        <span>{t("codex.summary.model")}</span>
                        <span className="font-mono font-medium text-foreground">{targetModel}</span>
                      </div>
                    ) : null}

                    {targetEffort ? (
                      <div className="flex items-center justify-between gap-2">
                        <span>{t("codex.summary.effort")}</span>
                        <span className="font-mono text-foreground">{targetEffort}</span>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-2">
                      <span>{t("codex.summary.apiKey")}</span>
                      <span className="font-mono text-foreground">
                        {isCustom
                          ? t("codex.summary.customSnippet")
                          : isChatGptLogin(profile.providerId)
                            ? t("codex.summary.chatgptLogin")
                            : profile.apiKey || t("codex.summary.apiKeyUnset")}
                      </span>
                    </div>

                    {provider?.docUrl ? (
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span>{t("codex.openDocs")}</span>
                        <Button
                          type="button"
                          variant="link"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            provider.docUrl && void openUrl(provider.docUrl);
                          }}
                          className="h-auto p-0 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="size-3" />
                          <span>{provider.name}</span>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* 底部操作条 */}
                <div
                  className={cn(CARD_ACTION_BAR_CLASS, "justify-between pt-2")}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="sm"
                    variant={isActive ? "secondary" : "default"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTriggerApply(profile);
                    }}
                    disabled={isActive}
                    className="gap-1.5"
                  >
                    {isActive ? <Check className="size-3.5" /> : null}
                    {isActive ? t("codex.applied") : t("codex.apply")}
                  </Button>

                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(CARD_ACTION_BUTTON_CLASS, "size-8")}
                      onClick={(e) => {
                        e.stopPropagation();
                        requestExitGuard(() => handleOpenEdit(profile));
                      }}
                      title={t("codex.edit")}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        CARD_ACTION_BUTTON_CLASS,
                        "size-8 text-destructive hover:bg-destructive/10 hover:text-destructive",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(profile);
                      }}
                      title={t("codex.delete")}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Profile 创建/编辑 抽屉 */}
      <Sheet open={isEditorOpen} onOpenChange={(open) => !open && handleCloseEditor()}>
        <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {profileDraft?.id ? t("codex.editProfile") : t("codex.createProfile")}
            </SheetTitle>
            <SheetDescription>{t("codex.profileEditorDescription")}</SheetDescription>
          </SheetHeader>

          {profileDraft ? (
            <div className="flex flex-1 flex-col gap-5 py-4">
              {/* 模式选择 */}
              <Field>
                <FieldLabel>{t("codex.selectPresetTitle")}</FieldLabel>
                <FieldContent>
                  <SegmentedControl
                    ariaLabel={t("codex.modePreset")}
                    value={profileDraft.mode}
                    onValueChange={(val) => {
                      const nextMode = val as ProfileMode;
                      setProfileDraft((prev) => {
                        if (!prev) return null;
                        if (nextMode === "custom") {
                          return {
                            ...prev,
                            mode: "custom",
                            providerId: "custom",
                          };
                        }
                        const defaultP =
                          workspace?.providers.find((p) => p.id === "codex-builtin:deepseek") ??
                          workspace?.providers[0];
                        const targetP =
                          workspace?.providers.find((p) => p.id === prev.providerId) ?? defaultP;
                        return {
                          ...prev,
                          mode: "preset",
                          providerId: targetP ? targetP.id : "codex-builtin:deepseek",
                          model: prev.model || (targetP?.defaultModel ?? ""),
                          modelReasoningEffort:
                            prev.modelReasoningEffort || (targetP?.defaultReasoningEffort ?? ""),
                        };
                      });
                    }}
                    items={[
                      { value: "preset", label: t("codex.modePreset") },
                      { value: "custom", label: t("codex.modeCustom") },
                    ]}
                  />
                </FieldContent>
              </Field>

              {/* 预设模式: 厂商选择卡片 */}
              {profileDraft.mode === "preset" ? (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {workspace?.providers.map((p) => {
                      const isSelected = profileDraft.providerId === p.id;
                      return (
                        <Button
                          key={p.id}
                          type="button"
                          variant="ghost"
                          onClick={() => handleSelectPresetProvider(p)}
                          className={cn(
                            "flex h-auto flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all",
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border hover:border-muted-foreground/40 hover:bg-muted/40",
                          )}
                        >
                          <div className="flex w-full items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">{p.name}</span>
                            {isSelected ? <Check className="size-4 text-primary" /> : null}
                          </div>
                          <span className="text-xs text-muted-foreground truncate max-w-full font-normal">
                            {p.defaultModel ?? p.slug}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* 通用字段: 配置名称 */}
              <Field>
                <FieldLabel>{t("codex.field.profileName")}</FieldLabel>
                <FieldContent>
                  <Input
                    value={profileDraft.name}
                    onChange={(e) =>
                      setProfileDraft((prev) => (prev ? { ...prev, name: e.target.value } : null))
                    }
                    placeholder={t("codex.field.profileNamePlaceholder")}
                  />
                </FieldContent>
              </Field>

              {/* 预设模式表单项 */}
              {profileDraft.mode === "preset" && currentSelectedPresetProvider ? (
                <div className="flex flex-col gap-4 rounded-lg border border-border/80 bg-muted/20 p-4">
                  {/* 目标模型 */}
                  <Field>
                    <FieldLabel>{t("codex.field.model")}</FieldLabel>
                    <FieldContent className="flex flex-col gap-2">
                      {currentSelectedPresetProvider.models.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {currentSelectedPresetProvider.models.map((m) => {
                            const isCurrent = profileDraft.model === m.id;
                            return (
                              <Button
                                key={m.id}
                                type="button"
                                variant={isCurrent ? "secondary" : "outline"}
                                size="xs"
                                onClick={() =>
                                  setProfileDraft((prev) =>
                                    prev ? { ...prev, model: m.id } : null,
                                  )
                                }
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
                        value={profileDraft.model}
                        onChange={(e) =>
                          setProfileDraft((prev) =>
                            prev ? { ...prev, model: e.target.value } : null,
                          )
                        }
                        placeholder={t("codex.field.modelPlaceholder")}
                        className="font-mono text-xs"
                      />
                      <FieldDescription>{t("codex.field.modelHint")}</FieldDescription>
                    </FieldContent>
                  </Field>

                  {/* 推理档位 */}
                  <Field>
                    <FieldLabel>{t("codex.field.reasoningEffort")}</FieldLabel>
                    <FieldContent>
                      <Select
                        value={profileDraft.modelReasoningEffort || "none"}
                        onValueChange={(val) =>
                          setProfileDraft((prev) =>
                            prev
                              ? { ...prev, modelReasoningEffort: val === "none" ? "" : val }
                              : null,
                          )
                        }
                      >
                        <SelectTrigger>
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
                      <FieldDescription>{t("codex.field.reasoningEffortHint")}</FieldDescription>
                    </FieldContent>
                  </Field>

                  {/* API Key 认证 */}
                  <Field>
                    <FieldLabel>{t("codex.field.apiKey")}</FieldLabel>
                    <FieldContent>
                      {isChatGptLogin(profileDraft.providerId) ? (
                        <div className="rounded-md border border-border/60 bg-background/80 p-3 text-xs text-muted-foreground">
                          {t("codex.field.chatgptLoginHint")}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <SensitiveTextInput
                            id="codex-profile-api-key"
                            ariaLabel={t("codex.field.apiKey")}
                            showLabel={t("codex.field.showApiKey")}
                            hideLabel={t("codex.field.hideApiKey")}
                            value={profileDraft.apiKey}
                            onChange={(val) =>
                              setProfileDraft((prev) => (prev ? { ...prev, apiKey: val } : null))
                            }
                            placeholder={
                              profileDraft.id
                                ? t("codex.field.apiKeyKeepHint")
                                : t("codex.field.apiKeyPlaceholder")
                            }
                          />
                          <FieldDescription>{t("codex.field.apiKeyHint")}</FieldDescription>
                        </div>
                      )}
                    </FieldContent>
                  </Field>

                  {/* 供应商详情与文档 */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                    <span className="truncate">
                      Base URL:{" "}
                      <code className="font-mono text-foreground">
                        {currentSelectedPresetProvider.baseUrl}
                      </code>
                    </span>
                    {currentSelectedPresetProvider.docUrl ? (
                      <Button
                        type="button"
                        variant="link"
                        size="xs"
                        onClick={() =>
                          currentSelectedPresetProvider.docUrl &&
                          void openUrl(currentSelectedPresetProvider.docUrl)
                        }
                        className="h-auto p-0 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="size-3" />
                        <span>{t("codex.openDocs")}</span>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* 自定义模式表单项 */}
              {profileDraft.mode === "custom" ? (
                <div className="flex flex-col gap-4">
                  <Field>
                    <FieldLabel>{t("codex.field.customToml")}</FieldLabel>
                    <FieldContent>
                      <Textarea
                        value={profileDraft.customConfigToml}
                        onChange={(e) =>
                          setProfileDraft((prev) =>
                            prev ? { ...prev, customConfigToml: e.target.value } : null,
                          )
                        }
                        placeholder={t("codex.field.customTomlPlaceholder")}
                        className="font-mono text-xs min-h-[160px]"
                      />
                      <FieldDescription>{t("codex.field.customTomlHint")}</FieldDescription>
                    </FieldContent>
                  </Field>

                  <Field>
                    <FieldLabel>{t("codex.field.customJson")}</FieldLabel>
                    <FieldContent>
                      <Textarea
                        value={profileDraft.customModelsJson}
                        onChange={(e) =>
                          setProfileDraft((prev) =>
                            prev ? { ...prev, customModelsJson: e.target.value } : null,
                          )
                        }
                        placeholder={t("codex.field.customJsonPlaceholder")}
                        className="font-mono text-xs min-h-[120px]"
                      />
                      <FieldDescription>{t("codex.field.customJsonHint")}</FieldDescription>
                    </FieldContent>
                  </Field>
                </div>
              ) : null}

              {/* 实时配置预览 */}
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
                <span className="text-xs font-semibold text-foreground">
                  {t("codex.previewLiveTitle")}
                </span>
                <span className="text-xs text-muted-foreground">{t("codex.previewLiveHint")}</span>

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
              </div>
            </div>
          ) : null}

          <SheetFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={handleCloseEditor} disabled={saving}>
              {t("codex.cancel")}
            </Button>
            <Button onClick={handleSaveProfile} disabled={saving || !profileDraft?.name.trim()}>
              {saving ? t("codex.loading") : t("codex.save")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* 删除 Profile 确认 */}
      {deleteTarget !== null ? (
        <ConfirmAlertDialog
          title={t("codex.deleteProfileTitle")}
          message={
            deleteTarget
              ? `${t("codex.deleteProfileDescription")} (${deleteTarget.name})`
              : t("codex.deleteProfileDescription")
          }
          confirmText={t("codex.delete")}
          cancelText={t("codex.cancel")}
          onConfirm={handleDeleteProfile}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      ) : null}

      {/* Apply 预览确认弹窗 */}
      <Dialog
        open={applyTarget !== null}
        onOpenChange={(open) => {
          if (!open && !applying) {
            setApplyTarget(null);
            setApplyPreview(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("codex.applyPreviewTitle")}</DialogTitle>
            <DialogDescription>{t("codex.applyPreviewDescription")}</DialogDescription>
          </DialogHeader>

          {applyPreviewLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("codex.loading")}</p>
          ) : applyPreview ? (
            <div className="flex flex-col gap-4 py-2">
              {/* 关键信息摘要 */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 text-xs">
                <div>
                  <span className="text-muted-foreground">{t("codex.applyPreviewCurrent")}:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {applyPreview.currentModelProvider || t("codex.applyPreviewNone")}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("codex.applyPreviewNext")}:</span>{" "}
                  <span className="font-semibold text-primary">
                    {applyPreview.nextModelProvider}
                  </span>
                </div>
                {applyPreview.targetModel ? (
                  <div>
                    <span className="text-muted-foreground">
                      {t("codex.applyPreviewTargetModel")}:
                    </span>{" "}
                    <span className="font-mono text-foreground">{applyPreview.targetModel}</span>
                  </div>
                ) : null}
                {applyPreview.targetReasoningEffort ? (
                  <div>
                    <span className="text-muted-foreground">
                      {t("codex.applyPreviewReasoningEffort")}:
                    </span>{" "}
                    <span className="font-mono text-foreground">
                      {applyPreview.targetReasoningEffort}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* 完整文件预览选项卡 */}
              <Tabs defaultValue="toml" className="w-full">
                <TabsList className="h-8">
                  <TabsTrigger value="toml" className="text-xs">
                    {t("codex.previewTabToml")}
                  </TabsTrigger>
                  {applyPreview.modelsJsonPreview ? (
                    <TabsTrigger value="models" className="text-xs">
                      {t("codex.previewTabModels")}
                    </TabsTrigger>
                  ) : null}
                </TabsList>
                <TabsContent value="toml" className="mt-2">
                  <ConfigPreview content={applyPreview.configTomlPreview} />
                </TabsContent>
                {applyPreview.modelsJsonPreview ? (
                  <TabsContent value="models" className="mt-2">
                    <ConfigPreview content={applyPreview.modelsJsonPreview} />
                  </TabsContent>
                ) : null}
              </Tabs>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setApplyTarget(null);
                setApplyPreview(null);
              }}
              disabled={applying}
            >
              {t("codex.cancel")}
            </Button>
            <Button onClick={handleConfirmApply} disabled={applying || applyPreviewLoading}>
              {applying ? t("codex.loading") : t("codex.apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 未保存修改拦截对话框 */}
      {isUnsavedChangesAlertOpen ? (
        <UnsavedChangesAlertDialog
          canSave={Boolean(profileDraft?.name.trim())}
          onCancel={() => setIsUnsavedChangesAlertOpen(false)}
          onDiscard={() => {
            setIsUnsavedChangesAlertOpen(false);
            if (pendingExitActionRef.current) {
              const action = pendingExitActionRef.current;
              pendingExitActionRef.current = null;
              action();
            }
          }}
          onSaveAndExit={async () => {
            setIsUnsavedChangesAlertOpen(false);
            await handleSaveProfile();
            if (pendingExitActionRef.current) {
              const action = pendingExitActionRef.current;
              pendingExitActionRef.current = null;
              action();
            }
          }}
        />
      ) : null}
    </div>
  );
}
