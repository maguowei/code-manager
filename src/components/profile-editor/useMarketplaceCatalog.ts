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

  // 已发起拉取的 marketplaceId 集合，用于识别新增 source（避免重复拉取已知源）
  const knownIdsRef = useRef<Set<string>>(new Set(Object.keys(byMarketplace)));

  // 组件卸载后阻止 setState，避免 in-flight fetch resolve 时写入已卸载组件状态
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setEntry = useCallback(
    (marketplaceId: string, partial: Partial<MarketplaceCatalogState>) => {
      if (!mountedRef.current) return;
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

  // active 切入时全量拉取并把当前 source 视为已知（重置基线）
  useEffect(() => {
    if (!active) return;
    knownIdsRef.current = new Set(sourcesRef.current.map((s) => s.marketplaceId));
    const supported = sourcesRef.current.filter((s) => s.sourceType === "github");
    void runWithConcurrency(supported, CONCURRENCY, async (source) => {
      await fetchOne(source);
    });
  }, [active, fetchOne]);

  // active 时增量拉取新增 source（如浏览页快速添加市场后），不重复拉已知源
  useEffect(() => {
    if (!active) return;
    const fresh = sources.filter((source) => !knownIdsRef.current.has(source.marketplaceId));
    if (fresh.length === 0) return;
    for (const source of fresh) {
      knownIdsRef.current.add(source.marketplaceId);
    }
    // 先为新源建占位条目，立即可见 loading / unsupported 状态
    setByMarketplace((current) => {
      const next = { ...current };
      for (const source of fresh) {
        if (!next[source.marketplaceId]) {
          const supported = isSupportedSource(source.sourceType);
          next[source.marketplaceId] = {
            marketplaceId: source.marketplaceId,
            status: supported ? "loading" : "ready",
            plugins: [],
            unsupported: !supported,
          };
        }
      }
      return next;
    });
    void runWithConcurrency(fresh, CONCURRENCY, async (source) => {
      await fetchOne(source);
    });
  }, [active, sources, fetchOne]);

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
