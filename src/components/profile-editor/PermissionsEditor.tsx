import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
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
import { SandboxSwitchControl } from "./SandboxEditor";
import StringListEditor from "./StringListEditor";
import "./PermissionsEditor.css";

interface PermissionsEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
}

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

function PermissionsEditor({ value, onChange, onError }: PermissionsEditorProps) {
  const { language, t } = useI18n();
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

  function addRow(setter: Dispatch<SetStateAction<StringRow[]>>) {
    setter((current) => [
      ...current,
      {
        id: createRowId("permission"),
        value: "",
      },
    ]);
  }

  return (
    <div className="profile-section-body">
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

      <div className="profile-section-grid">
        <StringListEditor
          label={t("profileEditor.permissions.allowRulesTitle")}
          rows={allowRows}
          onChange={setAllowRows}
          onAdd={() => addRow(setAllowRows)}
          addLabel={t("profileEditor.permissions.addAllow")}
          itemLabelPrefix={t("profileEditor.permissions.allowRulePrefix")}
          placeholder={t("profileEditor.permissions.allowPlaceholder")}
          emptyHint={t("profileEditor.permissions.allowEmptyHint")}
        />

        <StringListEditor
          label={t("profileEditor.permissions.denyRulesTitle")}
          rows={denyRows}
          onChange={setDenyRows}
          onAdd={() => addRow(setDenyRows)}
          addLabel={t("profileEditor.permissions.addDeny")}
          itemLabelPrefix={t("profileEditor.permissions.denyRulePrefix")}
          placeholder={t("profileEditor.permissions.denyPlaceholder")}
          emptyHint={t("profileEditor.permissions.denyEmptyHint")}
        />

        <StringListEditor
          label={t("profileEditor.permissions.askRulesTitle")}
          rows={askRows}
          onChange={setAskRows}
          onAdd={() => addRow(setAskRows)}
          addLabel={t("profileEditor.permissions.addAsk")}
          itemLabelPrefix={t("profileEditor.permissions.askRulePrefix")}
          placeholder={t("profileEditor.permissions.askPlaceholder")}
          emptyHint={t("profileEditor.permissions.askEmptyHint")}
        />

        <StringListEditor
          label={t("profileEditor.permissions.additionalDirsTitle")}
          rows={directoryRows}
          onChange={setDirectoryRows}
          onAdd={() => addRow(setDirectoryRows)}
          addLabel={t("profileEditor.permissions.addDirectory")}
          itemLabelPrefix={t("profileEditor.permissions.directoryPrefix")}
          placeholder={t("profileEditor.permissions.directoryPlaceholder")}
          emptyHint={t("profileEditor.permissions.directoryEmptyHint")}
        />
      </div>
    </div>
  );
}

export default PermissionsEditor;
