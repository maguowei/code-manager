import { readObject } from "./editor-utils";
import { buildOfficialPluginId, OFFICIAL_MARKETPLACE_RAW_URL } from "./marketplace-presets";

export interface OfficialPluginMetadata {
  pluginId: string;
  description: string;
  category: string;
  authorName: string;
  sourceType: string;
  homepage: string;
}

export interface OfficialPluginCacheV1 {
  version: 1;
  updatedAt: string;
  plugins: OfficialPluginMetadata[];
}

export const OFFICIAL_PLUGIN_CACHE_KEY = "ai-manager-official-plugin-cache:v1";

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOfficialPluginMetadata(value: unknown): OfficialPluginMetadata | null {
  const record = readObject(value);
  const pluginId = readTrimmedString(record.pluginId);
  if (!pluginId) {
    return null;
  }

  return {
    pluginId,
    description: readTrimmedString(record.description),
    category: readTrimmedString(record.category),
    authorName: readTrimmedString(record.authorName),
    sourceType: readTrimmedString(record.sourceType) || "unknown",
    homepage: readTrimmedString(record.homepage),
  };
}

function normalizeSourceType(source: unknown): string {
  if (typeof source === "string") {
    return "path";
  }

  const sourceRecord = readObject(source);
  const sourceType = readTrimmedString(sourceRecord.source);
  return sourceType || "unknown";
}

export function createOfficialPluginMetadataMap(
  plugins: OfficialPluginMetadata[],
): Record<string, OfficialPluginMetadata> {
  return plugins.reduce<Record<string, OfficialPluginMetadata>>((accumulator, plugin) => {
    accumulator[plugin.pluginId] = plugin;
    return accumulator;
  }, {});
}

export function loadOfficialPluginCache(): OfficialPluginCacheV1 | null {
  try {
    const rawCache = localStorage.getItem(OFFICIAL_PLUGIN_CACHE_KEY);
    if (!rawCache) {
      return null;
    }

    const parsedCache = readObject(JSON.parse(rawCache));
    if (parsedCache.version !== 1 || !Array.isArray(parsedCache.plugins)) {
      return null;
    }

    const plugins = parsedCache.plugins
      .map((plugin) => normalizeOfficialPluginMetadata(plugin))
      .filter((plugin): plugin is OfficialPluginMetadata => plugin !== null);

    return {
      version: 1,
      updatedAt: readTrimmedString(parsedCache.updatedAt),
      plugins,
    };
  } catch {
    return null;
  }
}

export function saveOfficialPluginCache(plugins: OfficialPluginMetadata[]): OfficialPluginCacheV1 {
  const cache: OfficialPluginCacheV1 = {
    version: 1,
    updatedAt: new Date().toISOString(),
    plugins,
  };
  localStorage.setItem(OFFICIAL_PLUGIN_CACHE_KEY, JSON.stringify(cache));
  return cache;
}

export function parseOfficialPluginCatalog(manifest: unknown): OfficialPluginMetadata[] {
  const manifestRecord = readObject(manifest);
  if (!Array.isArray(manifestRecord.plugins)) {
    throw new Error("invalid official marketplace manifest");
  }

  const plugins: OfficialPluginMetadata[] = [];
  const seen = new Set<string>();

  manifestRecord.plugins.forEach((entry) => {
    const pluginRecord = readObject(entry);
    const pluginName = readTrimmedString(pluginRecord.name);
    if (!pluginName) {
      return;
    }

    const pluginId = buildOfficialPluginId(pluginName);
    if (seen.has(pluginId)) {
      return;
    }

    seen.add(pluginId);
    const authorRecord = readObject(pluginRecord.author);
    plugins.push({
      pluginId,
      description: readTrimmedString(pluginRecord.description),
      category: readTrimmedString(pluginRecord.category),
      authorName: readTrimmedString(authorRecord.name),
      sourceType: normalizeSourceType(pluginRecord.source),
      homepage: readTrimmedString(pluginRecord.homepage),
    });
  });

  return plugins;
}

export async function fetchOfficialPluginCatalog(): Promise<OfficialPluginMetadata[]> {
  const response = await fetch(OFFICIAL_MARKETPLACE_RAW_URL);
  if (!response.ok) {
    throw new Error("failed to load official plugins");
  }

  return parseOfficialPluginCatalog(await response.json());
}
