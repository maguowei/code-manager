import { z } from "zod";

const urlField = z
  .string()
  .refine(
    (v) => !v || v.startsWith("http://") || v.startsWith("https://"),
    { message: "configEditor.validation.invalidUrl" }
  )
  .optional();

export const ClaudeConfigSchema = z.object({
  name: z.string().min(1, "configEditor.validation.nameRequired"),
  description: z.string().default(""),
  apiKey: z.string().min(1, "configEditor.validation.apiKeyRequired"),
  apiUrl: urlField,
  websiteUrl: urlField,
  model: z.string().optional(),
  haikuModel: z.string().optional(),
  sonnetModel: z.string().optional(),
  opusModel: z.string().optional(),
  alwaysThinkingEnabled: z.boolean().default(false),
  disableNonessentialTraffic: z.boolean().default(false),
  skipWebFetchPreflight: z.boolean().default(false),
  enableLspTool: z.boolean().default(false),
  agentTeamsEnabled: z.boolean().default(false),
  hasCompletedOnboarding: z.boolean().default(false),
  enableExtraMarketplaces: z.boolean().default(false),
  preferredLanguage: z.string().default("english"),
  useDefaults: z.boolean().default(false),
  providerId: z.string().optional(),
  enabledPlugins: z.record(z.string(), z.boolean()).optional(),
});

export type ClaudeConfigFormData = z.infer<typeof ClaudeConfigSchema>;
