import { useI18n } from "../../i18n";
import BehaviorFieldHeader from "./BehaviorFieldHeader";
import DocumentEditorSection from "./DocumentEditorSection";
import EnabledPluginsEditor from "./EnabledPluginsEditor";
import EnvEditor from "./EnvEditor";
import HooksEditor from "./HooksEditor";
import MarketplaceEditor from "./MarketplaceEditor";
import PermissionsEditor, {
  PermissionDefaultModeSelect,
  setPermissionsDefaultMode,
} from "./PermissionsEditor";
import SandboxEditor, { SandboxSwitchControl, setSandboxEnabled } from "./SandboxEditor";
import SettingsSectionModePanel, { type SectionJsonEditorState } from "./SettingsSectionModePanel";
import type { SettingsFieldDefinition, SettingsFieldOption } from "./settings-form-registry";
import type { StructuredSettingsSectionState } from "./useStructuredSettingsSectionState";
import "./editor-shared.css";

type StructuredSettingsScope = "profiles" | "presets";
type StructuredObjectKey =
  | "env"
  | "permissions"
  | "sandbox"
  | "hooks"
  | "extraKnownMarketplaces"
  | "enabledPlugins";

interface BehaviorFieldState {
  mappedToEnv: boolean;
  value: string;
}

interface StructuredSettingsSectionsProps {
  scope: StructuredSettingsScope;
  settings: Record<string, unknown>;
  supportedKeys: string[];
  previewContent: string;
  previewError?: string;
  hiddenAuthEnvKeys: readonly string[];
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
  toggleFieldRows: SettingsFieldDefinition[][];
  readBehaviorFieldState: (field: SettingsFieldDefinition) => BehaviorFieldState;
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
  envJsonEditor: SectionJsonEditorState;
  permissionsJsonEditor: SectionJsonEditorState;
  sandboxJsonEditor: SectionJsonEditorState;
  hooksJsonEditor: SectionJsonEditorState;
  marketplacesJsonEditor: SectionJsonEditorState;
  pluginsJsonEditor: SectionJsonEditorState;
}

function StructuredSettingsSections({
  scope,
  settings,
  supportedKeys,
  previewContent,
  previewError,
  hiddenAuthEnvKeys,
  visibleEnvCount,
  marketplaceCount,
  permissionsDefaultMode,
  hooksTypeCount,
  sandboxPresentation,
  enabledPluginsSummary,
  scalarFieldRows,
  toggleFieldRows,
  readBehaviorFieldState,
  resolveSelectOptions,
  onMappedFieldChange,
  onSimpleFieldChange,
  onStructuredObjectChange,
  sectionState,
  documentJsonEditor,
  behaviorJsonEditor,
  envJsonEditor,
  permissionsJsonEditor,
  sandboxJsonEditor,
  hooksJsonEditor,
  marketplacesJsonEditor,
  pluginsJsonEditor,
}: StructuredSettingsSectionsProps) {
  const { language, t } = useI18n();
  const isProfileScope = scope === "profiles";
  const messages = isProfileScope
    ? {
        behavior: t("profiles.editor.sections.behavior"),
        environment: t("profiles.editor.sections.environment"),
        permissions: t("profiles.editor.sections.permissions"),
        sandbox: t("profiles.editor.sections.sandbox"),
        hooks: t("profiles.editor.sections.hooks"),
        marketplaces: t("profiles.editor.sections.marketplaces"),
        plugins: t("profiles.editor.sections.plugins"),
        document: t("profiles.editor.sections.preview"),
        behaviorJsonHint: t("profiles.editor.hints.behaviorJson"),
        editModeLabel: t("profiles.editor.modes.editSourceJson"),
        editHint: t("profiles.editor.hints.expert"),
        supportedKeysLabel: t("profiles.editor.hints.expertStructuredKeys"),
      }
    : {
        behavior: t("presets.editor.sections.behavior"),
        environment: t("presets.editor.sections.environment"),
        permissions: t("presets.editor.sections.permissions"),
        sandbox: t("presets.editor.sections.sandbox"),
        hooks: t("presets.editor.sections.hooks"),
        marketplaces: t("presets.editor.sections.marketplaces"),
        plugins: t("presets.editor.sections.plugins"),
        document: t("presets.editor.sections.preview"),
        behaviorJsonHint: t("presets.editor.hints.behaviorJson"),
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
    sectionState.editorErrors.env;

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
                          envKey={field.envKey}
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
                        envKey={field.envKey}
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

            {toggleFieldRows.map((row) => (
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
            hiddenKeys={[...hiddenAuthEnvKeys]}
          />
        }
        jsonEditor={envJsonEditor}
        jsonHint={t("common.sectionJsonHint")}
        error={sectionState.editorErrors.env || envJsonEditor.jsonError}
        expanded={sectionState.environmentExpanded}
        onToggleExpanded={sectionState.toggleEnvironmentExpanded}
        badgeCount={visibleEnvCount}
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
        badgeCount={hooksTypeCount}
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
      />

      <SettingsSectionModePanel
        title={messages.marketplaces}
        variant="accordion"
        badgeCount={marketplaceCount}
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
      />

      <SettingsSectionModePanel
        title={messages.plugins}
        variant="accordion"
        mode={sectionState.sectionModes.plugins}
        onModeChange={(mode) => sectionState.handleSectionModeChange("plugins", mode)}
        controls={
          <EnabledPluginsEditor
            value={settings.enabledPlugins}
            onChange={(value) => onStructuredObjectChange("enabledPlugins", value)}
            onError={(message) => sectionState.setSectionError("enabledPlugins", message)}
            showTitle={false}
          />
        }
        jsonEditor={pluginsJsonEditor}
        jsonHint={t("common.sectionJsonHint")}
        error={sectionState.editorErrors.enabledPlugins || pluginsJsonEditor.jsonError}
        expanded={sectionState.activeAccordionSection === "plugins"}
        onToggleExpanded={() => sectionState.toggleAccordionSection("plugins")}
        headerMeta={`${t("common.pluginsEnabledSummaryLabel")} ${enabledPluginsSummary.enabledCount}/${enabledPluginsSummary.totalCount}`}
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
