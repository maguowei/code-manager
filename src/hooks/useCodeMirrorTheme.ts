import { xcodeDark, xcodeLight } from "@uiw/codemirror-theme-xcode";
import { useIsDark } from "./useIsDark";

/** 根据当前应用主题返回 CodeMirror xcode 扩展 */
export function useCodeMirrorTheme() {
  const isDark = useIsDark();
  return isDark ? xcodeDark : xcodeLight;
}
