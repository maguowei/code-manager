// 会话聚焦全局快捷键的纯工具函数：键盘事件 ↔ Tauri accelerator 字符串。
// 与后端 config.rs 的默认值保持一致。

/// 默认快捷键组合(双修饰键，降低与其它软件冲突的概率)。
export const DEFAULT_FOCUS_SESSION_SHORTCUT = "Command+Control+J";

// Tauri accelerator 修饰键 token → 展示符号(macOS 风格)。
const MODIFIER_SYMBOLS: Record<string, string> = {
  Command: "⌘",
  Control: "⌃",
  Alt: "⌥",
  Shift: "⇧",
};

/// 把键盘事件转成 Tauri accelerator 字符串,如 `Command+Control+J`。
/// 要求至少一个修饰键 + 一个单字符主键;否则(只按修饰键、功能键等)返回 null。
export function keyEventToAccelerator(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  key: string;
}): string | null {
  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push("Command");
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");

  const { key } = event;
  // 只按下修饰键本身、没有主键 → 无效
  if (key === "Meta" || key === "Control" || key === "Alt" || key === "Shift") {
    return null;
  }
  // 仅接受单字符主键(字母/数字/符号);功能键、方向键等暂不支持
  if (key.length !== 1) {
    return null;
  }
  // 必须至少有一个修饰键,避免与普通输入冲突
  if (modifiers.length === 0) {
    return null;
  }
  return [...modifiers, key.toUpperCase()].join("+");
}

/// 把 accelerator 字符串格式化为便于阅读的符号形式,如 `Command+Control+J` → `⌘⌃J`。
export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split("+")
    .map((token) => MODIFIER_SYMBOLS[token] ?? token)
    .join("");
}
