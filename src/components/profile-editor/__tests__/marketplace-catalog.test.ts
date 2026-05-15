import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMarketplaceRawUrl,
  fetchMarketplaceCatalog,
  loadMarketplaceCatalogCache,
  parseMarketplacePluginCatalog,
  saveMarketplaceCatalogCache,
} from "../marketplace-catalog";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();
const CACHE_KEY = "ai-manager-marketplace-plugin-cache:v1";

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "fetch", {
    value: originalFetch,
    writable: true,
    configurable: true,
  });
});

describe("marketplace-catalog", () => {
  it("buildMarketplaceRawUrl 推导 github raw URL", () => {
    expect(
      buildMarketplaceRawUrl({
        sourceType: "github",
        repo: "anthropics/foo",
        ref: "main",
        path: "",
      }),
    ).toBe("https://raw.githubusercontent.com/anthropics/foo/main/.claude-plugin/marketplace.json");
    expect(
      buildMarketplaceRawUrl({ sourceType: "github", repo: "x/y", ref: "", path: "sub/dir" }),
    ).toBe("https://raw.githubusercontent.com/x/y/main/sub/dir/.claude-plugin/marketplace.json");
  });

  it("buildMarketplaceRawUrl 对非 github 源返回 null", () => {
    expect(buildMarketplaceRawUrl({ sourceType: "url", repo: "", ref: "", path: "" })).toBeNull();
  });

  it("parseMarketplacePluginCatalog 把 manifest plugins 转成带 marketplaceId 的条目", () => {
    const manifest = {
      plugins: [
        {
          name: "alpha",
          description: "d",
          category: "c",
          author: { name: "Anthropic" },
          source: { source: "github" },
          homepage: "h",
        },
      ],
    };
    const result = parseMarketplacePluginCatalog(manifest, "claude-plugins-official");
    expect(result).toEqual([
      {
        pluginId: "alpha@claude-plugins-official",
        marketplaceId: "claude-plugins-official",
        description: "d",
        category: "c",
        authorName: "Anthropic",
        sourceType: "github",
        homepage: "h",
        isOfficial: true,
      },
    ]);
  });

  it("fetchMarketplaceCatalog 失败抛错", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await expect(
      fetchMarketplaceCatalog({
        marketplaceId: "x",
        sourceType: "github",
        repo: "x/y",
        ref: "",
        path: "",
      }),
    ).rejects.toThrow();
  });

  it("save / load 缓存按 marketplaceId 索引", () => {
    saveMarketplaceCatalogCache("a", []);
    saveMarketplaceCatalogCache("b", []);
    const cache = loadMarketplaceCatalogCache();
    expect(Object.keys(cache ?? {}).sort()).toEqual(["a", "b"]);
    expect(localStorage.getItem(CACHE_KEY)).toContain('"a"');
  });
});
