import { z } from "zod";

const urlField = z
  .string()
  .refine((v) => !v || v.startsWith("http://") || v.startsWith("https://"), {
    message: "configEditor.validation.invalidUrl",
  })
  .optional();

export const ClaudeConfigSchema = z.object({
  name: z.string().min(1, "configEditor.validation.nameRequired"),
  description: z.string().default(""),
  apiKey: z.string().min(1, "configEditor.validation.apiKeyRequired"),
  baseUrl: urlField,
  websiteUrl: urlField,
  model: z.string().optional(),
  haikuModel: z.string().optional(),
  sonnetModel: z.string().optional(),
  opusModel: z.string().optional(),
  alwaysThinkingEnabled: z.boolean().default(true),
  disableNonessentialTraffic: z.boolean().default(true),
  skipWebFetchPreflight: z.boolean().default(true),
  enableLspTool: z.boolean().default(true),
  agentTeamsEnabled: z.boolean().default(false),
  hasCompletedOnboarding: z.boolean().default(true),
  enableExtraMarketplaces: z.boolean().default(false),
  preferredLanguage: z.string().default("english"),
  useDefaults: z.boolean().default(false),
  providerId: z.string().optional(),
  enabledPlugins: z.record(z.string(), z.boolean()).optional(),
});

export type ClaudeConfigFormData = z.infer<typeof ClaudeConfigSchema>;
