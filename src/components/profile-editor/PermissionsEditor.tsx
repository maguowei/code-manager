import { open } from "@tauri-apps/plugin-dialog";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../i18n";
import ConfirmDialog from "../ConfirmDialog";
import {
  buildStringListError,
  createRowId,
  PERMISSION_MODE_OPTIONS,
  type PermissionModeOption,
  readObject,
  rowsFromStringArray,
  type StringRow,
  stringArrayFromRows,
  USER_VISIBLE_PERMISSION_MODE_OPTIONS,
} from "./editor-utils";
import { RECOMMENDED_PERMISSION_RULES } from "./permission-presets";
import { SandboxSwitchControl } from "./SandboxEditor";
import StringListEditor from "./StringListEditor";
import "./PermissionsEditor.css";

interface PermissionsEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
}

type PermissionRuleListKey = "allow" | "ask" | "deny";

interface PermissionDefaultModeSelectProps {
  value: string;
  onChange: (nextValue: string) => void;
  selectId?: string;
  ariaLabel?: string;
  variant?: "panel" | "header";
}

export function readPermissionsDefaultMode(value: unknown): string {
  const permissionObject = readObject(value);
  return typeof permissionObject.defaultMode === "string" ? permissionObject.defaultMode : "";
}

export function setPermissionsDefaultMode(
  value: unknown,
  nextValue: string,
): Record<string, unknown> {
  const permissionObject = readObject(value);
  const nextPermissions = { ...permissionObject };

  if (nextValue) {
    nextPermissions.defaultMode = nextValue;
  } else {
    delete nextPermissions.defaultMode;
  }

  return nextPermissions;
}

export function PermissionDefaultModeSelect({
  value,
  onChange,
  selectId,
  ariaLabel,
  variant = "panel",
}: PermissionDefaultModeSelectProps) {
  const { t } = useI18n();
  const label = t("profileEditor.permissions.defaultModeLabel");
  const modeOptions = getPermissionModeSelectOptions(value);

  const select = (
    <select
      id={selectId}
      className={variant === "header" ? "profile-permissions-header-select" : "form-select"}
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{t("profileEditor.permissions.unset")}</option>
      {modeOptions.map((mode) => (
        <option key={mode} value={mode}>
          {mode}
        </option>
      ))}
    </select>
  );

  if (variant === "header") {
    return (
      <div className="profile-permissions-header-field">
        <span className="profile-permissions-header-label">{label}</span>
        {select}
      </div>
    );
  }

  return (
    <div className="form-group">
      <label htmlFor={selectId}>{label}</label>
      {select}
    </div>
  );
}

function getPermissionModeSelectOptions(value: string): readonly string[] {
  if (
    !value ||
    USER_VISIBLE_PERMISSION_MODE_OPTIONS.includes(
      value as (typeof USER_VISIBLE_PERMISSION_MODE_OPTIONS)[number],
    )
  ) {
    return USER_VISIBLE_PERMISSION_MODE_OPTIONS;
  }

  const compatibilityMode = value as PermissionModeOption;
  const compatibilityIndex = PERMISSION_MODE_OPTIONS.indexOf(compatibilityMode);
  if (compatibilityIndex === -1) {
    return USER_VISIBLE_PERMISSION_MODE_OPTIONS;
  }

  const insertIndex = PERMISSION_MODE_OPTIONS.slice(0, compatibilityIndex).filter((mode) =>
    USER_VISIBLE_PERMISSION_MODE_OPTIONS.includes(
      mode as (typeof USER_VISIBLE_PERMISSION_MODE_OPTIONS)[number],
    ),
  ).length;

  return [
    ...USER_VISIBLE_PERMISSION_MODE_OPTIONS.slice(0, insertIndex),
    value,
    ...USER_VISIBLE_PERMISSION_MODE_OPTIONS.slice(insertIndex),
  ];
}

function DirectoryActionIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
    </svg>
  );
}

function PermissionsEditor({ value, onChange, onError }: PermissionsEditorProps) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const isZh = language === "zh";
  const permissionObject = useMemo(() => readObject(value), [value]);
  const [defaultMode, setDefaultMode] = useState(readPermissionsDefaultMode(permissionObject));
  const [disableBypass, setDisableBypass] = useState(
    permissionObject.disableBypassPermissionsMode === "disable",
  );
  const [allowRows, setAllowRows] = useState(
    rowsFromStringArray(
      Array.isArray(permissionObject.allow) ? (permissionObject.allow as string[]) : [],
    ),
  );
  const [denyRows, setDenyRows] = useState(
    rowsFromStringArray(
      Array.isArray(permissionObject.deny) ? (permissionObject.deny as string[]) : [],
    ),
  );
  const [askRows, setAskRows] = useState(
    rowsFromStringArray(
      Array.isArray(permissionObject.ask) ? (permissionObject.ask as string[]) : [],
    ),
  );
  const [directoryRows, setDirectoryRows] = useState(
    rowsFromStringArray(
      Array.isArray(permissionObject.additionalDirectories)
        ? (permissionObject.additionalDirectories as string[])
        : [],
    ),
  );
  const [subErrors, setSubErrors] = useState<Record<string, string>>({});
  const [allowExpanded, setAllowExpanded] = useState(false);
  const [denyExpanded, setDenyExpanded] = useState(false);
  const [askExpanded, setAskExpanded] = useState(false);
  const [directoryExpanded, setDirectoryExpanded] = useState(true);
  const [recommendedDialogOpen, setRecommendedDialogOpen] = useState(false);
  const [clearRulesDialog, setClearRulesDialog] = useState<PermissionRuleListKey | null>(null);
  const skipStructuredSyncRef = useRef(false);

  useEffect(() => {
    skipStructuredSyncRef.current = true;
    setDefaultMode(readPermissionsDefaultMode(permissionObject));
    setDisableBypass(permissionObject.disableBypassPermissionsMode === "disable");
    setAllowRows(
      rowsFromStringArray(
        Array.isArray(permissionObject.allow) ? (permissionObject.allow as string[]) : [],
      ),
    );
    setDenyRows(
      rowsFromStringArray(
        Array.isArray(permissionObject.deny) ? (permissionObject.deny as string[]) : [],
      ),
    );
    setAskRows(
      rowsFromStringArray(
        Array.isArray(permissionObject.ask) ? (permissionObject.ask as string[]) : [],
      ),
    );
    setDirectoryRows(
      rowsFromStringArray(
        Array.isArray(permissionObject.additionalDirectories)
          ? (permissionObject.additionalDirectories as string[])
          : [],
      ),
    );
  }, [permissionObject]);

  useEffect(() => {
    if (skipStructuredSyncRef.current) {
      skipStructuredSyncRef.current = false;
      return;
    }
    const nextErrors = {
      allow: buildStringListError(allowRows, t("profileEditor.permissions.allowRulesLabel"), isZh, {
        unique: true,
      }),
      deny: buildStringListError(denyRows, t("profileEditor.permissions.denyRulesLabel"), isZh, {
        unique: true,
      }),
      ask: buildStringListError(askRows, t("profileEditor.permissions.askRulesLabel"), isZh, {
        unique: true,
      }),
      additionalDirectories: buildStringListError(
        directoryRows,
        t("profileEditor.permissions.additionalDirsLabel"),
        isZh,
        { unique: true },
      ),
    };
    setSubErrors(nextErrors);
    const firstError = Object.values(nextErrors).find(Boolean) ?? "";
    if (firstError) {
      return;
    }

    const nextValue: Record<string, unknown> = {};
    if (defaultMode) {
      nextValue.defaultMode = defaultMode;
    }
    if (disableBypass) {
      nextValue.disableBypassPermissionsMode = "disable";
    }
    if (allowRows.length > 0) {
      nextValue.allow = stringArrayFromRows(allowRows);
    }
    if (denyRows.length > 0) {
      nextValue.deny = stringArrayFromRows(denyRows);
    }
    if (askRows.length > 0) {
      nextValue.ask = stringArrayFromRows(askRows);
    }
    if (directoryRows.length > 0) {
      nextValue.additionalDirectories = stringArrayFromRows(directoryRows);
    }
    if (JSON.stringify(nextValue) !== JSON.stringify(value ?? {})) {
      onChange(nextValue);
    }
  }, [
    allowRows,
    askRows,
    defaultMode,
    denyRows,
    directoryRows,
    disableBypass,
    isZh,
    onChange,
    t,
    value,
  ]);

  const structuredError = Object.values(subErrors).find(Boolean) ?? "";

  useEffect(() => {
    onError(structuredError);
  }, [onError, structuredError]);

  useEffect(() => {
    if (allowRows.length === 0) {
      setAllowExpanded(true);
    }
  }, [allowRows.length]);

  useEffect(() => {
    if (denyRows.length === 0) {
      setDenyExpanded(true);
    }
  }, [denyRows.length]);

  useEffect(() => {
    if (askRows.length === 0) {
      setAskExpanded(true);
    }
  }, [askRows.length]);

  useEffect(() => {
    if (directoryRows.length === 0) {
      setDirectoryExpanded(true);
    }
  }, [directoryRows.length]);

  function addRow(
    setter: Dispatch<SetStateAction<StringRow[]>>,
    setExpanded: Dispatch<SetStateAction<boolean>>,
  ) {
    setExpanded(true);
    setter((current) => [
      ...current,
      {
        id: createRowId("permission"),
        value: "",
      },
    ]);
  }

  async function selectAdditionalDirectory() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("profileEditor.permissions.directorySelectTitle"),
      });

      return typeof selected === "string" ? selected : null;
    } catch {
      showToast(t("profileEditor.permissions.directorySelectError"), "error");
      return null;
    }
  }

  async function handleAddDirectory() {
    setDirectoryExpanded(true);
    const selected = await selectAdditionalDirectory();
    if (!selected) {
      return;
    }

    setDirectoryRows((current) => [
      ...current,
      {
        id: createRowId("permission"),
        value: selected,
      },
    ]);
  }

  async function handleSelectDirectory(row: StringRow) {
    const selected = await selectAdditionalDirectory();
    if (!selected) {
      return;
    }

    setDirectoryRows((current) =>
      current.map((candidate) =>
        candidate.id === row.id
          ? {
              ...candidate,
              value: selected,
            }
          : candidate,
      ),
    );
  }

  function handleLoadRecommendedRules() {
    setAllowRows(rowsFromStringArray([...RECOMMENDED_PERMISSION_RULES.allow]));
    setAskRows(rowsFromStringArray([...RECOMMENDED_PERMISSION_RULES.ask]));
    setDenyRows(rowsFromStringArray([...RECOMMENDED_PERMISSION_RULES.deny]));
    setAllowExpanded(false);
    setAskExpanded(false);
    setDenyExpanded(false);
    setRecommendedDialogOpen(false);
  }

  function handleConfirmClearRules() {
    if (clearRulesDialog === "allow") {
      setAllowRows([]);
      setAllowExpanded(true);
    }
    if (clearRulesDialog === "ask") {
      setAskRows([]);
      setAskExpanded(true);
    }
    if (clearRulesDialog === "deny") {
      setDenyRows([]);
      setDenyExpanded(true);
    }
    setClearRulesDialog(null);
  }

  function getClearRulesDialogTitle() {
    if (clearRulesDialog === "allow") {
      return t("profileEditor.permissions.clearAllow");
    }
    if (clearRulesDialog === "ask") {
      return t("profileEditor.permissions.clearAsk");
    }
    return t("profileEditor.permissions.clearDeny");
  }

  return (
    <div className="profile-section-body">
      <div className="profile-permissions-toolbar">
        <div className="profile-inline-switch-row profile-inline-switch-row-emphasis">
          <span className="profile-inline-switch-title">
            {t("profileEditor.permissions.disableBypass")}
          </span>
          <SandboxSwitchControl
            enabled={disableBypass}
            ariaLabel={t("profileEditor.permissions.disableBypass")}
            variant="header"
            onToggle={() => setDisableBypass(!disableBypass)}
          />
        </div>

        <button
          type="button"
          className="profile-secondary-btn profile-permissions-recommended-btn"
          onClick={() => setRecommendedDialogOpen(true)}
        >
          {t("profileEditor.permissions.loadRecommendedRules")}
        </button>
      </div>

      <div className="profile-section-grid">
        <StringListEditor
          label={t("profileEditor.permissions.allowRulesTitle")}
          rows={allowRows}
          onChange={setAllowRows}
          onAdd={() => addRow(setAllowRows, setAllowExpanded)}
          onClear={() => setClearRulesDialog("allow")}
          addLabel={t("profileEditor.permissions.addAllow")}
          clearLabel={t("profileEditor.permissions.clearAllow")}
          itemLabelPrefix={t("profileEditor.permissions.allowRulePrefix")}
          placeholder={t("profileEditor.permissions.allowPlaceholder")}
          emptyHint={t("profileEditor.permissions.allowEmptyHint")}
          collapsible
          expanded={allowExpanded}
          onToggleExpanded={() => setAllowExpanded((current) => !current)}
          showCollapseToggle={allowRows.length > 0}
        />

        <StringListEditor
          label={t("profileEditor.permissions.denyRulesTitle")}
          rows={denyRows}
          onChange={setDenyRows}
          onAdd={() => addRow(setDenyRows, setDenyExpanded)}
          onClear={() => setClearRulesDialog("deny")}
          addLabel={t("profileEditor.permissions.addDeny")}
          clearLabel={t("profileEditor.permissions.clearDeny")}
          itemLabelPrefix={t("profileEditor.permissions.denyRulePrefix")}
          placeholder={t("profileEditor.permissions.denyPlaceholder")}
          emptyHint={t("profileEditor.permissions.denyEmptyHint")}
          collapsible
          expanded={denyExpanded}
          onToggleExpanded={() => setDenyExpanded((current) => !current)}
          showCollapseToggle={denyRows.length > 0}
        />

        <StringListEditor
          label={t("profileEditor.permissions.askRulesTitle")}
          rows={askRows}
          onChange={setAskRows}
          onAdd={() => addRow(setAskRows, setAskExpanded)}
          onClear={() => setClearRulesDialog("ask")}
          addLabel={t("profileEditor.permissions.addAsk")}
          clearLabel={t("profileEditor.permissions.clearAsk")}
          itemLabelPrefix={t("profileEditor.permissions.askRulePrefix")}
          placeholder={t("profileEditor.permissions.askPlaceholder")}
          emptyHint={t("profileEditor.permissions.askEmptyHint")}
          collapsible
          expanded={askExpanded}
          onToggleExpanded={() => setAskExpanded((current) => !current)}
          showCollapseToggle={askRows.length > 0}
        />

        <StringListEditor
          label={t("profileEditor.permissions.additionalDirsTitle")}
          rows={directoryRows}
          onChange={setDirectoryRows}
          onAdd={handleAddDirectory}
          addLabel={t("profileEditor.permissions.addDirectory")}
          itemLabelPrefix={t("profileEditor.permissions.directoryPrefix")}
          placeholder={t("profileEditor.permissions.directoryPlaceholder")}
          rowActionLabel={t("profileEditor.permissions.selectDirectory")}
          rowActionIcon={<DirectoryActionIcon />}
          onRowAction={handleSelectDirectory}
          buildRowActionAriaLabel={(itemLabel) =>
            `${t("profileEditor.permissions.selectDirectory")} ${itemLabel}`
          }
          emptyHint={t("profileEditor.permissions.directoryEmptyHint")}
          collapsible
          expanded={directoryExpanded}
          onToggleExpanded={() => setDirectoryExpanded((current) => !current)}
          showCollapseToggle={directoryRows.length > 0}
        />
      </div>

      {recommendedDialogOpen ? (
        <ConfirmDialog
          title={t("profileEditor.permissions.loadRecommendedDialogTitle")}
          message={t("profileEditor.permissions.loadRecommendedDialogMessage")}
          confirmText={t("profileEditor.permissions.loadRecommendedDialogConfirm")}
          cancelText={t("profileEditor.common.cancel")}
          onConfirm={handleLoadRecommendedRules}
          onCancel={() => setRecommendedDialogOpen(false)}
        />
      ) : null}

      {clearRulesDialog ? (
        <ConfirmDialog
          title={getClearRulesDialogTitle()}
          message={t("profileEditor.permissions.clearRulesDialogMessage")}
          confirmText={t("profileEditor.permissions.clearRulesDialogConfirm")}
          cancelText={t("profileEditor.common.cancel")}
          onConfirm={handleConfirmClearRules}
          onCancel={() => setClearRulesDialog(null)}
          danger
        />
      ) : null}
    </div>
  );
}

export default PermissionsEditor;
