import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type { ConfigWorkspace, SettingsPreset } from "../types";
import ConfirmAlertDialog from "./ConfirmAlertDialog";
import {
  getEnabledPluginsSummary,
  presetDisplayName,
  presetNameById,
} from "./config-workspace-utils";
import EmptyState from "./EmptyState";
import {
  LIST_DETAIL_DRAWER_OFFSET_CLASS,
  LIST_PANEL_COMPRESSED_WIDTH_CLASS,
  LIST_PANEL_WIDTH_CLASS,
} from "./layout-size-classes";
import PageHeader from "./PageHeader";
import PresetEditor from "./PresetEditor";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Sheet, SheetContent } from "./ui/sheet";

interface PresetsPageProps {
  workspace: ConfigWorkspace;
  onWorkspaceChange: () => Promise<void>;
}

const PRESET_CARD_CLASS =
  "preset-card flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-foreground shadow-panel transition-[transform,border-color,box-shadow,background-color] duration-200 hover:-translate-y-px hover:border-primary hover:bg-accent/40";

const PRESET_BUILTIN_CARD_CLASS = "builtin bg-muted/40";

const PRESET_CHIP_CLASS =
  "preset-chip inline-flex min-h-7 items-center rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground";

function PresetsPage({ workspace, onWorkspaceChange }: PresetsPageProps) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const [editingPreset, setEditingPreset] = useState<SettingsPreset | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const allPresets = useMemo(
    () => [...workspace.builtinPresets, ...workspace.customPresets],
    [workspace.builtinPresets, workspace.customPresets],
  );

  function presetPluginsSummary(preset: SettingsPreset) {
    return getEnabledPluginsSummary(preset.settingsPatch.enabledPlugins);
  }

  function presetModelSuggestions(preset: SettingsPreset) {
    return preset.modelSuggestions.map((model) => model.trim()).filter(Boolean);
  }

  function openPresetDocs(docUrl?: string) {
    if (!docUrl) {
      return;
    }
    void openUrl(docUrl);
  }

  function renderDocLink(docUrl?: string) {
    if (!docUrl) {
      return null;
    }

    return (
      <Button
        type="button"
        variant="link"
        className="preset-card-doc-link h-auto min-h-7 gap-1.5 p-0 text-xs font-semibold text-primary hover:text-primary"
        onClick={() => openPresetDocs(docUrl)}
      >
        <span>{t("presets.actions.openDocs")}</span>
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </Button>
    );
  }

  function renderModelSection(modelSuggestions: string[]) {
    return (
      <div className="preset-model-section flex flex-col gap-[7px]">
        <span className="preset-model-label inline-flex items-center text-xs leading-normal font-semibold text-muted-foreground">
          {t("presets.editor.fields.modelSuggestions")}
        </span>
        <div className="preset-chip-list flex flex-wrap items-center gap-2 text-sm leading-normal text-foreground">
          {modelSuggestions.length > 0 ? (
            modelSuggestions.map((model) => (
              <span key={model} className={PRESET_CHIP_CLASS}>
                {model}
              </span>
            ))
          ) : (
            <span
              className={cn(PRESET_CHIP_CLASS, "preset-chip-empty bg-muted text-muted-foreground")}
            >
              —
            </span>
          )}
        </div>
      </div>
    );
  }

  async function handleSave(data: {
    id?: string;
    name: string;
    localizedName?: {
      zh: string;
      en: string;
    };
    description: string;
    basePresetId?: string;
    docUrl?: string;
    models?: SettingsPreset["models"];
    modelSuggestions: string[];
    settingsPatch: Record<string, unknown>;
  }) {
    try {
      await invoke("upsert_preset", { data });
      await onWorkspaceChange();
      setIsDrawerOpen(false);
      setEditingPreset(null);
      showToast(t("presets.toast.saved"));
    } catch {
      showToast(t("presets.toast.saveError"), "error");
    }
  }

  async function handleDelete(id: string) {
    try {
      await invoke("delete_preset", { id });
      await onWorkspaceChange();
      showToast(t("presets.toast.deleted"));
    } catch {
      showToast(t("presets.toast.deleteError"), "error");
    }
  }

  return (
    <>
      <div
        className={cn(
          "list-section scrollbar-none flex shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-secondary transition-[width] duration-300 max-[1000px]:fixed max-[1000px]:inset-y-0 max-[1000px]:right-0 max-[1000px]:left-[60px] max-[1000px]:z-50 max-[1000px]:w-auto max-[700px]:left-[48px]",
          isDrawerOpen && "compressed",
          isDrawerOpen ? LIST_PANEL_COMPRESSED_WIDTH_CLASS : LIST_PANEL_WIDTH_CLASS,
        )}
      >
        <PageHeader title={t("presets.title")} surface="secondary" variant="list" />

        <div className="preset-section-block flex flex-col gap-4 border-b border-border p-4">
          <div className="preset-section-header flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">{t("presets.builtin.title")}</h2>
              <p className="mt-1.5 leading-normal text-muted-foreground">
                {t("presets.builtin.description")}
              </p>
            </div>
          </div>

          <div className="preset-list flex flex-col gap-3">
            {workspace.builtinPresets.map((preset) => {
              const modelSuggestions = presetModelSuggestions(preset);

              return (
                <Card
                  key={preset.id}
                  className={cn(PRESET_CARD_CLASS, PRESET_BUILTIN_CARD_CLASS)}
                  data-slot="preset-card"
                >
                  <div className="preset-card-head flex items-start justify-between gap-3 max-[700px]:flex-wrap">
                    <div className="preset-card-title-block min-w-0 flex-1">
                      <h3 className="text-base leading-snug font-semibold">
                        {presetDisplayName(preset, language)}
                      </h3>
                    </div>
                    <Badge
                      variant="outline"
                      className="preset-source-badge shrink-0 bg-background px-2.5 py-1 text-xs font-semibold text-primary max-[700px]:order-[-1]"
                    >
                      {t("presets.builtin.badge")}
                    </Badge>
                  </div>

                  <div className="preset-card-body flex flex-col gap-2.5">
                    <div className="preset-card-meta-row flex flex-wrap items-center gap-2.5">
                      <div className="preset-card-id inline-flex max-w-full items-center self-start rounded-full border border-border bg-muted px-[9px] py-1 font-mono text-xs leading-normal text-muted-foreground [overflow-wrap:anywhere]">
                        {preset.id}
                      </div>
                      {renderDocLink(preset.docUrl)}
                    </div>
                    {renderModelSection(modelSuggestions)}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="preset-section-block flex flex-col gap-4 border-b border-border p-4">
          <div className="preset-section-header flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">{t("presets.custom.title")}</h2>
              <p className="mt-1.5 leading-normal text-muted-foreground">
                {t("presets.custom.description")}
              </p>
            </div>
            <Button
              type="button"
              className="gap-1.5 font-semibold"
              onClick={() => {
                setEditingPreset(null);
                setIsDrawerOpen(true);
              }}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              <span>{t("presets.add")}</span>
            </Button>
          </div>

          {workspace.customPresets.length === 0 ? (
            <EmptyState title={t("presets.custom.empty")} hint={t("presets.custom.emptyHint")} />
          ) : (
            <div className="preset-list flex flex-col gap-3">
              {workspace.customPresets.map((preset) => {
                const basePresetName = presetNameById(
                  allPresets,
                  preset.basePresetId,
                  language,
                  t("profileEditor.preset.noPreset"),
                );
                const modelSuggestions = presetModelSuggestions(preset);
                const pluginsSummary = presetPluginsSummary(preset);

                return (
                  <Card key={preset.id} className={PRESET_CARD_CLASS} data-slot="preset-card">
                    <div className="preset-card-head flex items-start justify-between gap-3 max-[700px]:flex-wrap">
                      <div className="preset-card-title-block min-w-0 flex-1">
                        <h3 className="text-base leading-snug font-semibold">
                          {presetDisplayName(preset, language)}
                        </h3>
                      </div>
                      <Badge
                        variant="outline"
                        className="preset-source-badge custom shrink-0 bg-background px-2.5 py-1 text-xs font-semibold text-chart-2 max-[700px]:order-[-1]"
                      >
                        {t("presets.custom.badge")}
                      </Badge>
                    </div>

                    <div className="preset-card-body flex flex-col gap-2.5">
                      <div className="preset-card-meta-row flex flex-wrap items-center gap-2.5">
                        <div className="preset-card-id inline-flex max-w-full items-center self-start rounded-full border border-border bg-muted px-[9px] py-1 font-mono text-xs leading-normal text-muted-foreground [overflow-wrap:anywhere]">
                          {preset.id}
                        </div>
                        {renderDocLink(preset.docUrl)}
                      </div>

                      <div className="preset-card-summary flex flex-col gap-2.5">
                        <div className="preset-summary-block rounded-lg border border-border bg-muted/50 px-3 py-[11px]">
                          <span className="preset-summary-label inline-flex items-center text-xs leading-normal font-semibold text-muted-foreground">
                            {t("presets.editor.fields.basePreset")}
                          </span>
                          <div className="preset-summary-value mt-[7px] flex flex-wrap items-center gap-2 text-sm leading-normal text-foreground">
                            {basePresetName}
                          </div>
                        </div>

                        {pluginsSummary.totalCount > 0 ? (
                          <div className="preset-summary-block rounded-lg border border-border bg-muted/50 px-3 py-[11px]">
                            <span className="preset-summary-label inline-flex items-center text-xs leading-normal font-semibold text-muted-foreground">
                              {t("common.pluginsEnabledSummaryLabel")}
                            </span>
                            <div className="preset-summary-value mt-[7px] flex flex-wrap items-center gap-2 text-sm leading-normal text-foreground">
                              {pluginsSummary.enabledCount}/{pluginsSummary.totalCount}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {renderModelSection(modelSuggestions)}
                    </div>

                    <div className="preset-card-actions flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="preset-card-action font-semibold"
                        onClick={() => {
                          setEditingPreset(preset);
                          setIsDrawerOpen(true);
                        }}
                      >
                        {t("presets.actions.edit")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive-outline"
                        className="preset-card-action"
                        onClick={() => setPendingDeleteId(preset.id)}
                      >
                        {t("presets.actions.delete")}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isDrawerOpen && (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) {
              setIsDrawerOpen(false);
              setEditingPreset(null);
            }
          }}
        >
          <SheetContent
            side="right"
            showCloseButton={false}
            className={cn(
              LIST_DETAIL_DRAWER_OFFSET_CLASS,
              "w-auto border-l-0 bg-card p-0 shadow-floating sm:max-w-none",
            )}
          >
            <PresetEditor
              preset={editingPreset}
              presets={allPresets}
              onSave={handleSave}
              onClose={() => {
                setIsDrawerOpen(false);
                setEditingPreset(null);
              }}
            />
          </SheetContent>
        </Sheet>
      )}

      {pendingDeleteId && (
        <ConfirmAlertDialog
          title={t("presets.dialog.deleteTitle")}
          message={t("presets.dialog.deleteMessage")}
          confirmText={t("confirm.delete")}
          cancelText={t("confirm.cancel")}
          danger
          onConfirm={() => {
            void handleDelete(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </>
  );
}

export default PresetsPage;
