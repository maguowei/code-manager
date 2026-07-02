import i18next, { type TOptions } from "i18next";
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { initReactI18next } from "react-i18next";
import useTauriEvent from "./hooks/useTauriEvent";
import { catalogs, i18nNamespaces, type translations } from "./i18n/catalogs";
import { getActiveFormatLanguage, localeForLanguage, setActiveFormatLanguage } from "./i18n/format";
import { ipc } from "./ipc";
import { isTauri } from "./types";

export type Language = "zh" | "en";

export type TranslationKey = keyof typeof translations.zh;
export type TranslationValues = Record<string, string | number>;

type I18nNamespace = (typeof i18nNamespaces)[number];

const KEY_NAMESPACE: Record<string, I18nNamespace> = {
  app: "common",
  common: "common",
  ui: "common",
  form: "common",
  header: "common",
  nav: "common",
  confirm: "common",
  configModal: "common",
  toast: "common",
  update: "common",
  logs: "common",
  settings: "settings",
  profiles: "profiles",
  providers: "profiles",
  profileEditor: "profiles",
  memory: "memory",
  skills: "skills",
  projects: "projects",
  claudeOverview: "projects",
  history: "history",
  stats: "stats",
  usage: "usage",
  widget: "usage",
  cheatsheet: "cheatsheet",
};

function namespaceForKey(key: TranslationKey): I18nNamespace {
  const prefix = key.includes(".") ? key.slice(0, key.indexOf(".")) : "common";
  return KEY_NAMESPACE[prefix] ?? "common";
}

export function translate(
  key: TranslationKey,
  values?: TranslationValues,
  language: Language = getActiveFormatLanguage(),
): string {
  return i18nInstance.getFixedT(language, namespaceForKey(key))(key, values as TOptions) || key;
}

const i18nInstance = i18next.createInstance();
void i18nInstance.use(initReactI18next).init({
  resources: catalogs,
  supportedLngs: ["zh", "en"],
  fallbackLng: "en",
  lng: "zh",
  ns: i18nNamespaces,
  defaultNS: "common",
  keySeparator: false,
  initAsync: false,
  interpolation: {
    escapeValue: false,
    prefix: "{",
    suffix: "}",
  },
});

// 设置持久化
const STORAGE_KEY = "code-manager-settings";

interface AppSettings {
  language: Language;
}

function isChineseSystemLocale(locale: string | undefined): boolean {
  return (locale ?? "").trim().replace("_", "-").toLowerCase().startsWith("zh");
}

function getSystemLanguage(): Language {
  if (typeof navigator === "undefined") {
    return "en";
  }

  const primaryLanguage =
    Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? navigator.languages.find((language) => language.trim() !== "")
      : navigator.language;

  return isChineseSystemLocale(primaryLanguage) ? "zh" : "en";
}

function loadSettings(): AppSettings {
  const defaults: AppSettings = { language: getSystemLanguage() };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 校验解析结果，防止 localStorage 数据损坏导致崩溃
      if (parsed && typeof parsed === "object") {
        const validLanguages: Language[] = ["zh", "en"];
        return {
          language: validLanguages.includes(parsed.language) ? parsed.language : defaults.language,
        };
      }
    }
  } catch {
    // 忽略解析错误
  }
  return defaults;
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// Context
interface I18nContextType {
  language: Language;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  setLanguage: (lang: Language) => Promise<void>;
}

const I18nContext = createContext<I18nContextType | null>(null);

// Provider 组件
export function I18nProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const settingsRef = useRef(settings);
  const localChangeVersionRef = useRef(0);

  const applyLanguage = useCallback((language: Language) => {
    const next = { ...settingsRef.current, language };
    settingsRef.current = next;
    saveSettings(next);
    setSettings(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues): string => {
      return translate(key, values, settings.language);
    },
    [settings.language],
  );

  const setLanguage = useCallback(
    async (language: Language) => {
      const previousLanguage = settingsRef.current.language;
      if (previousLanguage === language) return;

      const changeVersion = ++localChangeVersionRef.current;
      applyLanguage(language);
      if (!isTauri()) return;

      try {
        const persistedLanguage = await ipc.setUiLanguage(language);
        if (localChangeVersionRef.current === changeVersion) {
          applyLanguage(persistedLanguage);
        }
      } catch (error) {
        if (localChangeVersionRef.current === changeVersion) {
          applyLanguage(previousLanguage);
        }
        throw error;
      }
    },
    [applyLanguage],
  );

  useEffect(() => {
    setActiveFormatLanguage(settings.language);
    document.documentElement.lang = localeForLanguage(settings.language);
    document.documentElement.dir = "ltr";
  }, [settings.language]);

  const syncLanguageFromBackend = useCallback(
    async (expectedChangeVersion?: number) => {
      const workspace = await ipc.getConfigWorkspace();
      if (
        expectedChangeVersion !== undefined &&
        localChangeVersionRef.current !== expectedChangeVersion
      ) {
        return;
      }
      applyLanguage(workspace.app.uiLanguage);
    },
    [applyLanguage],
  );

  useEffect(() => {
    if (!isTauri()) return;

    const initialChangeVersion = localChangeVersionRef.current;
    void syncLanguageFromBackend(initialChangeVersion).catch(() => {
      // 初始化同步失败时保留启动缓存，避免首屏语言闪烁
    });
  }, [syncLanguageFromBackend]);

  useTauriEvent("config-workspace-changed", () => {
    void syncLanguageFromBackend().catch(() => {
      // 事件同步失败时保留当前语言，下次配置事件继续重试
    });
  });

  const value = useMemo<I18nContextType>(
    () => ({
      language: settings.language,
      t,
      setLanguage,
    }),
    [settings.language, t, setLanguage],
  );

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
