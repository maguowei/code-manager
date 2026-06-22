import type { Language } from "../i18n";
import type { MemoryPresetContentResult, MemoryPresetLanguage } from "../types";

export const KARPATHY_MEMORY_PRESET_ID = "karpathy-behavior-guidelines";
export const KARPATHY_MEMORY_PRESET_REPOSITORY_URL =
  "https://github.com/multica-ai/andrej-karpathy-skills";
export const KARPATHY_MEMORY_PRESET_SOURCE_URL =
  "https://raw.githubusercontent.com/multica-ai/andrej-karpathy-skills/refs/heads/main/CLAUDE.md";

export function getMemoryPresetLanguage(language: Language): MemoryPresetLanguage {
  return language === "zh" ? "zh" : "en";
}

export function appendMemoryPresetContent(
  currentContent: string,
  preset: MemoryPresetContentResult,
) {
  // 用不含品牌前缀的稳定标识检测是否已插入，兼容历史上以 ai-manager 前缀写入的旧文档。
  const markerKey = `${preset.presetId}:${preset.language}:start`;
  if (currentContent.includes(markerKey)) {
    return { content: currentContent, inserted: false };
  }

  const body = currentContent.trimEnd();
  const presetContent = preset.content.trim();
  return {
    content: body ? `${body}\n\n${presetContent}` : presetContent,
    inserted: true,
  };
}
