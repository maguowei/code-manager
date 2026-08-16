import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import type { DragEvent } from "react";
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
import {
  EDITOR_CONTROL_SURFACE_CLASS,
  EditorDescription,
  EditorField,
  EditorFieldGrid,
  EditorSection,
} from "./editor-layout";
import LaunchCommandBlock from "./LaunchCommandBlock";
import {
  LIST_DETAIL_DRAWER_OFFSET_CLASS,
  LIST_PANEL_COMPRESSED_WIDTH_CLASS,
  LIST_PANEL_WIDTH_CLASS,
} from "./layout-size-classes";
import PageHeader from "./PageHeader";
import ProfileNameBadge from "./ProfileNameBadge";
import SensitiveTextInput from "./profile-editor/SensitiveTextInput";
import { TYPOGRAPHY } from "./typography-classes";
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
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SegmentedControl } from "./ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./ui/sheet";
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

function buildCodexLaunchCommand(profile: CodexProfile, provider?: CodexProvider): string {
  const model = profile.model || provider?.defaultModel;
  if (model) {
    return `codex -m ${model}`;
  }
  return "codex";
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

  // 快捷启动命令弹窗
  const [launchProfile, setLaunchProfile] = useState<CodexProfile | null>(null);

  // 拖拽排序状态
  const [dragState, setDragState] = useState<{
    draggingIndex: number | null;
    overIndex: number | null;
    overPosition: "above" | "below" | null;
  }>({
    draggingIndex: null,
    overIndex: null,
    overPosition: null,
  });
  const dragIndexRef = useRef<number | null>(null);
  const dragOverRef = useRef<{
    overIndex: number | null;
    overPosition: "above" | "below" | null;
  }>({
    overIndex: null,
    overPosition: null,
  });

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

  // 复制 Profile
  const handleDuplicate = async (profile: CodexProfile) => {
    try {
      const input: CodexProfileInput = {
        id: null,
        name: `${profile.name} (副本)`,
        providerId: profile.providerId,
        apiKey: profile.apiKey,
        model: profile.model,
        modelReasoningEffort: profile.modelReasoningEffort,
        customConfigToml: profile.customConfigToml,
        customModelsJson: profile.customModelsJson,
      };
      await ipc.upsertCodexProfile(input);
      showToast(t("codex.toast.profileDuplicated"), "success");
      await fetchWorkspace();
    } catch (error) {
      showOperationError(showToast, t("codex.toast.profileSaveFailed"), error);
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

  // 拖拽排序逻辑
  const handleDragStart = useCallback((_event: DragEvent<HTMLDivElement>, index: number) => {
    dragIndexRef.current = index;
    setDragState({
      draggingIndex: index,
      overIndex: null,
      overPosition: null,
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    dragOverRef.current = { overIndex: null, overPosition: null };
    setDragState({
      draggingIndex: null,
      overIndex: null,
      overPosition: null,
    });
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    if (dragIndexRef.current === null || dragIndexRef.current === index) {
      setDragState((prev) => ({ ...prev, overIndex: null, overPosition: null }));
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: "above" | "below" = event.clientY < midY ? "above" : "below";
    dragOverRef.current = { overIndex: index, overPosition: position };
    setDragState((prev) => ({ ...prev, overIndex: index, overPosition: position }));
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, dropIndex: number) => {
      event.preventDefault();
      const fromIndex = dragIndexRef.current;
      if (fromIndex === null || fromIndex === dropIndex || !workspace) {
        handleDragEnd();
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const insertAfter =
        dragOverRef.current.overIndex === dropIndex
          ? dragOverRef.current.overPosition === "below"
          : event.clientY >= rect.top + rect.height / 2;
      const reorderedProfiles = [...workspace.profiles];
      const [dragged] = reorderedProfiles.splice(fromIndex, 1);
      let targetIndex = dropIndex;
      if (fromIndex < dropIndex) {
        targetIndex -= 1;
      }
      if (insertAfter) {
        targetIndex += 1;
      }
      reorderedProfiles.splice(targetIndex, 0, dragged);
      setWorkspace({
        ...workspace,
        profiles: reorderedProfiles,
      });
      handleDragEnd();
    },
    [handleDragEnd, workspace],
  );

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
    <div className="flex h-full w-full">
      {/* 左侧 Master 列表栏 */}
      <div
        className={cn(
          "relative flex flex-col transition-[width] duration-300 ease-in-out",
          isEditorOpen ? LIST_PANEL_COMPRESSED_WIDTH_CLASS : LIST_PANEL_WIDTH_CLASS,
        )}
      >
        <PageHeader
          title={t("codex.pageTitle")}
          description={t("codex.pageDescription")}
          actions={null}
        />

        {/* 列表顶部大号主按钮 */}
        <Button
          type="button"
          className="mx-2 mt-4 mb-3 h-auto gap-2 rounded-lg p-3.5 text-base font-semibold"
          onClick={handleOpenCreate}
          disabled={loading}
        >
          <Plus data-icon="inline-start" className="size-4" aria-hidden="true" />
          <span>{t("codex.addProfile")}</span>
        </Button>

        {/* Profile 列表容器 */}
        <div
          className={cn(
            "profiles-grid flex flex-col gap-3 p-4",
            dragState.draggingIndex !== null &&
              "is-dragging [&_[data-slot=profile-card]:not(.dragging)]:opacity-70",
          )}
          onDragOver={(e) => e.preventDefault()}
        >
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
            workspace.profiles.map((profile, index) => {
              const isCustom = profile.providerId === "custom";
              const provider = workspace.providers.find((p) => p.id === profile.providerId);
              const isActive = activeProfileId === profile.id;
              const isEditing = isEditorOpen && profileDraft?.id === profile.id;
              const targetModel = profile.model || provider?.defaultModel;
              const targetEffort = profile.modelReasoningEffort || provider?.defaultReasoningEffort;

              return (
                <Card
                  key={profile.id}
                  className={cn(
                    "group relative flex flex-col gap-4 rounded-lg border border-border bg-card p-4 py-4 shadow-panel",
                    INTERACTIVE_CARD_CLASS,
                    isActive && "active border-primary ring-1 ring-primary/30",
                    isEditing && "editing border-chart-3 ring-1 ring-chart-3/30",
                    dragState.draggingIndex === index &&
                      "dragging scale-[0.985] opacity-50 shadow-md",
                    dragState.overIndex === index &&
                      dragState.overPosition === "above" &&
                      "drag-over-above before:absolute before:top-[-6px] before:right-[-12px] before:left-[-12px] before:h-1 before:rounded-full before:bg-chart-2 before:content-['']",
                    dragState.overIndex === index &&
                      dragState.overPosition === "below" &&
                      "drag-over-below after:absolute after:right-[-12px] after:bottom-[-6px] after:left-[-12px] after:h-1 after:rounded-full after:bg-chart-2 after:content-['']",
                  )}
                  role="button"
                  tabIndex={0}
                  aria-label={profile.name}
                  data-slot="profile-card"
                  data-drag-over={
                    dragState.overIndex === index ? dragState.overPosition : undefined
                  }
                  draggable
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
                  onDragStart={(event) => handleDragStart(event, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => handleDragOver(event, index)}
                  onDrop={(event) => handleDrop(event, index)}
                >
                  {/* 顶部标题与状态行 */}
                  <div className="flex items-start justify-between gap-3">
                    <ProfileNameBadge name={profile.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center">
                        <h3 className="truncate text-base font-semibold">{profile.name}</h3>
                      </div>
                      <div className="mt-1.5 flex items-center">
                        <Badge
                          variant="secondary"
                          className="rounded-full px-2 py-0.5 text-xs font-semibold text-primary"
                        >
                          {isCustom
                            ? t("codex.customBadge")
                            : (provider?.name ?? profile.providerId)}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {isEditing ? (
                        <Badge
                          className={cn(
                            "editing rounded-md bg-chart-3/10 px-2.5 py-1.5 text-chart-3",
                            TYPOGRAPHY.badge,
                          )}
                        >
                          {t("codex.badges.editing")}
                        </Badge>
                      ) : isActive ? (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "active rounded-md px-2.5 py-1.5 text-chart-2",
                            TYPOGRAPHY.badge,
                          )}
                        >
                          {t("codex.badges.inUse")}
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="font-semibold"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleTriggerApply(profile);
                          }}
                        >
                          {t("codex.apply")}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* 摘要信息行 */}
                  <div className="flex flex-col gap-2">
                    {targetModel ? (
                      <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-1.5 text-sm text-muted-foreground">
                        <span className="inline-flex shrink-0 items-center text-xs leading-none font-bold text-muted-foreground uppercase after:ml-0.5 after:font-bold after:text-border after:content-[':']">
                          MODEL
                        </span>
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="min-w-0 max-w-full font-mono font-medium text-foreground truncate">
                            {targetModel}
                          </span>
                          {targetEffort ? (
                            <span
                              className={cn(
                                "shrink-0 font-mono text-xs whitespace-nowrap",
                                targetEffort === "max"
                                  ? "text-destructive"
                                  : targetEffort === "high"
                                    ? "text-chart-4"
                                    : targetEffort === "medium"
                                      ? "text-primary"
                                      : "text-muted-foreground",
                              )}
                            >
                              {targetEffort}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-1.5 text-sm text-muted-foreground">
                      <span className="inline-flex shrink-0 items-center text-xs leading-none font-bold text-muted-foreground uppercase after:ml-0.5 after:font-bold after:text-border after:content-[':']">
                        AUTH
                      </span>
                      <span className="inline-flex min-w-0 items-center font-mono text-xs text-foreground truncate">
                        {isCustom
                          ? t("codex.summary.customSnippet")
                          : isChatGptLogin(profile.providerId)
                            ? t("codex.summary.chatgptLogin")
                            : profile.apiKey || t("codex.summary.apiKeyUnset")}
                      </span>
                    </div>

                    {provider?.docUrl ? (
                      <div className="flex items-center justify-between gap-2 pt-0.5 text-xs text-muted-foreground">
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

                  {/* 底部操作条 */}
                  <div
                    className={cn(CARD_ACTION_BAR_CLASS, "justify-end gap-1.5 pt-1")}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className={CARD_ACTION_BUTTON_CLASS}
                      aria-label={t("codex.actions.copyLaunchCommand")}
                      title={t("codex.actions.copyLaunchCommand")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLaunchProfile(profile);
                      }}
                    >
                      <SquareTerminal className="size-4" aria-hidden="true" />
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className={CARD_ACTION_BUTTON_CLASS}
                      aria-label={t("codex.actions.duplicate")}
                      title={t("codex.actions.duplicate")}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDuplicate(profile);
                      }}
                    >
                      <Copy className="size-4" aria-hidden="true" />
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className={CARD_ACTION_BUTTON_CLASS}
                      onClick={(e) => {
                        e.stopPropagation();
                        requestExitGuard(() => handleOpenEdit(profile));
                      }}
                      title={t("codex.edit")}
                    >
                      <Pencil className="size-4" />
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="border-border bg-muted text-foreground hover:border-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(profile);
                      }}
                      title={t("codex.delete")}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* 右侧 Detail 编辑抽屉 */}
      {isEditorOpen && (
        <Sheet open onOpenChange={(open) => !open && handleCloseEditor()}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className={cn(
              LIST_DETAIL_DRAWER_OFFSET_CLASS,
              "w-auto border-l-0 bg-secondary p-0 shadow-floating sm:max-w-none",
            )}
          >
            <SheetTitle className="sr-only">{t("codex.pageTitle")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("codex.profileEditorDescription")}
            </SheetDescription>

            <div
              data-slot="profile-editor-panel"
              className="flex h-full min-h-0 w-full min-w-[560px] flex-col overflow-hidden bg-secondary"
            >
              {/* 顶部工具条 */}
              <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-card/95 px-5 shadow-toolbar">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleCloseEditor}
                  aria-label={t("common.close")}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                </Button>
                <h2 className={cn("min-w-0 flex-1 truncate", TYPOGRAPHY.drawerTitle)}>
                  {profileDraft?.id ? t("codex.editProfile") : t("codex.createProfile")}
                </h2>
                <Button
                  type="button"
                  disabled={saving || !profileDraft?.name.trim()}
                  onClick={() => {
                    void handleSaveProfile();
                  }}
                >
                  {saving ? t("codex.loading") : t("codex.save")}
                </Button>
              </div>

              {/* 抽屉主体 */}
              {profileDraft ? (
                <div
                  data-slot="profile-editor-body"
                  className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto bg-secondary px-6 py-6 pb-6 [&>*]:shrink-0 [&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]"
                >
                  <ProfileNameBadge name={profileDraft.name} size="lg" fallbackChar="C" />

                  {/* 模式选择 */}
                  <EditorSection title={t("codex.selectPresetTitle")}>
                    <div className="flex flex-col gap-3">
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
                              workspace?.providers.find((p) => p.id === prev.providerId) ??
                              defaultP;
                            return {
                              ...prev,
                              mode: "preset",
                              providerId: targetP ? targetP.id : "codex-builtin:deepseek",
                              model: prev.model || (targetP?.defaultModel ?? ""),
                              modelReasoningEffort:
                                prev.modelReasoningEffort ||
                                (targetP?.defaultReasoningEffort ?? ""),
                            };
                          });
                        }}
                        items={[
                          { value: "preset", label: t("codex.modePreset") },
                          { value: "custom", label: t("codex.modeCustom") },
                        ]}
                      />

                      {profileDraft.mode === "preset" ? (
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
                                  <span className="text-sm font-semibold text-foreground">
                                    {p.name}
                                  </span>
                                  {isSelected ? <Check className="size-4 text-primary" /> : null}
                                </div>
                                <span className="text-xs text-muted-foreground truncate max-w-full font-normal">
                                  {p.defaultModel ?? p.slug}
                                </span>
                              </Button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </EditorSection>

                  {/* 基本信息 */}
                  <EditorSection title={t("profiles.editor.sections.basicInfo")}>
                    <EditorFieldGrid>
                      <EditorField>
                        <Label htmlFor="codex-profile-name">{t("codex.field.profileName")}</Label>
                        <Input
                          id="codex-profile-name"
                          className={EDITOR_CONTROL_SURFACE_CLASS}
                          value={profileDraft.name}
                          onChange={(e) =>
                            setProfileDraft((prev) =>
                              prev ? { ...prev, name: e.target.value } : null,
                            )
                          }
                          placeholder={t("codex.field.profileNamePlaceholder")}
                        />
                      </EditorField>
                    </EditorFieldGrid>
                  </EditorSection>

                  {/* 预设模式表单项 */}
                  {profileDraft.mode === "preset" && currentSelectedPresetProvider ? (
                    <>
                      {/* 模型与推理 */}
                      <EditorSection title={t("profiles.summary.modelTitle")}>
                        <EditorFieldGrid>
                          <EditorField>
                            <Label htmlFor="codex-target-model">{t("codex.field.model")}</Label>
                            <div className="flex flex-col gap-2">
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
                                id="codex-target-model"
                                className={cn("font-mono text-xs", EDITOR_CONTROL_SURFACE_CLASS)}
                                value={profileDraft.model}
                                onChange={(e) =>
                                  setProfileDraft((prev) =>
                                    prev ? { ...prev, model: e.target.value } : null,
                                  )
                                }
                                placeholder={t("codex.field.modelPlaceholder")}
                              />
                            </div>
                            <EditorDescription>{t("codex.field.modelHint")}</EditorDescription>
                          </EditorField>

                          <EditorField>
                            <Label htmlFor="codex-reasoning-effort">
                              {t("codex.field.reasoningEffort")}
                            </Label>
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
                              <SelectTrigger
                                id="codex-reasoning-effort"
                                className={EDITOR_CONTROL_SURFACE_CLASS}
                              >
                                <SelectValue
                                  placeholder={t("codex.field.reasoningEffortPlaceholder")}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">默认 (Default)</SelectItem>
                                <SelectItem value="low">low</SelectItem>
                                <SelectItem value="medium">medium</SelectItem>
                                <SelectItem value="high">high</SelectItem>
                                <SelectItem value="max">max</SelectItem>
                              </SelectContent>
                            </Select>
                            <EditorDescription>
                              {t("codex.field.reasoningEffortHint")}
                            </EditorDescription>
                          </EditorField>
                        </EditorFieldGrid>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-3 text-xs text-muted-foreground">
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
                      </EditorSection>

                      {/* 认证设置 */}
                      <EditorSection title={t("profiles.editor.sections.auth")}>
                        {isChatGptLogin(profileDraft.providerId) ? (
                          <div className="rounded-md border border-border/60 bg-background/80 p-3 text-xs text-muted-foreground">
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
                            <EditorDescription>{t("codex.field.apiKeyHint")}</EditorDescription>
                          </EditorField>
                        )}
                      </EditorSection>
                    </>
                  ) : null}

                  {/* 自定义模式表单项 */}
                  {profileDraft.mode === "custom" ? (
                    <>
                      <EditorSection title={t("codex.field.customToml")}>
                        <EditorField>
                          <Textarea
                            id="codex-custom-toml"
                            value={profileDraft.customConfigToml}
                            onChange={(e) =>
                              setProfileDraft((prev) =>
                                prev ? { ...prev, customConfigToml: e.target.value } : null,
                              )
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
                            value={profileDraft.customModelsJson}
                            onChange={(e) =>
                              setProfileDraft((prev) =>
                                prev ? { ...prev, customModelsJson: e.target.value } : null,
                              )
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
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* 快捷启动命令弹窗 */}
      {launchProfile && (
        <Dialog open onOpenChange={(open) => !open && setLaunchProfile(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("codex.launchCommandTitle")}</DialogTitle>
              <DialogDescription>
                {t("codex.launchCommandDescription").replace("{name}", launchProfile.name)}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <LaunchCommandBlock
                label={t("codex.launchCommandTitle")}
                command={buildCodexLaunchCommand(
                  launchProfile,
                  workspace?.providers.find((p) => p.id === launchProfile.providerId),
                )}
                hint="直接在终端中运行此命令即可使用当前配置启动 Codex CLI"
                hintTone="info"
                onCopy={(cmd) => {
                  navigator.clipboard.writeText(cmd);
                  showToast(t("common.copied"), "success");
                }}
                copyLabel={t("common.copy")}
                copiedLabel={t("common.copied")}
                revealLabel={t("common.showToken")}
                hideLabel={t("common.hideToken")}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLaunchProfile(null)}>
                {t("common.close")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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
