export type SettingsFieldKind = "text" | "select" | "checkbox";
export type SettingsFieldStorage = "top-level" | "top-level-or-env" | "env-only";

export interface SettingsFieldOption {
  value: string;
  label: {
    zh: string;
    en: string;
  };
}

export interface SettingsFieldDefinition {
  key: string;
  section: "behavior";
  kind: SettingsFieldKind;
  storage?: SettingsFieldStorage;
  envKey?: string;
  defaultValue?: string;
  envOnlyOptions?: string[];
  label: {
    zh: string;
    en: string;
  };
  placeholder?: {
    zh: string;
    en: string;
  };
  description?: {
    zh: string;
    en: string;
  };
  options?: SettingsFieldOption[];
}

export const PROFILE_SETTINGS_FORM_REGISTRY: SettingsFieldDefinition[] = [
  {
    key: "model",
    section: "behavior",
    kind: "text",
    storage: "env-only",
    envKey: "ANTHROPIC_MODEL",
    label: {
      zh: "模型",
      en: "Model",
    },
    placeholder: {
      zh: "例如：claude-sonnet-4-6",
      en: "e.g. claude-sonnet-4-6",
    },
  },
  {
    key: "effortLevel",
    section: "behavior",
    kind: "select",
    storage: "env-only",
    envKey: "CLAUDE_CODE_EFFORT_LEVEL",
    defaultValue: "auto",
    label: {
      zh: "努力级别",
      en: "Effort Level",
    },
    options: [
      {
        value: "auto",
        label: {
          zh: "auto",
          en: "auto",
        },
      },
      {
        value: "low",
        label: {
          zh: "low",
          en: "low",
        },
      },
      {
        value: "medium",
        label: {
          zh: "medium",
          en: "medium",
        },
      },
      {
        value: "high",
        label: {
          zh: "high",
          en: "high",
        },
      },
      {
        value: "xhigh",
        label: {
          zh: "xhigh",
          en: "xhigh",
        },
      },
      {
        value: "max",
        label: {
          zh: "max",
          en: "max",
        },
      },
    ],
  },
  {
    key: "defaultOpusModel",
    section: "behavior",
    kind: "text",
    storage: "env-only",
    envKey: "ANTHROPIC_DEFAULT_OPUS_MODEL",
    label: {
      zh: "Opus 默认模型",
      en: "Opus Default Model",
    },
    placeholder: {
      zh: "例如：claude-opus-4-1",
      en: "e.g. claude-opus-4-1",
    },
  },
  {
    key: "defaultSonnetModel",
    section: "behavior",
    kind: "text",
    storage: "env-only",
    envKey: "ANTHROPIC_DEFAULT_SONNET_MODEL",
    label: {
      zh: "Sonnet 默认模型",
      en: "Sonnet Default Model",
    },
    placeholder: {
      zh: "例如：claude-sonnet-4-6",
      en: "e.g. claude-sonnet-4-6",
    },
  },
  {
    key: "defaultHaikuModel",
    section: "behavior",
    kind: "text",
    storage: "env-only",
    envKey: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    label: {
      zh: "Haiku 默认模型",
      en: "Haiku Default Model",
    },
    placeholder: {
      zh: "例如：claude-haiku-4-5",
      en: "e.g. claude-haiku-4-5",
    },
  },
  {
    key: "subagentModel",
    section: "behavior",
    kind: "text",
    storage: "env-only",
    envKey: "CLAUDE_CODE_SUBAGENT_MODEL",
    label: {
      zh: "Subagent 模型",
      en: "Subagent Model",
    },
    placeholder: {
      zh: "例如：claude-sonnet-4-6",
      en: "e.g. claude-sonnet-4-6",
    },
  },
  {
    key: "language",
    section: "behavior",
    kind: "select",
    label: {
      zh: "回复语言",
      en: "Language",
    },
    options: [
      {
        value: "english",
        label: {
          zh: "English",
          en: "English",
        },
      },
      {
        value: "chinese",
        label: {
          zh: "中文 (Chinese)",
          en: "中文 (Chinese)",
        },
      },
      {
        value: "japanese",
        label: {
          zh: "日本語 (Japanese)",
          en: "日本語 (Japanese)",
        },
      },
      {
        value: "korean",
        label: {
          zh: "한국어 (Korean)",
          en: "한국어 (Korean)",
        },
      },
      {
        value: "spanish",
        label: {
          zh: "Español (Spanish)",
          en: "Español (Spanish)",
        },
      },
      {
        value: "french",
        label: {
          zh: "Français (French)",
          en: "Français (French)",
        },
      },
      {
        value: "german",
        label: {
          zh: "Deutsch (German)",
          en: "Deutsch (German)",
        },
      },
      {
        value: "portuguese",
        label: {
          zh: "Português (Portuguese)",
          en: "Português (Portuguese)",
        },
      },
      {
        value: "russian",
        label: {
          zh: "Русский (Russian)",
          en: "Русский (Russian)",
        },
      },
      {
        value: "arabic",
        label: {
          zh: "العربية (Arabic)",
          en: "العربية (Arabic)",
        },
      },
      {
        value: "italian",
        label: {
          zh: "Italiano (Italian)",
          en: "Italiano (Italian)",
        },
      },
    ],
  },
  {
    key: "alwaysThinkingEnabled",
    section: "behavior",
    kind: "checkbox",
    label: {
      zh: "默认开启 alwaysThinkingEnabled",
      en: "Enable alwaysThinkingEnabled",
    },
  },
  {
    key: "skipWebFetchPreflight",
    section: "behavior",
    kind: "checkbox",
    label: {
      zh: "跳过 WebFetch 预检",
      en: "Skip WebFetch preflight",
    },
  },
  {
    key: "prefersReducedMotion",
    section: "behavior",
    kind: "checkbox",
    label: {
      zh: "降低动画",
      en: "Reduced motion",
    },
  },
  {
    key: "respectGitignore",
    section: "behavior",
    kind: "checkbox",
    label: {
      zh: "尊重 .gitignore",
      en: "Respect .gitignore",
    },
  },
];

export const BEHAVIOR_TOP_LEVEL_SETTINGS_KEYS = PROFILE_SETTINGS_FORM_REGISTRY.filter(
  (field) => field.storage !== "env-only",
).map((field) => field.key);

export const BEHAVIOR_ENV_SETTINGS_KEYS = PROFILE_SETTINGS_FORM_REGISTRY.flatMap((field) =>
  field.envKey ? [field.envKey] : [],
);

export const BEHAVIOR_JSON_ALLOWED_KEYS = [...BEHAVIOR_TOP_LEVEL_SETTINGS_KEYS, "env"];

export const STRUCTURED_SETTINGS_KEYS = new Set([
  ...BEHAVIOR_TOP_LEVEL_SETTINGS_KEYS,
  "env",
  "permissions",
  "sandbox",
  "hooks",
  "enabledPlugins",
  "extraKnownMarketplaces",
]);
