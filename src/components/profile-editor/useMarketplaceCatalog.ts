import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchMarketplaceCatalog,
  loadMarketplaceCatalogCache,
  type MarketplaceFetchInput,
  type MarketplacePluginEntry,
  saveMarketplaceCatalogCache,
} from "./marketplace-catalog";

const CONCURRENCY = 5;

export interface MarketplaceSourceInput {
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

interface UseMarketplaceCatalogOptions {
  sources: MarketplaceSourceInput[];
  active: boolean;
}

export interface UseMarketplaceCatalogResult {
  byMarketplace: Record<string, MarketplaceCatalogState>;
  refreshAll: () => Promise<MarketplaceRefreshSummary[]>;
  refreshOne: (marketplaceId: string) => Promise<MarketplaceRefreshSummary | null>;
}

export interface MarketplaceRefreshSummary {
  marketplaceId: string;
  status: MarketplaceCatalogStatus;
  pluginCount: number;
  error?: string;
  unsupported?: boolean;
}

function isSupportedSource(sourceType: string): boolean {
  return sourceType === "github";
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  async function consume(): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) return;
      await worker(next);
    }
  }
  const tasks: Promise<void>[] = [];
  while (tasks.length < limit && queue.length > 0) tasks.push(consume());
  await Promise.all(tasks);
}

export function useMarketplaceCatalog({
  sources,
  active,
}: UseMarketplaceCatalogOptions): UseMarketplaceCatalogResult {
  const [byMarketplace, setByMarketplace] = useState<Record<string, MarketplaceCatalogState>>(
    () => {
      const cache = loadMarketplaceCatalogCache() ?? {};
      return sources.reduce<Record<string, MarketplaceCatalogState>>((acc, source) => {
        const cached = cache[source.marketplaceId];
        acc[source.marketplaceId] = {
          marketplaceId: source.marketplaceId,
          status: cached ? "ready" : "idle",
          plugins: cached?.plugins ?? [],
          cachedAt: cached?.cachedAt,
          unsupported: !isSupportedSource(source.sourceType),
        };
        return acc;
      }, {});
    },
  );

  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const setEntry = useCallback(
    (marketplaceId: string, partial: Partial<MarketplaceCatalogState>) => {
      setByMarketplace((current) => ({
        ...current,
        [marketplaceId]: { ...current[marketplaceId], marketplaceId, ...partial },
      }));
    },
    [],
  );

  const fetchOne = useCallback(
    async (input: MarketplaceFetchInput): Promise<MarketplaceRefreshSummary> => {
      if (!isSupportedSource(input.sourceType)) {
        setEntry(input.marketplaceId, { status: "ready", unsupported: true, plugins: [] });
        return {
          marketplaceId: input.marketplaceId,
          status: "ready",
          pluginCount: 0,
          unsupported: true,
        };
      }
      setEntry(input.marketplaceId, { status: "loading", error: undefined });
      try {
        const plugins = await fetchMarketplaceCatalog(input);
        saveMarketplaceCatalogCache(input.marketplaceId, plugins);
        setEntry(input.marketplaceId, {
          status: "ready",
          plugins,
          cachedAt: new Date().toISOString(),
          error: undefined,
        });
        return {
          marketplaceId: input.marketplaceId,
          status: "ready",
          pluginCount: plugins.length,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "fetch failed";
        setEntry(input.marketplaceId, { status: "error", error: message });
        return {
          marketplaceId: input.marketplaceId,
          status: "error",
          pluginCount: 0,
          error: message,
        };
      }
    },
    [setEntry],
  );

  useEffect(() => {
    if (!active) return;
    const supported = sourcesRef.current.filter((s) => s.sourceType === "github");
    void runWithConcurrency(supported, CONCURRENCY, async (source) => {
      await fetchOne(source);
    });
  }, [active, fetchOne]);

  const refreshAll = useCallback(async () => {
    const sources = sourcesRef.current;
    const summaries: Record<string, MarketplaceRefreshSummary> = {};
    await runWithConcurrency(sources, CONCURRENCY, async (source) => {
      summaries[source.marketplaceId] = await fetchOne(source);
    });
    return sources.map((source) => summaries[source.marketplaceId]).filter(Boolean);
  }, [fetchOne]);

  const refreshOne = useCallback(
    async (marketplaceId: string) => {
      const source = sourcesRef.current.find((item) => item.marketplaceId === marketplaceId);
      if (!source) return null;
      return fetchOne(source);
    },
    [fetchOne],
  );

  return useMemo(
    () => ({ byMarketplace, refreshAll, refreshOne }),
    [byMarketplace, refreshAll, refreshOne],
  );
}
