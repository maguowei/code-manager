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
  section: "behavior" | "common";
  kind: SettingsFieldKind;
  storage?: SettingsFieldStorage;
  envKey?: string;
  helperKey?: string;
  defaultValue?: string;
  defaultEnabled?: boolean;
  enabledValue?: string;
  envOnlyOptions?: string[];
  // 字段官方文档相对路径段，会拼接为 `${CLAUDE_CODE_DOCS_BASE_URL}/${docsLocale}/${docPath}`
  docPath?: string;
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
      zh: "默认模型",
      en: "Default Model",
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
    label: {
      zh: "努力级别",
      en: "Effort Level",
    },
    options: [
      {
        value: "",
        label: {
          zh: "未设置",
          en: "Unset",
        },
      },
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
      {
        value: "ultracode",
        label: {
          zh: "ultracode",
          en: "ultracode",
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
      zh: "留空保持默认行为,除非你了解修改的含义",
      en: "Leave empty to keep default behavior unless you understand the change",
    },
  },
  {
    key: "autoCompactWindow",
    section: "behavior",
    kind: "text",
    storage: "env-only",
    envKey: "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
    label: {
      zh: "自动压缩窗口",
      en: "Auto Compact Window",
    },
    placeholder: {
      zh: "0–1000000，留空使用默认",
      en: "0–1000000, empty for default",
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
    key: "outputStyle",
    section: "behavior",
    kind: "select",
    label: {
      zh: "输出风格",
      en: "Output style",
    },
    description: {
      zh: "结构化编辑仅支持内置风格；如需自定义样式名称，请切换到 JSON 编辑并填写 outputStyle。",
      en: "Structured editing only supports built-in styles. Switch to JSON editing to set a custom outputStyle.",
    },
    options: [
      {
        value: "",
        label: {
          zh: "未设置",
          en: "Unset",
        },
      },
      {
        value: "default",
        label: {
          zh: "default",
          en: "default",
        },
      },
      {
        value: "Explanatory",
        label: {
          zh: "Explanatory",
          en: "Explanatory",
        },
      },
      {
        value: "Learning",
        label: {
          zh: "Learning",
          en: "Learning",
        },
      },
    ],
  },
  {
    key: "alwaysThinkingEnabled",
    section: "common",
    kind: "checkbox",
    defaultEnabled: true,
    label: {
      zh: "默认启用深度思考",
      en: "Enable extended thinking by default",
    },
  },
  {
    key: "showThinkingSummaries",
    section: "common",
    kind: "checkbox",
    label: {
      zh: "显示 Thinking 摘要",
      en: "Show thinking summaries",
    },
    description: {
      zh: "在 transcript 视图中显示 thinking 摘要，便于回看推理过程。",
      en: "Show thinking summaries in the transcript view for easier review of reasoning.",
    },
  },
  {
    key: "showClearContextOnPlanAccept",
    section: "common",
    kind: "checkbox",
    label: {
      zh: "接受计划时显示清理上下文",
      en: "Show clear context on plan accept",
    },
    description: {
      zh: "开启后，接受计划时会在确认弹窗中提供“清理上下文”选项。",
      en: "Show a clear-context option in the confirmation dialog when accepting a plan.",
    },
  },
  {
    key: "disableAllHooks",
    section: "common",
    kind: "checkbox",
    label: {
      zh: "禁用所有 Hooks",
      en: "Disable all hooks",
    },
    description: {
      zh: "禁用全部 hooks 和 statusLine 执行；适合需要完全静默运行的环境。",
      en: "Disable all hooks and statusLine execution for fully quiet environments.",
    },
  },
  {
    key: "attribution",
    section: "common",
    kind: "checkbox",
    label: {
      zh: "禁用 AI 署名",
      en: "Disable AI attribution",
    },
    description: {
      zh: "默认保留 AI 署名；开启后会通过 attribution 禁用提交和 PR 中的 AI 署名。如需自定义署名内容，请切换到 JSON 编辑。",
      en: "AI attribution is enabled by default. Turn this on to disable AI attribution in commits and PRs via attribution. Use JSON editing to customize attribution text.",
    },
  },
  {
    key: "hasCompletedOnboarding",
    section: "common",
    kind: "checkbox",
    defaultEnabled: true,
    label: {
      zh: "已完成引导设置",
      en: "Completed onboarding",
    },
    description: {
      zh: "启用后将在生成的配置中跳过 Claude Code 首次启动时的引导流程。",
      en: "Skip the Claude Code onboarding flow on first launch when enabled.",
    },
  },
  {
    key: "skipWebFetchPreflight",
    section: "common",
    kind: "checkbox",
    defaultEnabled: true,
    label: {
      zh: "跳过 WebFetch 预检",
      en: "Skip WebFetch preflight",
    },
    description: {
      zh: "适用于安全策略严格的企业环境，跳过 WebFetch 的 blocklist 预检。",
      en: "Skip the WebFetch blocklist preflight for restrictive enterprise environments.",
    },
  },
  {
    key: "respectGitignore",
    section: "common",
    kind: "checkbox",
    label: {
      zh: "尊重 .gitignore",
      en: "Respect .gitignore",
    },
    description: {
      zh: "启用后，@ 文件选择器会排除匹配 .gitignore 的文件。",
      en: "Exclude files matching .gitignore patterns from the @ file picker.",
    },
  },
  {
    key: "disableNonessentialTraffic",
    section: "common",
    kind: "checkbox",
    storage: "env-only",
    envKey: "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
    defaultEnabled: true,
    enabledValue: "1",
    label: {
      zh: "禁用非必要网络请求",
      en: "Disable nonessential traffic",
    },
    description: {
      zh: "关闭自动更新、反馈、错误上报和遥测等全部非必要网络请求；如只需关闭自动更新，请使用“禁用自动更新”。",
      en: "Disable auto-updates, feedback, error reporting, telemetry, and all other nonessential traffic. Use Disable auto-updates when only updates should be disabled.",
    },
  },
  {
    key: "disableAutoUpdater",
    section: "common",
    kind: "checkbox",
    storage: "env-only",
    envKey: "DISABLE_AUTOUPDATER",
    enabledValue: "1",
    label: {
      zh: "禁用自动更新",
      en: "Disable auto-updates",
    },
    description: {
      zh: "禁用 Claude Code 后台自动更新；手动运行 claude update 仍可更新。",
      en: "Disable Claude Code background auto-updates. Manual claude update remains available.",
    },
  },
  {
    key: "enableLspTool",
    section: "common",
    kind: "checkbox",
    storage: "env-only",
    envKey: "ENABLE_LSP_TOOL",
    defaultEnabled: true,
    enabledValue: "1",
    label: {
      zh: "启用 LSP 工具",
      en: "Enable LSP tool",
    },
    description: {
      zh: "启用语言服务器协议工具，为 Claude Code 提供跳转定义、引用查找和诊断能力。",
      en: "Enable the LSP tool for definitions, references, and diagnostics in Claude Code.",
    },
  },
  {
    key: "enableToolSearch",
    section: "common",
    kind: "checkbox",
    storage: "env-only",
    envKey: "ENABLE_TOOL_SEARCH",
    enabledValue: "true",
    label: {
      zh: "显式启用 Tool Search",
      en: "Explicitly enable Tool Search",
    },
    description: {
      zh: "在自定义 ANTHROPIC_BASE_URL、Vertex AI 或兼容代理支持 tool_reference 时显式启用 MCP Tool Search。",
      en: "Explicitly enable MCP Tool Search when a custom ANTHROPIC_BASE_URL, Vertex AI, or compatible proxy supports tool_reference.",
    },
  },
  {
    key: "enableNewInit",
    section: "common",
    kind: "checkbox",
    storage: "env-only",
    envKey: "CLAUDE_CODE_NEW_INIT",
    defaultEnabled: true,
    enabledValue: "1",
    label: {
      zh: "启用新版 Init",
      en: "Enable new init",
    },
    description: {
      zh: "启用 Claude Code 的新版初始化流程。",
      en: "Enable the new Claude Code initialization flow.",
    },
  },
  {
    key: "enableNoFlicker",
    section: "common",
    kind: "checkbox",
    storage: "env-only",
    envKey: "CLAUDE_CODE_NO_FLICKER",
    defaultEnabled: true,
    enabledValue: "1",
    docPath: "fullscreen",
    label: {
      zh: "启用无闪烁模式",
      en: "Enable no-flicker mode",
    },
    description: {
      zh: "启用减少界面闪烁的渲染模式。",
      en: "Enable the rendering mode that reduces UI flicker.",
    },
  },
  {
    key: "experimentalAgentTeams",
    section: "common",
    kind: "checkbox",
    storage: "env-only",
    envKey: "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
    enabledValue: "1",
    label: {
      zh: "启用 Agent Teams",
      en: "Enable Agent Teams",
    },
    description: {
      zh: "设置为 1 以启用实验性的 agent teams，默认关闭。",
      en: "Set to 1 to enable experimental agent teams, which are disabled by default.",
    },
  },
];

function topLevelSettingsKeysBySection(section: SettingsFieldDefinition["section"]) {
  return PROFILE_SETTINGS_FORM_REGISTRY.filter(
    (field) => field.section === section && field.storage !== "env-only",
  ).map((field) => field.key);
}

function envSettingsKeysBySection(section: SettingsFieldDefinition["section"]) {
  return PROFILE_SETTINGS_FORM_REGISTRY.flatMap((field) =>
    field.section === section && field.envKey ? [field.envKey] : [],
  );
}

export const BEHAVIOR_TOP_LEVEL_SETTINGS_KEYS = topLevelSettingsKeysBySection("behavior");

export const BEHAVIOR_ENV_SETTINGS_KEYS = envSettingsKeysBySection("behavior");

export const BEHAVIOR_JSON_ALLOWED_KEYS = [...BEHAVIOR_TOP_LEVEL_SETTINGS_KEYS, "env"];

export const COMMON_TOP_LEVEL_SETTINGS_KEYS = topLevelSettingsKeysBySection("common");

export const COMMON_ENV_SETTINGS_KEYS = envSettingsKeysBySection("common");

export const COMMON_JSON_ALLOWED_KEYS = [...COMMON_TOP_LEVEL_SETTINGS_KEYS, "env"];

export function getFieldHelperKey(field: SettingsFieldDefinition): string {
  return field.helperKey ?? field.envKey ?? field.key;
}

export const STRUCTURED_SETTINGS_KEYS = new Set([
  ...BEHAVIOR_TOP_LEVEL_SETTINGS_KEYS,
  ...COMMON_TOP_LEVEL_SETTINGS_KEYS,
  "env",
  "permissions",
  "sandbox",
  "hooks",
  "enabledPlugins",
  "extraKnownMarketplaces",
  "statusLine",
]);
