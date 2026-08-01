import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useTauriEvent from "../hooks/useTauriEvent";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import { ipc } from "../ipc";
import { showOperationError } from "../lib/user-facing-error";
import type {
  CodexProfile,
  CodexProfileInput,
  CodexProvider,
  CodexProviderInput,
  CodexWorkspace,
} from "../types";
import EmptyState from "./EmptyState";
import PageHeader from "./PageHeader";
import { Button } from "./ui/button";
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

// Codex wire_api 的合法取值(与后端校验一致)。
const WIRE_API_OPTIONS = ["responses", "chat"] as const;
type WireApi = (typeof WIRE_API_OPTIONS)[number];

interface ProviderDraft {
  id: string | null;
  name: string;
  baseUrl: string;
  envKey: string;
  wireApi: WireApi;
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
    wireApi: "responses",
    docUrl: "",
  };
}

function providerDraftFrom(p: CodexProvider): ProviderDraft {
  return {
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    envKey: p.envKey,
    wireApi: (WIRE_API_OPTIONS as readonly string[]).includes(p.wireApi)
      ? (p.wireApi as WireApi)
      : "responses",
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

export default function CodexProfilesPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [workspace, setWorkspace] = useState<CodexWorkspace | null>(null);
  const [loading, setLoading] = useState(true);

  // Provider 编辑器
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(emptyProviderDraft());
  const [providerSaving, setProviderSaving] = useState(false);

  // Profile 编辑器
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  // 删除确认(共用,带类型与目标 id)
  const [pendingDelete, setPendingDelete] = useState<{
    kind: "provider" | "profile";
    id: string;
  } | null>(null);

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

  // ===== Provider handlers =====
  const openCreateProvider = () => {
    setProviderDraft(emptyProviderDraft());
    setProviderEditorOpen(true);
  };
  const openEditProvider = (p: CodexProvider) => {
    setProviderDraft(providerDraftFrom(p));
    setProviderEditorOpen(true);
  };
  const handleSaveProvider = async () => {
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
      setProviderEditorOpen(false);
    } catch (error) {
      showOperationError(showToast, t("codex.toast.providerSaveFailed"), error);
    } finally {
      setProviderSaving(false);
    }
  };

  // ===== Profile handlers =====
  const openCreateProfile = () => {
    const defaultProviderId = providers[0]?.id ?? "";
    setProfileDraft(emptyProfileDraft(defaultProviderId));
    setProfileEditorOpen(true);
  };
  const openEditProfile = (p: CodexProfile) => {
    setProfileDraft(profileDraftFrom(p));
    setProfileEditorOpen(true);
  };
  const handleSaveProfile = async () => {
    if (!profileDraft) return;
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
      setProfileEditorOpen(false);
    } catch (error) {
      showOperationError(showToast, t("codex.toast.profileSaveFailed"), error);
    } finally {
      setProfileSaving(false);
    }
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
  const hasProvider = providers.length > 0;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("codex.pageTitle")} description={t("codex.pageDescription")} />

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <EmptyState title={t("codex.loading")} loading />
        ) : (
          <div className="flex flex-col gap-6">
            {/* Provider 区 */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sectionTitle font-medium">{t("codex.providerSectionTitle")}</h2>
                <Button type="button" size="sm" onClick={openCreateProvider}>
                  <Plus className="size-4" />
                  {t("codex.addProvider")}
                </Button>
              </div>
              <p className="text-auxiliary text-muted-foreground">
                {t("codex.providerSectionHint")}
              </p>
              {providers.length === 0 ? (
                <EmptyState
                  title={t("codex.emptyProviderTitle")}
                  hint={t("codex.emptyProviderHint")}
                  icon={Plus}
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {providers.map((provider) => {
                    const builtin = builtinIdSet.has(provider.id);
                    return (
                      <li
                        key={provider.id}
                        className="bg-card shadow-panel flex items-center gap-3 rounded-md border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-cardTitle truncate font-medium">
                              {provider.name}
                            </span>
                            {builtin ? (
                              <span className="bg-secondary text-auxiliary rounded px-1.5 py-0.5 text-muted-foreground">
                                {t("codex.builtinBadge")}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-auxiliary mt-0.5 truncate text-muted-foreground">
                            {provider.baseUrl}
                          </div>
                          <div className="text-auxiliary mt-0.5 text-muted-foreground">
                            {t("codex.providerMetaEnvKey")} {provider.envKey}
                            {" · "}
                            {t("codex.providerMetaWireApi")} {provider.wireApi}
                          </div>
                        </div>
                        {provider.docUrl ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void openUrl(provider.docUrl as string)}
                            aria-label={t("codex.openDocs")}
                          >
                            <ExternalLink className="size-4" />
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Profile 区(#35:增删改名 + key 脱敏;#36 将加 Apply) */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sectionTitle font-medium">{t("codex.profileSectionTitle")}</h2>
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
              <p className="text-auxiliary text-muted-foreground">
                {t("codex.profileSectionHint")}
              </p>
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
                <ul className="flex flex-col gap-2">
                  {profiles.map((profile) => (
                    <li
                      key={profile.id}
                      className="bg-card shadow-panel flex items-center gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-cardTitle truncate font-medium">{profile.name}</div>
                        <div className="text-auxiliary mt-0.5 truncate text-muted-foreground">
                          {providerName(profile.providerId)}
                        </div>
                        <div className="text-auxiliary mt-0.5 text-muted-foreground">
                          {t("codex.profileApiKey")} {profile.apiKey || "—"}
                        </div>
                      </div>
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
                        onClick={() => setPendingDelete({ kind: "profile", id: profile.id })}
                        aria-label={t("codex.delete")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Provider 编辑器 */}
      <Sheet open={providerEditorOpen} onOpenChange={setProviderEditorOpen}>
        <SheetContent className="flex flex-col gap-4">
          <SheetHeader>
            <SheetTitle>
              {providerDraft.id ? t("codex.editProvider") : t("codex.createProvider")}
            </SheetTitle>
            <SheetDescription>{t("codex.editorDescription")}</SheetDescription>
          </SheetHeader>
          <FieldGroup className="flex-1 overflow-auto">
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
                  onChange={(e) => setProviderDraft({ ...providerDraft, baseUrl: e.target.value })}
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
                <div className="flex gap-2">
                  {WIRE_API_OPTIONS.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant={providerDraft.wireApi === option ? "default" : "outline"}
                      size="sm"
                      onClick={() => setProviderDraft({ ...providerDraft, wireApi: option })}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
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
          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProviderEditorOpen(false)}
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
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Profile 编辑器 */}
      <Sheet open={profileEditorOpen} onOpenChange={setProfileEditorOpen}>
        <SheetContent className="flex flex-col gap-4">
          <SheetHeader>
            <SheetTitle>
              {profileDraft?.id ? t("codex.editProfile") : t("codex.createProfile")}
            </SheetTitle>
            <SheetDescription>{t("codex.profileEditorDescription")}</SheetDescription>
          </SheetHeader>
          {profileDraft ? (
            <>
              <FieldGroup className="flex-1 overflow-auto">
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
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>{t("codex.field.apiKey")}</FieldLabel>
                  <FieldDescription>{t("codex.field.apiKeyHint")}</FieldDescription>
                  <FieldContent>
                    <Input
                      type="password"
                      value={profileDraft.apiKey}
                      onChange={(e) => setProfileDraft({ ...profileDraft, apiKey: e.target.value })}
                      placeholder={profileDraft.id ? t("codex.field.apiKeyKeepHint") : "sk-..."}
                    />
                  </FieldContent>
                </Field>
              </FieldGroup>
              <SheetFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setProfileEditorOpen(false)}
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
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* 删除确认(共用) */}
      <Sheet open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <SheetContent className="flex flex-col gap-4">
          <SheetHeader>
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
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
              {t("codex.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleConfirmDelete()}>
              {t("codex.delete")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
