import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOCUS_SESSION_SHORTCUT,
  formatAccelerator,
  keyEventToAccelerator,
} from "../shortcut-utils";

function event(partial: Partial<Parameters<typeof keyEventToAccelerator>[0]>) {
  return {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    key: "",
    ...partial,
  };
}

describe("keyEventToAccelerator", () => {
  it("按修饰键顺序 Command→Control→Alt→Shift 拼接,主键大写", () => {
    expect(keyEventToAccelerator(event({ metaKey: true, ctrlKey: true, key: "j" }))).toBe(
      "Command+Control+J",
    );
    expect(keyEventToAccelerator(event({ altKey: true, shiftKey: true, key: "1" }))).toBe(
      "Alt+Shift+1",
    );
  });

  it("缺少修饰键时返回 null(避免与普通输入冲突)", () => {
    expect(keyEventToAccelerator(event({ key: "j" }))).toBeNull();
  });

  it("只按下修饰键本身时返回 null", () => {
    expect(keyEventToAccelerator(event({ metaKey: true, key: "Meta" }))).toBeNull();
    expect(keyEventToAccelerator(event({ ctrlKey: true, key: "Control" }))).toBeNull();
  });

  it("非单字符主键(功能键、方向键)返回 null", () => {
    expect(keyEventToAccelerator(event({ metaKey: true, key: "F1" }))).toBeNull();
    expect(keyEventToAccelerator(event({ metaKey: true, key: "ArrowUp" }))).toBeNull();
  });
});

describe("formatAccelerator", () => {
  it("把修饰键 token 映射为 macOS 符号", () => {
    expect(formatAccelerator("Command+Control+J")).toBe("⌘⌃J");
    expect(formatAccelerator("Alt+Shift+1")).toBe("⌥⇧1");
  });

  it("默认快捷键可被格式化", () => {
    expect(formatAccelerator(DEFAULT_FOCUS_SESSION_SHORTCUT)).toBe("⌘⌃J");
  });
});
