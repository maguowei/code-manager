import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useTauriEvent from "../hooks/useTauriEvent";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import { ipc } from "../ipc";
import { showOperationError } from "../lib/user-facing-error";
import type { CodexProvider, CodexProviderInput, CodexWorkspace } from "../types";
import EmptyState from "./EmptyState";
import PageHeader from "./PageHeader";
import { Button } from "./ui/button";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
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

interface EditorDraft {
  id: string | null;
  name: string;
  baseUrl: string;
  envKey: string;
  wireApi: WireApi;
  docUrl: string;
}

function emptyDraft(): EditorDraft {
  return {
    id: null,
    name: "",
    baseUrl: "",
    envKey: "OPENAI_API_KEY",
    wireApi: "responses",
    docUrl: "",
  };
}

function draftFromProvider(provider: CodexProvider): EditorDraft {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    envKey: provider.envKey,
    wireApi: (WIRE_API_OPTIONS as readonly string[]).includes(provider.wireApi)
      ? (provider.wireApi as WireApi)
      : "responses",
    docUrl: provider.docUrl ?? "",
  };
}

export default function CodexProfilesPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [workspace, setWorkspace] = useState<CodexWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<EditorDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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

  // 后端变更后重新拉取工作区
  useTauriEvent("codex-workspace-changed", () => {
    void loadWorkspace();
  });

  const builtinIdSet = new Set(workspace?.builtinProviderIds ?? []);
  const providers = workspace?.providers ?? [];
  const customProviders = providers.filter((p) => !builtinIdSet.has(p.id));

  const openCreateEditor = () => {
    setDraft(emptyDraft());
    setEditorOpen(true);
  };

  const openEditEditor = (provider: CodexProvider) => {
    setDraft(draftFromProvider(provider));
    setEditorOpen(true);
  };

  const handleSave = async () => {
    const input: CodexProviderInput = {
      id: draft.id,
      name: draft.name.trim(),
      baseUrl: draft.baseUrl.trim(),
      envKey: draft.envKey.trim(),
      wireApi: draft.wireApi,
      docUrl: draft.docUrl.trim() ? draft.docUrl.trim() : undefined,
    };
    setSaving(true);
    try {
      await ipc.upsertCodexProvider(input);
      showToast(draft.id ? t("codex.toast.providerUpdated") : t("codex.toast.providerCreated"));
      setEditorOpen(false);
    } catch (error) {
      showOperationError(showToast, t("codex.toast.providerSaveFailed"), error);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      await ipc.deleteCodexProvider(id);
      showToast(t("codex.toast.providerDeleted"));
    } catch (error) {
      showOperationError(showToast, t("codex.toast.providerDeleteFailed"), error);
    }
  };

  const draftValid =
    draft.name.trim() !== "" && draft.baseUrl.trim() !== "" && draft.envKey.trim() !== "";

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t("codex.pageTitle")}
        description={t("codex.pageDescription")}
        actions={
          <Button type="button" onClick={openCreateEditor}>
            <Plus className="size-4" />
            {t("codex.addProvider")}
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <EmptyState title={t("codex.loading")} loading />
        ) : providers.length === 0 ? (
          <EmptyState
            title={t("codex.emptyProviderTitle")}
            hint={t("codex.emptyProviderHint")}
            icon={Plus}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-auxiliary text-muted-foreground">{t("codex.providerSectionHint")}</p>
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
                        <span className="text-cardTitle truncate font-medium">{provider.name}</span>
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
                          onClick={() => openEditEditor(provider)}
                          aria-label={t("codex.edit")}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDeleteId(provider.id)}
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
            {customProviders.length === 0 ? (
              <p className="text-auxiliary text-muted-foreground">{t("codex.noCustomProvider")}</p>
            ) : null}
          </div>
        )}
      </div>

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent className="flex flex-col gap-4">
          <SheetHeader>
            <SheetTitle>
              {draft.id ? t("codex.editProvider") : t("codex.createProvider")}
            </SheetTitle>
            <SheetDescription>{t("codex.editorDescription")}</SheetDescription>
          </SheetHeader>
          <FieldGroup className="flex-1 overflow-auto">
            <Field>
              <FieldLabel>{t("codex.field.name")}</FieldLabel>
              <FieldContent>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder={t("codex.field.namePlaceholder")}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>{t("codex.field.baseUrl")}</FieldLabel>
              <FieldDescription>{t("codex.field.baseUrlHint")}</FieldDescription>
              <FieldContent>
                <Input
                  value={draft.baseUrl}
                  onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel>{t("codex.field.envKey")}</FieldLabel>
              <FieldDescription>{t("codex.field.envKeyHint")}</FieldDescription>
              <FieldContent>
                <Input
                  value={draft.envKey}
                  onChange={(e) => setDraft({ ...draft, envKey: e.target.value })}
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
                      variant={draft.wireApi === option ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDraft({ ...draft, wireApi: option })}
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
                  value={draft.docUrl}
                  onChange={(e) => setDraft({ ...draft, docUrl: e.target.value })}
                  placeholder="https://docs.example.com"
                />
              </FieldContent>
            </Field>
          </FieldGroup>
          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={saving}
            >
              {t("codex.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={!draftValid || saving}
            >
              {t("codex.save")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* 删除确认 */}
      <Sheet
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <SheetContent className="flex flex-col gap-4">
          <SheetHeader>
            <SheetTitle>{t("codex.deleteProviderTitle")}</SheetTitle>
            <SheetDescription>{t("codex.deleteProviderDescription")}</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDeleteId(null)}>
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
