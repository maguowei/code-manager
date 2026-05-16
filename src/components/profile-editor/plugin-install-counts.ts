import { invoke } from "@tauri-apps/api/core";
import type { ClaudeFilePreview } from "../../types";
import { isTauri } from "../../types";
import { readObject } from "./editor-utils";

export const PLUGIN_INSTALL_COUNTS_CACHE_PATH = "plugins/install-counts-cache.json";

export type PluginInstallCounts = Record<string, number>;

function readTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readInstallCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.trunc(value);
}

export function parsePluginInstallCountsCache(raw: unknown): PluginInstallCounts {
  const record = readObject(raw);
  if (!Array.isArray(record.counts)) {
    return {};
  }

  const counts: PluginInstallCounts = {};
  for (const item of record.counts) {
    const itemRecord = readObject(item);
    const pluginId = readTrim(itemRecord.plugin);
    const installCount = readInstallCount(itemRecord.unique_installs);
    if (pluginId && installCount !== null) {
      counts[pluginId] = installCount;
    }
  }
  return counts;
}

export async function loadPluginInstallCounts(): Promise<PluginInstallCounts> {
  if (!isTauri()) {
    return {};
  }

  try {
    const preview = await invoke<ClaudeFilePreview>("read_claude_file_preview", {
      path: PLUGIN_INSTALL_COUNTS_CACHE_PATH,
    });
    if (preview.isBinary || preview.truncated || !preview.content.trim()) {
      return {};
    }
    return parsePluginInstallCountsCache(JSON.parse(preview.content));
  } catch {
    return {};
  }
}
