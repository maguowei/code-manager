import { ipc } from "../../ipc";
import { isTauri } from "../../types";
import { readObject } from "./editor-utils";

// Claude Code 已将插件安装数从独立的 install-counts-cache.json 合并进 plugin-catalog-cache.json
export const PLUGIN_CATALOG_CACHE_PATH = "plugins/plugin-catalog-cache.json";

export type PluginInstallCounts = Record<string, number>;

function readInstallCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.trunc(value);
}

export function parsePluginInstallCountsCache(raw: unknown): PluginInstallCounts {
  const record = readObject(raw);
  const catalog = readObject(record.catalog);
  const plugins = readObject(catalog.plugins);

  const counts: PluginInstallCounts = {};
  // catalog.plugins 形如 { "<pluginId>": { unique_installs, ... } }，键即 pluginId
  for (const [pluginId, value] of Object.entries(plugins)) {
    const installCount = readInstallCount(readObject(value).unique_installs);
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
    const preview = await ipc.readClaudeFilePreview(PLUGIN_CATALOG_CACHE_PATH);
    if (preview.isBinary || preview.truncated || !preview.content.trim()) {
      return {};
    }
    return parsePluginInstallCountsCache(JSON.parse(preview.content));
  } catch {
    return {};
  }
}
