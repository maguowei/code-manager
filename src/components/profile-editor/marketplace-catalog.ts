import { readObject } from "./editor-utils";
import { OFFICIAL_MARKETPLACE_ID } from "./marketplace-presets";

export interface MarketplacePluginEntry {
  pluginId: string;
  marketplaceId: string;
  description: string;
  category: string;
  authorName: string;
  sourceType: string;
  homepage: string;
  isOfficial: boolean;
}

export interface MarketplaceFetchInput {
  marketplaceId: string;
  sourceType: string;
  repo: string;
  ref: string;
  path: string;
}

export type MarketplaceCatalogStatus = "idle" | "loading" | "ready" | "error";

export interface MarketplaceCatalogState {
  marketplaceId: string;
  status: MarketplaceCatalogStatus;
  plugins: MarketplacePluginEntry[];
  error?: string;
  cachedAt?: string;
  unsupported?: boolean;
}

export const MARKETPLACE_CATALOG_CACHE_KEY = "ai-manager-marketplace-plugin-cache:v1";
const CACHE_VERSION = 1;

interface CacheV1 {
  version: 1;
  byMarketplace: Record<string, { plugins: MarketplacePluginEntry[]; cachedAt: string }>;
}

function readTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildMarketplaceRawUrl(input: {
  sourceType: string;
  repo: string;
  ref: string;
  path: string;
}): string | null {
  if (input.sourceType !== "github") return null;
  const repo = input.repo.trim();
  if (!repo) return null;
  const ref = input.ref.trim() || "main";
  const path = input.path.trim().replace(/^\/+|\/+$/g, "");
  const segments = ["https://raw.githubusercontent.com", repo, ref];
  if (path) segments.push(path);
  segments.push(".claude-plugin/marketplace.json");
  return segments.join("/");
}

export function parseMarketplacePluginCatalog(
  manifest: unknown,
  marketplaceId: string,
): MarketplacePluginEntry[] {
  const record = readObject(manifest);
  if (!Array.isArray(record.plugins)) throw new Error("invalid marketplace manifest");
  const seen = new Set<string>();
  const plugins: MarketplacePluginEntry[] = [];
  record.plugins.forEach((entry) => {
    const pluginRecord = readObject(entry);
    const name = readTrim(pluginRecord.name);
    if (!name) return;
    const pluginId = `${name}@${marketplaceId}`;
    if (seen.has(pluginId)) return;
    seen.add(pluginId);
    const author = readObject(pluginRecord.author);
    const source = pluginRecord.source;
    const sourceType =
      typeof source === "string" ? "path" : readTrim(readObject(source).source) || "unknown";
    plugins.push({
      pluginId,
      marketplaceId,
      description: readTrim(pluginRecord.description),
      category: readTrim(pluginRecord.category),
      authorName: readTrim(author.name),
      sourceType,
      homepage: readTrim(pluginRecord.homepage),
      isOfficial: marketplaceId === OFFICIAL_MARKETPLACE_ID,
    });
  });
  return plugins;
}

export async function fetchMarketplaceCatalog(
  input: MarketplaceFetchInput,
): Promise<MarketplacePluginEntry[]> {
  const url = buildMarketplaceRawUrl(input);
  if (!url) throw new Error(`unsupported marketplace source: ${input.sourceType}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
  return parseMarketplacePluginCatalog(await response.json(), input.marketplaceId);
}

export function loadMarketplaceCatalogCache(): CacheV1["byMarketplace"] | null {
  try {
    const raw = localStorage.getItem(MARKETPLACE_CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = readObject(JSON.parse(raw));
    if (parsed.version !== CACHE_VERSION) return null;
    return readObject(parsed.byMarketplace) as CacheV1["byMarketplace"];
  } catch {
    return null;
  }
}

export function saveMarketplaceCatalogCache(
  marketplaceId: string,
  plugins: MarketplacePluginEntry[],
): void {
  const current = loadMarketplaceCatalogCache() ?? {};
  current[marketplaceId] = { plugins, cachedAt: new Date().toISOString() };
  const cache: CacheV1 = { version: CACHE_VERSION, byMarketplace: current };
  localStorage.setItem(MARKETPLACE_CATALOG_CACHE_KEY, JSON.stringify(cache));
}

export function isSupportedMarketplaceSource(sourceType: string): boolean {
  return sourceType === "github";
}
