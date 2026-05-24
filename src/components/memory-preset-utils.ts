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

function getPresetStartMarker(preset: MemoryPresetContentResult) {
  const marker = preset.content
    .split(/\r?\n/)
    .find((line) => line.includes(`${preset.presetId}:${preset.language}:start`));
  return marker?.trim();
}

export function appendMemoryPresetContent(
  currentContent: string,
  preset: MemoryPresetContentResult,
) {
  const marker = getPresetStartMarker(preset);
  if (marker && currentContent.includes(marker)) {
    return { content: currentContent, inserted: false };
  }

  const body = currentContent.trimEnd();
  const presetContent = preset.content.trim();
  return {
    content: body ? `${body}\n\n${presetContent}` : presetContent,
    inserted: true,
  };
}
