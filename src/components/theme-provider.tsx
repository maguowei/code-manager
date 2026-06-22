import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Theme = "system" | "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
}

const STORAGE_KEY = "code-manager.theme";
const THEME_VALUES: Theme[] = ["system", "light", "dark"];

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_VALUES.includes(value as Theme);
}

function readStoredTheme(): Theme {
  if (typeof localStorage === "undefined") {
    return "system";
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (isTheme(stored)) {
    return stored;
  }

  return "system";
}

function writeStoredTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 桌面应用环境下 localStorage 通常可写；异常时保持内存状态可用
  }
}

function prefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyDarkClass(isDark: boolean) {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.classList.toggle("dark", isDark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark);

  useEffect(() => {
    writeStoredTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
    };

    setSystemDark(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const isDark = theme === "system" ? systemDark : theme === "dark";

  useEffect(() => {
    applyDarkClass(isDark);
  }, [isDark]);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    writeStoredTheme(nextTheme);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, isDark }),
    [isDark, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme 必须在 ThemeProvider 内使用");
  }
  return context;
}
