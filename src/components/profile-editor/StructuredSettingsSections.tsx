import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n";
import { EDITOR_CONTROL_SURFACE_CLASS } from "../editor-layout";
import { TYPOGRAPHY } from "../typography-classes";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import AutoCompactWindowField from "./AutoCompactWindowField";
import BehaviorFieldHeader from "./BehaviorFieldHeader";
import DocumentEditorSection from "./DocumentEditorSection";
import EffortLevelField from "./EffortLevelField";
import EnabledPluginsEditor from "./EnabledPluginsEditor";
import EnvEditor from "./EnvEditor";
import FieldDocsLinkButton from "./FieldDocsLinkButton";
import FieldHelpButton from "./FieldHelpButton";
import HooksEditor from "./HooksEditor";
import MarketplaceEditor from "./MarketplaceEditor";
import PermissionsEditor, {
  PermissionDefaultModeSelect,
  setPermissionsDefaultMode,
} from "./PermissionsEditor";
import SandboxEditor, { SandboxSwitchControl, setSandboxEnabled } from "./SandboxEditor";
import SettingsSectionModePanel, { type SectionJsonEditorState } from "./SettingsSectionModePanel";
import StatusLineEditor from "./StatusLineEditor";
import {
  getFieldHelperKey,
  type SettingsFieldDefinition,
  type SettingsFieldOption,
} from "./settings-form-registry";
import type { MarketplaceSourceInput } from "./useMarketplaceCatalog";
import type { StructuredSettingsSectionState } from "./useStructuredSettingsSectionState";

type StructuredSettingsScope = "profiles" | "providers";
type DocsLocale = "zh-CN" | "en";
type StructuredSettingsDocsKey =
  | "behavior"
  | "common"
  | "env"
  | "permissions"
  | "sandbox"
  | "hooks"
  | "marketplaces"
  | "plugins"
  | "statusLine";
type StructuredObjectKey =
  | "env"
  | "permissions"
  | "sandbox"
  | "hooks"
  | "extraKnownMarketplaces"
  | "enabledPlugins"
  | "statusLine";
const EMPTY_SELECT_VALUE = "__empty__";

interface BehaviorFieldState {
  mappedToEnv: boolean;
  /** 用户的显式覆盖值（可能为空） */
  value: string;
  /** provider 提供的继承默认值 */
  providerDefault: string;
  /** 最终生效值 = value || providerDefault */
  effectiveValue: string;
  /** 值来源：用户覆盖 / 继承自供应商 / 未设置 */
  source: "override" | "inherited" | "unset";
}

const CLAUDE_CODE_DOCS_BASE_URL = "https://code.claude.com/docs";
const STRUCTURED_SETTINGS_DOCS_PATHS: Record<StructuredSettingsDocsKey, string> = {
  behavior: "model-config",
  common: "settings",
  env: "env-vars",
  permissions: "permissions",
  sandbox: "sandboxing",
  hooks: "hooks",
  marketplaces: "plugin-marketplaces",
  plugins: "discover-plugins",
  statusLine: "statusline",
};

interface StructuredSettingsSectionsProps {
  scope: StructuredSettingsScope;
  settings: Record<string, unknown>;
  previewContent: string;
  previewError?: string;
  hiddenEnvKeys: readonly string[];
  visibleEnvCount: number;
  marketplaceCount: number;
  permissionsDefaultMode: string;
  hooksTypeCount: number;
  sandboxPresentation: {
    enabled: boolean;
    headerSummary: string;
  };
  enabledPluginsSummary: {
    enabledCount: number;
    totalCount: number;
  };
  scalarFieldRows: SettingsFieldDefinition[][];
  behaviorToggleFieldRows: SettingsFieldDefinition[][];
  commonScalarFieldRows: SettingsFieldDefinition[][];
  commonToggleFields: SettingsFieldDefinition[];
  readBehaviorFieldState: (field: SettingsFieldDefinition) => BehaviorFieldState;
  readSimpleFieldValue: (field: SettingsFieldDefinition) => string;
  readToggleFieldEnabled: (field: SettingsFieldDefinition) => boolean;
  resolveSelectOptions: (
    field: SettingsFieldDefinition,
    currentValue: string,
    mappedToEnv: boolean,
  ) => SettingsFieldOption[];
  onMappedFieldChange: (
    field: SettingsFieldDefinition,
    value: string,
    mappedToEnv: boolean,
  ) => void;
  onSimpleFieldChange: (field: SettingsFieldDefinition, value: string | boolean) => void;
  onStructuredObjectChange: (key: StructuredObjectKey, value: Record<string, unknown>) => void;
  sectionState: StructuredSettingsSectionState;
  documentJsonEditor: SectionJsonEditorState;
  behaviorJsonEditor: SectionJsonEditorState;
  commonJsonEditor: SectionJsonEditorState;
  envJsonEditor: SectionJsonEditorState;
  permissionsJsonEditor: SectionJsonEditorState;
  sandboxJsonEditor: SectionJsonEditorState;
  hooksJsonEditor: SectionJsonEditorState;
  marketplacesJsonEditor: SectionJsonEditorState;
  pluginsJsonEditor: SectionJsonEditorState;
  statusLineJsonEditor: SectionJsonEditorState;
  behaviorHeaderControl?: ReactNode;
  behaviorTopAction?: ReactNode;
  behaviorFooter?: ReactNode;
  marketplaceSources?: MarketplaceSourceInput[];
}

function StructuredSettingsSections({
  scope,
  settings,
  previewContent,
  previewError,
  hiddenEnvKeys,
  visibleEnvCount,
  marketplaceCount,
  permissionsDefaultMode,
  hooksTypeCount,
  sandboxPresentation,
  enabledPluginsSummary,
  scalarFieldRows,
  behaviorToggleFieldRows,
  commonScalarFieldRows,
  commonToggleFields,
  readBehaviorFieldState,
  readSimpleFieldValue,
  readToggleFieldEnabled,
  resolveSelectOptions,
  onMappedFieldChange,
  onSimpleFieldChange,
  onStructuredObjectChange,
  sectionState,
  documentJsonEditor,
  behaviorJsonEditor,
  commonJsonEditor,
  envJsonEditor,
  permissionsJsonEditor,
  sandboxJsonEditor,
  hooksJsonEditor,
  marketplacesJsonEditor,
  pluginsJsonEditor,
  statusLineJsonEditor,
  behaviorHeaderControl,
  behaviorTopAction,
  behaviorFooter,
  marketplaceSources,
}: StructuredSettingsSectionsProps) {
  const { language, t } = useI18n();
  const isProfileScope = scope === "profiles";

  // 高级配置跳转：滚动到插件市场配置分区并短暂高亮，增强辨识度
  const marketplaceSectionRef = useRef<HTMLDivElement | null>(null);
  const [highlightMarketplace, setHighlightMarketplace] = useState(false);
  const highlightTimerRef = useRef<number | null>(null);
  // 引导查看合并后的完整配置：滚动到底部「配置预览」并短暂高亮
  const documentSectionRef = useRef<HTMLDivElement | null>(null);
  const [highlightDocument, setHighlightDocument] = useState(false);
  const documentHighlightTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      if (documentHighlightTimerRef.current) {
        clearTimeout(documentHighlightTimerRef.current);
      }
    },
    [],
  );

  function openMarketplaceConfig() {
    if (sectionState.activeAccordionSection !== "marketplaces") {
      sectionState.toggleAccordionSection("marketplaces");
    }
    requestAnimationFrame(() => {
      marketplaceSectionRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    });
    setHighlightMarketplace(true);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => setHighlightMarketplace(false), 2000);
  }

  function openMergedPreview() {
    requestAnimationFrame(() => {
      documentSectionRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    });
    setHighlightDocument(true);
    if (documentHighlightTimerRef.current) {
      clearTimeout(documentHighlightTimerRef.current);
    }
    documentHighlightTimerRef.current = window.setTimeout(() => setHighlightDocument(false), 2000);
  }

  // 字段值来源标注:继承自供应商显示徽标,已覆盖且有供应商默认时给出重置入口
  function renderFieldProvenance(
    field: SettingsFieldDefinition,
    fieldState: BehaviorFieldState,
  ): ReactNode {
    if (!fieldState.mappedToEnv) {
      return null;
    }
    if (fieldState.source === "inherited") {
      return (
        <span className={cn("text-muted-foreground", TYPOGRAPHY.auxiliary)}>
          {t("profiles.editor.fieldSource.inherited")}
        </span>
      );
    }
    if (fieldState.source === "override" && fieldState.providerDefault) {
      return (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={cn(
            "h-auto px-1 py-0 font-normal text-muted-foreground hover:text-foreground",
            TYPOGRAPHY.auxiliary,
          )}
          onClick={() => onMappedFieldChange(field, "", fieldState.mappedToEnv)}
        >
          {t("profiles.editor.fieldSource.reset")}
        </Button>
      );
    }
    return null;
  }

  const enabledCommonToggleCount = commonToggleFields.filter((field) =>
    readToggleFieldEnabled(field),
  ).length;
  const docsLocale: DocsLocale = language === "zh" ? "zh-CN" : "en";
  const messages = isProfileScope
    ? {
        behavior: t("profiles.editor.sections.behavior"),
        common: t("profiles.editor.sections.common"),
        environment: t("profiles.editor.sections.environment"),
        permissions: t("profiles.editor.sections.permissions"),
        sandbox: t("profiles.editor.sections.sandbox"),
        hooks: t("profiles.editor.sections.hooks"),
        marketplaces: t("profiles.editor.sections.marketplaces"),
        plugins: t("profiles.editor.sections.plugins"),
        statusLine: t("profiles.editor.sections.statusLine"),
        document: t("profiles.editor.sections.preview"),
        behaviorJsonHint: t("profiles.editor.hints.behaviorJson"),
        commonJsonHint: t("profiles.editor.hints.commonJson"),
        editModeLabel: t("profiles.editor.modes.editSourceJson"),
        editHint: t("profiles.editor.hints.expert"),
        previewHint: t("profiles.editor.hints.previewComposition"),
      }
    : {
        behavior: t("providers.editor.sections.behavior"),
        common: t("providers.editor.sections.common"),
        environment: t("providers.editor.sections.environment"),
        permissions: t("providers.editor.sections.permissions"),
        sandbox: t("providers.editor.sections.sandbox"),
        hooks: t("providers.editor.sections.hooks"),
        marketplaces: t("providers.editor.sections.marketplaces"),
        plugins: t("providers.editor.sections.plugins"),
        statusLine: t("providers.editor.sections.statusLine"),
        document: t("providers.editor.sections.preview"),
        behaviorJsonHint: t("providers.editor.hints.behaviorJson"),
        commonJsonHint: t("providers.editor.hints.commonJson"),
        editModeLabel: t("common.editJsonMode"),
        editHint: t("providers.editor.hints.expert"),
        // 供应商只读场景无两层合并,预览即供应商自身 env,无组成说明
        previewHint: undefined,
      };

  const documentError =
    sectionState.editorErrors.enabledPlugins ||
    sectionState.editorErrors.extraKnownMarketplaces ||
    sectionState.editorErrors.hooks ||
    sectionState.editorErrors.permissions ||
    sectionState.editorErrors.sandbox ||
    sectionState.editorErrors.env ||
    sectionState.editorErrors.statusLine;

  function getSectionDocsUrl(docsKey: StructuredSettingsDocsKey) {
    return `${CLAUDE_CODE_DOCS_BASE_URL}/${docsLocale}/${STRUCTURED_SETTINGS_DOCS_PATHS[docsKey]}`;
  }

  function renderSectionDocsButton(docsKey: StructuredSettingsDocsKey, sectionTitle: string) {
    const label = t("profileEditor.docs.openAriaLabel").replace("{section}", sectionTitle);

    return (
      <Button
        type="button"
        variant="outline"
        className="min-h-[34px] px-3 text-xs font-semibold"
        aria-label={label}
        title={label}
        onClick={() => {
          void openUrl(getSectionDocsUrl(docsKey));
        }}
      >
        <span>{t("profileEditor.docs.openButtonLabel")}</span>
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </Button>
    );
  }

  function renderSectionModeRowAction(
    docsKey: StructuredSettingsDocsKey,
    sectionTitle: string,
    extraControl?: ReactNode,
  ) {
    return (
      <div className="inline-flex min-w-0 flex-wrap items-center gap-2">
        {renderSectionDocsButton(docsKey, sectionTitle)}
        {extraControl}
      </div>
    );
  }

  return (
    <>
      <SettingsSectionModePanel
        title={messages.behavior}
        mode={sectionState.sectionModes.behavior}
        onModeChange={(mode) => sectionState.handleSectionModeChange("behavior", mode)}
        controls={
          <>
            {scalarFieldRows.map((row) => (
              <div
                key={`${scope}-behavior-row-${row.map((field) => field.key).join("-")}`}
                className="grid gap-4 md:grid-cols-2"
              >
                {row.map((field) => {
                  const label = field.label[language];
                  const fieldState = readBehaviorFieldState(field);
                  // 自动压缩窗口用滑块 + 数字输入双控件,独占整行
                  if (field.key === "autoCompactWindow") {
                    return (
                      <div key={field.key} className="grid gap-2" data-slot="settings-field">
                        <BehaviorFieldHeader
                          label={label}
                          inputId={`${scope}-field-${field.key}`}
                          helperKey={getFieldHelperKey(field)}
                          provenance={renderFieldProvenance(field, fieldState)}
                        />
                        <AutoCompactWindowField
                          id={`${scope}-field-${field.key}`}
                          ariaLabel={label}
                          placeholder={field.placeholder ? field.placeholder[language] : ""}
                          value={fieldState.effectiveValue}
                          onChange={(value) =>
                            onMappedFieldChange(field, value, fieldState.mappedToEnv)
                          }
                        />
                      </div>
                    );
                  }
                  if (field.kind === "select") {
                    const options = resolveSelectOptions(
                      field,
                      fieldState.effectiveValue,
                      fieldState.mappedToEnv,
                    );
                    // 努力级别用触发按钮 + 浮窗刻度条展示
                    if (field.key === "effortLevel") {
                      return (
                        <div key={field.key} className="grid gap-2" data-slot="settings-field">
                          <BehaviorFieldHeader
                            label={label}
                            inputId={`${scope}-field-${field.key}`}
                            helperKey={getFieldHelperKey(field)}
                            provenance={renderFieldProvenance(field, fieldState)}
                          />
                          <EffortLevelField
                            id={`${scope}-field-${field.key}`}
                            ariaLabel={label}
                            options={options}
                            value={fieldState.effectiveValue}
                            onChange={(value) =>
                              onMappedFieldChange(field, value, fieldState.mappedToEnv)
                            }
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={field.key} className="grid gap-2" data-slot="settings-field">
                        <BehaviorFieldHeader
                          label={label}
                          inputId={`${scope}-field-${field.key}`}
                          helperKey={getFieldHelperKey(field)}
                          provenance={renderFieldProvenance(field, fieldState)}
                        />
                        <Select
                          value={fieldState.effectiveValue || EMPTY_SELECT_VALUE}
                          onValueChange={(value) =>
                            onMappedFieldChange(
                              field,
                              value === EMPTY_SELECT_VALUE ? "" : value,
                              fieldState.mappedToEnv,
                            )
                          }
                        >
                          <SelectTrigger
                            id={`${scope}-field-${field.key}`}
                            className={cn("w-full", EDITOR_CONTROL_SURFACE_CLASS)}
                            value={fieldState.effectiveValue}
                            data-value={fieldState.effectiveValue}
                            onChange={(event) =>
                              onMappedFieldChange(
                                field,
                                (event.target as HTMLButtonElement).value,
                                fieldState.mappedToEnv,
                              )
                            }
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {options.map((option) => (
                                <SelectItem
                                  key={option.value || EMPTY_SELECT_VALUE}
                                  value={option.value || EMPTY_SELECT_VALUE}
                                >
                                  {option.label[language]}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  }

                  return (
                    <div key={field.key} className="grid gap-2" data-slot="settings-field">
                      <BehaviorFieldHeader
                        label={label}
                        inputId={`${scope}-field-${field.key}`}
                        helperKey={getFieldHelperKey(field)}
                        provenance={renderFieldProvenance(field, fieldState)}
                      />
                      <Input
                        id={`${scope}-field-${field.key}`}
                        className={EDITOR_CONTROL_SURFACE_CLASS}
                        value={fieldState.value}
                        placeholder={
                          fieldState.providerDefault ||
                          (field.placeholder ? field.placeholder[language] : "")
                        }
                        onChange={(event) =>
                          onMappedFieldChange(field, event.target.value, fieldState.mappedToEnv)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            ))}

            {behaviorToggleFieldRows.map((row) => (
              <div
                key={`${scope}-toggle-row-${row.map((field) => field.key).join("-")}`}
                className="grid gap-3 md:grid-cols-2"
              >
                {row.map((field) => (
                  <label
                    key={field.key}
                    className="flex items-center gap-2 rounded-lg border border-border/80 bg-background/60 px-3 py-2 text-sm font-medium text-foreground shadow-xs"
                  >
                    <Checkbox
                      checked={settings[field.key] === true}
                      onCheckedChange={(checked) => onSimpleFieldChange(field, checked === true)}
                    />
                    <span>{field.label[language]}</span>
                  </label>
                ))}
              </div>
            ))}
          </>
        }
        jsonEditor={behaviorJsonEditor}
        jsonHint={messages.behaviorJsonHint}
        error={behaviorJsonEditor.jsonError}
        headerControl={renderSectionDocsButton("behavior", messages.behavior)}
        modeRowAction={
          <div className="inline-flex flex-wrap items-center gap-2">
            {behaviorHeaderControl}
            {behaviorTopAction}
          </div>
        }
        footer={behaviorFooter}
      />

      <SettingsSectionModePanel
        title={messages.common}
        variant="accordion"
        mode={sectionState.sectionModes.common}
        onModeChange={(mode) => sectionState.handleSectionModeChange("common", mode)}
        controls={
          <>
            {commonScalarFieldRows.map((row) => (
              <div
                key={`${scope}-common-row-${row.map((field) => field.key).join("-")}`}
                className="grid gap-4 md:grid-cols-2"
              >
                {row.map((field) => {
                  const label = field.label[language];
                  const description = field.description?.[language];
                  const value = readSimpleFieldValue(field);
                  const inputId = `${scope}-field-${field.key}`;

                  if (field.kind === "select") {
                    const options = resolveSelectOptions(field, value, false);

                    return (
                      <div key={field.key} className="grid gap-2" data-slot="settings-field">
                        <BehaviorFieldHeader
                          label={label}
                          inputId={inputId}
                          helperKey={getFieldHelperKey(field)}
                        />
                        <Select
                          value={value || EMPTY_SELECT_VALUE}
                          onValueChange={(nextValue) =>
                            onSimpleFieldChange(
                              field,
                              nextValue === EMPTY_SELECT_VALUE ? "" : nextValue,
                            )
                          }
                        >
                          <SelectTrigger
                            id={inputId}
                            className={cn("w-full", EDITOR_CONTROL_SURFACE_CLASS)}
                            value={value}
                            data-value={value}
                            onChange={(event) =>
                              onSimpleFieldChange(field, (event.target as HTMLButtonElement).value)
                            }
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {options.map((option) => (
                                <SelectItem
                                  key={option.value || EMPTY_SELECT_VALUE}
                                  value={option.value || EMPTY_SELECT_VALUE}
                                >
                                  {option.label[language]}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        {description ? (
                          <p className="m-0 text-sm text-muted-foreground">{description}</p>
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <div key={field.key} className="grid gap-2" data-slot="settings-field">
                      <BehaviorFieldHeader
                        label={label}
                        inputId={inputId}
                        helperKey={getFieldHelperKey(field)}
                      />
                      <Input
                        id={inputId}
                        className={EDITOR_CONTROL_SURFACE_CLASS}
                        value={value}
                        placeholder={field.placeholder ? field.placeholder[language] : ""}
                        onChange={(event) => onSimpleFieldChange(field, event.target.value)}
                      />
                      {description ? (
                        <p className="m-0 text-sm text-muted-foreground">{description}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="flex flex-col gap-3">
              {commonToggleFields.map((field) => {
                const label = field.label[language];
                const description = field.description?.[language];
                const enabled = readToggleFieldEnabled(field);
                const helperKey = getFieldHelperKey(field);

                return (
                  <div
                    key={field.key}
                    data-slot="common-option"
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-background/60 px-3 py-3 shadow-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{label}</span>
                        <FieldHelpButton helperKey={helperKey} />
                        {field.docPath ? (
                          <FieldDocsLinkButton
                            href={`${CLAUDE_CODE_DOCS_BASE_URL}/${docsLocale}/${field.docPath}`}
                            ariaLabel={t("profileEditor.docs.openFieldAriaLabel").replace(
                              "{label}",
                              label,
                            )}
                          />
                        ) : null}
                      </div>
                      {description ? (
                        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                      ) : null}
                    </div>
                    <SandboxSwitchControl
                      enabled={enabled}
                      ariaLabel={t("profileEditor.commonOptions.switchAriaLabel").replace(
                        "{label}",
                        label,
                      )}
                      onToggle={() => onSimpleFieldChange(field, !enabled)}
                      variant="header"
                    />
                  </div>
                );
              })}
            </div>
          </>
        }
        jsonEditor={commonJsonEditor}
        jsonHint={messages.commonJsonHint}
        error={commonJsonEditor.jsonError}
        expanded={sectionState.commonExpanded}
        onToggleExpanded={sectionState.toggleCommonExpanded}
        headerMeta={`${t("common.pluginsEnabledSummaryLabel")} ${enabledCommonToggleCount}/${commonToggleFields.length}`}
        modeRowAction={renderSectionModeRowAction("common", messages.common)}
      />

      <SettingsSectionModePanel
        title={messages.environment}
        variant="accordion"
        mode={sectionState.sectionModes.env}
        onModeChange={(mode) => sectionState.handleSectionModeChange("env", mode)}
        controls={
          <div className="grid gap-2">
            {isProfileScope ? (
              <p className={cn("text-muted-foreground", TYPOGRAPHY.auxiliary)}>
                {t("profiles.editor.hints.envOverridesOnly")}{" "}
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto p-0 align-baseline font-normal"
                  onClick={openMergedPreview}
                >
                  {t("profiles.editor.hints.viewMergedConfig")}
                </Button>
              </p>
            ) : null}
            <EnvEditor
              value={settings.env}
              onChange={(value) => onStructuredObjectChange("env", value)}
              onError={(message) => sectionState.setSectionError("env", message)}
              showTitle={false}
              hiddenKeys={[...hiddenEnvKeys]}
            />
          </div>
        }
        jsonEditor={envJsonEditor}
        jsonHint={t("common.sectionJsonHint")}
        error={sectionState.editorErrors.env || envJsonEditor.jsonError}
        expanded={sectionState.environmentExpanded}
        onToggleExpanded={sectionState.toggleEnvironmentExpanded}
        headerMeta={visibleEnvCount}
        modeRowAction={renderSectionModeRowAction("env", messages.environment)}
      />

      <SettingsSectionModePanel
        title={messages.permissions}
        variant="accordion"
        mode={sectionState.sectionModes.permissions}
        onModeChange={(mode) => sectionState.handleSectionModeChange("permissions", mode)}
        controls={
          <PermissionsEditor
            value={settings.permissions}
            onChange={(value) => onStructuredObjectChange("permissions", value)}
            onError={(message) => sectionState.setSectionError("permissions", message)}
          />
        }
        jsonEditor={permissionsJsonEditor}
        jsonHint={t("common.sectionJsonHint")}
        error={sectionState.editorErrors.permissions || permissionsJsonEditor.jsonError}
        expanded={sectionState.activeAccordionSection === "permissions"}
        onToggleExpanded={() => sectionState.toggleAccordionSection("permissions")}
        headerControl={
          <PermissionDefaultModeSelect
            variant="header"
            value={permissionsDefaultMode}
            ariaLabel={t("profileEditor.permissions.headerDefaultModeAriaLabel")}
            onChange={(value) =>
              onStructuredObjectChange(
                "permissions",
                setPermissionsDefaultMode(settings.permissions, value),
              )
            }
          />
        }
        modeRowAction={renderSectionModeRowAction("permissions", messages.permissions)}
      />

      <SettingsSectionModePanel
        title={messages.sandbox}
        variant="accordion"
        mode={sectionState.sectionModes.sandbox}
        onModeChange={(mode) => sectionState.handleSectionModeChange("sandbox", mode)}
        controls={
          <SandboxEditor
            value={settings.sandbox}
            onChange={(value) => onStructuredObjectChange("sandbox", value)}
            onError={(message) => sectionState.setSectionError("sandbox", message)}
          />
        }
        jsonEditor={sandboxJsonEditor}
        jsonHint={t("common.sectionJsonHint")}
        error={sectionState.editorErrors.sandbox || sandboxJsonEditor.jsonError}
        expanded={sectionState.activeAccordionSection === "sandbox"}
        onToggleExpanded={() => sectionState.toggleAccordionSection("sandbox")}
        headerMeta={sandboxPresentation.headerSummary}
        headerControl={
          <SandboxSwitchControl
            enabled={sandboxPresentation.enabled}
            ariaLabel={t("profileEditor.sandbox.headerToggleAriaLabel")}
            variant="header"
            visibleLabel={t("profileEditor.sandbox.switchLabel")}
            onToggle={() =>
              onStructuredObjectChange(
                "sandbox",
                setSandboxEnabled(settings.sandbox, !sandboxPresentation.enabled),
              )
            }
          />
        }
        modeRowAction={renderSectionModeRowAction("sandbox", messages.sandbox)}
      />

      <SettingsSectionModePanel
        title={messages.hooks}
        variant="accordion"
        headerMeta={hooksTypeCount}
        mode={sectionState.sectionModes.hooks}
        onModeChange={(mode) => sectionState.handleSectionModeChange("hooks", mode)}
        controls={
          <HooksEditor
            value={settings.hooks}
            onChange={(value) => onStructuredObjectChange("hooks", value)}
            onError={(message) => sectionState.setSectionError("hooks", message)}
          />
        }
        jsonEditor={hooksJsonEditor}
        jsonHint={t("common.sectionJsonHint")}
        error={sectionState.editorErrors.hooks || hooksJsonEditor.jsonError}
        expanded={sectionState.activeAccordionSection === "hooks"}
        onToggleExpanded={() => sectionState.toggleAccordionSection("hooks")}
        modeRowAction={renderSectionModeRowAction("hooks", messages.hooks)}
      />

      <div
        ref={marketplaceSectionRef}
        className={cn(
          "rounded-lg transition-shadow duration-500",
          highlightMarketplace && "ring-[3px] ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <SettingsSectionModePanel
          title={messages.marketplaces}
          variant="accordion"
          headerMeta={marketplaceCount}
          mode={sectionState.sectionModes.marketplaces}
          onModeChange={(mode) => sectionState.handleSectionModeChange("marketplaces", mode)}
          controls={
            <MarketplaceEditor
              value={settings.extraKnownMarketplaces}
              onChange={(value) => onStructuredObjectChange("extraKnownMarketplaces", value)}
              onError={(message) => sectionState.setSectionError("extraKnownMarketplaces", message)}
              showTitle={false}
            />
          }
          jsonEditor={marketplacesJsonEditor}
          jsonHint={t("common.sectionJsonHint")}
          error={
            sectionState.editorErrors.extraKnownMarketplaces || marketplacesJsonEditor.jsonError
          }
          expanded={sectionState.activeAccordionSection === "marketplaces"}
          onToggleExpanded={() => sectionState.toggleAccordionSection("marketplaces")}
          modeRowAction={renderSectionModeRowAction("marketplaces", messages.marketplaces)}
        />
      </div>

      <SettingsSectionModePanel
        title={messages.plugins}
        variant="accordion"
        mode={sectionState.sectionModes.plugins}
        onModeChange={(mode) => sectionState.handleSectionModeChange("plugins", mode)}
        modeRowAction={renderSectionModeRowAction("plugins", messages.plugins)}
        controls={
          <EnabledPluginsEditor
            value={settings.enabledPlugins}
            onChange={(value) => onStructuredObjectChange("enabledPlugins", value)}
            onError={(message) => sectionState.setSectionError("enabledPlugins", message)}
            showTitle={false}
            marketplaceSources={marketplaceSources}
            marketplacesValue={settings.extraKnownMarketplaces}
            onMarketplacesChange={(value) =>
              onStructuredObjectChange("extraKnownMarketplaces", value)
            }
            onOpenMarketplaceConfig={openMarketplaceConfig}
          />
        }
        jsonEditor={pluginsJsonEditor}
        jsonHint={t("common.sectionJsonHint")}
        error={sectionState.editorErrors.enabledPlugins || pluginsJsonEditor.jsonError}
        expanded={sectionState.activeAccordionSection === "plugins"}
        onToggleExpanded={() => sectionState.toggleAccordionSection("plugins")}
        headerMeta={`${t("common.pluginsEnabledSummaryLabel")} ${enabledPluginsSummary.enabledCount}/${enabledPluginsSummary.totalCount}`}
      />

      <SettingsSectionModePanel
        title={messages.statusLine}
        variant="accordion"
        mode={sectionState.sectionModes.statusLine}
        onModeChange={(mode) => sectionState.handleSectionModeChange("statusLine", mode)}
        controls={
          <StatusLineEditor
            value={settings.statusLine}
            onChange={(value) => onStructuredObjectChange("statusLine", value)}
            onError={(message) => sectionState.setSectionError("statusLine", message)}
            showTitle={false}
          />
        }
        jsonEditor={statusLineJsonEditor}
        jsonHint={t("common.sectionJsonHint")}
        error={sectionState.editorErrors.statusLine || statusLineJsonEditor.jsonError}
        expanded={sectionState.activeAccordionSection === "statusLine"}
        onToggleExpanded={() => sectionState.toggleAccordionSection("statusLine")}
        modeRowAction={renderSectionModeRowAction("statusLine", messages.statusLine)}
      />

      <div
        ref={documentSectionRef}
        className={cn(
          "rounded-lg transition-shadow duration-500",
          highlightDocument && "ring-[3px] ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <DocumentEditorSection
          title={messages.document}
          previewContent={previewContent}
          previewError={previewError}
          getEditContent={() => documentJsonEditor.rawJson}
          editError={documentJsonEditor.jsonError || documentError}
          hasAppliedDraft={documentJsonEditor.hasAppliedDraft}
          onEditChange={documentJsonEditor.handleJsonChange}
          onFormat={documentJsonEditor.formatJson}
          onClear={documentJsonEditor.clearJson}
          previewModeLabel={t("common.previewMode")}
          editModeLabel={messages.editModeLabel}
          editHint={messages.editHint}
          previewHint={messages.previewHint}
        />
      </div>
    </>
  );
}

export default StructuredSettingsSections;
