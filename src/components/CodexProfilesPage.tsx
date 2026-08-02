import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleCheck, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  CodexProviderInput,
  CodexWorkspace,
} from "../types";
import EmptyState from "./EmptyState";
import type { EditorExitGuard } from "./editor-exit-guard";
import PageHeader from "./PageHeader";
import ProfileNameBadge from "./ProfileNameBadge";
import SensitiveTextInput from "./profile-editor/SensitiveTextInput";
import { TYPOGRAPHY } from "./typography-classes";
import UnsavedChangesAlertDialog from "./UnsavedChangesAlertDialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";

// Codex wire_api 合法值(与后端 config.rs 的 CODEX_WIRE_API_RESPONSES / _CHAT 对齐)
const WIRE_API_RESPONSES = "responses";
const WIRE_API_CHAT = "chat";

// 卡片与 chip 样式对齐 ProvidersPage 的 preset-card / preset-chip 体系
const PROVIDER_CARD_CLASS =
  "preset-card flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-foreground shadow-panel";
const PROVIDER_CHIP_CLASS =
  "preset-chip inline-flex min-h-7 items-center rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground";

interface ProviderDraft {
  id: string | null;
  name: string;
  baseUrl: string;
  envKey: string;
  wireApi: string;
  docUrl: string;
}

interface ProfileDraft {
  id: string | null;
  name: string;
  providerId: string;
  apiKey: string;
}

function emptyProviderDraft(): ProviderDraft {
  return {
    id: null,
    name: "",
    baseUrl: "",
    envKey: "OPENAI_API_KEY",
    wireApi: WIRE_API_RESPONSES,
    docUrl: "",
  };
}

function providerDraftFrom(p: CodexProvider): ProviderDraft {
  return {
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    envKey: p.envKey,
    wireApi: p.wireApi,
    docUrl: p.docUrl ?? "",
  };
}

function emptyProfileDraft(defaultProviderId: string): ProfileDraft {
  return { id: null, name: "", providerId: defaultProviderId, apiKey: "" };
}

function profileDraftFrom(p: CodexProfile): ProfileDraft {
  // 编辑时 apiKey 留空:后端空 key 表示保留已有值;界面显示脱敏值作占位提示
  return { id: p.id, name: p.name, providerId: p.providerId, apiKey: "" };
}

interface CodexProfilesPageProps {
  onEditorExitGuardChange?: (guard: EditorExitGuard | null) => void;
}

export default function CodexProfilesPage({ onEditorExitGuardChange }: CodexProfilesPageProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [workspace, setWorkspace] = useState<CodexWorkspace | null>(null);
  const [loading, setLoading] = useState(true);

  // Provider 编辑器
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(emptyProviderDraft());
  const [providerSaving, setProviderSaving] = useState(false);
  // 打开时的 draft 快照,用于判断是否 dirty
  const providerDraftInitialRef = useRef("");

  // Profile 编辑器
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const profileDraftInitialRef = useRef("");

  // 脏编辑器的退出保护:跳转页面前弹 UnsavedChangesAlertDialog
  const [pendingExitAction, setPendingExitAction] = useState<(() => void) | null>(null);
  const [isSavingExit, setIsSavingExit] = useState(false);

  // 删除确认(共用,带类型与目标 id)
  const [pendingDelete, setPendingDelete] = useState<{
    kind: "provider" | "profile";
    id: string;
  } | null>(null);

  // Apply 中的 profile id(禁用按钮、防重复点击)
  const [applyingProfileId, setApplyingProfileId] = useState<string | null>(null);
  // Apply 预览确认(profileId + 预览数据;null 表示关闭)
  const [applyPreview, setApplyPreview] = useState<{
    profileId: string;
    preview: CodexApplyPreview;
  } | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
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
    void loadWorkspace();
  }, [loadWorkspace]);

  useTauriEvent("codex-workspace-changed", () => {
    void loadWorkspace();
  });

  const builtinIdSet = new Set(workspace?.builtinProviderIds ?? []);
  const providers = workspace?.providers ?? [];
  const profiles = workspace?.profiles ?? [];
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;
  const providerOf = (id: string) => providers.find((p) => p.id === id);

  // ===== Provider handlers =====
  const openCreateProvider = () => {
    const draft = emptyProviderDraft();
    providerDraftInitialRef.current = JSON.stringify(draft);
    setProviderDraft(draft);
    setProviderEditorOpen(true);
  };
  const openEditProvider = (p: CodexProvider) => {
    const draft = providerDraftFrom(p);
    providerDraftInitialRef.current = JSON.stringify(draft);
    setProviderDraft(draft);
    setProviderEditorOpen(true);
  };
  const closeProviderEditor = () => {
    setProviderEditorOpen(false);
    setPendingExitAction(null);
  };
  async function saveProviderDraft(): Promise<boolean> {
    const input: CodexProviderInput = {
      id: providerDraft.id,
      name: providerDraft.name.trim(),
      baseUrl: providerDraft.baseUrl.trim(),
      envKey: providerDraft.envKey.trim(),
      wireApi: providerDraft.wireApi,
      docUrl: providerDraft.docUrl.trim() ? providerDraft.docUrl.trim() : undefined,
    };
    setProviderSaving(true);
    try {
      await ipc.upsertCodexProvider(input);
      showToast(
        providerDraft.id ? t("codex.toast.providerUpdated") : t("codex.toast.providerCreated"),
      );
      closeProviderEditor();
      return true;
    } catch (error) {
      showOperationError(showToast, t("codex.toast.providerSaveFailed"), error);
      return false;
    } finally {
      setProviderSaving(false);
    }
  }
  const handleSaveProvider = () => {
    void saveProviderDraft();
  };

  // ===== Profile handlers =====
  const openCreateProfile = () => {
    const defaultProviderId = providers[0]?.id ?? "";
    const draft = emptyProfileDraft(defaultProviderId);
    profileDraftInitialRef.current = JSON.stringify(draft);
    setProfileDraft(draft);
    setProfileEditorOpen(true);
  };
  const openEditProfile = (p: CodexProfile) => {
    const draft = profileDraftFrom(p);
    profileDraftInitialRef.current = JSON.stringify(draft);
    setProfileDraft(draft);
    setProfileEditorOpen(true);
  };
  const closeProfileEditor = () => {
    setProfileEditorOpen(false);
    setProfileDraft(null);
    setPendingExitAction(null);
  };
  async function saveProfileDraft(): Promise<boolean> {
    if (!profileDraft) return false;
    const input: CodexProfileInput = {
      id: profileDraft.id,
      name: profileDraft.name.trim(),
      providerId: profileDraft.providerId,
      apiKey: profileDraft.apiKey,
    };
    setProfileSaving(true);
    try {
      await ipc.upsertCodexProfile(input);
      showToast(
        profileDraft.id ? t("codex.toast.profileUpdated") : t("codex.toast.profileCreated"),
      );
      closeProfileEditor();
      return true;
    } catch (error) {
      showOperationError(showToast, t("codex.toast.profileSaveFailed"), error);
      return false;
    } finally {
      setProfileSaving(false);
    }
  }
  const handleSaveProfile = () => {
    void saveProfileDraft();
  };

  // ===== Delete handler(共用) =====
  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    setPendingDelete(null);
    try {
      if (kind === "provider") {
        await ipc.deleteCodexProvider(id);
        showToast(t("codex.toast.providerDeleted"));
      } else {
        await ipc.deleteCodexProfile(id);
        showToast(t("codex.toast.profileDeleted"));
      }
    } catch (error) {
      showOperationError(
        showToast,
        kind === "provider"
          ? t("codex.toast.providerDeleteFailed")
          : t("codex.toast.profileDeleteFailed"),
        error,
      );
    }
  };

  const providerDraftValid =
    providerDraft.name.trim() !== "" &&
    providerDraft.baseUrl.trim() !== "" &&
    providerDraft.envKey.trim() !== "";
  const profileDraftValid =
    profileDraft !== null &&
    profileDraft.name.trim() !== "" &&
    profileDraft.providerId !== "" &&
    // 新建必须有 key;编辑可空(保留)
    (profileDraft.id !== null || profileDraft.apiKey.trim() !== "");

  // ===== 脏编辑器退出保护(frontend-ui.md:抽屉编辑器必须暴露 EditorExitGuard)=====
  const providerDirty =
    providerEditorOpen && JSON.stringify(providerDraft) !== providerDraftInitialRef.current;
  const profileDirty =
    profileEditorOpen &&
    profileDraft !== null &&
    JSON.stringify(profileDraft) !== profileDraftInitialRef.current;

  const requestEditorExit = useCallback(
    (action: () => void) => {
      if (providerDirty || profileDirty) {
        setPendingExitAction(() => action);
        return;
      }
      action();
    },
    [providerDirty, profileDirty],
  );

  useEffect(() => {
    if (!onEditorExitGuardChange) {
      return;
    }
    if (!providerEditorOpen && !profileEditorOpen) {
      onEditorExitGuardChange(null);
      return;
    }
    onEditorExitGuardChange({ requestExit: requestEditorExit });
    return () => onEditorExitGuardChange(null);
  }, [providerEditorOpen, profileEditorOpen, onEditorExitGuardChange, requestEditorExit]);

  async function saveAndRunPendingExit() {
    const action = pendingExitAction;
    if (!action) {
      return;
    }
    setIsSavingExit(true);
    try {
      const saved = providerDirty ? await saveProviderDraft() : await saveProfileDraft();
      if (saved) {
        setPendingExitAction(null);
        action();
      }
    } finally {
      setIsSavingExit(false);
    }
  }

  function discardAndRunPendingExit() {
    const action = pendingExitAction;
    setPendingExitAction(null);
    if (providerEditorOpen) {
      closeProviderEditor();
    }
    if (profileEditorOpen) {
      closeProfileEditor();
    }
    action?.();
  }
  const hasProvider = providers.length > 0;
  const activeProfileId = workspace?.bindings.codexProfileId ?? null;

  // 点击应用:先拉取预览(不写盘),弹确认面板;确认后才真正 apply
  const handleApplyProfile = async (profileId: string) => {
    setPreviewLoadingId(profileId);
    try {
      const preview = await ipc.previewCodexApply(profileId);
      setApplyPreview({ profileId, preview });
    } catch (error) {
      showOperationError(showToast, t("codex.toast.profileApplyFailed"), error);
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleConfirmApply = async () => {
    if (!applyPreview) return;
    const { profileId } = applyPreview;
    setApplyPreview(null);
    setApplyingProfileId(profileId);
    try {
      await ipc.applyCodexProfile(profileId);
      showToast(t("codex.toast.profileApplied"));
    } catch (error) {
      showOperationError(showToast, t("codex.toast.profileApplyFailed"), error);
    } finally {
      setApplyingProfileId(null);
    }
  };

  // Profile 摘要行的标签样式(对齐 ProfilesPage 的 summary row)
  const summaryLabelClass =
    "inline-flex shrink-0 items-center text-xs leading-none font-bold text-muted-foreground uppercase after:ml-0.5 after:font-bold after:text-border after:content-[':']";
  const summaryRowClass =
    "grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-1.5 text-sm text-muted-foreground";

  return (
    <div className="flex h-full min-h-0 flex-col bg-secondary">
      <PageHeader
        title={t("codex.pageTitle")}
        description={t("codex.pageDescription")}
        surface="secondary"
        variant="list"
      />

      <div className="scrollbar-none flex min-h-0 flex-col gap-6 overflow-y-auto p-4">
        {loading ? (
          <EmptyState title={t("codex.loading")} loading />
        ) : (
          <>
            {/* Provider 区 */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className={TYPOGRAPHY.sectionTitle}>{t("codex.providerSectionTitle")}</h2>
                <Button type="button" size="sm" onClick={openCreateProvider}>
                  <Plus className="size-4" />
                  {t("codex.addProvider")}
                </Button>
              </div>
              <p className={TYPOGRAPHY.auxiliary}>{t("codex.providerSectionHint")}</p>
              {providers.length === 0 ? (
                <EmptyState
                  title={t("codex.emptyProviderTitle")}
                  hint={t("codex.emptyProviderHint")}
                  icon={Plus}
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {providers.map((provider) => {
                    const builtin = builtinIdSet.has(provider.id);
                    const docUrl = provider.docUrl;
                    return (
                      <li key={provider.id}>
                        <Card className={PROVIDER_CARD_CLASS} data-slot="codex-provider-card">
                          <div className="preset-card-head flex items-start justify-between gap-3 max-[700px]:flex-wrap">
                            <div className="preset-card-title-block min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base leading-snug font-semibold">
                                  {provider.name}
                                </h3>
                                {builtin ? (
                                  <Badge
                                    variant="secondary"
                                    className="rounded-full px-2 py-0.5 text-xs font-semibold text-muted-foreground"
                                  >
                                    {t("codex.builtinBadge")}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {docUrl ? (
                                <Button
                                  type="button"
                                  variant="link"
                                  className="preset-card-doc-link h-auto min-h-7 gap-1.5 p-0 text-xs font-semibold text-primary hover:text-primary"
                                  onClick={() => void openUrl(docUrl)}
                                >
                                  <span>{t("codex.openDocs")}</span>
                                  <ExternalLink className="size-3.5" aria-hidden="true" />
                                </Button>
                              ) : null}
                              {builtin ? null : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditProvider(provider)}
                                    aria-label={t("codex.edit")}
                                  >
                                    <Pencil className="size-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setPendingDelete({ kind: "provider", id: provider.id })
                                    }
                                    aria-label={t("codex.delete")}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="preset-card-body flex flex-col gap-2.5">
                            <div className="preset-summary-block rounded-lg border border-border bg-muted/50 px-3 py-[11px]">
                              <span className="preset-summary-label inline-flex items-center text-xs leading-normal font-semibold text-muted-foreground">
                                {t("codex.field.baseUrl")}
                              </span>
                              <div className="preset-summary-value mt-[7px] flex flex-wrap items-center gap-2 font-mono text-xs leading-normal text-foreground [overflow-wrap:anywhere]">
                                {provider.baseUrl}
                              </div>
                            </div>
                            <div className="preset-chip-list flex flex-wrap items-center gap-2">
                              <span className={PROVIDER_CHIP_CLASS}>{provider.envKey}</span>
                              <span className={PROVIDER_CHIP_CLASS}>{provider.wireApi}</span>
                            </div>
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Profile 区 */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className={TYPOGRAPHY.sectionTitle}>{t("codex.profileSectionTitle")}</h2>
                <Button
                  type="button"
                  size="sm"
                  onClick={openCreateProfile}
                  disabled={!hasProvider}
                  title={hasProvider ? undefined : t("codex.profileCreateDisabledHint")}
                >
                  <Plus className="size-4" />
                  {t("codex.addProfile")}
                </Button>
              </div>
              <p className={TYPOGRAPHY.auxiliary}>{t("codex.profileSectionHint")}</p>
              {!hasProvider ? (
                <EmptyState
                  title={t("codex.profileNeedsProviderTitle")}
                  hint={t("codex.profileNeedsProviderHint")}
                  icon={Plus}
                />
              ) : profiles.length === 0 ? (
                <EmptyState
                  title={t("codex.emptyProfileTitle")}
                  hint={t("codex.emptyProfileHint")}
                  icon={Plus}
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {profiles.map((profile) => {
                    const isActive = profile.id === activeProfileId;
                    const applying = applyingProfileId === profile.id;
                    const previewing = previewLoadingId === profile.id;
                    const provider = providerOf(profile.providerId);
                    return (
                      <li key={profile.id}>
                        <Card
                          className="group relative flex flex-col gap-4 rounded-lg border border-border bg-card p-4 py-4 text-foreground shadow-panel transition-[border-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          data-slot="codex-profile-card"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <ProfileNameBadge
                                name={profile.name}
                                colorSeedScope={profile.providerId}
                                size="sm"
                              />
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate text-base font-semibold">{profile.name}</h3>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="secondary"
                                    className="rounded-full px-2 py-0.5 text-xs font-semibold text-primary"
                                  >
                                    {providerName(profile.providerId)}
                                  </Badge>
                                  {isActive ? (
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        "active rounded-md px-2.5 py-1.5 text-chart-2",
                                        TYPOGRAPHY.badge,
                                      )}
                                    >
                                      <CircleCheck className="size-3" />
                                      {t("codex.activeBadge")}
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void handleApplyProfile(profile.id)}
                                disabled={applying || previewing}
                                aria-label={t("codex.apply")}
                              >
                                {t("codex.apply")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditProfile(profile)}
                                aria-label={t("codex.edit")}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setPendingDelete({ kind: "profile", id: profile.id })
                                }
                                aria-label={t("codex.delete")}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            <div className={summaryRowClass}>
                              <span className={summaryLabelClass}>
                                {t("codex.summary.baseUrl")}
                              </span>
                              <span className="min-w-0 max-w-full truncate font-mono text-xs leading-none text-foreground [overflow-wrap:anywhere]">
                                {provider?.baseUrl ?? "—"}
                              </span>
                            </div>
                            <div className={summaryRowClass}>
                              <span className={summaryLabelClass}>
                                {t("codex.summary.wireApi")}
                              </span>
                              <span className="font-mono text-xs leading-none text-foreground">
                                {provider?.wireApi ?? "—"}
                              </span>
                            </div>
                            <div className={summaryRowClass}>
                              <span className={summaryLabelClass}>{t("codex.summary.apiKey")}</span>
                              {profile.apiKey ? (
                                <span className="min-w-0 max-w-full truncate font-mono text-xs leading-none text-foreground [overflow-wrap:anywhere]">
                                  {profile.apiKey}
                                </span>
                              ) : (
                                <span className="text-xs leading-none text-muted-foreground">
                                  {t("codex.summary.apiKeyUnset")}
                                </span>
                              )}
                            </div>
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {/* Provider 编辑器 */}
      <Sheet
        open={providerEditorOpen}
        onOpenChange={(open) => !open && requestEditorExit(closeProviderEditor)}
      >
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="shrink-0 border-b px-5 py-3.5 pr-12">
            <SheetTitle>
              {providerDraft.id ? t("codex.editProvider") : t("codex.createProvider")}
            </SheetTitle>
            <SheetDescription>{t("codex.editorDescription")}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-5 py-4">
            <ProfileNameBadge name={providerDraft.name} size="lg" fallbackChar="P" />
            <FieldGroup className="w-full">
              <Field>
                <FieldLabel>{t("codex.field.name")}</FieldLabel>
                <FieldContent>
                  <Input
                    value={providerDraft.name}
                    onChange={(e) => setProviderDraft({ ...providerDraft, name: e.target.value })}
                    placeholder={t("codex.field.namePlaceholder")}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>{t("codex.field.baseUrl")}</FieldLabel>
                <FieldDescription>{t("codex.field.baseUrlHint")}</FieldDescription>
                <FieldContent>
                  <Input
                    value={providerDraft.baseUrl}
                    onChange={(e) =>
                      setProviderDraft({ ...providerDraft, baseUrl: e.target.value })
                    }
                    placeholder="https://api.example.com/v1"
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>{t("codex.field.envKey")}</FieldLabel>
                <FieldDescription>{t("codex.field.envKeyHint")}</FieldDescription>
                <FieldContent>
                  <Input
                    value={providerDraft.envKey}
                    onChange={(e) => setProviderDraft({ ...providerDraft, envKey: e.target.value })}
                    placeholder="OPENAI_API_KEY"
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>{t("codex.field.wireApi")}</FieldLabel>
                <FieldDescription>{t("codex.field.wireApiHint")}</FieldDescription>
                <FieldContent>
                  <Select
                    value={providerDraft.wireApi}
                    onValueChange={(value) =>
                      setProviderDraft({ ...providerDraft, wireApi: value })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={WIRE_API_RESPONSES}>
                        {t("codex.field.wireApiResponses")}
                      </SelectItem>
                      <SelectItem value={WIRE_API_CHAT}>{t("codex.field.wireApiChat")}</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>{t("codex.field.docUrl")}</FieldLabel>
                <FieldContent>
                  <Input
                    value={providerDraft.docUrl}
                    onChange={(e) => setProviderDraft({ ...providerDraft, docUrl: e.target.value })}
                    placeholder="https://docs.example.com"
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </div>
          <SheetFooter className="shrink-0 border-t px-5 py-3.5">
            <div className="flex w-full flex-row justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => requestEditorExit(closeProviderEditor)}
                disabled={providerSaving}
              >
                {t("codex.cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveProvider()}
                disabled={!providerDraftValid || providerSaving}
              >
                {t("codex.save")}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Profile 编辑器 */}
      <Sheet
        open={profileEditorOpen}
        onOpenChange={(open) => !open && requestEditorExit(closeProfileEditor)}
      >
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="shrink-0 border-b px-5 py-3.5 pr-12">
            <SheetTitle>
              {profileDraft?.id ? t("codex.editProfile") : t("codex.createProfile")}
            </SheetTitle>
            <SheetDescription>{t("codex.profileEditorDescription")}</SheetDescription>
          </SheetHeader>
          {profileDraft ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-5 py-4">
                <ProfileNameBadge
                  name={profileDraft.name}
                  colorSeedScope={profileDraft.providerId}
                  size="lg"
                  fallbackChar="P"
                />
                <FieldGroup className="w-full">
                  <Field>
                    <FieldLabel>{t("codex.field.profileName")}</FieldLabel>
                    <FieldContent>
                      <Input
                        value={profileDraft.name}
                        onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })}
                        placeholder={t("codex.field.profileNamePlaceholder")}
                      />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel>{t("codex.field.provider")}</FieldLabel>
                    <FieldContent>
                      <Select
                        value={profileDraft.providerId}
                        onValueChange={(value) =>
                          setProfileDraft({ ...profileDraft, providerId: value })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("codex.field.providerPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {providers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {providerOf(profileDraft.providerId) ? (
                        <p
                          className="text-auxiliary mt-1.5 text-muted-foreground"
                          data-slot="codex-profile-provider-summary"
                        >
                          <span className="font-mono">
                            {providerOf(profileDraft.providerId)?.baseUrl}
                          </span>
                          {" · "}
                          <span className="font-mono">
                            {t("codex.providerMetaWireApi")}{" "}
                            {providerOf(profileDraft.providerId)?.wireApi}
                          </span>
                        </p>
                      ) : null}
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel>{t("codex.field.apiKey")}</FieldLabel>
                    <FieldDescription>{t("codex.field.apiKeyHint")}</FieldDescription>
                    <FieldContent>
                      <SensitiveTextInput
                        id="codex-profile-api-key"
                        value={profileDraft.apiKey}
                        placeholder={profileDraft.id ? t("codex.field.apiKeyKeepHint") : "sk-..."}
                        ariaLabel={t("codex.field.apiKey")}
                        showLabel={t("codex.field.showApiKey")}
                        hideLabel={t("codex.field.hideApiKey")}
                        onChange={(value) => setProfileDraft({ ...profileDraft, apiKey: value })}
                      />
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </div>
              <SheetFooter className="shrink-0 border-t px-5 py-3.5">
                <div className="flex w-full flex-row justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => requestEditorExit(closeProfileEditor)}
                    disabled={profileSaving}
                  >
                    {t("codex.cancel")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleSaveProfile()}
                    disabled={!profileDraftValid || profileSaving}
                  >
                    {t("codex.save")}
                  </Button>
                </div>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* 删除确认(共用) */}
      <Sheet open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="shrink-0 border-b px-5 py-3.5 pr-12">
            <SheetTitle>
              {pendingDelete?.kind === "provider"
                ? t("codex.deleteProviderTitle")
                : t("codex.deleteProfileTitle")}
            </SheetTitle>
            <SheetDescription>
              {pendingDelete?.kind === "provider"
                ? t("codex.deleteProviderDescription")
                : t("codex.deleteProfileDescription")}
            </SheetDescription>
          </SheetHeader>
          <SheetFooter className="shrink-0 border-t px-5 py-3.5">
            <div className="flex w-full flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
                {t("codex.cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleConfirmDelete()}
              >
                {t("codex.delete")}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Apply 预览确认(#37):展示 provider 切换摘要,确认后才写盘 */}
      <Sheet open={applyPreview !== null} onOpenChange={(open) => !open && setApplyPreview(null)}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="shrink-0 border-b px-5 py-3.5 pr-12">
            <SheetTitle>{t("codex.applyPreviewTitle")}</SheetTitle>
            <SheetDescription>{t("codex.applyPreviewDescription")}</SheetDescription>
          </SheetHeader>
          {applyPreview ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <FieldGroup className="w-full">
                <Field>
                  <FieldLabel>{t("codex.applyPreviewCurrent")}</FieldLabel>
                  <FieldContent>
                    <p className="text-body text-muted-foreground">
                      {applyPreview.preview.currentModelProvider ?? t("codex.applyPreviewNone")}
                    </p>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>{t("codex.applyPreviewNext")}</FieldLabel>
                  <FieldContent>
                    <p className="text-body font-medium">
                      {applyPreview.preview.providerName}
                      <span className="text-muted-foreground">
                        {" "}
                        ({applyPreview.preview.nextModelProvider})
                      </span>
                    </p>
                    <p className="text-auxiliary text-muted-foreground">
                      {applyPreview.preview.providerBaseUrl} · {t("codex.providerMetaWireApi")}{" "}
                      {applyPreview.preview.providerWireApi}
                    </p>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>{t("codex.applyPreviewAuth")}</FieldLabel>
                  <FieldContent>
                    <p className="text-body text-muted-foreground">
                      {applyPreview.preview.apiKeyWillSet
                        ? t("codex.applyPreviewAuthSet")
                        : t("codex.applyPreviewAuthUnset")}
                    </p>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </div>
          ) : null}
          <SheetFooter className="shrink-0 border-t px-5 py-3.5">
            <div className="flex w-full flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setApplyPreview(null)}>
                {t("codex.cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void handleConfirmApply()}
                disabled={applyingProfileId !== null}
              >
                {t("codex.apply")}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {pendingExitAction && (
        <UnsavedChangesAlertDialog
          canSave={providerDirty ? providerDraftValid : profileDraftValid}
          isSaving={isSavingExit}
          onCancel={() => setPendingExitAction(null)}
          onDiscard={discardAndRunPendingExit}
          onSaveAndExit={() => {
            void saveAndRunPendingExit();
          }}
        />
      )}
    </div>
  );
}
