import type { ClaudeConfigFormData } from "./config-schema";

export type FieldInputType = "text" | "password" | "checkbox" | "select" | "combobox" | "url";

export interface FieldConfig {
  name: keyof ClaudeConfigFormData;
  labelKey: string;
  descriptionKey?: string;
  placeholderKey?: string;
  inputType: FieldInputType;
  options?: { value: string; labelKey: string }[];
}

export interface FieldGroup {
  id: string;
  labelKey: string;
  collapsible: boolean;
  fields: FieldConfig[];
}

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
