import { describe, expect, it } from "vitest";
import type { MemoryPresetContentResult } from "../../types";
import { appendMemoryPresetContent } from "../memory-preset-utils";

const NEW_MARKER_START =
  "<!-- code-manager:memory-preset:karpathy-behavior-guidelines:zh:start -->";
const NEW_MARKER_END = "<!-- /code-manager:memory-preset:karpathy-behavior-guidelines:zh:end -->";
// 历史版本（项目改名前）以 ai-manager 前缀写入用户文档的 marker
const LEGACY_MARKER_START =
  "<!-- ai-manager:memory-preset:karpathy-behavior-guidelines:zh:start -->";
const LEGACY_MARKER_END = "<!-- /ai-manager:memory-preset:karpathy-behavior-guidelines:zh:end -->";

function buildPreset(): MemoryPresetContentResult {
  return {
    presetId: "karpathy-behavior-guidelines",
    language: "zh",
    name: "Karpathy 行为指南",
    content: `${NEW_MARKER_START}\n编码前先思考\n${NEW_MARKER_END}`,
    sourceUrl: "https://example.com/CLAUDE.md",
  };
}

describe("appendMemoryPresetContent", () => {
  it("空文档时插入预设内容", () => {
    const result = appendMemoryPresetContent("", buildPreset());
    expect(result.inserted).toBe(true);
    expect(result.content).toContain(NEW_MARKER_START);
  });

  it("文档已含新版 marker 时不重复插入", () => {
    const preset = buildPreset();
    const existing = `# 团队规范\n\n${preset.content}`;
    const result = appendMemoryPresetContent(existing, preset);
    expect(result.inserted).toBe(false);
    expect(result.content).toBe(existing);
  });

  it("文档含历史 ai-manager 前缀 marker 时仍识别为已插入（向后兼容）", () => {
    const legacyDoc = `# 团队规范\n\n${LEGACY_MARKER_START}\n编码前先思考\n${LEGACY_MARKER_END}`;
    const result = appendMemoryPresetContent(legacyDoc, buildPreset());
    expect(result.inserted).toBe(false);
    expect(result.content).toBe(legacyDoc);
  });
});
