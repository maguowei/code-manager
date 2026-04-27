import { openUrl } from "@tauri-apps/plugin-opener";
import { type ReactNode, useCallback, useState } from "react";
import { useI18n } from "../../i18n";
import { ExternalLinkIcon } from "../Icons";
import BehaviorFieldHeader from "./BehaviorFieldHeader";
import DocumentEditorSection from "./DocumentEditorSection";
import EnabledPluginsEditor from "./EnabledPluginsEditor";
import EnvEditor from "./EnvEditor";
import { readObject } from "./editor-utils";
import FieldHelpButton from "./FieldHelpButton";
import HooksEditor from "./HooksEditor";
import MarketplaceEditor from "./MarketplaceEditor";
import { OFFICIAL_MARKETPLACE_ID } from "./marketplace-presets";
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
import type { StructuredSettingsSectionState } from "./useStructuredSettingsSectionState";
import "./editor-shared.css";

type StructuredSettingsScope = "profiles" | "presets";
type DocsLocale = "zh-CN" | "en";
type StructuredSettingsDocsKey =
  | "env"
  | "permissions"
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

interface BehaviorFieldState {
  mappedToEnv: boolean;
  value: string;
}

const CLAUDE_CODE_DOCS_BASE_URL = "https://code.claude.com/docs";
const STRUCTURED_SETTINGS_DOCS_PATHS: Record<StructuredSettingsDocsKey, string> = {
  env: "env-vars",
  permissions: "permissions",
  hooks: "hooks",
  marketplaces: "plugin-marketplaces",
  plugins: "discover-plugins",
  statusLine: "statusline",
};

interface StructuredSettingsSectionsProps {
  scope: StructuredSettingsScope;
  settings: Record<string, unknown>;
  supportedKeys: string[];
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
  behaviorFooter?: ReactNode;
}

function StructuredSettingsSections({
  scope,
  settings,
  supportedKeys,
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
  behaviorFooter,
}: StructuredSettingsSectionsProps) {
  const { language, t } = useI18n();
  const [officialPluginAction, setOfficialPluginAction] = useState<ReactNode>(null);
  const isProfileScope = scope === "profiles";
  const officialMarketplaceEnabled = Object.keys(
    readObject(settings.extraKnownMarketplaces),
  ).includes(OFFICIAL_MARKETPLACE_ID);
  const enabledCommonToggleCount = commonToggleFields.filter((field) =>
    readToggleFieldEnabled(field),
  ).length;
  const docsLocale: DocsLocale = language === "zh" ? "zh-CN" : "en";
  const handleOfficialPluginActionChange = useCallback((action: ReactNode | null) => {
    setOfficialPluginAction(action);
  }, []);
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
        supportedKeysLabel: t("profiles.editor.hints.expertStructuredKeys"),
      }
    : {
        behavior: t("presets.editor.sections.behavior"),
        common: t("presets.editor.sections.common"),
        environment: t("presets.editor.sections.environment"),
        permissions: t("presets.editor.sections.permissions"),
        sandbox: t("presets.editor.sections.sandbox"),
        hooks: t("presets.editor.sections.hooks"),
        marketplaces: t("presets.editor.sections.marketplaces"),
        plugins: t("presets.editor.sections.plugins"),
        statusLine: t("presets.editor.sections.statusLine"),
        document: t("presets.editor.sections.preview"),
        behaviorJsonHint: t("presets.editor.hints.behaviorJson"),
        commonJsonHint: t("presets.editor.hints.commonJson"),
        editModeLabel: t("common.editJsonMode"),
        editHint: t("presets.editor.hints.expert"),
        supportedKeysLabel: t("presets.editor.hints.expertStructuredKeys"),
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
      <button
        type="button"
        className="profile-icon-btn profile-section-doc-link"
        aria-label={label}
        title={label}
        onClick={() => {
          void openUrl(getSectionDocsUrl(docsKey));
        }}
      >
        <ExternalLinkIcon size={15} />
      </button>
    );
  }

  function renderSectionHeaderControl(
    docsKey: StructuredSettingsDocsKey,
    sectionTitle: string,
    extraControl?: ReactNode,
  ) {
    return (
      <div className="profile-section-header-actions">
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
                className="form-row"
              >
                {row.map((field) => {
                  const label = field.label[language];
                  const fieldState = readBehaviorFieldState(field);
                  if (field.kind === "select") {
                    const options = resolveSelectOptions(
                      field,
                      fieldState.value,
                      fieldState.mappedToEnv,
                    );
                    return (
                      <div key={field.key} className="form-group">
                        <BehaviorFieldHeader
                          label={label}
                          inputId={`${scope}-field-${field.key}`}
                          helperKey={getFieldHelperKey(field)}
                        />
                        <select
                          id={`${scope}-field-${field.key}`}
                          className="form-select"
                          value={fieldState.value}
                          onChange={(event) =>
                            onMappedFieldChange(field, event.target.value, fieldState.mappedToEnv)
                          }
                        >
                          {options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label[language]}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  return (
                    <div key={field.key} className="form-group">
                      <BehaviorFieldHeader
                        label={label}
                        inputId={`${scope}-field-${field.key}`}
                        helperKey={getFieldHelperKey(field)}
                      />
                      <input
                        id={`${scope}-field-${field.key}`}
                        value={fieldState.value}
                        placeholder={field.placeholder ? field.placeholder[language] : ""}
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
                className="profile-toggle-grid"
              >
                {row.map((field) => (
                  <label key={field.key} className="profile-toggle-item">
                    <input
                      type="checkbox"
                      checked={settings[field.key] === true}
                      onChange={(event) => onSimpleFieldChange(field, event.target.checked)}
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
        headerControl={behaviorHeaderControl}
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
                className="form-row"
              >
                {row.map((field) => {
                  const label = field.label[language];
                  const description = field.description?.[language];
                  const value = readSimpleFieldValue(field);
                  const inputId = `${scope}-field-${field.key}`;

                  if (field.kind === "select") {
                    const options = resolveSelectOptions(field, value, false);

                    return (
                      <div key={field.key} className="form-group">
                        <BehaviorFieldHeader
                          label={label}
                          inputId={inputId}
                          helperKey={getFieldHelperKey(field)}
                        />
                        <select
                          id={inputId}
                          className="form-select"
                          value={value}
                          onChange={(event) => onSimpleFieldChange(field, event.target.value)}
                        >
                          {options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label[language]}
                            </option>
                          ))}
                        </select>
                        {description ? <p className="form-hint">{description}</p> : null}
                      </div>
                    );
                  }

                  return (
                    <div key={field.key} className="form-group">
                      <BehaviorFieldHeader
                        label={label}
                        inputId={inputId}
                        helperKey={getFieldHelperKey(field)}
                      />
                      <input
                        id={inputId}
                        value={value}
                        placeholder={field.placeholder ? field.placeholder[language] : ""}
                        onChange={(event) => onSimpleFieldChange(field, event.target.value)}
                      />
                      {description ? <p className="form-hint">{description}</p> : null}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="profile-common-option-list">
              {commonToggleFields.map((field) => {
                const label = field.label[language];
                const description = field.description?.[language];
                const enabled = readToggleFieldEnabled(field);
                const helperKey = getFieldHelperKey(field);

                return (
                  <div key={field.key} className="profile-common-option-item">
                    <div className="profile-common-option-copy">
                      <div className="profile-common-option-title-row">
                        <span className="profile-common-option-title">{label}</span>
                        <FieldHelpButton helperKey={helperKey} />
                      </div>
                      {description ? (
                        <p className="profile-common-option-description">{description}</p>
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
      />

      <SettingsSectionModePanel
        title={messages.environment}
        variant="accordion"
        mode={sectionState.sectionModes.env}
        onModeChange={(mode) => sectionState.handleSectionModeChange("env", mode)}
        controls={
          <EnvEditor
            value={settings.env}
            onChange={(value) => onStructuredObjectChange("env", value)}
            onError={(message) => sectionState.setSectionError("env", message)}
            showTitle={false}
            hiddenKeys={[...hiddenEnvKeys]}
          />
        }
        jsonEditor={envJsonEditor}
        jsonHint={t("common.sectionJsonHint")}
        error={sectionState.editorErrors.env || envJsonEditor.jsonError}
        expanded={sectionState.environmentExpanded}
        onToggleExpanded={sectionState.toggleEnvironmentExpanded}
        headerMeta={visibleEnvCount}
        headerControl={renderSectionHeaderControl("env", messages.environment)}
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
        headerControl={renderSectionHeaderControl(
          "permissions",
          messages.permissions,
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
          />,
        )}
      />

      <SettingsSectionModePanel
        title={messages.sandbox}
        variant="accordion"
        mode={sectionState.sectionModes.sandbox}
        onModeChange={(mode) => sectionState.handleSectionModeChange("sandbox", mode)}
        controls={
          <SandboxEditor
            value={settings.sandbox}
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
        headerControl={renderSectionHeaderControl("hooks", messages.hooks)}
      />

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
        error={sectionState.editorErrors.extraKnownMarketplaces || marketplacesJsonEditor.jsonError}
        expanded={sectionState.activeAccordionSection === "marketplaces"}
        onToggleExpanded={() => sectionState.toggleAccordionSection("marketplaces")}
        headerControl={renderSectionHeaderControl("marketplaces", messages.marketplaces)}
      />

      <SettingsSectionModePanel
        title={messages.plugins}
        variant="accordion"
        mode={sectionState.sectionModes.plugins}
        onModeChange={(mode) => sectionState.handleSectionModeChange("plugins", mode)}
        modeRowAction={officialPluginAction}
        controls={
          <EnabledPluginsEditor
            value={settings.enabledPlugins}
            onChange={(value) => onStructuredObjectChange("enabledPlugins", value)}
            onError={(message) => sectionState.setSectionError("enabledPlugins", message)}
            showTitle={false}
            officialMarketplaceEnabled={officialMarketplaceEnabled}
            showOfficialToolbar={false}
            onOfficialActionChange={handleOfficialPluginActionChange}
          />
        }
        jsonEditor={pluginsJsonEditor}
        jsonHint={t("common.sectionJsonHint")}
        error={sectionState.editorErrors.enabledPlugins || pluginsJsonEditor.jsonError}
        expanded={sectionState.activeAccordionSection === "plugins"}
        onToggleExpanded={() => sectionState.toggleAccordionSection("plugins")}
        headerMeta={`${t("common.pluginsEnabledSummaryLabel")} ${enabledPluginsSummary.enabledCount}/${enabledPluginsSummary.totalCount}`}
        headerControl={renderSectionHeaderControl("plugins", messages.plugins)}
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
        headerControl={renderSectionHeaderControl("statusLine", messages.statusLine)}
      />

      <DocumentEditorSection
        title={messages.document}
        previewContent={previewContent}
        previewError={previewError}
        editContent={documentJsonEditor.rawJson}
        editError={documentJsonEditor.jsonError || documentError}
        hasAppliedDraft={documentJsonEditor.hasAppliedDraft}
        onEditChange={documentJsonEditor.handleJsonChange}
        onFormat={documentJsonEditor.formatJson}
        previewModeLabel={t("common.previewMode")}
        editModeLabel={messages.editModeLabel}
        editHint={messages.editHint}
        supportedKeys={supportedKeys}
        supportedKeysLabel={messages.supportedKeysLabel}
      />
    </>
  );
}

export default StructuredSettingsSections;
