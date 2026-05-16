import type { FileContents, MultiFileDiffProps, ThemeTypes } from "@pierre/diffs/react";
import { MultiFileDiff } from "@pierre/diffs/react";
import { invoke } from "@tauri-apps/api/core";
import {
  CircleAlert,
  CircleCheck,
  Copy,
  FileInput,
  Plus,
  TestTube,
  Trash2,
  Variable,
} from "lucide-react";
import {
  type CSSProperties,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getUserFacingErrorReason, showOperationError } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type {
  ActiveUserSettingsMismatch,
  ConfigProfile,
  ConfigWorkspace,
  ModelTestResult,
  UnmanagedUserSettings,
  UnmanagedUserSettingsImportStatus,
} from "../types";
import ConfirmAlertDialog from "./ConfirmAlertDialog";
import {
  getEnabledPluginsSummary,
  isPlainObject,
  presetNameById,
  presetSlugFromId,
} from "./config-workspace-utils";
import EmptyState from "./EmptyState";
import type { EditorExitGuard } from "./editor-exit-guard";
import {
  LIST_DETAIL_DRAWER_OFFSET_CLASS,
  LIST_PANEL_COMPRESSED_WIDTH_CLASS,
  LIST_PANEL_WIDTH_CLASS,
} from "./layout-size-classes";
import PageHeader from "./PageHeader";
import ProfileEditor, { type ProfileEditorHandle } from "./ProfileEditor";
import ProfileNameBadge from "./ProfileNameBadge";
import ModelTestResultDialog from "./profile-editor/ModelTestResultDialog";
import { readPermissionsDefaultMode } from "./profile-editor/PermissionsEditor";
import { useTheme } from "./theme-provider";
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
import { Spinner } from "./ui/spinner";

interface ProfilesPageProps {
  workspace: ConfigWorkspace;
  onWorkspaceChange: () => Promise<void>;
  onEditorExitGuardChange?: (guard: EditorExitGuard | null) => void;
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

interface SettingsDiffEntry {
  path: string;
  status: "added" | "removed" | "changed";
}

type SettingsMismatchDiffOptions = NonNullable<MultiFileDiffProps<undefined>["options"]>;

const unmanagedUserSettingsStatusLabels: Record<
  UnmanagedUserSettingsImportStatus,
  `profiles.unmanaged.status.${UnmanagedUserSettingsImportStatus}`
> = {
  ready: "profiles.unmanaged.status.ready",
  invalidJson: "profiles.unmanaged.status.invalidJson",
  invalidSchema: "profiles.unmanaged.status.invalidSchema",
  unsupportedSymlink: "profiles.unmanaged.status.unsupportedSymlink",
  readError: "profiles.unmanaged.status.readError",
};

const settingsDiffStatusLabels: Record<
  SettingsDiffEntry["status"],
  `profiles.mismatch.diffStatus.${SettingsDiffEntry["status"]}`
> = {
  added: "profiles.mismatch.diffStatus.added",
  removed: "profiles.mismatch.diffStatus.removed",
  changed: "profiles.mismatch.diffStatus.changed",
};

const PROFILE_DRAG_AUTO_SCROLL_EDGE_PX = 56;
const PROFILE_DRAG_AUTO_SCROLL_MAX_SPEED = 18;
const SETTINGS_MISMATCH_VISIBLE_DIFF_LIMIT = 8;
const SETTINGS_MISMATCH_DIFF_BASE_OPTIONS = {
  diffIndicators: "bars",
  diffStyle: "split",
  hunkSeparators: "line-info-basic",
  lineDiffType: "word-alt",
  overflow: "wrap",
  parseDiffOptions: {
    context: 6,
  },
  theme: {
    dark: "pierre-dark",
    light: "pierre-light",
  },
  tokenizeMaxLineLength: 2000,
} satisfies SettingsMismatchDiffOptions;

function formatSettingsJson(settings: Record<string, unknown>) {
  return JSON.stringify(settings, null, 2);
}

function buildSettingsDiffFile(name: string, settings: Record<string, unknown>): FileContents {
  return {
    name,
    contents: `${formatSettingsJson(settings)}\n`,
    lang: "json",
    cacheKey: `${name}:${JSON.stringify(settings)}`,
  };
}

function formatSettingsPath(path: string[]) {
  return path.join(".");
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function collectSettingsDiffs(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  prefix: string[] = [],
): SettingsDiffEntry[] {
  const keys = Array.from(new Set([...Object.keys(expected), ...Object.keys(actual)])).sort();
  const diffs: SettingsDiffEntry[] = [];

  for (const key of keys) {
    const nextPrefix = [...prefix, key];
    const hasExpected = Object.hasOwn(expected, key);
    const hasActual = Object.hasOwn(actual, key);

    if (!hasExpected) {
      diffs.push({ path: formatSettingsPath(nextPrefix), status: "added" });
      continue;
    }
    if (!hasActual) {
      diffs.push({ path: formatSettingsPath(nextPrefix), status: "removed" });
      continue;
    }

    const expectedValue = expected[key];
    const actualValue = actual[key];
    if (isPlainObject(expectedValue) && isPlainObject(actualValue)) {
      diffs.push(
        ...collectSettingsDiffs(
          expectedValue as Record<string, unknown>,
          actualValue as Record<string, unknown>,
          nextPrefix,
        ),
      );
      continue;
    }

    if (!valuesEqual(expectedValue, actualValue)) {
      diffs.push({ path: formatSettingsPath(nextPrefix), status: "changed" });
    }
  }

  return diffs;
}

function ProfilesPage({
  workspace,
  onWorkspaceChange,
  onEditorExitGuardChange,
}: ProfilesPageProps) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const { isDark } = useTheme();
  const [editingProfile, setEditingProfile] = useState<ConfigProfile | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingEditorExitAction, setPendingEditorExitAction] = useState<(() => void) | null>(null);
  const [isSavingEditorExit, setIsSavingEditorExit] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isTestingAllProfiles, setIsTestingAllProfiles] = useState(false);
  const [isImportingUserSettings, setIsImportingUserSettings] = useState(false);
  const [profileModelTestStates, setProfileModelTestStates] = useState<
    Record<string, ProfileModelTestState>
  >({});
  const [activeModelTestDialog, setActiveModelTestDialog] = useState<ActiveModelTestDialog | null>(
    null,
  );
  const [isSettingsMismatchDialogOpen, setIsSettingsMismatchDialogOpen] = useState(false);
  const [retestingProfileId, setRetestingProfileId] = useState<string | null>(null);
  const [isRawResponseExpanded, setIsRawResponseExpanded] = useState(false);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const profileEditorRef = useRef<ProfileEditorHandle | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const dragAutoScrollFrameRef = useRef<number | null>(null);
  const dragAutoScrollVelocityRef = useRef(0);
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

  function profileSettingsMismatch(profile: ConfigProfile): ActiveUserSettingsMismatch | null {
    const mismatch = workspace.activeUserSettingsMismatch;
    return mismatch?.profileId === profile.id ? mismatch : null;
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
    setPendingEditorExitAction(null);
  }

  const requestEditorExit = useCallback((action: () => void) => {
    if (profileEditorRef.current?.isDirty()) {
      setPendingEditorExitAction(() => action);
      return;
    }

    action();
  }, []);

  async function saveAndRunPendingEditorExit() {
    const action = pendingEditorExitAction;
    const editor = profileEditorRef.current;
    if (!action || !editor?.canSave()) {
      return;
    }

    setIsSavingEditorExit(true);
    try {
      const saved = await editor.save();
      if (saved) {
        setPendingEditorExitAction(null);
        action();
      }
    } finally {
      setIsSavingEditorExit(false);
    }
  }

  function discardAndRunPendingEditorExit() {
    const action = pendingEditorExitAction;
    setPendingEditorExitAction(null);
    action?.();
  }

  useEffect(() => {
    if (!onEditorExitGuardChange) {
      return;
    }

    if (!isDrawerOpen) {
      onEditorExitGuardChange(null);
      return;
    }

    onEditorExitGuardChange({ requestExit: requestEditorExit });
    return () => onEditorExitGuardChange(null);
  }, [isDrawerOpen, onEditorExitGuardChange, requestEditorExit]);

  function closeModelTestDialog() {
    setActiveModelTestDialog(null);
    setIsRawResponseExpanded(false);
  }

  const stopDragAutoScroll = useCallback(() => {
    if (dragAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
      dragAutoScrollFrameRef.current = null;
    }
    dragAutoScrollVelocityRef.current = 0;
  }, []);

  const runDragAutoScroll = useCallback(() => {
    const list = listScrollRef.current;
    const velocity = dragAutoScrollVelocityRef.current;
    if (!list || velocity === 0 || dragIndexRef.current === null) {
      dragAutoScrollFrameRef.current = null;
      return;
    }

    list.scrollTop += velocity;
    dragAutoScrollFrameRef.current = window.requestAnimationFrame(runDragAutoScroll);
  }, []);

  const updateDragAutoScroll = useCallback(
    (clientY: number) => {
      if (dragIndexRef.current === null) {
        stopDragAutoScroll();
        return;
      }

      const list = listScrollRef.current;
      if (!list) {
        stopDragAutoScroll();
        return;
      }

      const rect = list.getBoundingClientRect();
      const topDistance = clientY - rect.top;
      const bottomDistance = rect.bottom - clientY;
      let velocity = 0;

      if (topDistance < PROFILE_DRAG_AUTO_SCROLL_EDGE_PX) {
        const intensity =
          (PROFILE_DRAG_AUTO_SCROLL_EDGE_PX - Math.max(0, topDistance)) /
          PROFILE_DRAG_AUTO_SCROLL_EDGE_PX;
        velocity = -Math.ceil(intensity * PROFILE_DRAG_AUTO_SCROLL_MAX_SPEED);
      } else if (bottomDistance < PROFILE_DRAG_AUTO_SCROLL_EDGE_PX) {
        const intensity =
          (PROFILE_DRAG_AUTO_SCROLL_EDGE_PX - Math.max(0, bottomDistance)) /
          PROFILE_DRAG_AUTO_SCROLL_EDGE_PX;
        velocity = Math.ceil(intensity * PROFILE_DRAG_AUTO_SCROLL_MAX_SPEED);
      }

      dragAutoScrollVelocityRef.current = velocity;
      if (velocity === 0) {
        stopDragAutoScroll();
        return;
      }

      if (dragAutoScrollFrameRef.current === null) {
        dragAutoScrollFrameRef.current = window.requestAnimationFrame(runDragAutoScroll);
      }
    },
    [runDragAutoScroll, stopDragAutoScroll],
  );

  const handleDragStart = useCallback((event: DragEvent<HTMLDivElement>, index: number) => {
    dragIndexRef.current = index;
    dragOverRef.current = { overIndex: null, overPosition: null };
    setDragState({ draggingIndex: index, overIndex: null, overPosition: null });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragEnd = useCallback(() => {
    stopDragAutoScroll();
    dragIndexRef.current = null;
    dragOverRef.current = { overIndex: null, overPosition: null };
    setDragState({ draggingIndex: null, overIndex: null, overPosition: null });
  }, [stopDragAutoScroll]);

  const handleListDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      updateDragAutoScroll(event.clientY);
    },
    [updateDragAutoScroll],
  );

  useEffect(() => stopDragAutoScroll, [stopDragAutoScroll]);

  useEffect(() => {
    if (!workspace.activeUserSettingsMismatch) {
      setIsSettingsMismatchDialogOpen(false);
    }
  }, [workspace.activeUserSettingsMismatch]);

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

  function settingsPrimaryModel(settings: Record<string, unknown>) {
    const env = isPlainObject(settings.env) ? settings.env : {};
    if (typeof env.ANTHROPIC_MODEL === "string" && env.ANTHROPIC_MODEL.trim()) {
      return env.ANTHROPIC_MODEL.trim();
    }
    if (typeof settings.model === "string" && settings.model.trim()) {
      return settings.model.trim();
    }
    return "";
  }

  function profilePrimaryModel(profile: ConfigProfile) {
    return settingsPrimaryModel(profile.settings);
  }

  function settingsEffortLevel(settings: Record<string, unknown>) {
    const env = isPlainObject(settings.env) ? settings.env : {};
    if (typeof env.CLAUDE_CODE_EFFORT_LEVEL === "string" && env.CLAUDE_CODE_EFFORT_LEVEL.trim()) {
      return env.CLAUDE_CODE_EFFORT_LEVEL.trim();
    }
    if (typeof settings.effortLevel === "string" && settings.effortLevel.trim()) {
      return settings.effortLevel.trim();
    }
    return "";
  }

  function profileEffortLevel(profile: ConfigProfile) {
    return settingsEffortLevel(profile.settings);
  }

  function profileEffortLevelClass(effort: string) {
    switch (effort) {
      case "low":
        return "text-muted-foreground";
      case "medium":
        return "text-primary";
      case "high":
        return "text-chart-4";
      case "xhigh":
        return "text-chart-3";
      case "max":
        return "text-destructive";
      default:
        return "";
    }
  }

  function settingsPermissionMode(settings: Record<string, unknown>) {
    return readPermissionsDefaultMode(settings.permissions).trim();
  }

  function profilePermissionMode(profile: ConfigProfile) {
    return settingsPermissionMode(profile.settings);
  }

  function settingsSandboxEnabled(settings: Record<string, unknown>) {
    const sandbox = isPlainObject(settings.sandbox) ? settings.sandbox : {};
    return sandbox.enabled === true;
  }

  function profileSandboxEnabled(profile: ConfigProfile) {
    return settingsSandboxEnabled(profile.settings);
  }

  function profilePermissionModeClass(permissionMode: string) {
    switch (permissionMode) {
      case "plan":
        return "text-primary";
      case "acceptEdits":
        return "text-chart-4";
      case "dontAsk":
        return "text-chart-3";
      case "bypassPermissions":
        return "text-destructive";
      default:
        return "";
    }
  }

  function settingsPluginsSummary(settings: Record<string, unknown>) {
    return getEnabledPluginsSummary(settings.enabledPlugins);
  }

  function profilePluginsSummary(profile: ConfigProfile) {
    return settingsPluginsSummary(profile.settings);
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
      return true;
    } catch (err) {
      showOperationError(showToast, t("profiles.toast.saveError"), err);
      return false;
    }
  }

  async function handleApply(id: string) {
    try {
      await invoke("apply_profile", { id });
      await onWorkspaceChange();
      showToast(t("profiles.toast.applied"));
    } catch (err) {
      showOperationError(showToast, t("profiles.toast.applyError"), err);
    }
  }

  async function handleMismatchAcceptActual() {
    if (!activeSettingsMismatch) return;
    const profile = profiles.find((p) => p.id === activeSettingsMismatch.profileId);
    if (!profile) return;
    try {
      await invoke("upsert_profile", {
        data: {
          id: profile.id,
          name: profile.name,
          description: profile.description,
          presetId: profile.presetId,
          settings: activeSettingsMismatch.actualSettings,
        },
      });
      await onWorkspaceChange();
      setIsSettingsMismatchDialogOpen(false);
      showToast(t("profiles.mismatch.toast.accepted"));
    } catch (err) {
      showOperationError(showToast, t("profiles.mismatch.toast.acceptError"), err);
    }
  }

  async function handleMismatchDiscardChanges() {
    if (!activeSettingsMismatch) return;
    try {
      await invoke("apply_profile", { id: activeSettingsMismatch.profileId });
      await onWorkspaceChange();
      setIsSettingsMismatchDialogOpen(false);
      showToast(t("profiles.mismatch.toast.discarded"));
    } catch (err) {
      showOperationError(showToast, t("profiles.mismatch.toast.discardError"), err);
    }
  }

  async function handleImportUserSettings() {
    setIsImportingUserSettings(true);
    try {
      await invoke("import_user_settings_profile", {
        data: {
          name: t("profiles.unmanaged.importedName"),
          description: t("profiles.unmanaged.importedDescription"),
        },
      });
      await onWorkspaceChange();
      showToast(t("profiles.toast.imported"));
    } catch (err) {
      showOperationError(showToast, t("profiles.toast.importError"), err);
    } finally {
      setIsImportingUserSettings(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await invoke("delete_profile", { id });
      await onWorkspaceChange();
      showToast(t("profiles.toast.deleted"));
    } catch (err) {
      showOperationError(showToast, t("profiles.toast.deleteError"), err);
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
    } catch (err) {
      showOperationError(showToast, t("profiles.toast.envCopyError"), err);
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
    } catch (err) {
      showOperationError(showToast, t("profiles.toast.duplicateError"), err);
    }
  }

  const handleReorder = useCallback(
    async (ids: string[]) => {
      try {
        await invoke("reorder_profiles", { ids });
        await onWorkspaceChange();
      } catch (err) {
        showOperationError(showToast, t("profiles.toast.reorderError"), err);
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
              errorMessage: getUserFacingErrorReason(error) ?? t("profiles.testAll.failed"),
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
        const errorMessage = getUserFacingErrorReason(error) ?? t("profiles.testAll.failed");
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
      ? t("profiles.testAll.successResult").replace("{durationMs}", String(state.result.durationMs))
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
          className="running inline-flex min-h-5 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-sm border border-border bg-muted px-1.5 py-px text-xs leading-tight font-bold text-muted-foreground"
          title={t("profiles.testAll.running")}
        >
          <Spinner className="size-3" aria-hidden="true" />
          <span>{t("profiles.testAll.runningBadge")}</span>
        </span>
      );
    }

    const label = modelTestResultLabel(state);
    const ariaLabel = modelTestResultAriaLabel(profile, state);
    const isSuccess = state.status === "success";
    const ResultIcon = isSuccess ? CircleCheck : CircleAlert;

    return (
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className={cn(
          "h-auto min-h-5 max-w-full shrink-0 gap-1 overflow-hidden rounded-sm border px-1.5 py-px text-xs leading-tight font-bold",
          state.status,
          isSuccess
            ? "border-chart-2/40 bg-chart-2/10 text-chart-2 hover:bg-chart-2/15 hover:text-chart-2"
            : "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive",
        )}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={(event) => {
          event.stopPropagation();
          openProfileModelTestResult(profile, state);
        }}
      >
        <ResultIcon className="size-3" aria-hidden="true" />
        <span className="min-w-0 truncate">{label}</span>
      </Button>
    );
  }

  function renderUnmanagedUserSettingsCard(userSettings: UnmanagedUserSettings) {
    const statusLabel = t(
      unmanagedUserSettingsStatusLabels[userSettings.importStatus] ??
        "profiles.unmanaged.status.readError",
    );
    const canImport = userSettings.importStatus === "ready";
    const model = settingsPrimaryModel(userSettings.settings);
    const effort = settingsEffortLevel(userSettings.settings);
    const permissionMode = settingsPermissionMode(userSettings.settings);
    const sandboxEnabled = settingsSandboxEnabled(userSettings.settings);
    const plugins = settingsPluginsSummary(userSettings.settings);
    const hasSummary =
      canImport && (model || permissionMode || sandboxEnabled || plugins.totalCount > 0);
    const importTitle = canImport
      ? t("profiles.unmanaged.importHint")
      : (userSettings.errorMessage ?? statusLabel);

    return (
      <Card
        key="unmanaged-user-settings"
        data-slot="unmanaged-user-settings-card"
        className="flex cursor-default flex-col gap-3 rounded-lg border border-dashed border-border bg-card p-4 text-foreground shadow-panel"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-chart-3/10 text-chart-3">
              <FileInput className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">{t("profiles.unmanaged.title")}</h3>
              <div className="mt-1.5 flex min-w-0 items-center gap-2">
                <Badge
                  variant="secondary"
                  className="rounded-full px-2 py-0.5 text-xs font-semibold text-chart-3"
                >
                  {t("profiles.unmanaged.badge")}
                </Badge>
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {userSettings.sourcePath}
                </span>
              </div>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 border-chart-3 bg-chart-3/10 font-semibold text-chart-3 hover:bg-chart-3/20 hover:text-chart-3"
            disabled={!canImport || isImportingUserSettings}
            title={importTitle}
            onClick={() => {
              void handleImportUserSettings();
            }}
          >
            {isImportingUserSettings
              ? t("profiles.unmanaged.importing")
              : t("profiles.unmanaged.import")}
          </Button>
        </div>

        <p className="m-0 text-sm leading-normal text-muted-foreground [overflow-wrap:anywhere]">
          {canImport ? t("profiles.unmanaged.description") : statusLabel}
        </p>

        {hasSummary ? (
          <div className="flex flex-col gap-2">
            {model ? (
              <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-1.5 text-sm text-muted-foreground">
                <span className="inline-flex shrink-0 items-center text-xs leading-none font-bold text-muted-foreground uppercase after:ml-0.5 after:font-bold after:text-border after:content-[':']">
                  {t("profiles.summary.modelTitle")}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="min-w-0 max-w-full truncate">{model}</span>
                  {effort ? (
                    <span
                      className={cn("shrink-0 whitespace-nowrap", profileEffortLevelClass(effort))}
                    >
                      {effort}
                    </span>
                  ) : null}
                </span>
              </div>
            ) : null}
            {permissionMode || sandboxEnabled ? (
              <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-1.5 text-sm text-muted-foreground">
                <span className="inline-flex shrink-0 items-center text-xs leading-none font-bold text-muted-foreground uppercase after:ml-0.5 after:font-bold after:text-border after:content-[':']">
                  {t("profiles.summary.permissionsTitle")}
                </span>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  {permissionMode ? (
                    <span className={cn(profilePermissionModeClass(permissionMode))}>
                      {permissionMode}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {t("profileEditor.permissions.unset")}
                    </span>
                  )}
                  <span
                    className={cn(
                      "shrink-0 border-l border-border/70 pl-1.5 text-xs leading-none whitespace-nowrap",
                      sandboxEnabled ? "text-chart-2" : "text-muted-foreground",
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
            ) : null}
            {plugins.totalCount > 0 ? (
              <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-1.5 text-sm text-muted-foreground">
                <span className="inline-flex shrink-0 items-center text-xs leading-none font-bold text-muted-foreground uppercase after:ml-0.5 after:font-bold after:text-border after:content-[':']">
                  {t("profiles.summary.pluginsTitle")}
                </span>
                <span className="min-w-0 truncate">
                  {t("common.pluginsEnabledSummaryLabel")} {plugins.enabledCount}/
                  {plugins.totalCount}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {!canImport && userSettings.errorMessage ? (
          <p className="m-0 text-xs leading-normal text-muted-foreground [overflow-wrap:anywhere]">
            {userSettings.errorMessage}
          </p>
        ) : null}
      </Card>
    );
  }

  const activeModelTestProfile = activeModelTestDialog
    ? (profiles.find((profile) => profile.id === activeModelTestDialog.profileId) ?? null)
    : null;
  const activeSettingsMismatch = workspace.activeUserSettingsMismatch ?? null;
  const settingsMismatchDiffs = activeSettingsMismatch
    ? collectSettingsDiffs(
        activeSettingsMismatch.expectedSettings,
        activeSettingsMismatch.actualSettings,
      )
    : [];
  const visibleSettingsMismatchDiffs = settingsMismatchDiffs.slice(
    0,
    SETTINGS_MISMATCH_VISIBLE_DIFF_LIMIT,
  );
  const settingsDiffThemeType: ThemeTypes = isDark ? "dark" : "light";
  const settingsDiffOptions = useMemo(
    () => ({
      ...SETTINGS_MISMATCH_DIFF_BASE_OPTIONS,
      themeType: settingsDiffThemeType,
    }),
    [settingsDiffThemeType],
  );
  const settingsDiffStyle = useMemo<CSSProperties>(
    () =>
      ({
        colorScheme: settingsDiffThemeType,
        "--diffs-dark": "var(--foreground)",
        "--diffs-dark-bg": "var(--card)",
        "--diffs-font-family": '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
        "--diffs-font-size": "0.8125rem",
        "--diffs-gap-block": "0.75rem",
        "--diffs-gap-inline": "1rem",
        "--diffs-light": "var(--foreground)",
        "--diffs-light-bg": "var(--card)",
        "--diffs-line-height": "1.5",
      }) as CSSProperties,
    [settingsDiffThemeType],
  );
  const settingsDiffOldFile = activeSettingsMismatch
    ? buildSettingsDiffFile("ai-manager-settings.json", activeSettingsMismatch.expectedSettings)
    : null;
  const settingsDiffNewFile = activeSettingsMismatch
    ? buildSettingsDiffFile(
        activeSettingsMismatch.sourcePath,
        activeSettingsMismatch.actualSettings,
      )
    : null;

  return (
    <>
      <div
        ref={listScrollRef}
        className={cn(
          "list-section scrollbar-none flex shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-secondary transition-[width] duration-300 max-[1000px]:fixed max-[1000px]:inset-y-0 max-[1000px]:right-0 max-[1000px]:left-[60px] max-[1000px]:z-50 max-[1000px]:w-auto max-[700px]:left-[48px]",
          isDrawerOpen && "compressed",
          isDrawerOpen ? LIST_PANEL_COMPRESSED_WIDTH_CLASS : LIST_PANEL_WIDTH_CLASS,
        )}
        data-slot="profiles-list-scroll"
        onDragOver={handleListDragOver}
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
                "border-border bg-muted font-semibold text-foreground hover:border-primary hover:text-primary",
                isTestingAllProfiles && "is-testing",
              )}
              disabled={profiles.length === 0 || isTestingAllProfiles}
              onClick={() => {
                void handleTestAllProfiles();
              }}
            >
              <TestTube
                data-icon="inline-start"
                className={cn(isTestingAllProfiles && "animate-spin")}
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
            requestEditorExit(() => {
              setEditingProfile(null);
              setIsDrawerOpen(true);
            });
          }}
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          <span>{t("profiles.add")}</span>
        </Button>

        {profiles.length === 0 && !workspace.unmanagedUserSettings ? (
          <EmptyState title={t("profiles.empty")} hint={t("profiles.emptyHint")} />
        ) : (
          <div
            className={cn(
              "profiles-grid flex flex-col gap-3 p-4",
              dragState.draggingIndex !== null &&
                "is-dragging [&_[data-slot=profile-card]:not(.dragging)]:opacity-70",
            )}
            onDragOver={handleListDragOver}
          >
            {profiles.length === 0 && workspace.unmanagedUserSettings
              ? renderUnmanagedUserSettingsCard(workspace.unmanagedUserSettings)
              : null}
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
              const settingsMismatch = profileSettingsMismatch(profile);
              return (
                <Card
                  key={profile.id}
                  className={cn(
                    "group relative flex cursor-pointer flex-col gap-4 rounded-lg border border-border bg-card p-4 py-4 shadow-panel transition-[transform,border-color,box-shadow,opacity] duration-200 hover:-translate-y-px hover:border-primary hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    isAppliedProfile && "active border-primary ring-1 ring-primary/30",
                    isEditingProfile && "editing border-chart-3 ring-1 ring-chart-3/30",
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
                    requestEditorExit(() => {
                      setEditingProfile(profile);
                      setIsDrawerOpen(true);
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      requestEditorExit(() => {
                        setEditingProfile(profile);
                        setIsDrawerOpen(true);
                      });
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
                        <h3 className="truncate text-base font-semibold">{profile.name}</h3>
                      </div>
                      <div className="mt-1.5 flex items-center">
                        <Badge
                          variant="secondary"
                          className="rounded-full px-2 py-0.5 text-xs font-semibold text-primary"
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
                        <Badge
                          className={cn(
                            "editing rounded-md bg-chart-3/10 px-2.5 py-1.5 text-chart-3",
                            TYPOGRAPHY.badge,
                          )}
                        >
                          {t("profiles.badges.editing")}
                        </Badge>
                      ) : isAppliedProfile ? (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "active rounded-md px-2.5 py-1.5 text-chart-2",
                            TYPOGRAPHY.badge,
                          )}
                        >
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
                          <span className="inline-flex shrink-0 items-center text-xs leading-none font-bold text-muted-foreground uppercase after:ml-0.5 after:font-bold after:text-border after:content-[':']">
                            {t("profiles.summary.modelTitle")}
                          </span>
                          <div
                            data-slot="profile-model-summary-value"
                            className="flex min-w-0 flex-wrap items-center gap-1.5"
                          >
                            <span className="min-w-0 max-w-full truncate">{model}</span>
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
                          <span className="inline-flex shrink-0 items-center text-xs leading-none font-bold text-muted-foreground uppercase after:ml-0.5 after:font-bold after:text-border after:content-[':']">
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
                                "shrink-0 border-l border-border/70 pl-1.5 text-xs leading-none whitespace-nowrap",
                                sandboxEnabled
                                  ? "text-chart-2"
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
                          <span className="inline-flex shrink-0 items-center text-xs leading-none font-bold text-muted-foreground uppercase after:ml-0.5 after:font-bold after:text-border after:content-[':']">
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

                  {settingsMismatch ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto w-full justify-start gap-2 border-chart-3/50 bg-chart-3/10 px-2.5 py-2 text-left font-semibold text-chart-3 hover:bg-chart-3/15 hover:text-chart-3"
                      title={t("profiles.mismatch.tooltip")}
                      onClick={(event) => {
                        event.stopPropagation();
                        setIsSettingsMismatchDialogOpen(true);
                      }}
                    >
                      <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 truncate">{t("profiles.mismatch.button")}</span>
                      <span
                        aria-hidden="true"
                        className="min-w-0 flex-1 truncate text-xs font-normal text-muted-foreground"
                      >
                        {t("profiles.mismatch.inlineHint")}
                      </span>
                    </Button>
                  ) : null}

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
                      <Variable aria-hidden="true" />
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
                      <Copy aria-hidden="true" />
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
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {isDrawerOpen && (
        <Sheet open onOpenChange={(open) => !open && requestEditorExit(closeDrawer)}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className={cn(
              LIST_DETAIL_DRAWER_OFFSET_CLASS,
              "w-auto border-l-0 bg-secondary p-0 shadow-floating sm:max-w-none",
            )}
          >
            <SheetTitle className="sr-only">{t("profiles.title")}</SheetTitle>
            <SheetDescription className="sr-only">{t("profiles.title")}</SheetDescription>
            <ProfileEditor
              key={editingProfile?.id ?? "new-profile"}
              ref={profileEditorRef}
              profile={editingProfile}
              presets={allPresets}
              onSave={handleSave}
              onClose={() => requestEditorExit(closeDrawer)}
            />
          </SheetContent>
        </Sheet>
      )}

      {pendingEditorExitAction && (
        <UnsavedChangesAlertDialog
          canSave={profileEditorRef.current?.canSave() ?? false}
          isSaving={isSavingEditorExit}
          onCancel={() => setPendingEditorExitAction(null)}
          onDiscard={discardAndRunPendingEditorExit}
          onSaveAndExit={() => {
            void saveAndRunPendingEditorExit();
          }}
        />
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

      <Dialog
        open={isSettingsMismatchDialogOpen && !!activeSettingsMismatch}
        onOpenChange={setIsSettingsMismatchDialogOpen}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t("profiles.mismatch.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("profiles.mismatch.dialogDescription").replace(
                "{sourcePath}",
                activeSettingsMismatch?.sourcePath ?? "settings.json",
              )}
            </DialogDescription>
          </DialogHeader>

          {activeSettingsMismatch ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className={cn(TYPOGRAPHY.fieldLabel, "text-foreground")}>
                    {t("profiles.mismatch.diffSummaryTitle")}
                  </span>
                  <Badge variant="secondary" className="rounded-full">
                    {t("profiles.mismatch.diffCount").replace(
                      "{count}",
                      String(settingsMismatchDiffs.length),
                    )}
                  </Badge>
                </div>
                {visibleSettingsMismatchDiffs.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {visibleSettingsMismatchDiffs.map((diff) => (
                      <Badge
                        key={`${diff.status}:${diff.path}`}
                        variant="outline"
                        className="max-w-full gap-1 rounded-md bg-background"
                      >
                        <span className="shrink-0 text-muted-foreground">
                          {t(settingsDiffStatusLabels[diff.status])}
                        </span>
                        <span className="min-w-0 truncate font-mono">{diff.path}</span>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="m-0 text-sm text-muted-foreground">
                    {t("profiles.mismatch.noDiffSummary")}
                  </p>
                )}
              </div>

              {settingsDiffOldFile && settingsDiffNewFile ? (
                <div
                  data-slot="settings-mismatch-diff"
                  className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
                >
                  <MultiFileDiff
                    oldFile={settingsDiffOldFile}
                    newFile={settingsDiffNewFile}
                    options={settingsDiffOptions}
                    style={settingsDiffStyle}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => void handleMismatchDiscardChanges()}>
              {t("profiles.mismatch.discardChanges")}
            </Button>
            <Button onClick={() => void handleMismatchAcceptActual()}>
              {t("profiles.mismatch.acceptActual")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ProfilesPage;
