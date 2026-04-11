import { xcodeDark, xcodeLight } from "@uiw/codemirror-theme-xcode";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";

/**
 * 根据应用主题返回对应的 CodeMirror 编辑器配色方案。
 * 当主题为 "system" 时，监听系统深色模式变化并实时响应。
 */
function useEditorTheme() {
  const { theme } = useI18n();

  // 仅在 system 模式下需要跟踪系统偏好
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return useMemo(() => {
    if (theme === "dark") return xcodeDark;
    if (theme === "light") return xcodeLight;
    return systemDark ? xcodeDark : xcodeLight;
  }, [theme, systemDark]);
}

export default useEditorTheme;
