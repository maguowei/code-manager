import { createContext, useContext, useState, useCallback, useEffect, ReactNode, createElement } from "react";

export type Language = "zh" | "en";
export type Theme = "light" | "dark" | "system";

// 翻译字典
const translations = {
  zh: {
    // 通用
    "app.title": "AI Manager",
    "loading": "加载中...",

    // 头部
    "header.settings": "设置",
    "header.addConfig": "添加配置",

    // 配置列表
    "configList.empty": "暂无配置",
    "configList.emptyHint": "点击右上角 + 按钮添加新的 Claude Code 配置",

    // 配置项
    "configItem.activate": "启用",
    "configItem.activateTitle": "启用此配置",
    "configItem.edit": "编辑",
    "configItem.duplicate": "复制",
    "configItem.delete": "删除",

    // 配置弹窗
    "configModal.addTitle": "添加配置",
    "configModal.editTitle": "编辑配置",
    "configModal.name": "配置名称",
    "configModal.nameRequired": "配置名称 *",
    "configModal.namePlaceholder": "例如：个人账号、公司账号",
    "configModal.description": "备注",
    "configModal.descriptionPlaceholder": "例如：公司专用账号",
    "configModal.websiteUrl": "官网链接",
    "configModal.websiteUrlPlaceholder": "https://example.com（可选）",
    "configModal.apiKey": "API Key *",
    "configModal.apiKeyPlaceholder": "sk-ant-...",
    "configModal.apiUrl": "请求地址",
    "configModal.apiUrlPlaceholder": "https://api.anthropic.com",
    "configModal.apiUrlHint": "填写兼容 Claude API 的服务端点地址，不要以斜杠结尾",
    "configModal.model": "主模型",
    "configModal.modelPlaceholder": "claude-sonnet-4-5",
    "configModal.thinkingModel": "推理模型 (Thinking)",
    "configModal.haikuModel": "Haiku 默认模型",
    "configModal.haikuModelPlaceholder": "claude-sonnet-4-5",
    "configModal.sonnetModel": "Sonnet 默认模型",
    "configModal.sonnetModelPlaceholder": "claude-sonnet-4-5",
    "configModal.opusModel": "Opus 默认模型",
    "configModal.opusModelPlaceholder": "claude-opus-4-5-thinking",
    "configModal.modelHint": "可选：指定默认使用的 Claude 模型，留空则使用系统默认。",
    "configModal.advancedOptions": "高级选项",
    "configModal.alwaysThinking": "始终启用思考模式 (Always Thinking)",
    "configModal.disableTraffic": "禁用非必要网络请求",
    "configModal.jsonPreview": "配置 JSON 预览",
    "configModal.cancel": "取消",
    "configModal.save": "保存",

    // 设置页面
    "settings.title": "设置",
    "settings.general": "通用",
    "settings.language": "界面语言",
    "settings.languageDesc": "选择应用的显示语言",
    "settings.theme": "主题外观",
    "settings.themeDesc": "选择应用的外观主题",
    "settings.themeLight": "浅色",
    "settings.themeDark": "深色",
    "settings.themeSystem": "跟随系统",
  },
  en: {
    // 通用
    "app.title": "AI Manager",
    "loading": "Loading...",

    // 头部
    "header.settings": "Settings",
    "header.addConfig": "Add Config",

    // 配置列表
    "configList.empty": "No configurations",
    "configList.emptyHint": "Click the + button in the top right to add a new Claude Code config",

    // 配置项
    "configItem.activate": "Activate",
    "configItem.activateTitle": "Activate this config",
    "configItem.edit": "Edit",
    "configItem.duplicate": "Duplicate",
    "configItem.delete": "Delete",

    // 配置弹窗
    "configModal.addTitle": "Add Config",
    "configModal.editTitle": "Edit Config",
    "configModal.name": "Config Name",
    "configModal.nameRequired": "Config Name *",
    "configModal.namePlaceholder": "e.g. Personal, Company",
    "configModal.description": "Description",
    "configModal.descriptionPlaceholder": "e.g. Company account",
    "configModal.websiteUrl": "Website URL",
    "configModal.websiteUrlPlaceholder": "https://example.com (optional)",
    "configModal.apiKey": "API Key *",
    "configModal.apiKeyPlaceholder": "sk-ant-...",
    "configModal.apiUrl": "API URL",
    "configModal.apiUrlPlaceholder": "https://api.anthropic.com",
    "configModal.apiUrlHint": "Enter a Claude API compatible endpoint URL, without trailing slash",
    "configModal.model": "Primary Model",
    "configModal.modelPlaceholder": "claude-sonnet-4-5",
    "configModal.thinkingModel": "Thinking Model",
    "configModal.haikuModel": "Haiku Default Model",
    "configModal.haikuModelPlaceholder": "claude-sonnet-4-5",
    "configModal.sonnetModel": "Sonnet Default Model",
    "configModal.sonnetModelPlaceholder": "claude-sonnet-4-5",
    "configModal.opusModel": "Opus Default Model",
    "configModal.opusModelPlaceholder": "claude-opus-4-5-thinking",
    "configModal.modelHint": "Optional: specify the default Claude model. Leave empty to use system default.",
    "configModal.advancedOptions": "Advanced Options",
    "configModal.alwaysThinking": "Always enable thinking mode",
    "configModal.disableTraffic": "Disable non-essential network traffic",
    "configModal.jsonPreview": "Config JSON Preview",
    "configModal.cancel": "Cancel",
    "configModal.save": "Save",

    // 设置页面
    "settings.title": "Settings",
    "settings.general": "General",
    "settings.language": "Language",
    "settings.languageDesc": "Choose the display language",
    "settings.theme": "Theme",
    "settings.themeDesc": "Choose the app appearance",
    "settings.themeLight": "Light",
    "settings.themeDark": "Dark",
    "settings.themeSystem": "System",
  },
} as const;

type TranslationKey = keyof typeof translations.zh;

// 设置持久化
const STORAGE_KEY = "ai-manager-settings";

interface AppSettings {
  language: Language;
  theme: Theme;
}

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // 忽略解析错误
  }
  return { language: "zh", theme: "dark" };
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// 主题应用
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

// Context
interface I18nContextType {
  language: Language;
  theme: Theme;
  t: (key: TranslationKey) => string;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
}

const I18nContext = createContext<I18nContextType | null>(null);

// Provider 组件
export function I18nProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const t = useCallback(
    (key: TranslationKey): string => {
      return translations[settings.language][key] || key;
    },
    [settings.language]
  );

  const setLanguage = useCallback((language: Language) => {
    setSettings((prev) => {
      const next = { ...prev, language };
      saveSettings(next);
      return next;
    });
  }, []);

  const setTheme = useCallback((theme: Theme) => {
    setSettings((prev) => {
      const next = { ...prev, theme };
      saveSettings(next);
      applyTheme(theme);
      return next;
    });
  }, []);

  // 初始化时应用主题
  useEffect(() => {
    applyTheme(settings.theme);
  }, []);

  // 监听系统主题变化（仅在 "system" 模式下生效）
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [settings.theme]);

  const value: I18nContextType = {
    language: settings.language,
    theme: settings.theme,
    t,
    setLanguage,
    setTheme,
  };

  return createElement(I18nContext.Provider, { value }, children);
}

// Hook
export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
