import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveMarketplaceCatalogCache } from "../marketplace-catalog";
import { useMarketplaceCatalog } from "../useMarketplaceCatalog";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

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

const SOURCES = [
  {
    marketplaceId: "claude-plugins-official",
    sourceType: "github",
    repo: "anthropics/claude-plugins-official",
    ref: "",
    path: "",
  },
  { marketplaceId: "dev", sourceType: "github", repo: "my/dev", ref: "", path: "" },
  { marketplaceId: "legacy", sourceType: "url", repo: "", ref: "", path: "" },
];

describe("useMarketplaceCatalog", () => {
  it("active=true 时并发拉取所有 github 源,标注 url 源为 unsupported", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ plugins: [{ name: "x" }] }),
    } as unknown as Response);
    const { result } = renderHook(() => useMarketplaceCatalog({ sources: SOURCES, active: true }));
    await waitFor(() => {
      expect(result.current.byMarketplace["claude-plugins-official"].status).toBe("ready");
      expect(result.current.byMarketplace.dev.status).toBe("ready");
    });
    expect(result.current.byMarketplace.legacy.unsupported).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("active=false 时不拉取", () => {
    renderHook(() => useMarketplaceCatalog({ sources: SOURCES, active: false }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshAll 强制重新拉取已支持的源", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ plugins: [] }),
    } as unknown as Response);
    const { result } = renderHook(() => useMarketplaceCatalog({ sources: SOURCES, active: true }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      await result.current.refreshAll();
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("单源 fetch 失败标记 status=error 不影响其他源", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ plugins: [] }),
      } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    const { result } = renderHook(() => useMarketplaceCatalog({ sources: SOURCES, active: true }));
    await waitFor(() => {
      const statuses = [
        result.current.byMarketplace["claude-plugins-official"].status,
        result.current.byMarketplace.dev.status,
      ];
      expect(statuses).toContain("ready");
      expect(statuses).toContain("error");
    });
  });

  it("refreshOne 只重新拉取指定 marketplace", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ plugins: [] }),
    } as unknown as Response);
    const { result } = renderHook(() => useMarketplaceCatalog({ sources: SOURCES, active: false }));
    await act(async () => {
      await result.current.refreshOne("claude-plugins-official");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.byMarketplace["claude-plugins-official"].status).toBe("ready");
    expect(result.current.byMarketplace.dev.status).toBe("idle");
  });

  it("从 localStorage 缓存初始化时 status 为 ready", () => {
    saveMarketplaceCatalogCache("claude-plugins-official", [
      {
        pluginId: "alpha@claude-plugins-official",
        marketplaceId: "claude-plugins-official",
        description: "",
        category: "",
        authorName: "",
        sourceType: "github",
        homepage: "",
        isOfficial: true,
      },
    ]);
    const { result } = renderHook(() => useMarketplaceCatalog({ sources: SOURCES, active: false }));
    expect(result.current.byMarketplace["claude-plugins-official"].status).toBe("ready");
    expect(result.current.byMarketplace["claude-plugins-official"].plugins).toHaveLength(1);
    expect(result.current.byMarketplace.dev.status).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
