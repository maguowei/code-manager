import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import {
  buildStringListError,
  createRowId,
  PERMISSION_MODE_OPTIONS,
  readObject,
  rowsFromStringArray,
  type StringRow,
  stringArrayFromRows,
} from "./editor-utils";
import StringListEditor from "./StringListEditor";

interface PermissionsEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
}

function PermissionsEditor({ value, onChange, onError }: PermissionsEditorProps) {
  const { language } = useI18n();
  const isZh = language === "zh";
  const permissionObject = useMemo(() => readObject(value), [value]);
  const [defaultMode, setDefaultMode] = useState(
    typeof permissionObject.defaultMode === "string" ? permissionObject.defaultMode : "",
  );
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
    setDefaultMode(
      typeof permissionObject.defaultMode === "string" ? permissionObject.defaultMode : "",
    );
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
      allow: buildStringListError(allowRows, isZh ? "允许规则" : "Allow rules", isZh, {
        unique: true,
      }),
      deny: buildStringListError(denyRows, isZh ? "拒绝规则" : "Deny rules", isZh, {
        unique: true,
      }),
      ask: buildStringListError(askRows, isZh ? "询问规则" : "Ask rules", isZh, { unique: true }),
      additionalDirectories: buildStringListError(
        directoryRows,
        isZh ? "附加目录" : "Additional directories",
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
      <div className="profile-subsection-header">
        <div>
          <h4>{isZh ? "权限规则" : "Permission Rules"}</h4>
          <p>
            {isZh
              ? "用规则构建器快速维护权限配置。"
              : "Use the rule builder for quick permission edits."}
          </p>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="permissions-default-mode">{isZh ? "默认模式" : "Default Mode"}</label>
          <select
            id="permissions-default-mode"
            className="form-select"
            value={defaultMode}
            onChange={(event) => setDefaultMode(event.target.value)}
          >
            <option value="">{isZh ? "未设置" : "Unset"}</option>
            {PERMISSION_MODE_OPTIONS.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="profile-toggle-item">
        <input
          type="checkbox"
          checked={disableBypass}
          onChange={(event) => setDisableBypass(event.target.checked)}
        />
        <span>{isZh ? "禁用 bypassPermissions 模式" : "Disable bypassPermissions mode"}</span>
      </label>

      <div className="profile-section-grid">
        <StringListEditor
          label={isZh ? "允许规则" : "Allow Rules"}
          rows={allowRows}
          onChange={setAllowRows}
          onAdd={() => addRow(setAllowRows)}
          addLabel={isZh ? "新增允许规则" : "Add allow rule"}
          itemLabelPrefix={isZh ? "允许规则" : "Allow Rule"}
          placeholder={isZh ? "例如：Bash(git status:*)" : "e.g. Bash(git status:*)"}
          emptyHint={isZh ? "对这些工具调用直接放行。" : "These rules are always allowed."}
        />

        <StringListEditor
          label={isZh ? "拒绝规则" : "Deny Rules"}
          rows={denyRows}
          onChange={setDenyRows}
          onAdd={() => addRow(setDenyRows)}
          addLabel={isZh ? "新增拒绝规则" : "Add deny rule"}
          itemLabelPrefix={isZh ? "拒绝规则" : "Deny Rule"}
          placeholder={isZh ? "例如：Read(.env)" : "e.g. Read(.env)"}
          emptyHint={isZh ? "这些规则会被直接拦截。" : "These rules are always denied."}
        />

        <StringListEditor
          label={isZh ? "询问规则" : "Ask Rules"}
          rows={askRows}
          onChange={setAskRows}
          onAdd={() => addRow(setAskRows)}
          addLabel={isZh ? "新增询问规则" : "Add ask rule"}
          itemLabelPrefix={isZh ? "询问规则" : "Ask Rule"}
          placeholder={isZh ? "例如：Bash(git commit:*)" : "e.g. Bash(git commit:*)"}
          emptyHint={isZh ? "这些规则每次都要求确认。" : "These rules always require confirmation."}
        />

        <StringListEditor
          label={isZh ? "附加目录" : "Additional Directories"}
          rows={directoryRows}
          onChange={setDirectoryRows}
          onAdd={() => addRow(setDirectoryRows)}
          addLabel={isZh ? "新增附加目录" : "Add directory"}
          itemLabelPrefix={isZh ? "附加目录" : "Additional Directory"}
          placeholder={isZh ? "例如：~/projects/shared" : "e.g. ~/projects/shared"}
          emptyHint={
            isZh
              ? "把额外目录纳入 Claude 的权限作用域。"
              : "Include extra directories in Claude's permission scope."
          }
        />
      </div>
    </div>
  );
}

export default PermissionsEditor;
