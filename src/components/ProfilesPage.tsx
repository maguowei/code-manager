import { invoke } from "@tauri-apps/api/core";
import { type DragEvent, useCallback, useMemo, useRef, useState } from "react";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type { ConfigProfile, ConfigWorkspace } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import { cloneSettings, isPlainObject, presetNameById } from "./config-workspace-utils";
import Drawer from "./Drawer";
import { TrashIcon } from "./Icons";
import ProfileEditor from "./ProfileEditor";
import "./ProfilesPage.css";

interface ProfilesPageProps {
  workspace: ConfigWorkspace;
  onWorkspaceChange: () => Promise<void>;
}

function ProfilesPage({ workspace, onWorkspaceChange }: ProfilesPageProps) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const [editingProfile, setEditingProfile] = useState<ConfigProfile | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const dragOverRef = useRef<{
    overIndex: number | null;
    overPosition: "above" | "below" | null;
  }>({ overIndex: null, overPosition: null });
  const [dragState, setDragState] = useState<{
    draggingIndex: number | null;
    overIndex: number | null;
    overPosition: "above" | "below" | null;
  }>({ draggingIndex: null, overIndex: null, overPosition: null });

  const allPresets = useMemo(
    () => [...workspace.builtinPresets, ...workspace.customPresets],
    [workspace.builtinPresets, workspace.customPresets],
  );
  const profiles = useMemo(() => workspace.profiles, [workspace.profiles]);

  function scopeLabel(scope: ConfigProfile["target"]["scope"]) {
    switch (scope) {
      case "user":
        return t("profiles.scope.user");
      case "project":
        return t("profiles.scope.project");
      case "local":
        return t("profiles.scope.local");
      default:
        return scope;
    }
  }

  function profileTargetText(profile: ConfigProfile) {
    if (profile.target.scope === "user") {
      return scopeLabel("user");
    }
    return `${scopeLabel(profile.target.scope)} · ${profile.target.projectPath ?? t("profiles.target.unknown")}`;
  }

  function bindingSummaryText(profile: ConfigProfile) {
    if (workspace.bindings.userProfileId === profile.id) {
      return t("profiles.binding.user");
    }

    const projectBinding = workspace.bindings.projectBindings.find(
      (binding) => binding.profileId === profile.id,
    );
    if (projectBinding) {
      return `${t("profiles.binding.project")} ${projectBinding.projectPath}`;
    }

    const localBinding = workspace.bindings.localBindings.find(
      (binding) => binding.profileId === profile.id,
    );
    if (localBinding) {
      return `${t("profiles.binding.local")} ${localBinding.projectPath}`;
    }

    return null;
  }

  function closeDrawer() {
    setIsDrawerOpen(false);
    setEditingProfile(null);
  }

  const handleDragStart = useCallback((event: DragEvent<HTMLDivElement>, index: number) => {
    dragIndexRef.current = index;
    dragOverRef.current = { overIndex: null, overPosition: null };
    setDragState({ draggingIndex: index, overIndex: null, overPosition: null });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    dragOverRef.current = { overIndex: null, overPosition: null };
    setDragState({ draggingIndex: null, overIndex: null, overPosition: null });
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === index) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? "above" : "below";
    dragOverRef.current = { overIndex: index, overPosition: position };
    setDragState((current) => {
      if (current.overIndex === index && current.overPosition === position) {
        return current;
      }
      return { ...current, overIndex: index, overPosition: position };
    });
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>, index: number) => {
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) {
      return;
    }
    dragOverRef.current = { overIndex: null, overPosition: null };
    setDragState((current) => {
      if (current.overIndex !== index) {
        return current;
      }
      return { ...current, overIndex: null, overPosition: null };
    });
  }, []);

  function profilePrimaryModel(profile: ConfigProfile) {
    const env = isPlainObject(profile.settings.env) ? profile.settings.env : {};
    if (typeof env.ANTHROPIC_MODEL === "string" && env.ANTHROPIC_MODEL.trim()) {
      return env.ANTHROPIC_MODEL.trim();
    }
    if (typeof profile.settings.model === "string" && profile.settings.model.trim()) {
      return profile.settings.model.trim();
    }
    return "";
  }

  function profileEffortLevel(profile: ConfigProfile) {
    const env = isPlainObject(profile.settings.env) ? profile.settings.env : {};
    if (typeof env.CLAUDE_CODE_EFFORT_LEVEL === "string" && env.CLAUDE_CODE_EFFORT_LEVEL.trim()) {
      return env.CLAUDE_CODE_EFFORT_LEVEL.trim();
    }
    if (typeof profile.settings.effortLevel === "string" && profile.settings.effortLevel.trim()) {
      return profile.settings.effortLevel.trim();
    }
    return "";
  }

  function profilePluginCount(profile: ConfigProfile) {
    const enabledPlugins = isPlainObject(profile.settings.enabledPlugins)
      ? profile.settings.enabledPlugins
      : {};
    return Object.keys(enabledPlugins).length;
  }

  function shellEscape(value: string) {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\$/g, "\\$")
      .replace(/`/g, "\\`");
  }

  function buildEnvExportText(resolvedSettings: Record<string, unknown>) {
    const envObject = isPlainObject(resolvedSettings.env) ? resolvedSettings.env : {};
    const mergedEntries = new Map<string, string>();

    for (const [key, value] of Object.entries(envObject)) {
      if (typeof value === "string" && value.trim()) {
        mergedEntries.set(key, value);
      }
    }

    if (
      !mergedEntries.has("ANTHROPIC_MODEL") &&
      typeof resolvedSettings.model === "string" &&
      resolvedSettings.model.trim()
    ) {
      mergedEntries.set("ANTHROPIC_MODEL", resolvedSettings.model.trim());
    }

    if (
      !mergedEntries.has("CLAUDE_CODE_EFFORT_LEVEL") &&
      typeof resolvedSettings.effortLevel === "string" &&
      resolvedSettings.effortLevel.trim()
    ) {
      mergedEntries.set("CLAUDE_CODE_EFFORT_LEVEL", resolvedSettings.effortLevel.trim());
    }

    return Array.from(mergedEntries.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `export ${key}="${shellEscape(value)}"`)
      .join("\n");
  }

  async function handleSave(data: {
    id?: string;
    name: string;
    description: string;
    target: { scope: "user" | "project" | "local"; projectPath?: string };
    presetId?: string;
    settings: Record<string, unknown>;
  }) {
    try {
      await invoke("upsert_profile", { data });
      await onWorkspaceChange();
      closeDrawer();
      showToast(t("profiles.toast.saved"));
    } catch {
      showToast(t("profiles.toast.saveError"), "error");
    }
  }

  async function handleApply(id: string) {
    try {
      await invoke("apply_profile", { id });
      await onWorkspaceChange();
      showToast(t("profiles.toast.applied"));
    } catch {
      showToast(t("profiles.toast.applyError"), "error");
    }
  }

  async function handleDelete(id: string) {
    try {
      await invoke("delete_profile", { id });
      await onWorkspaceChange();
      showToast(t("profiles.toast.deleted"));
    } catch {
      showToast(t("profiles.toast.deleteError"), "error");
    }
  }

  async function handleCopyEnv(profile: ConfigProfile) {
    try {
      const preview = await invoke<string>("preview_profile", {
        data: {
          id: profile.id,
          name: profile.name,
          description: profile.description,
          target: profile.target,
          presetId: profile.presetId,
          settings: profile.settings,
        },
      });
      const resolvedSettings = JSON.parse(preview) as Record<string, unknown>;
      const exportText = buildEnvExportText(resolvedSettings);
      if (!exportText) {
        throw new Error("no env to copy");
      }
      await navigator.clipboard.writeText(exportText);
      showToast(t("profiles.toast.envCopied"));
    } catch {
      showToast(t("profiles.toast.envCopyError"), "error");
    }
  }

  async function handleDuplicate(profile: ConfigProfile) {
    try {
      await invoke("upsert_profile", {
        data: {
          id: undefined,
          name: `${profile.name}${t("profiles.duplicateSuffix")}`,
          description: profile.description,
          target: { ...profile.target },
          presetId: profile.presetId,
          settings: cloneSettings(profile.settings),
        },
      });
      await onWorkspaceChange();
      showToast(t("profiles.toast.duplicated"));
    } catch {
      showToast(t("profiles.toast.duplicateError"), "error");
    }
  }

  const handleReorder = useCallback(
    async (ids: string[]) => {
      try {
        await invoke("reorder_profiles", { ids });
        await onWorkspaceChange();
      } catch {
        showToast(t("profiles.toast.reorderError"), "error");
      }
    },
    [onWorkspaceChange, showToast, t],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, dropIndex: number) => {
      event.preventDefault();
      const fromIndex = dragIndexRef.current;
      if (fromIndex === null || fromIndex === dropIndex) {
        handleDragEnd();
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const insertAfter =
        dragOverRef.current.overIndex === dropIndex
          ? dragOverRef.current.overPosition === "below"
          : event.clientY >= rect.top + rect.height / 2;
      const reorderedProfiles = [...profiles];
      const [dragged] = reorderedProfiles.splice(fromIndex, 1);
      let targetIndex = dropIndex;
      if (fromIndex < dropIndex) {
        targetIndex -= 1;
      }
      if (insertAfter) {
        targetIndex += 1;
      }
      reorderedProfiles.splice(targetIndex, 0, dragged);
      void handleReorder(reorderedProfiles.map((profile) => profile.id));
      handleDragEnd();
    },
    [handleDragEnd, handleReorder, profiles],
  );

  return (
    <>
      <div className={`list-section ${isDrawerOpen ? "compressed" : ""}`}>
        <div className="page-header">
          <h1 className="page-title">{t("profiles.title")}</h1>
        </div>
        <button
          type="button"
          className="add-config-btn"
          onClick={() => {
            setEditingProfile(null);
            setIsDrawerOpen(true);
          }}
        >
          + <span>{t("profiles.add")}</span>
        </button>

        {profiles.length === 0 ? (
          <div className="config-list-empty">
            <p className="empty-text">{t("profiles.empty")}</p>
            <p className="empty-hint">{t("profiles.emptyHint")}</p>
          </div>
        ) : (
          <div
            className={`profiles-grid${dragState.draggingIndex !== null ? " is-dragging" : ""}`}
            onDragOver={(event) => event.preventDefault()}
          >
            {profiles.map((profile, index) => (
              <div
                key={profile.id}
                className={`profile-card ${bindingSummaryText(profile) ? "active" : ""} ${
                  isDrawerOpen && editingProfile?.id === profile.id ? "editing" : ""
                } ${dragState.draggingIndex === index ? "dragging" : ""} ${
                  dragState.overIndex === index ? `drag-over-${dragState.overPosition}` : ""
                }`}
                role="button"
                tabIndex={0}
                draggable
                onClick={() => {
                  setEditingProfile(profile);
                  setIsDrawerOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setEditingProfile(profile);
                    setIsDrawerOpen(true);
                  }
                }}
                onDragStart={(event) => handleDragStart(event, index)}
                onDragEnd={handleDragEnd}
                onDragOver={(event) => handleDragOver(event, index)}
                onDragLeave={(event) => handleDragLeave(event, index)}
                onDrop={(event) => handleDrop(event, index)}
              >
                <div className="profile-card-head">
                  <div className="profile-card-title-block">
                    <div className="profile-card-title-row">
                      <h3>{profile.name}</h3>
                      <span className="profile-preset-badge">
                        {presetNameById(allPresets, profile.presetId, language)}
                      </span>
                    </div>
                    {profile.description && (
                      <p className="profile-card-description">{profile.description}</p>
                    )}
                  </div>

                  <div className="profile-card-head-actions">
                    <span className={`profile-scope-badge scope-${profile.target.scope}`}>
                      {scopeLabel(profile.target.scope)}
                    </span>
                    {isDrawerOpen && editingProfile?.id === profile.id ? (
                      <span className="profile-status-badge editing">
                        {t("profiles.badges.editing")}
                      </span>
                    ) : bindingSummaryText(profile) ? (
                      <span className="profile-status-badge active">
                        {t("profiles.badges.inUse")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="profile-card-apply-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleApply(profile.id);
                        }}
                      >
                        {t("profiles.actions.apply")}
                      </button>
                    )}
                  </div>
                </div>

                <div className="profile-card-meta">
                  <div>{profileTargetText(profile)}</div>
                  {bindingSummaryText(profile) && <div>{bindingSummaryText(profile)}</div>}
                </div>

                {(profilePrimaryModel(profile) || profilePluginCount(profile) > 0) && (
                  <div className="profile-card-summary">
                    {profilePrimaryModel(profile) && (
                      <div className="profile-summary-row">
                        <svg
                          className="profile-summary-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <div className="profile-summary-main">
                          <span>{profilePrimaryModel(profile)}</span>
                          {profileEffortLevel(profile) && (
                            <span className="profile-summary-effort">
                              {profileEffortLevel(profile)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {profilePluginCount(profile) > 0 && (
                      <div className="profile-summary-row">
                        <svg
                          className="profile-summary-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <line x1="9" y1="9" x2="15" y2="9" />
                          <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                        <span>
                          {profilePluginCount(profile)} {t("profiles.meta.plugins")}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="profile-card-actions">
                  <button
                    type="button"
                    className="profile-card-action icon-only"
                    aria-label={t("profiles.actions.copyEnv")}
                    title={t("profiles.actions.copyEnv")}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleCopyEnv(profile);
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="4 17 10 11 4 5" />
                      <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="profile-card-action icon-only"
                    aria-label={t("profiles.actions.duplicate")}
                    title={t("profiles.actions.duplicate")}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDuplicate(profile);
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="profile-card-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingProfile(profile);
                      setIsDrawerOpen(true);
                    }}
                  >
                    {t("profiles.actions.edit")}
                  </button>
                  <button
                    type="button"
                    className="profile-card-action danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPendingDeleteId(profile.id);
                    }}
                  >
                    <TrashIcon />
                    <span>{t("profiles.actions.delete")}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isDrawerOpen && (
        <Drawer onClose={closeDrawer}>
          <ProfileEditor
            profile={editingProfile}
            presets={allPresets}
            knownProjects={workspace.knownProjects}
            onSave={handleSave}
            onClose={closeDrawer}
          />
        </Drawer>
      )}

      {pendingDeleteId && (
        <ConfirmDialog
          title={t("profiles.dialog.deleteTitle")}
          message={t("profiles.dialog.deleteMessage")}
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

export default ProfilesPage;
