import { invoke } from "@tauri-apps/api/core";
import { Copy, Files, Plus, TestTube, Trash2 } from "lucide-react";
import { type DragEvent, useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type { ConfigProfile, ConfigWorkspace, ModelTestResult } from "../types";
import ConfirmAlertDialog from "./ConfirmAlertDialog";
import {
  getEnabledPluginsSummary,
  isPlainObject,
  presetNameById,
  presetSlugFromId,
} from "./config-workspace-utils";
import PageHeader from "./PageHeader";
import ProfileEditor from "./ProfileEditor";
import ProfileNameBadge from "./ProfileNameBadge";
import ModelTestResultDialog from "./profile-editor/ModelTestResultDialog";
import { readPermissionsDefaultMode } from "./profile-editor/PermissionsEditor";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Sheet, SheetContent } from "./ui/sheet";

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
        return "text-muted-foreground text-chart-2";
      case "medium":
        return "text-[var(--chart-4)] text-[var(--primary)]";
      case "high":
        return "text-[var(--chart-2)] text-chart-4";
      case "xhigh":
        return "text-[var(--chart-1)] text-chart-3";
      case "max":
        return "text-[var(--chart-1)] text-destructive";
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
        return "text-[var(--chart-4)] text-[var(--primary)]";
      case "acceptEdits":
        return "text-[var(--chart-2)] text-chart-4";
      case "dontAsk":
        return "text-[var(--chart-1)] text-chart-3";
      case "bypassPermissions":
        return "text-[var(--chart-3)] text-destructive";
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
        <span
          className="running inline-flex min-h-[18px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-sm border border-border bg-muted px-[5px] py-px text-[11px] leading-[1.15] font-bold text-muted-foreground"
          title={t("profiles.testAll.running")}
        >
          <span
            className="size-2.5 animate-spin rounded-full border-[1.5px] border-current border-r-transparent"
            aria-hidden="true"
          />
          <span>{t("profiles.testAll.runningBadge")}</span>
        </span>
      );
    }

    const label = modelTestResultLabel(state);
    const ariaLabel = modelTestResultAriaLabel(profile, state);

    return (
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className={cn(
          "h-auto min-h-[18px] shrink-0 gap-1 rounded-sm border-0 px-[5px] py-px text-[11px] leading-[1.15] font-bold text-white hover:text-white",
          state.status,
          state.status === "success" ? "bg-chart-2" : "bg-destructive",
        )}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={(event) => {
          event.stopPropagation();
          openProfileModelTestResult(profile, state);
        }}
      >
        {label}
      </Button>
    );
  }

  const activeModelTestProfile = activeModelTestDialog
    ? (profiles.find((profile) => profile.id === activeModelTestDialog.profileId) ?? null)
    : null;

  return (
    <>
      <div
        className={cn(
          "list-section scrollbar-none flex w-[360px] shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-secondary transition-[width] duration-300 max-[1000px]:fixed max-[1000px]:inset-y-0 max-[1000px]:right-0 max-[1000px]:left-[60px] max-[1000px]:z-50 max-[1000px]:w-auto max-[700px]:left-[48px]",
          isDrawerOpen && "compressed w-[280px]",
        )}
      >
        <PageHeader
          title={t("profiles.title")}
          surface="secondary"
          variant="list"
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "border-border bg-muted font-semibold text-foreground hover:border-primary hover:text-[var(--primary)]",
                isTestingAllProfiles && "is-testing",
              )}
              disabled={profiles.length === 0 || isTestingAllProfiles}
              onClick={() => {
                void handleTestAllProfiles();
              }}
            >
              <TestTube
                className={cn("size-[15px]", isTestingAllProfiles && "animate-spin")}
                aria-hidden="true"
              />
              <span>
                {isTestingAllProfiles
                  ? t("profiles.actions.testingAll")
                  : t("profiles.actions.testAll")}
              </span>
            </Button>
          }
        />
        <Button
          type="button"
          className="mx-2 mt-4 mb-3 h-auto gap-2 rounded-lg p-3.5 text-base font-semibold"
          onClick={() => {
            setEditingProfile(null);
            setIsDrawerOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          <span>{t("profiles.add")}</span>
        </Button>

        {profiles.length === 0 ? (
          <div className="config-list-empty flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <p className="empty-text mb-2 text-lg font-medium">{t("profiles.empty")}</p>
            <p className="empty-hint max-w-[360px] text-center text-sm leading-normal text-muted-foreground">
              {t("profiles.emptyHint")}
            </p>
          </div>
        ) : (
          <div
            className={cn(
              "profiles-grid flex flex-col gap-3 p-4",
              dragState.draggingIndex !== null &&
                "is-dragging [&_[data-slot=profile-card]:not(.dragging)]:opacity-70",
            )}
            onDragOver={(event) => event.preventDefault()}
          >
            {profiles.map((profile, index) => {
              const model = profilePrimaryModel(profile);
              const effort = profileEffortLevel(profile);
              const permissionMode = profilePermissionMode(profile);
              const sandboxEnabled = profileSandboxEnabled(profile);
              const plugins = profilePluginsSummary(profile);
              const hasSummary =
                model || permissionMode || sandboxEnabled || plugins.totalCount > 0;
              const isEditingProfile = isDrawerOpen && editingProfile?.id === profile.id;
              const isAppliedProfile = isAppliedToUserSettings(profile);
              return (
                <Card
                  key={profile.id}
                  className={cn(
                    "group relative flex cursor-pointer flex-col gap-4 rounded-xl border border-border bg-card p-4 py-4 shadow-none transition-[transform,border-color,box-shadow,opacity] duration-200 hover:-translate-y-px hover:border-primary hover:shadow-[0_4px_12px_rgb(59_130_246_/_0.15)] focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:outline-none",
                    isAppliedProfile &&
                      "active border-[var(--primary)] ring-1 ring-[var(--primary)] shadow-[0_0_16px_rgb(59_130_246_/_0.2)]",
                    isEditingProfile &&
                      "editing border-chart-3 ring-1 ring-[var(--chart-3)] shadow-[0_0_18px_rgb(247_129_102_/_0.24)]",
                    dragState.draggingIndex === index &&
                      "dragging scale-[0.985] opacity-50 shadow-[0_18px_36px_rgb(59_130_246_/_0.18)]",
                    dragState.overIndex === index &&
                      dragState.overPosition === "above" &&
                      "drag-over-above before:absolute before:top-[-6px] before:right-[-12px] before:left-[-12px] before:h-1 before:rounded-full before:bg-chart-2 before:shadow-[0_0_0_2px_var(--background),var(--glow-green)] before:content-['']",
                    dragState.overIndex === index &&
                      dragState.overPosition === "below" &&
                      "drag-over-below after:absolute after:right-[-12px] after:bottom-[-6px] after:left-[-12px] after:h-1 after:rounded-full after:bg-chart-2 after:shadow-[0_0_0_2px_var(--background),var(--glow-green)] after:content-['']",
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
                  <div className="flex items-start justify-between gap-3">
                    <ProfileNameBadge
                      name={profile.name}
                      colorSeedScope={presetSlugFromId(profile.presetId)}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center">
                        <h3 className="truncate text-lg font-semibold">{profile.name}</h3>
                      </div>
                      <div className="mt-1.5 flex items-center">
                        <Badge
                          variant="ghost"
                          className="rounded-full bg-[rgb(59_130_246_/_0.1)] px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)]"
                        >
                          {presetNameById(
                            allPresets,
                            profile.presetId,
                            language,
                            t("profileEditor.preset.noPreset"),
                          )}
                        </Badge>
                      </div>
                      {profile.description && (
                        <p className="mt-1.5 line-clamp-2 text-sm leading-normal text-muted-foreground">
                          {profile.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {isEditingProfile ? (
                        <Badge className="editing rounded-md bg-chart-3/10 px-2.5 py-1.5 text-sm font-semibold text-chart-3">
                          {t("profiles.badges.editing")}
                        </Badge>
                      ) : isAppliedProfile ? (
                        <Badge className="active rounded-md bg-[rgb(34_197_94_/_0.15)] px-2.5 py-1.5 text-sm font-semibold text-chart-2">
                          {t("profiles.badges.inUse")}
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="font-semibold"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleApply(profile.id);
                          }}
                        >
                          {t("profiles.actions.apply")}
                        </Button>
                      )}
                    </div>
                  </div>

                  {hasSummary && (
                    <div className="flex flex-col gap-2">
                      {model && (
                        <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-1.5 text-sm text-muted-foreground">
                          <span className="inline-flex shrink-0 items-center text-[11px] leading-none font-bold text-muted-foreground uppercase after:ml-0.5 after:font-bold after:text-[var(--border)] after:content-[':']">
                            {t("profiles.summary.modelTitle")}
                          </span>
                          <div className="inline-flex min-w-0 items-center gap-1.5">
                            <span className="min-w-0 truncate">{model}</span>
                            {renderProfileModelTestState(profile)}
                            {effort && (
                              <span
                                className={cn(
                                  "shrink-0 whitespace-nowrap",
                                  profileEffortLevelClass(effort),
                                )}
                              >
                                {effort}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {(permissionMode || sandboxEnabled) && (
                        <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-1.5 text-sm text-muted-foreground">
                          <span className="inline-flex shrink-0 items-center text-[11px] leading-none font-bold text-muted-foreground uppercase after:ml-0.5 after:font-bold after:text-[var(--border)] after:content-[':']">
                            {t("profiles.summary.permissionsTitle")}
                          </span>
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            {permissionMode ? (
                              <span className={cn(profilePermissionModeClass(permissionMode))}>
                                {permissionMode}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-muted-foreground">
                                {t("profileEditor.permissions.unset")}
                              </span>
                            )}
                            <span
                              className={cn(
                                "shrink-0 border-l border-border/70 pl-1.5 text-[11px] leading-none whitespace-nowrap",
                                sandboxEnabled
                                  ? "text-[var(--chart-2)] text-chart-2"
                                  : "text-muted-foreground text-muted-foreground",
                              )}
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
                        <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-1.5 text-sm text-muted-foreground">
                          <span className="inline-flex shrink-0 items-center text-[11px] leading-none font-bold text-muted-foreground uppercase after:ml-0.5 after:font-bold after:text-[var(--border)] after:content-[':']">
                            {t("profiles.summary.pluginsTitle")}
                          </span>
                          <span className="min-w-0 truncate">
                            {t("common.pluginsEnabledSummaryLabel")} {plugins.enabledCount}/
                            {plugins.totalCount}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-[-1rem] flex max-h-0 flex-wrap justify-end gap-2 self-end overflow-hidden opacity-0 transition-[max-height,margin-top,opacity,transform] duration-200 group-hover:mt-0 group-hover:max-h-12 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:mt-0 group-focus-within:max-h-12 group-focus-within:translate-y-0 group-focus-within:opacity-100 pointer-events-none translate-y-2 group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="border-border bg-muted text-foreground hover:border-primary hover:text-primary"
                      aria-label={t("profiles.actions.copyEnv")}
                      title={t("profiles.actions.copyEnv")}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleCopyEnv(profile);
                      }}
                    >
                      <Copy className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="border-border bg-muted text-foreground hover:border-primary hover:text-primary"
                      aria-label={t("profiles.actions.duplicate")}
                      title={t("profiles.actions.duplicate")}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDuplicate(profile);
                      }}
                    >
                      <Files className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="border-border bg-muted text-foreground hover:border-destructive hover:text-destructive"
                      aria-label={t("profiles.actions.delete")}
                      title={t("profiles.actions.delete")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDeleteId(profile.id);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {isDrawerOpen && (
        <Sheet open onOpenChange={(open) => !open && closeDrawer()}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className="left-[340px] w-auto border-l-0 bg-card p-0 shadow-[-4px_0_24px_rgb(0_0_0_/_0.2)] sm:max-w-none max-[1000px]:left-[60px] max-[700px]:left-[48px]"
          >
            <ProfileEditor
              profile={editingProfile}
              presets={allPresets}
              onSave={handleSave}
              onClose={closeDrawer}
            />
          </SheetContent>
        </Sheet>
      )}

      {pendingDeleteId && (
        <ConfirmAlertDialog
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
