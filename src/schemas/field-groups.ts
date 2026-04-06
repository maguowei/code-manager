import type { ClaudeConfigFormData } from "./config-schema";
import type { TranslationKey } from "../i18n";

export type FieldInputType = "text" | "password" | "checkbox" | "select" | "combobox" | "url";

export interface FieldConfig {
  name: keyof ClaudeConfigFormData;
  labelKey: TranslationKey;
  descriptionKey?: TranslationKey;
  placeholderKey?: TranslationKey;
  inputType: FieldInputType;
  required?: boolean;
  options?: { value: string; labelKey: TranslationKey }[];
}

export interface FieldGroup {
  id: string;
  labelKey: TranslationKey;
  collapsible: boolean;
  fields: FieldConfig[];
}

// 注意：apiUrl / websiteUrl / model 系列（model/haikuModel/sonnetModel/opusModel）/
// preferredLanguage / enableExtraMarketplaces / useDefaults / providerId / enabledPlugins
// 使用 ConfigEditor 中的自定义渲染逻辑，不在此处声明。
export const FIELD_GROUPS: FieldGroup[] = [
  {
    id: "basic",
    labelKey: "configEditor.section.basic",
    collapsible: false,
    fields: [
      {
        name: "name",
        labelKey: "configModal.name",
        placeholderKey: "configModal.namePlaceholder",
        inputType: "text",
        required: true,
      },
      {
        name: "description",
        labelKey: "configModal.description",
        placeholderKey: "configModal.descriptionPlaceholder",
        inputType: "text",
      },
      {
        name: "apiKey",
        labelKey: "configModal.apiKey",
        placeholderKey: "configModal.apiKeyPlaceholder",
        inputType: "password",
        required: true,
      },
    ],
  },
  {
    id: "advanced",
    labelKey: "configEditor.section.advanced",
    collapsible: true,
    fields: [
      {
        name: "hasCompletedOnboarding",
        labelKey: "configModal.hasCompletedOnboarding",
        descriptionKey: "configModal.hasCompletedOnboardingDesc",
        inputType: "checkbox",
      },
      {
        name: "alwaysThinkingEnabled",
        labelKey: "configModal.alwaysThinking",
        inputType: "checkbox",
      },
      {
        name: "disableNonessentialTraffic",
        labelKey: "configModal.disableTraffic",
        inputType: "checkbox",
      },
      {
        name: "skipWebFetchPreflight",
        labelKey: "configModal.skipWebFetchPreflight",
        inputType: "checkbox",
      },
      {
        name: "enableLspTool",
        labelKey: "configModal.enableLspTool",
        inputType: "checkbox",
      },
      {
        name: "agentTeamsEnabled",
        labelKey: "configModal.enableAgentTeams",
        descriptionKey: "configModal.enableAgentTeamsDesc",
        inputType: "checkbox",
      },
    ],
  },
];
