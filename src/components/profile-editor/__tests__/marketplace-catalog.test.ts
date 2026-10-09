import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMarketplaceRawUrl,
  fetchMarketplaceCatalog,
  fetchMarketplaceName,
  loadMarketplaceCatalogCache,
  parseMarketplacePluginCatalog,
  saveMarketplaceCatalogCache,
} from "../marketplace-catalog";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();
const CACHE_KEY = "code-manager-marketplace-plugin-cache:v1";

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
  vi.useRealTimers();
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

  it("fetchMarketplaceCatalog 成功时返回解析后的插件列表", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        plugins: [
          {
            name: "alpha",
            description: "desc",
            category: "cat",
            author: { name: "Anthropic" },
            source: { source: "github" },
            homepage: "https://example.com",
          },
        ],
      }),
    } as unknown as Response);
    const result = await fetchMarketplaceCatalog({
      marketplaceId: "claude-plugins-official",
      sourceType: "github",
      repo: "anthropics/claude-plugins-official",
      ref: "main",
      path: "",
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      pluginId: "alpha@claude-plugins-official",
      marketplaceId: "claude-plugins-official",
      description: "desc",
      isOfficial: true,
    });
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

  it("fetchMarketplaceName 返回 manifest 的 name 而非仓库名", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: " claude-community ", plugins: [] }),
    } as unknown as Response);
    await expect(
      fetchMarketplaceName({
        sourceType: "github",
        repo: "anthropics/claude-plugins-community",
        ref: "",
        path: "",
      }),
    ).resolves.toBe("claude-community");
  });

  it("fetchMarketplaceName 在 manifest 缺少 name 时抛错", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plugins: [] }),
    } as unknown as Response);
    await expect(
      fetchMarketplaceName({ sourceType: "github", repo: "x/y", ref: "", path: "" }),
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

it("请求无响应时超时并取消请求", async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementation(() => new Promise(() => {}));
  const request = fetchMarketplaceCatalog({
    marketplaceId: "x",
    sourceType: "github",
    repo: "x/y",
    ref: "",
    path: "",
  });
  const verdict = expect(request).rejects.toThrow(/timeout/i);
  await vi.advanceTimersByTimeAsync(30_000);
  await verdict;
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
}, 1000);
it("响应体持续等待也受请求超时限制", async () => {
  vi.useFakeTimers();
  fetchMock.mockResolvedValue({ ok: true, json: () => new Promise(() => {}) });
  const request = fetchMarketplaceCatalog({
    marketplaceId: "x",
    sourceType: "github",
    repo: "x/y",
    ref: "",
    path: "",
  });
  const verdict = expect(request).rejects.toThrow(/timeout/i);
  await vi.advanceTimersByTimeAsync(30_000);
  await verdict;
}, 1000);
