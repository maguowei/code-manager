import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMemo, useState } from "react";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type { ConfigWorkspace, SettingsPreset } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import { presetDisplayName, presetNameById } from "./config-workspace-utils";
import Drawer from "./Drawer";
import PresetEditor from "./PresetEditor";
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
            {workspace.builtinPresets.map((preset) => (
              <article key={preset.id} className="preset-card builtin">
                <div className="preset-card-head">
                  <div>
                    <h3>{presetDisplayName(preset, language)}</h3>
                    {preset.description && <p>{preset.description}</p>}
                  </div>
                  <span className="preset-source-badge">{t("presets.builtin.badge")}</span>
                </div>
                <div className="preset-card-meta">
                  <div>{preset.id}</div>
                  <div>{preset.modelSuggestions.join(", ") || "—"}</div>
                </div>
                <div className="preset-card-actions">
                  {preset.docUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        void openUrl(preset.docUrl as string);
                      }}
                    >
                      {t("presets.actions.openDocs")}
                    </button>
                  )}
                </div>
              </article>
            ))}
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
              {workspace.customPresets.map((preset) => (
                <article key={preset.id} className="preset-card">
                  <div className="preset-card-head">
                    <div>
                      <h3>{presetDisplayName(preset, language)}</h3>
                      {preset.description && <p>{preset.description}</p>}
                    </div>
                    <span className="preset-source-badge custom">{t("presets.custom.badge")}</span>
                  </div>

                  <div className="preset-card-meta">
                    <div>{preset.id}</div>
                    <div>{presetNameById(allPresets, preset.basePresetId, language)}</div>
                    <div>{preset.modelSuggestions.join(", ") || "—"}</div>
                  </div>

                  <div className="preset-card-actions">
                    {preset.docUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          void openUrl(preset.docUrl as string);
                        }}
                      >
                        {t("presets.actions.openDocs")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPreset(preset);
                        setIsDrawerOpen(true);
                      }}
                    >
                      {t("presets.actions.edit")}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => setPendingDeleteId(preset.id)}
                    >
                      {t("presets.actions.delete")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {isDrawerOpen && (
        <Drawer
          onClose={() => {
            setIsDrawerOpen(false);
            setEditingPreset(null);
          }}
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
        </Drawer>
      )}

      {pendingDeleteId && (
        <ConfirmDialog
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
