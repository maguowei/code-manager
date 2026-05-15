import { readObject } from "./editor-utils";
import {
  fetchMarketplaceCatalog,
  type MarketplacePluginEntry,
  parseMarketplacePluginCatalog,
} from "./marketplace-catalog";
import { OFFICIAL_MARKETPLACE_ID, OFFICIAL_MARKETPLACE_REPO } from "./marketplace-presets";

// OfficialPluginMetadata 是 MarketplacePluginEntry 的别名，保持向后兼容
export type OfficialPluginMetadata = MarketplacePluginEntry;

export interface OfficialPluginCacheV1 {
  version: 1;
  updatedAt: string;
  plugins: OfficialPluginMetadata[];
}

// 保持旧缓存键不变，避免破坏已有缓存读写逻辑
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
    // 旧缓存条目可能没有 marketplaceId，回退到官方市场 ID
    marketplaceId: readTrimmedString(record.marketplaceId) || OFFICIAL_MARKETPLACE_ID,
    description: readTrimmedString(record.description),
    category: readTrimmedString(record.category),
    authorName: readTrimmedString(record.authorName),
    sourceType: readTrimmedString(record.sourceType) || "unknown",
    homepage: readTrimmedString(record.homepage),
    // 旧缓存条目可能没有 isOfficial，官方缓存默认为 true
    isOfficial: record.isOfficial === undefined ? true : record.isOfficial === true,
  };
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

// parseOfficialPluginCatalog 委托给通用模块，保持向后兼容
export function parseOfficialPluginCatalog(manifest: unknown): OfficialPluginMetadata[] {
  return parseMarketplacePluginCatalog(manifest, OFFICIAL_MARKETPLACE_ID);
}

export async function fetchOfficialPluginCatalog(): Promise<OfficialPluginMetadata[]> {
  return fetchMarketplaceCatalog({
    marketplaceId: OFFICIAL_MARKETPLACE_ID,
    sourceType: "github",
    repo: OFFICIAL_MARKETPLACE_REPO,
    ref: "",
    path: "",
  });
}
