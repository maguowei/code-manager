import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMemo, useState } from "react";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type { ConfigWorkspace, SettingsPreset } from "../types";
import ConfirmAlertDialog from "./ConfirmAlertDialog";
import {
  getEnabledPluginsSummary,
  presetDisplayName,
  presetNameById,
} from "./config-workspace-utils";
import PresetEditor from "./PresetEditor";
import { Sheet, SheetContent } from "./ui/sheet";
import "./PresetsPage.css";

interface PresetsPageProps {
  workspace: ConfigWorkspace;
  onWorkspaceChange: () => Promise<void>;
}

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
      <button type="button" className="preset-card-doc-link" onClick={() => openPresetDocs(docUrl)}>
        {t("presets.actions.openDocs")}
      </button>
    );
  }

  function renderModelSection(modelSuggestions: string[]) {
    return (
      <div className="preset-model-section">
        <span className="preset-model-label">{t("presets.editor.fields.modelSuggestions")}</span>
        <div className="preset-chip-list">
          {modelSuggestions.length > 0 ? (
            modelSuggestions.map((model) => (
              <span key={model} className="preset-chip">
                {model}
              </span>
            ))
          ) : (
            <span className="preset-chip preset-chip-empty">—</span>
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
      <div className={`list-section ${isDrawerOpen ? "compressed" : ""}`}>
        <div className="page-header">
          <h1 className="page-title">{t("presets.title")}</h1>
        </div>

        <div className="preset-section-block">
          <div className="preset-section-header">
            <div>
              <h2>{t("presets.builtin.title")}</h2>
              <p>{t("presets.builtin.description")}</p>
            </div>
          </div>

          <div className="preset-list">
            {workspace.builtinPresets.map((preset) => {
              const modelSuggestions = presetModelSuggestions(preset);

              return (
                <article key={preset.id} className="preset-card builtin">
                  <div className="preset-card-head">
                    <div className="preset-card-title-block">
                      <h3>{presetDisplayName(preset, language)}</h3>
                    </div>
                    <span className="preset-source-badge">{t("presets.builtin.badge")}</span>
                  </div>

                  <div className="preset-card-body">
                    <div className="preset-card-meta-row">
                      <div className="preset-card-id">{preset.id}</div>
                      {renderDocLink(preset.docUrl)}
                    </div>
                    {renderModelSection(modelSuggestions)}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="preset-section-block">
          <div className="preset-section-header">
            <div>
              <h2>{t("presets.custom.title")}</h2>
              <p>{t("presets.custom.description")}</p>
            </div>
            <button
              type="button"
              className="add-config-btn"
              onClick={() => {
                setEditingPreset(null);
                setIsDrawerOpen(true);
              }}
            >
              + <span>{t("presets.add")}</span>
            </button>
          </div>

          {workspace.customPresets.length === 0 ? (
            <div className="config-list-empty">
              <p className="empty-text">{t("presets.custom.empty")}</p>
              <p className="empty-hint">{t("presets.custom.emptyHint")}</p>
            </div>
          ) : (
            <div className="preset-list">
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
                  <article key={preset.id} className="preset-card">
                    <div className="preset-card-head">
                      <div className="preset-card-title-block">
                        <h3>{presetDisplayName(preset, language)}</h3>
                      </div>
                      <span className="preset-source-badge custom">
                        {t("presets.custom.badge")}
                      </span>
                    </div>

                    <div className="preset-card-body">
                      <div className="preset-card-meta-row">
                        <div className="preset-card-id">{preset.id}</div>
                        {renderDocLink(preset.docUrl)}
                      </div>

                      <div className="preset-card-summary">
                        <div className="preset-summary-block">
                          <span className="preset-summary-label">
                            {t("presets.editor.fields.basePreset")}
                          </span>
                          <div className="preset-summary-value">{basePresetName}</div>
                        </div>

                        {pluginsSummary.totalCount > 0 ? (
                          <div className="preset-summary-block">
                            <span className="preset-summary-label">
                              {t("common.pluginsEnabledSummaryLabel")}
                            </span>
                            <div className="preset-summary-value">
                              {pluginsSummary.enabledCount}/{pluginsSummary.totalCount}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {renderModelSection(modelSuggestions)}
                    </div>

                    <div className="preset-card-actions">
                      <button
                        type="button"
                        className="preset-card-action primary"
                        onClick={() => {
                          setEditingPreset(preset);
                          setIsDrawerOpen(true);
                        }}
                      >
                        {t("presets.actions.edit")}
                      </button>
                      <button
                        type="button"
                        className="preset-card-action danger"
                        onClick={() => setPendingDeleteId(preset.id)}
                      >
                        {t("presets.actions.delete")}
                      </button>
                    </div>
                  </article>
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
            className="left-[calc(var(--sidebar-width)+280px)] w-auto border-l-0 bg-[var(--bg-elevated)] p-0 shadow-[-4px_0_24px_rgb(0_0_0_/_0.2)] sm:max-w-none max-[1000px]:left-[var(--sidebar-width)] max-[700px]:left-[var(--sidebar-width-small)]"
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
