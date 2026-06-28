import { describe, expect, it, vi } from "vitest";
import { getUserFacingErrorReason, showOperationError } from "../user-facing-error";

describe("getUserFacingErrorReason", () => {
  it("extracts plain string and Error messages", () => {
    expect(getUserFacingErrorReason("CLAUDE.md 已存在，无法覆盖")).toBe(
      "CLAUDE.md 已存在，无法覆盖",
    );
    expect(getUserFacingErrorReason(new Error("项目目录不存在"))).toBe("项目目录不存在");
  });

  it("hides empty, stack, and low-level JavaScript errors", () => {
    expect(getUserFacingErrorReason("")).toBeNull();
    expect(getUserFacingErrorReason("undefined")).toBeNull();
    expect(
      getUserFacingErrorReason(new TypeError("Cannot read properties of undefined")),
    ).toBeNull();
    expect(getUserFacingErrorReason("Error: TypeError: Cannot read properties")).toBeNull();
    expect(getUserFacingErrorReason("Error: boom\n    at fn (/tmp/app.ts:1:2)")).toBeNull();
  });

  it("masks absolute paths and truncates long messages", () => {
    const reason = getUserFacingErrorReason(
      '读取文件失败 "/Users/dev/.claude/CLAUDE.md": Permission denied',
    );

    expect(reason).toBe('读取文件失败 "~/.claude/CLAUDE.md": Permission denied');
    expect(reason).not.toContain("/Users/dev");
    expect(
      getUserFacingErrorReason(
        String.raw`读取文件失败 "C:\Users\dev\.claude\settings.json": Access denied`,
      ),
    ).toBe(String.raw`读取文件失败 "~\.claude\settings.json": Access denied`);
    expect(
      getUserFacingErrorReason(
        String.raw`读取文件失败 "C:\Users\Mary Jane\.claude\settings.json": Access denied`,
      ),
    ).toBe(String.raw`读取文件失败 "~\.claude\settings.json": Access denied`);
    expect(getUserFacingErrorReason(String.raw`启动 "C:\Program Files\Warp\warp.exe" 失败`)).toBe(
      String.raw`启动 "…\warp.exe" 失败`,
    );
    expect(getUserFacingErrorReason("读取 /private/var/tmp/source/CLAUDE.md 失败")).toBe(
      "读取 …/CLAUDE.md 失败",
    );

    const longReason = getUserFacingErrorReason(`失败原因：${"很长".repeat(120)}`);

    expect(longReason).not.toBeNull();
    expect(longReason?.length).toBeLessThanOrEqual(181);
    expect(longReason?.endsWith("…")).toBe(true);
  });

  it("hides large HTML and JSON payloads", () => {
    expect(getUserFacingErrorReason("<html><body>Internal Server Error</body></html>")).toBeNull();
    expect(getUserFacingErrorReason(JSON.stringify({ error: "x".repeat(160) }))).toBeNull();
  });

  it("reads a message from plain objects and falls back to String for others", () => {
    // 非 Error 对象但带 string message
    expect(getUserFacingErrorReason({ message: "后端返回错误" })).toBe("后端返回错误");
    // message 非字符串 → 走 String(error) 兜底成占位符 → null
    expect(getUserFacingErrorReason({ message: 500 })).toBeNull();
    // 无 message 的对象 → String(error) 得 "[object Object]" 占位符 → null
    expect(getUserFacingErrorReason({ code: "E_FAIL" })).toBeNull();
    // 非对象原始值 → String(error)
    expect(getUserFacingErrorReason(42)).toBe("42");
  });
});

describe("showOperationError", () => {
  it("shows a friendly reason as toast description", () => {
    const showToast = vi.fn();

    showOperationError(showToast, "切换记忆状态失败", "CLAUDE.md 已存在，无法覆盖");

    expect(showToast).toHaveBeenCalledWith("切换记忆状态失败", "error", {
      description: "CLAUDE.md 已存在，无法覆盖",
    });
  });

  it("falls back to the title when no safe reason exists", () => {
    const showToast = vi.fn();

    showOperationError(showToast, "切换记忆状态失败", new TypeError("Cannot read x"));

    expect(showToast).toHaveBeenCalledWith("切换记忆状态失败", "error");
  });
});
