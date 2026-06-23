import { describe, expect, it } from "vitest";
import { countMemoryDocumentLines, formatMemorySize } from "../memory-card-utils";

describe("countMemoryDocumentLines", () => {
  it("把标题拼回正文并按编辑器口径计数（标题 + 空行 + 正文）", () => {
    // # t / (空行) / a => 3 行
    expect(countMemoryDocumentLines("t", "a")).toBe(3);
    // # t / (空行) / a / b => 4 行
    expect(countMemoryDocumentLines("t", "a\nb")).toBe(4);
  });

  it("正文结尾换行算作编辑器末尾空行", () => {
    // # t / (空行) / a / (末尾空行) => 4 行
    expect(countMemoryDocumentLines("t", "a\n")).toBe(4);
  });

  it("保留正文内部空行", () => {
    // # t / (空行) / a / (空) / b => 5 行
    expect(countMemoryDocumentLines("t", "a\n\nb")).toBe(5);
  });

  it("空正文只剩标题行", () => {
    expect(countMemoryDocumentLines("t", "")).toBe(1);
  });

  it("name 为空时不拼标题，仅按正文计数", () => {
    expect(countMemoryDocumentLines("", "a\nb")).toBe(2);
  });
});

describe("formatMemorySize", () => {
  it("小于 1 KB 以字节展示", () => {
    expect(formatMemorySize(512)).toBe("512 B");
  });

  it("KB 区间保留一位小数", () => {
    expect(formatMemorySize(1536)).toBe("1.5 KB");
  });

  it("大于等于 10 的单位不保留小数", () => {
    expect(formatMemorySize(20 * 1024)).toBe("20 KB");
  });

  it("逐级换算到 MB", () => {
    expect(formatMemorySize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
