import type { ClaudeConfigFormData } from "../schemas/config-schema";

interface ConfigEditorDefaultConfig {
  name: string;
  description: string;
  apiKey: string;
  baseUrl?: string;
  websiteUrl?: string;
  model?: string;
  haikuModel?: string;
  sonnetModel?: string;
  opusModel?: string;
  effortLevel?: "auto" | "low" | "medium" | "high" | "xhigh" | "max";
  alwaysThinkingEnabled?: boolean;
  disableNonessentialTraffic?: boolean;
  skipWebFetchPreflight?: boolean;
  enableLspTool?: boolean;
  fullscreenRenderingEnabled?: boolean;
  interactiveInitEnabled?: boolean;
  agentTeamsEnabled?: boolean;
  enableExtraMarketplaces?: boolean;
  hasCompletedOnboarding?: boolean;
  preferredLanguage?: string;
  useDefaults?: boolean;
  enabledPlugins?: Record<string, boolean>;
  providerId?: string;
  extraFields?: Record<string, unknown>;
}

interface ConfigEditorDefaultProvider {
  id: string;
  baseUrl: string;
}

function readLegacyEnvToggleValue(
  extraFields?: Record<string, unknown>,
  envKey?: string,
): boolean | undefined {
  const env = extraFields?.env;
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return undefined;
  }

  if (!envKey || !(envKey in env)) {
    return undefined;
  }

  return (env as Record<string, unknown>)[envKey] === "1";
}

/** 构造配置编辑器的初始表单值 */
export function buildConfigEditorDefaultValues(
  config: ConfigEditorDefaultConfig | null,
  defaultLang: string,
  providers: ConfigEditorDefaultProvider[] = [],
): Partial<ClaudeConfigFormData> {
  const isNewConfig = config === null;
  const providerBaseUrl = config?.providerId
    ? providers.find((provider) => provider.id === config.providerId)?.baseUrl
    : undefined;
  const legacyFullscreenRenderingEnabled = readLegacyEnvToggleValue(
    config?.extraFields,
    "CLAUDE_CODE_NO_FLICKER",
  );
  const legacyInteractiveInitEnabled = readLegacyEnvToggleValue(
    config?.extraFields,
    "CLAUDE_CODE_NEW_INIT",
  );

  return {
    name: config?.name ?? "",
    description: config?.description ?? "",
    apiKey: config?.apiKey ?? "",
    baseUrl: config?.baseUrl ?? providerBaseUrl ?? "",
    websiteUrl: config?.websiteUrl ?? "",
    model: config?.model ?? "",
    haikuModel: config?.haikuModel ?? "",
    sonnetModel: config?.sonnetModel ?? "",
    opusModel: config?.opusModel ?? "",
    effortLevel: config?.effortLevel ?? "",
    alwaysThinkingEnabled: config?.alwaysThinkingEnabled ?? isNewConfig,
    disableNonessentialTraffic: config?.disableNonessentialTraffic ?? isNewConfig,
    skipWebFetchPreflight: config?.skipWebFetchPreflight ?? isNewConfig,
    enableLspTool: config?.enableLspTool ?? isNewConfig,
    fullscreenRenderingEnabled:
      config?.fullscreenRenderingEnabled ?? legacyFullscreenRenderingEnabled ?? isNewConfig,
    interactiveInitEnabled:
      config?.interactiveInitEnabled ?? legacyInteractiveInitEnabled ?? isNewConfig,
    agentTeamsEnabled: config?.agentTeamsEnabled ?? false,
    hasCompletedOnboarding: config?.hasCompletedOnboarding ?? isNewConfig,
    enableExtraMarketplaces: config?.enableExtraMarketplaces ?? false,
    preferredLanguage: config?.preferredLanguage ?? defaultLang,
    useDefaults: config?.useDefaults ?? false,
    providerId: config?.providerId ?? "",
    enabledPlugins: config?.enabledPlugins,
  };
}
