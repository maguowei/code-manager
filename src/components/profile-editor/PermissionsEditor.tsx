import { open } from "@tauri-apps/plugin-dialog";
import { ArrowRightLeft, FolderOpen, Info } from "lucide-react";
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../i18n";
import ConfirmAlertDialog from "../ConfirmAlertDialog";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
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

interface PermissionsEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
}

type PermissionRuleListKey = "allow" | "ask" | "deny";
const UNSET_PERMISSION_MODE_VALUE = "__unset__";
const MANAGED_PERMISSION_KEYS = [
  "defaultMode",
  "disableBypassPermissionsMode",
  "allow",
  "deny",
  "ask",
  "additionalDirectories",
] as const;
const PERMISSION_LIST_KEYS = ["allow", "deny", "ask", "additionalDirectories"] as const;
const LOOSE_MODE_PERMISSION_RULES = [
  "Bash(kill *)",
  "Bash(env)",
  "Bash(printenv *)",
  "Bash(cp *)",
  "Bash(mv *)",
  "Bash(open *)",
  "Bash(git commit *)",
  "Bash(git pull *)",
  "Bash(git checkout *)",
  "Bash(git stash *)",
  "Bash(sed -i*)",
  "Bash(find * -exec*)",
  "Bash(go run *)",
  "Bash(go get *)",
  "Bash(go install *)",
  "Bash(go generate *)",
  "Bash(go mod tidy *)",
  "Bash(cargo run *)",
  "Bash(cargo install *)",
  "Bash(cargo update *)",
  "Bash(rustup *)",
  "Bash(npm *)",
  "Bash(yarn *)",
  "Bash(npx *)",
  "Bash(curl *)",
  "Bash(wget *)",
  "Bash(pip *)",
  "Bash(python -m pip *)",
  "Bash(python *)",
  "Bash(python3 *)",
  "Bash(uv *)",
  "Bash(pnpm install *)",
  "Bash(pnpm add *)",
  "Bash(pnpm remove *)",
  "Bash(pnpm update *)",
  "Bash(pnpm dlx *)",
  "Bash(pnpm exec *)",
  "Bash(pnpm approve-builds *)",
  "Bash(bun install *)",
  "Bash(bun add *)",
  "Bash(bun remove *)",
  "Bash(bunx *)",
  "Bash(make install *)",
] as const;
const LOOSE_MODE_PERMISSION_RULE_SET = new Set<string>(LOOSE_MODE_PERMISSION_RULES);

type PermissionListKey = (typeof PERMISSION_LIST_KEYS)[number];

interface PermissionsDraftValue {
  defaultMode: string;
  disableBypass: boolean;
  allowRows: StringRow[];
  denyRows: StringRow[];
  askRows: StringRow[];
  directoryRows: StringRow[];
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

function normalizePermissionStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function normalizePermissionList(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  key: PermissionListKey,
) {
  const normalized = normalizePermissionStringArray(source[key]);
  if (normalized.length > 0) {
    target[key] = normalized;
  } else {
    delete target[key];
  }
}

function normalizePermissionsValue(value: unknown): Record<string, unknown> {
  const source = readObject(value);
  const normalized = { ...source };

  if (typeof source.defaultMode === "string" && source.defaultMode) {
    normalized.defaultMode = source.defaultMode;
  } else {
    delete normalized.defaultMode;
  }

  if (source.disableBypassPermissionsMode === "disable") {
    normalized.disableBypassPermissionsMode = "disable";
  } else {
    delete normalized.disableBypassPermissionsMode;
  }

  for (const key of PERMISSION_LIST_KEYS) {
    normalizePermissionList(normalized, source, key);
  }

  return normalized;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = sortJsonValue((value as Record<string, unknown>)[key]);
      return accumulator;
    }, {});
}

function permissionsValueEquals(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(sortJsonValue(normalizePermissionsValue(left))) ===
    JSON.stringify(sortJsonValue(normalizePermissionsValue(right)))
  );
}

function setPermissionListFromRows(
  target: Record<string, unknown>,
  key: PermissionListKey,
  rows: StringRow[],
) {
  const values = stringArrayFromRows(rows);
  if (values.length > 0) {
    target[key] = values;
  }
}

function hasLooseModeRule(rows: StringRow[]): boolean {
  return rows.some((row) => LOOSE_MODE_PERMISSION_RULE_SET.has(row.value.trim()));
}

function isLooseModeEnabled(allowRows: StringRow[], askRows: StringRow[]): boolean {
  return hasLooseModeRule(allowRows) && !hasLooseModeRule(askRows);
}

function appendMissingRows(targetRows: StringRow[], rowsToAppend: StringRow[]): StringRow[] {
  const existingValues = new Set(targetRows.map((row) => row.value.trim()));
  const nextRows = [...targetRows];

  for (const row of rowsToAppend) {
    const normalizedValue = row.value.trim();
    if (!existingValues.has(normalizedValue)) {
      existingValues.add(normalizedValue);
      nextRows.push({
        id: createRowId("permission"),
        value: row.value,
      });
    }
  }

  return nextRows;
}

function buildPermissionsValue(
  permissionObject: Record<string, unknown>,
  draft: PermissionsDraftValue,
): Record<string, unknown> {
  const nextValue = { ...permissionObject };
  for (const key of MANAGED_PERMISSION_KEYS) {
    delete nextValue[key];
  }

  if (draft.defaultMode) {
    nextValue.defaultMode = draft.defaultMode;
  }
  if (draft.disableBypass) {
    nextValue.disableBypassPermissionsMode = "disable";
  }
  setPermissionListFromRows(nextValue, "allow", draft.allowRows);
  setPermissionListFromRows(nextValue, "deny", draft.denyRows);
  setPermissionListFromRows(nextValue, "ask", draft.askRows);
  setPermissionListFromRows(nextValue, "additionalDirectories", draft.directoryRows);

  return nextValue;
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
    <Select
      value={value || UNSET_PERMISSION_MODE_VALUE}
      onValueChange={(nextValue) =>
        onChange(nextValue === UNSET_PERMISSION_MODE_VALUE ? "" : nextValue)
      }
    >
      <SelectTrigger
        id={selectId}
        aria-label={ariaLabel}
        value={value}
        data-value={value}
        onChange={(event) => onChange((event.target as HTMLButtonElement).value)}
        className={
          variant === "header"
            ? "w-[min(168px,36vw)] min-w-[132px] max-w-[168px] bg-card text-sm font-semibold max-[900px]:w-[min(150px,34vw)] max-[900px]:min-w-[120px] max-[900px]:max-w-[150px]"
            : "w-full"
        }
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={UNSET_PERMISSION_MODE_VALUE}>
            {t("profileEditor.permissions.unset")}
          </SelectItem>
          {modeOptions.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {mode}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );

  if (variant === "header") {
    return (
      <div className="inline-flex min-w-0 items-center gap-2.5 max-[900px]:gap-2">
        <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-muted-foreground">
          {label}
        </span>
        {select}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
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
  const looseModeEnabled = isLooseModeEnabled(allowRows, askRows);

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

    const nextValue = buildPermissionsValue(permissionObject, {
      defaultMode,
      disableBypass,
      allowRows,
      denyRows,
      askRows,
      directoryRows,
    });
    if (!permissionsValueEquals(nextValue, value)) {
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
    permissionObject,
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
    } catch (error) {
      showOperationError(showToast, t("profileEditor.permissions.directorySelectError"), error);
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

  function movePermissionRule(
    row: StringRow,
    setSourceRows: Dispatch<SetStateAction<StringRow[]>>,
    setTargetRows: Dispatch<SetStateAction<StringRow[]>>,
    setTargetExpanded: Dispatch<SetStateAction<boolean>>,
  ) {
    const normalizedValue = row.value.trim();
    setTargetExpanded(true);
    setSourceRows((current) => current.filter((candidate) => candidate.id !== row.id));
    setTargetRows((current) => {
      if (current.some((candidate) => candidate.value.trim() === normalizedValue)) {
        return current;
      }

      return [
        ...current,
        {
          id: createRowId("permission"),
          value: row.value,
        },
      ];
    });
  }

  function handleToggleLooseMode() {
    const movingRows = looseModeEnabled
      ? allowRows.filter((row) => LOOSE_MODE_PERMISSION_RULE_SET.has(row.value.trim()))
      : askRows.filter((row) => LOOSE_MODE_PERMISSION_RULE_SET.has(row.value.trim()));

    if (movingRows.length === 0) {
      return;
    }

    setAllowExpanded(true);
    setAskExpanded(true);

    if (looseModeEnabled) {
      setAllowRows((current) =>
        current.filter((row) => !LOOSE_MODE_PERMISSION_RULE_SET.has(row.value.trim())),
      );
      setAskRows((current) => appendMissingRows(current, movingRows));
      return;
    }

    setAskRows((current) =>
      current.filter((row) => !LOOSE_MODE_PERMISSION_RULE_SET.has(row.value.trim())),
    );
    setAllowRows((current) => appendMissingRows(current, movingRows));
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
    <div className="flex flex-col gap-4">
      <div className="mb-1.5 flex items-center justify-between gap-3.5 max-[900px]:flex-col max-[900px]:items-stretch">
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-3.5 self-start max-[900px]:justify-between">
          <div className="flex min-w-0 items-center justify-start gap-3.5">
            <span className="min-w-0 text-[15px] font-bold leading-snug text-foreground">
              {t("profileEditor.permissions.disableBypass")}
            </span>
            <SandboxSwitchControl
              enabled={disableBypass}
              ariaLabel={t("profileEditor.permissions.disableBypass")}
              variant="header"
              onToggle={() => setDisableBypass(!disableBypass)}
            />
          </div>
          <SandboxSwitchControl
            enabled={looseModeEnabled}
            ariaLabel={t("profileEditor.permissions.looseMode")}
            variant="header"
            visibleLabel={t("profileEditor.permissions.looseMode")}
            onToggle={handleToggleLooseMode}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="inline-flex size-6 items-center justify-center rounded-full border border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  aria-label={t("profileEditor.permissions.looseModeHelpLabel")}
                  data-tooltip={t("profileEditor.permissions.looseModeHelp")}
                  title={t("profileEditor.permissions.looseModeHelp")}
                >
                  <Info className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6} className="max-w-[300px] text-balance">
                {t("profileEditor.permissions.looseModeHelp")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <Button
          type="button"
          variant="outline"
          className=""
          onClick={() => setRecommendedDialogOpen(true)}
        >
          {t("profileEditor.permissions.loadRecommendedRules")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
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
          rowActions={[
            {
              label: t("profileEditor.permissions.moveToAsk"),
              icon: <ArrowRightLeft className="size-4" aria-hidden="true" />,
              onClick: (row) => movePermissionRule(row, setAllowRows, setAskRows, setAskExpanded),
              buildAriaLabel: (itemLabel) =>
                `${t("profileEditor.permissions.moveToAsk")} ${itemLabel}`,
            },
          ]}
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
          rowActions={[
            {
              label: t("profileEditor.permissions.moveToAllow"),
              icon: <ArrowRightLeft className="size-4" aria-hidden="true" />,
              onClick: (row) => movePermissionRule(row, setAskRows, setAllowRows, setAllowExpanded),
              buildAriaLabel: (itemLabel) =>
                `${t("profileEditor.permissions.moveToAllow")} ${itemLabel}`,
            },
          ]}
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
          rowActionIcon={<FolderOpen className="size-4" aria-hidden="true" />}
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
        <ConfirmAlertDialog
          title={t("profileEditor.permissions.loadRecommendedDialogTitle")}
          message={t("profileEditor.permissions.loadRecommendedDialogMessage")}
          confirmText={t("profileEditor.permissions.loadRecommendedDialogConfirm")}
          cancelText={t("profileEditor.common.cancel")}
          onConfirm={handleLoadRecommendedRules}
          onCancel={() => setRecommendedDialogOpen(false)}
        />
      ) : null}

      {clearRulesDialog ? (
        <ConfirmAlertDialog
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
