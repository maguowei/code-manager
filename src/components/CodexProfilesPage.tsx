import { openUrl } from "@tauri-apps/plugin-opener";
import { Copy, ExternalLink, Pencil, Plus, SquareTerminal, Trash2 } from "lucide-react";
import type { DragEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import useTauriEvent from "../hooks/useTauriEvent";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import { ipc } from "../ipc";
import { showOperationError } from "../lib/user-facing-error";
import { cn } from "../lib/utils";
import type { CodexApplyPreview, CodexProfile, CodexProfileInput, CodexWorkspace } from "../types";
import CodexProfileEditor, {
  type CodexProfileEditorHandle,
  type CodexProfileEditorSaveData,
} from "./CodexProfileEditor";
import CodexProvidersPage from "./CodexProvidersPage";
import ConfigPreview from "./ConfigPreview";
import ConfirmAlertDialog from "./ConfirmAlertDialog";
import {
  CARD_ACTION_BAR_CLASS,
  CARD_ACTION_BUTTON_CLASS,
  INTERACTIVE_CARD_CLASS,
} from "./card-interaction-classes";
import { providerDisplayName } from "./config-workspace-utils";
import EmptyState from "./EmptyState";
import type { EditorExitGuard } from "./editor-exit-guard";
import LaunchCommandBlock from "./LaunchCommandBlock";
import {
  LIST_DETAIL_DRAWER_OFFSET_CLASS,
  LIST_PANEL_COMPRESSED_WIDTH_CLASS,
  LIST_PANEL_WIDTH_CLASS,
} from "./layout-size-classes";
import PageHeader from "./PageHeader";
import ProfileNameBadge from "./ProfileNameBadge";
import ProfileProductSwitcher, { type ProfileProduct } from "./ProfileProductSwitcher";
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
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

const CODEX_BUILTIN_OPENAI_ID = "codex-builtin:openai";
const isChatGptLogin = (providerId: string) => providerId === CODEX_BUILTIN_OPENAI_ID;

interface CodexProfilesPageProps {
  onEditorExitGuardChange?: (guard: EditorExitGuard | null) => void;
  onProductChange?: (product: ProfileProduct) => void;
}

export default function CodexProfilesPage({
  onEditorExitGuardChange,
  onProductChange,
}: CodexProfilesPageProps = {}) {
  const { language, t } = useI18n();
  const { showToast } = useToast();

  const [workspace, setWorkspace] = useState<CodexWorkspace | null>(null);
  const [loading, setLoading] = useState(true);

  // 抽屉与正在编辑的 Profile
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<CodexProfile | null>(null);
  const profileEditorRef = useRef<CodexProfileEditorHandle | null>(null);

  // 内置供应商只读抽屉
  const [isBuiltinProvidersOpen, setIsBuiltinProvidersOpen] = useState(false);

  // 删除 Profile 确认对话框
  const [deleteTarget, setDeleteTarget] = useState<CodexProfile | null>(null);

  // Apply 预览对话框
  const [applyTarget, setApplyTarget] = useState<CodexProfile | null>(null);
  const [applyPreview, setApplyPreview] = useState<CodexApplyPreview | null>(null);
  const [applyPreviewLoading, setApplyPreviewLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  // 快捷启动命令弹窗
  const [launchProfile, setLaunchProfile] = useState<CodexProfile | null>(null);
  const [launchCommand, setLaunchCommand] = useState<string | null>(null);
  const [launchCommandLoading, setLaunchCommandLoading] = useState(false);

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

  const requestExitGuard = useCallback((onDiscard: () => void): boolean => {
    if (profileEditorRef.current?.isDirty()) {
      pendingExitActionRef.current = onDiscard;
      setIsUnsavedChangesAlertOpen(true);
      return false;
    }
    onDiscard();
    return true;
  }, []);

  useEffect(() => {
    if (!onEditorExitGuardChange) return;
    if (isDrawerOpen) {
      onEditorExitGuardChange({
        requestExit: (action) => {
          requestExitGuard(() => {
            setIsDrawerOpen(false);
            action();
          });
        },
      });
    } else {
      onEditorExitGuardChange(null);
    }
    return () => {
      onEditorExitGuardChange(null);
    };
  }, [isDrawerOpen, onEditorExitGuardChange, requestExitGuard]);

  // 打开创建 Profile 抽屉
  const handleOpenCreate = useCallback(() => {
    requestExitGuard(() => {
      setEditingProfile(null);
      setIsDrawerOpen(true);
    });
  }, [requestExitGuard]);

  // 打开编辑 Profile 抽屉
  const handleOpenEdit = useCallback(
    (profile: CodexProfile) => {
      requestExitGuard(() => {
        setEditingProfile(profile);
        setIsDrawerOpen(true);
      });
    },
    [requestExitGuard],
  );

  const handleCloseEditor = useCallback(() => {
    requestExitGuard(() => {
      setIsDrawerOpen(false);
      setEditingProfile(null);
    });
  }, [requestExitGuard]);

  // 保存 Profile 回调
  const handleSave = async (data: CodexProfileEditorSaveData): Promise<boolean> => {
    const isCustom = data.providerId === "custom";
    const input: CodexProfileInput = {
      id: data.id ?? null,
      name: data.name.trim(),
      description: data.description.trim() ? data.description.trim() : null,
      providerId: data.providerId,
      apiKey: data.apiKey,
      model: !isCustom && data.model.trim() ? data.model.trim() : null,
      modelReasoningEffort:
        !isCustom && data.modelReasoningEffort.trim() ? data.modelReasoningEffort.trim() : null,
      customConfigToml: isCustom && data.customConfigToml.trim() ? data.customConfigToml : null,
      customModelsJson: isCustom && data.customModelsJson.trim() ? data.customModelsJson : null,
    };

    try {
      await ipc.upsertCodexProfile(input);
      showToast(
        data.id ? t("codex.toast.profileUpdated") : t("codex.toast.profileCreated"),
        "success",
      );
      setIsDrawerOpen(false);
      setEditingProfile(null);
      await fetchWorkspace();
      return true;
    } catch (error) {
      showOperationError(showToast, t("codex.toast.profileSaveFailed"), error);
      return false;
    }
  };

  // 复制 Profile
  const handleDuplicate = async (profile: CodexProfile) => {
    try {
      await ipc.duplicateCodexProfile(profile.id, t("codex.duplicateSuffix"));
      showToast(t("codex.toast.profileDuplicated"), "success");
      await fetchWorkspace();
    } catch (error) {
      showOperationError(showToast, t("codex.toast.profileSaveFailed"), error);
    }
  };

  const handlePrepareLaunch = async (profile: CodexProfile) => {
    setLaunchProfile(profile);
    setLaunchCommand(null);
    setLaunchCommandLoading(true);
    try {
      const payload = await ipc.prepareCodexProfileLaunch(profile.id);
      setLaunchCommand(payload.command);
    } catch (error) {
      showOperationError(showToast, t("codex.toast.launchCommandFailed"), error);
      setLaunchProfile(null);
    } finally {
      setLaunchCommandLoading(false);
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
      void ipc
        .reorderCodexProfiles(reorderedProfiles.map((profile) => profile.id))
        .catch(async (error) => {
          showOperationError(showToast, t("codex.toast.profileReorderFailed"), error);
          await fetchWorkspace();
        });
    },
    [fetchWorkspace, handleDragEnd, showToast, t, workspace],
  );

  const activeProfileId = workspace?.bindings.codexProfileId;

  return (
    <div className="flex h-full w-full">
      {/* 左侧 Master 列表栏 */}
      <div
        className={cn(
          "list-section scrollbar-none flex shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-secondary transition-[width] duration-300 max-[1000px]:fixed max-[1000px]:inset-y-0 max-[1000px]:right-0 max-[1000px]:left-[60px] max-[1000px]:z-50 max-[1000px]:w-auto max-[700px]:left-[48px]",
          isDrawerOpen && "compressed",
          isDrawerOpen ? LIST_PANEL_COMPRESSED_WIDTH_CLASS : LIST_PANEL_WIDTH_CLASS,
        )}
        data-slot="codex-profiles-list-scroll"
      >
        <PageHeader
          title={t("profiles.title")}
          surface="secondary"
          variant="list"
          navigation={
            <ProfileProductSwitcher
              value="codex"
              onValueChange={(product) => onProductChange?.(product)}
            />
          }
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
              hint={t("codex.emptyProfileHint")}
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
              const isEditing = isDrawerOpen && editingProfile?.id === profile.id;
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
                    handleOpenEdit(profile);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleOpenEdit(profile);
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
                            : provider
                              ? providerDisplayName(provider, language)
                              : profile.providerId}
                        </Badge>
                      </div>
                      {profile.description ? (
                        <p className="mt-1.5 line-clamp-2 text-sm leading-normal text-muted-foreground">
                          {profile.description}
                        </p>
                      ) : null}
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
                          <span>{providerDisplayName(provider, language)}</span>
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
                        void handlePrepareLaunch(profile);
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
                        handleOpenEdit(profile);
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
      {isDrawerOpen && workspace && (
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

            <CodexProfileEditor
              key={editingProfile?.id ?? "new-codex-profile"}
              ref={profileEditorRef}
              profile={editingProfile}
              providers={workspace.providers}
              isActive={editingProfile?.id === activeProfileId}
              onSave={handleSave}
              onClose={handleCloseEditor}
              onViewBuiltinProviders={() => setIsBuiltinProvidersOpen(true)}
            />
          </SheetContent>
        </Sheet>
      )}

      {/* 内置供应商只读抽屉 */}
      {isBuiltinProvidersOpen && workspace && (
        <Sheet open onOpenChange={(open) => setIsBuiltinProvidersOpen(open)}>
          <SheetContent
            side="right"
            className={cn(
              LIST_DETAIL_DRAWER_OFFSET_CLASS,
              "w-auto border-l-0 bg-secondary p-0 shadow-floating sm:max-w-none",
            )}
          >
            <SheetTitle className="sr-only">{t("codex.builtinProvidersTitle")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("codex.builtinProvidersDescription")}
            </SheetDescription>
            <CodexProvidersPage
              providers={workspace.providers}
              onClose={() => setIsBuiltinProvidersOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}

      {/* 快捷启动命令弹窗 */}
      {launchProfile && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setLaunchProfile(null);
              setLaunchCommand(null);
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("codex.launchCommandTitle")}</DialogTitle>
              <DialogDescription>
                {t("codex.launchCommandDescription").replace("{name}", launchProfile.name)}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              {launchCommandLoading || !launchCommand ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t("codex.launchCommandLoading")}
                </p>
              ) : (
                <LaunchCommandBlock
                  label={t("codex.launchCommandTitle")}
                  command={launchCommand}
                  hint={t("codex.launchCommandHint")}
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
              )}
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
                    {applyPreview.providerId === "custom"
                      ? t("codex.customBadge")
                      : (() => {
                          const provider = workspace?.providers.find(
                            (item) => item.id === applyPreview.providerId,
                          );
                          return provider
                            ? providerDisplayName(provider, language)
                            : applyPreview.nextModelProvider;
                        })()}
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

              {applyPreview.warnings.map((warning) => (
                <div
                  key={warning}
                  className="rounded-md border border-chart-4/30 bg-chart-4/10 px-3 py-2 text-xs text-foreground"
                >
                  {warning === "legacyApiKeyMayOverrideChatGptLogin"
                    ? t("codex.warning.legacyApiKeyMayOverrideChatGptLogin")
                    : warning}
                </div>
              ))}

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
          canSave={profileEditorRef.current?.canSave() ?? false}
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
            if (profileEditorRef.current) {
              const saved = await profileEditorRef.current.save();
              if (saved && pendingExitActionRef.current) {
                const action = pendingExitActionRef.current;
                pendingExitActionRef.current = null;
                action();
              }
            }
          }}
        />
      ) : null}
    </div>
  );
}
