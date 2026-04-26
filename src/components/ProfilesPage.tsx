import { invoke } from "@tauri-apps/api/core";
import { type DragEvent, useCallback, useMemo, useRef, useState } from "react";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type { ConfigProfile, ConfigWorkspace, ModelTestResult } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import {
  getEnabledPluginsSummary,
  isPlainObject,
  presetNameById,
  presetSlugFromId,
} from "./config-workspace-utils";
import Drawer from "./Drawer";
import { TestTubeIcon, TrashIcon } from "./Icons";
import ProfileEditor from "./ProfileEditor";
import ProfileNameBadge from "./ProfileNameBadge";
import ModelTestResultDialog from "./profile-editor/ModelTestResultDialog";
import { readPermissionsDefaultMode } from "./profile-editor/PermissionsEditor";
import "./ProfilesPage.css";

interface ProfilesPageProps {
  workspace: ConfigWorkspace;
  onWorkspaceChange: () => Promise<void>;
}

type ProfileModelTestState =
  | { status: "running" }
  | { status: "success"; result: ModelTestResult }
  | { status: "failed"; result: ModelTestResult | null; errorMessage: string };

interface ActiveModelTestDialog {
  profileId: string;
  result: ModelTestResult | null;
  errorMessage: string;
}

function ProfilesPage({ workspace, onWorkspaceChange }: ProfilesPageProps) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const [editingProfile, setEditingProfile] = useState<ConfigProfile | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isTestingAllProfiles, setIsTestingAllProfiles] = useState(false);
  const [profileModelTestStates, setProfileModelTestStates] = useState<
    Record<string, ProfileModelTestState>
  >({});
  const [activeModelTestDialog, setActiveModelTestDialog] = useState<ActiveModelTestDialog | null>(
    null,
  );
  const [retestingProfileId, setRetestingProfileId] = useState<string | null>(null);
  const [isRawResponseExpanded, setIsRawResponseExpanded] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  const modelTestRunIdRef = useRef(0);
  const retestModelRunIdRef = useRef(0);
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
  const profiles = workspace.profiles;

  function isAppliedToUserSettings(profile: ConfigProfile) {
    return workspace.bindings.userProfileId === profile.id;
  }

  function profileToModelTestData(profile: ConfigProfile) {
    return {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      presetId: profile.presetId,
      settings: profile.settings,
    };
  }

  function profileModelTestQueueKey(profile: ConfigProfile) {
    const presetId = profile.presetId?.trim();
    return presetId ? `preset:${presetId}` : `profile:${profile.id}`;
  }

  function modelTestStateFromResult(
    result: ModelTestResult,
  ): Exclude<ProfileModelTestState, { status: "running" }> {
    if (result.ok) {
      return { status: "success", result };
    }

    return {
      status: "failed",
      result,
      errorMessage: result.errorMessage || t("profiles.testAll.failed"),
    };
  }

  function invokeProfileModelTest(profile: ConfigProfile, promptText?: string) {
    return invoke<ModelTestResult>("test_profile_model", {
      data: {
        ...profileToModelTestData(profile),
        ...(promptText !== undefined ? { promptText } : {}),
      },
    });
  }

  function closeDrawer() {
    setIsDrawerOpen(false);
    setEditingProfile(null);
  }

  function closeModelTestDialog() {
    setActiveModelTestDialog(null);
    setIsRawResponseExpanded(false);
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

  function profileEffortLevelClass(effort: string) {
    switch (effort) {
      case "low":
        return "profile-summary-effort-level--low";
      case "medium":
        return "profile-summary-effort-level--medium";
      case "high":
        return "profile-summary-effort-level--high";
      case "xhigh":
        return "profile-summary-effort-level--xhigh";
      case "max":
        return "profile-summary-effort-level--max";
      default:
        return "";
    }
  }

  function profilePermissionMode(profile: ConfigProfile) {
    return readPermissionsDefaultMode(profile.settings.permissions).trim();
  }

  function profileSandboxEnabled(profile: ConfigProfile) {
    const sandbox = isPlainObject(profile.settings.sandbox) ? profile.settings.sandbox : {};
    return sandbox.enabled === true;
  }

  function profilePermissionModeClass(permissionMode: string) {
    switch (permissionMode) {
      case "plan":
        return "profile-summary-permission-mode--plan";
      case "acceptEdits":
        return "profile-summary-permission-mode--accept-edits";
      case "dontAsk":
        return "profile-summary-permission-mode--dont-ask";
      case "bypassPermissions":
        return "profile-summary-permission-mode--bypass-permissions";
      default:
        return "";
    }
  }

  function profilePluginsSummary(profile: ConfigProfile) {
    return getEnabledPluginsSummary(profile.settings.enabledPlugins);
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
      await invoke("duplicate_profile", {
        id: profile.id,
        nameSuffix: t("profiles.duplicateSuffix"),
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

  async function handleTestAllProfiles() {
    if (isTestingAllProfiles || profiles.length === 0) {
      return;
    }

    const runId = modelTestRunIdRef.current + 1;
    modelTestRunIdRef.current = runId;
    const runningStates = Object.fromEntries(
      profiles.map((profile) => [profile.id, { status: "running" as const }]),
    );

    setIsTestingAllProfiles(true);
    setProfileModelTestStates(runningStates);
    setActiveModelTestDialog(null);
    setIsRawResponseExpanded(false);

    async function testProfile(profile: ConfigProfile) {
      try {
        const result = await invokeProfileModelTest(profile);
        if (modelTestRunIdRef.current === runId) {
          setProfileModelTestStates((current) => ({
            ...current,
            [profile.id]: modelTestStateFromResult(result),
          }));
        }
        return result;
      } catch (error) {
        if (modelTestRunIdRef.current === runId) {
          setProfileModelTestStates((current) => ({
            ...current,
            [profile.id]: {
              status: "failed",
              result: null,
              errorMessage: String(error),
            },
          }));
        }
      }
    }

    const profilesByQueue = new Map<string, ConfigProfile[]>();
    for (const profile of profiles) {
      const queueKey = profileModelTestQueueKey(profile);
      const queue = profilesByQueue.get(queueKey);
      if (queue) {
        queue.push(profile);
      } else {
        profilesByQueue.set(queueKey, [profile]);
      }
    }

    await Promise.all(
      Array.from(profilesByQueue.values()).map(async (queue) => {
        for (const profile of queue) {
          if (modelTestRunIdRef.current !== runId) {
            return;
          }
          await testProfile(profile);
        }
      }),
    );

    if (modelTestRunIdRef.current === runId) {
      setIsTestingAllProfiles(false);
    }
  }

  async function handleRetestActiveProfile(promptText?: string) {
    const activeProfileId = activeModelTestDialog?.profileId;
    if (!activeProfileId || retestingProfileId || isTestingAllProfiles) {
      return;
    }

    const profile = profiles.find((profile) => profile.id === activeProfileId);
    if (!profile) {
      return;
    }

    const runId = retestModelRunIdRef.current + 1;
    retestModelRunIdRef.current = runId;
    setRetestingProfileId(profile.id);
    setIsRawResponseExpanded(false);
    setProfileModelTestStates((current) => ({
      ...current,
      [profile.id]: { status: "running" },
    }));

    try {
      const result = await invokeProfileModelTest(profile, promptText);
      if (retestModelRunIdRef.current === runId) {
        const nextState = modelTestStateFromResult(result);
        setProfileModelTestStates((current) => ({
          ...current,
          [profile.id]: nextState,
        }));
        setActiveModelTestDialog((current) =>
          current?.profileId === profile.id
            ? {
                profileId: profile.id,
                result: nextState.result,
                errorMessage: nextState.status === "failed" ? nextState.errorMessage : "",
              }
            : current,
        );
      }
    } catch (error) {
      if (retestModelRunIdRef.current === runId) {
        const errorMessage = String(error);
        setProfileModelTestStates((current) => ({
          ...current,
          [profile.id]: {
            status: "failed",
            result: null,
            errorMessage,
          },
        }));
        setActiveModelTestDialog((current) =>
          current?.profileId === profile.id
            ? {
                profileId: profile.id,
                result: null,
                errorMessage,
              }
            : current,
        );
      }
    } finally {
      if (retestModelRunIdRef.current === runId) {
        setRetestingProfileId(null);
      }
    }
  }

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

  function modelTestResultLabel(state: Exclude<ProfileModelTestState, { status: "running" }>) {
    return state.status === "success"
      ? `${state.result.durationMs} ms`
      : t("profiles.testAll.failed");
  }

  function openProfileModelTestResult(
    profile: ConfigProfile,
    state: Exclude<ProfileModelTestState, { status: "running" }>,
  ) {
    setActiveModelTestDialog({
      profileId: profile.id,
      result: state.result,
      errorMessage: state.status === "failed" ? state.errorMessage : "",
    });
    setIsRawResponseExpanded(false);
  }

  function modelTestResultAriaLabel(
    profile: ConfigProfile,
    state: Exclude<ProfileModelTestState, { status: "running" }>,
  ) {
    return t("profiles.testAll.resultAriaLabel")
      .replace("{name}", profile.name)
      .replace("{result}", modelTestResultLabel(state));
  }

  function renderProfileModelTestState(profile: ConfigProfile) {
    const state = profileModelTestStates[profile.id];
    if (!state) {
      return null;
    }

    if (state.status === "running") {
      return (
        <span className="profile-test-result-badge running" title={t("profiles.testAll.running")}>
          <span className="profile-test-result-spinner" aria-hidden="true" />
          <span>{t("profiles.testAll.runningBadge")}</span>
        </span>
      );
    }

    const label = modelTestResultLabel(state);
    const ariaLabel = modelTestResultAriaLabel(profile, state);

    return (
      <button
        type="button"
        className={`profile-test-result-badge ${state.status}`}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={(event) => {
          event.stopPropagation();
          openProfileModelTestResult(profile, state);
        }}
      >
        {label}
      </button>
    );
  }

  const activeModelTestProfile = activeModelTestDialog
    ? (profiles.find((profile) => profile.id === activeModelTestDialog.profileId) ?? null)
    : null;

  return (
    <>
      <div className={`list-section ${isDrawerOpen ? "compressed" : ""}`}>
        <div className="page-header">
          <h1 className="page-title">{t("profiles.title")}</h1>
          <div className="profile-page-actions">
            <button
              type="button"
              className={`profile-test-all-btn${isTestingAllProfiles ? " is-testing" : ""}`}
              disabled={profiles.length === 0 || isTestingAllProfiles}
              onClick={() => {
                void handleTestAllProfiles();
              }}
            >
              <TestTubeIcon size={15} />
              <span>
                {isTestingAllProfiles
                  ? t("profiles.actions.testingAll")
                  : t("profiles.actions.testAll")}
              </span>
            </button>
          </div>
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
            {profiles.map((profile, index) => {
              const model = profilePrimaryModel(profile);
              const effort = profileEffortLevel(profile);
              const permissionMode = profilePermissionMode(profile);
              const sandboxEnabled = profileSandboxEnabled(profile);
              const plugins = profilePluginsSummary(profile);
              const hasSummary = model || permissionMode || plugins.totalCount > 0;
              return (
                <div
                  key={profile.id}
                  className={`profile-card ${isAppliedToUserSettings(profile) ? "active" : ""} ${
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
                    <ProfileNameBadge
                      name={profile.name}
                      colorSeedScope={presetSlugFromId(profile.presetId)}
                      size="sm"
                    />
                    <div className="profile-card-title-block">
                      <div className="profile-card-title-row">
                        <h3>{profile.name}</h3>
                      </div>
                      <div className="profile-card-preset-row">
                        <span className="profile-preset-badge">
                          {presetNameById(
                            allPresets,
                            profile.presetId,
                            language,
                            t("profileEditor.preset.noPreset"),
                          )}
                        </span>
                      </div>
                      {profile.description && (
                        <p className="profile-card-description">{profile.description}</p>
                      )}
                    </div>

                    <div className="profile-card-head-actions">
                      {isDrawerOpen && editingProfile?.id === profile.id ? (
                        <span className="profile-status-badge editing">
                          {t("profiles.badges.editing")}
                        </span>
                      ) : isAppliedToUserSettings(profile) ? (
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

                  {hasSummary && (
                    <div className="profile-card-summary">
                      {model && (
                        <div className="profile-summary-row">
                          <span className="profile-summary-title">
                            {t("profiles.summary.modelTitle")}
                          </span>
                          <div className="profile-summary-main">
                            <span>{model}</span>
                            {renderProfileModelTestState(profile)}
                            {effort && (
                              <span
                                className={[
                                  "profile-summary-effort-level",
                                  profileEffortLevelClass(effort),
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                {effort}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {permissionMode && (
                        <div className="profile-summary-row">
                          <span className="profile-summary-title">
                            {t("profiles.summary.permissionsTitle")}
                          </span>
                          <span className="profile-summary-main">
                            <span
                              className={[
                                "profile-summary-permission-mode",
                                profilePermissionModeClass(permissionMode),
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {permissionMode}
                            </span>
                            <span
                              className={`profile-summary-sandbox-state profile-summary-sandbox-state--${
                                sandboxEnabled ? "enabled" : "disabled"
                              }`}
                            >
                              {t(
                                sandboxEnabled
                                  ? "profiles.summary.sandboxEnabled"
                                  : "profiles.summary.sandboxDisabled",
                              )}
                            </span>
                          </span>
                        </div>
                      )}
                      {plugins.totalCount > 0 && (
                        <div className="profile-summary-row">
                          <span className="profile-summary-title">
                            {t("profiles.summary.pluginsTitle")}
                          </span>
                          <span>
                            {t("common.pluginsEnabledSummaryLabel")} {plugins.enabledCount}/
                            {plugins.totalCount}
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
                      className="profile-card-action danger icon-only"
                      aria-label={t("profiles.actions.delete")}
                      title={t("profiles.actions.delete")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDeleteId(profile.id);
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isDrawerOpen && (
        <Drawer onClose={closeDrawer}>
          <ProfileEditor
            profile={editingProfile}
            presets={allPresets}
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

      <ModelTestResultDialog
        isOpen={activeModelTestDialog !== null}
        result={activeModelTestDialog?.result ?? null}
        profileName={activeModelTestProfile?.name}
        errorMessage={activeModelTestDialog?.errorMessage ?? ""}
        rawResponseExpanded={isRawResponseExpanded}
        onClose={closeModelTestDialog}
        onToggleRawResponse={() => setIsRawResponseExpanded((value) => !value)}
        onRetest={activeModelTestDialog ? handleRetestActiveProfile : undefined}
        isRetesting={
          !!activeModelTestDialog && retestingProfileId === activeModelTestDialog.profileId
        }
      />
    </>
  );
}

export default ProfilesPage;
