# 插件管理 UI 重设计 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `EnabledPluginsEditor` 重构为「已启用 / 浏览市场」双 Tab,用真实 settings 状态消除现有的 draft 行混乱,同时把「加载官方插件」从命令式按钮升级为跨 marketplace 浏览体验。

**Architecture:** 在 `EnabledPluginsEditor` 引入 shadcn `Tabs`,把列表 UI 抽到 `EnabledPluginsTab`,新建 `BrowseMarketplaceTab`;两个 Tab 共享一个 `useEnabledPluginsState` hook 管理 `plugins` state,保证启用/禁用实时同步。`official-plugin-catalog.ts` 扩展为 `marketplace-catalog.ts`,提供按 `marketplaceId` 索引的多源拉取与缓存(阶段 1 仅支持 `source: github`)。`StructuredSettingsSections.tsx` 同步删除「加载官方插件」工具栏 prop,并新增 `extraKnownMarketplaces` 透传。

**Tech Stack:** React 19 + TypeScript + shadcn (Tabs / Empty / Popover / Button / Input / Select) + Tailwind v4 + Vitest + Testing Library。

**参考 Spec:** `docs/superpowers/specs/2026-05-15-plugin-management-ui-redesign.md`

---

## 文件结构

| 文件 | 责任 | 状态 |
| --- | --- | --- |
| `src/components/profile-editor/EnabledPluginsEditor.tsx` | 双 Tab 容器,组装 hook 与两个 Tab | 修改(从 916 行减到 ~120 行) |
| `src/components/profile-editor/EnabledPluginsTab.tsx` | Tab 1: 表格 + 筛选 + 手动 ID 录入 + 删除 | 新建 |
| `src/components/profile-editor/BrowseMarketplaceTab.tsx` | Tab 2: 跨源浏览 + 启用/取消启用 + 失败 popover | 新建 |
| `src/components/profile-editor/useEnabledPluginsState.ts` | 共享 plugins state hook | 新建 |
| `src/components/profile-editor/marketplace-catalog.ts` | 多 marketplace 拉取/缓存,扩展自 `official-plugin-catalog.ts` | 新建,逐步替换旧文件 |
| `src/components/profile-editor/official-plugin-catalog.ts` | 仅保留官方目录的 specialization,转发给 marketplace-catalog | 缩减 |
| `src/components/profile-editor/StructuredSettingsSections.tsx` | 删除 `showOfficialToolbar` / `onOfficialActionChange`,新增 `extraKnownMarketplaces` 透传 | 修改 |
| `src/components/ProfileEditor.tsx` | 把 `extraKnownMarketplaces` 传到结构化分区 | 修改 |
| `src/components/PresetEditor.tsx` | 同上 | 修改 |
| `src/i18n.ts` | 新增 Tab、浏览市场、空状态相关 zh / en key | 修改 |
| `src/components/profile-editor/__tests__/EnabledPluginsEditor.test.tsx` | 双 Tab 集成测试 | 修改 |
| `src/components/profile-editor/__tests__/BrowseMarketplaceTab.test.tsx` | Tab 2 单元测试 | 新建 |
| `src/components/profile-editor/__tests__/marketplace-catalog.test.ts` | 拉取/缓存单测 | 新建 |
| `src/components/profile-editor/__tests__/useEnabledPluginsState.test.tsx` | hook 单测 | 新建 |

---

### Task 1: 抽出 `useEnabledPluginsState` 共享 hook

**Files:**
- Create: `src/components/profile-editor/useEnabledPluginsState.ts`
- Create: `src/components/profile-editor/__tests__/useEnabledPluginsState.test.tsx`

- [ ] **Step 1.1: 写失败测试**

```ts
// src/components/profile-editor/__tests__/useEnabledPluginsState.test.tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEnabledPluginsState } from "../useEnabledPluginsState";

describe("useEnabledPluginsState", () => {
  it("从 boolean entries 构建初始 plugins,保留非布尔条目作为 preserved", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useEnabledPluginsState({
        value: { "a@official": true, "b@official": false, legacy: ["x"] },
        onChange,
      }),
    );
    expect(result.current.plugins).toEqual([
      { id: "plugin:a@official", pluginId: "a@official", enabled: true, committed: true },
      { id: "plugin:b@official", pluginId: "b@official", enabled: false, committed: true },
    ]);
    expect(result.current.preservedEntries).toEqual({ legacy: ["x"] });
  });

  it("addPlugin 在已存在时返回 false", () => {
    const { result } = renderHook(() =>
      useEnabledPluginsState({ value: { "a@official": true }, onChange: vi.fn() }),
    );
    let added: boolean | undefined;
    act(() => {
      added = result.current.addPlugin("a@official", true);
    });
    expect(added).toBe(false);
  });

  it("togglePlugin 切换 enabled 并保留 committed", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useEnabledPluginsState({ value: { "a@official": true }, onChange }),
    );
    act(() => result.current.togglePlugin("a@official"));
function buildRecord(
  plugins: PluginEntry[],
  preservedEntries: Record<string, unknown>,
): Record<string, unknown> {
  return plugins.reduce<Record<string, unknown>>(
    (accumulator, plugin) => {
      if (plugin.committed) {
        accumulator[plugin.pluginId] = plugin.enabled;
      }
      return accumulator;
    },
    { ...preservedEntries },
  );
}

function recordsEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) => rightKeys.includes(key) && JSON.stringify(left[key]) === JSON.stringify(right[key]),
  );
}

export interface UseEnabledPluginsStateResult {
  plugins: PluginEntry[];
  preservedEntries: Record<string, unknown>;
  addPlugin: (pluginId: string, enabled: boolean) => boolean;
  togglePlugin: (pluginId: string) => void;
  removePlugin: (id: string) => void;
}

export function useEnabledPluginsState({
  value,
  onChange,
}: UseEnabledPluginsStateOptions): UseEnabledPluginsStateResult {
  const { sourceEntries, booleanEntries, preservedEntries } = useMemo(
    () => splitEntries(value),
    [value],
  );
  const initialPlugins = useMemo(() => buildEntries(booleanEntries), [booleanEntries]);
  const [plugins, setPlugins] = useState(initialPlugins);

  useEffect(() => {
    setPlugins(initialPlugins);
  }, [initialPlugins]);

  useEffect(() => {
    const next = buildRecord(plugins, preservedEntries);
    if (!recordsEqual(next, sourceEntries)) {
      onChange(next);
    }
  }, [onChange, plugins, preservedEntries, sourceEntries]);

  const addPlugin = useCallback((pluginId: string, enabled: boolean): boolean => {
    let added = true;
    setPlugins((current) => {
      if (current.some((plugin) => plugin.pluginId === pluginId)) {
        added = false;
        return current;
      }
      return [...current, { id: `plugin:${pluginId}`, pluginId, enabled, committed: true }];
    });
    return added;
  }, []);

  const togglePlugin = useCallback((pluginId: string) => {
    setPlugins((current) =>
      current.map((plugin) =>
        plugin.pluginId === pluginId
          ? { ...plugin, enabled: !plugin.enabled, committed: true }
          : plugin,
      ),
    );
  }, []);

  const removePlugin = useCallback((id: string) => {
    setPlugins((current) => current.filter((plugin) => plugin.id !== id));
  }, []);

  return { plugins, preservedEntries, addPlugin, togglePlugin, removePlugin };
}
```

- [ ] **Step 1.4: 跑测试,确认通过**

Run: `pnpm test -- useEnabledPluginsState`
Expected: 3/3 通过。

- [ ] **Step 1.5: 提交**

```bash
git add src/components/profile-editor/useEnabledPluginsState.ts \
  src/components/profile-editor/__tests__/useEnabledPluginsState.test.tsx
git commit -m "feat(profile-editor): 抽出 useEnabledPluginsState 共享 hook"
```

---

### Task 2: 新建 `marketplace-catalog.ts` 多源拉取模块

**Files:**
- Create: `src/components/profile-editor/marketplace-catalog.ts`
- Create: `src/components/profile-editor/__tests__/marketplace-catalog.test.ts`
- Modify: `src/components/profile-editor/official-plugin-catalog.ts`

阶段 1 仅支持 `source: github`,通过 `repo` + `ref` + `path` 推导 raw URL,与 `OFFICIAL_MARKETPLACE_RAW_URL` 同源结构。

- [ ] **Step 2.1: 写失败测试**

```ts
// src/components/profile-editor/__tests__/marketplace-catalog.test.ts
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
  Object.defineProperty(globalThis, "fetch", { value: fetchMock, writable: true, configurable: true });
});

afterEach(() => {
  Object.defineProperty(globalThis, "fetch", { value: originalFetch, writable: true, configurable: true });
});

describe("marketplace-catalog", () => {
  it("buildMarketplaceRawUrl 推导 github raw URL", () => {
    expect(
      buildMarketplaceRawUrl({ sourceType: "github", repo: "anthropics/foo", ref: "main", path: "" }),
    ).toBe("https://raw.githubusercontent.com/anthropics/foo/main/.claude-plugin/marketplace.json");
    expect(
      buildMarketplaceRawUrl({ sourceType: "github", repo: "x/y", ref: "", path: "sub/dir" }),
    ).toBe("https://raw.githubusercontent.com/x/y/main/sub/dir/.claude-plugin/marketplace.json");
  });

  it("buildMarketplaceRawUrl 对非 github 源返回 null", () => {
    expect(buildMarketplaceRawUrl({ sourceType: "url", repo: "", ref: "", path: "" })).toBeNull();
  });

  it("parseMarketplacePluginCatalog 把 manifest plugins 转成带 marketplaceId 的条目", () => {
    const manifest = { plugins: [{ name: "alpha", description: "d", category: "c", author: { name: "Anthropic" }, source: { source: "github" }, homepage: "h" }] };
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

  it("fetchMarketplaceCatalog 失败时抛错并保留缓存可读", async () => {
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
    expect(localStorage.getItem(CACHE_KEY)).toContain("\"a\"");
  });
});
```

- [ ] **Step 2.2: 跑测试,确认失败**

Run: `pnpm test -- marketplace-catalog`
Expected: 模块未找到。

- [ ] **Step 2.3: 实现 marketplace-catalog**

```ts
// src/components/profile-editor/marketplace-catalog.ts
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
```


Run: `pnpm test -- useEnabledPluginsState`
Expected: 模块未找到。

- [ ] **Step 1.3: 实现 hook**

```ts
// src/components/profile-editor/useEnabledPluginsState.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PluginDraft } from "./editor-utils";
import { readObject } from "./editor-utils";

export interface PluginEntry extends PluginDraft {
  committed: boolean;
}

interface UseEnabledPluginsStateOptions {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
}

interface SplitResult {
  sourceEntries: Record<string, unknown>;
  booleanEntries: Record<string, boolean>;
  preservedEntries: Record<string, unknown>;
}

function splitEntries(value: unknown): SplitResult {
  const sourceEntries = readObject(value);
  const booleanEntries: Record<string, boolean> = {};
  const preservedEntries: Record<string, unknown> = {};
  Object.entries(sourceEntries).forEach(([id, entry]) => {
    if (typeof entry === "boolean") {
      booleanEntries[id] = entry;
    } else {
      preservedEntries[id] = entry;
    }
  });
  return { sourceEntries, booleanEntries, preservedEntries };
}

function buildEntries(value: Record<string, boolean>): PluginEntry[] {
  return Object.entries(value).map(([pluginId, enabled]) => ({
    id: `plugin:${pluginId}`,
    pluginId,
    enabled,
    committed: true,
  }));
}
```

function buildRecord(
  plugins: PluginEntry[],
  preservedEntries: Record<string, unknown>,
): Record<string, unknown> {
  return plugins.reduce<Record<string, unknown>>(
    (accumulator, plugin) => {
      if (plugin.committed) {
        accumulator[plugin.pluginId] = plugin.enabled;
      }
      return accumulator;
    },
    { ...preservedEntries },
  );
}

function recordsEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) => rightKeys.includes(key) && JSON.stringify(left[key]) === JSON.stringify(right[key]),
  );
}

export interface UseEnabledPluginsStateResult {
  plugins: PluginEntry[];
  preservedEntries: Record<string, unknown>;
  addPlugin: (pluginId: string, enabled: boolean) => boolean;
  togglePlugin: (pluginId: string) => void;
  removePlugin: (id: string) => void;
}

export function useEnabledPluginsState({
  value,
  onChange,
}: UseEnabledPluginsStateOptions): UseEnabledPluginsStateResult {
  const { sourceEntries, booleanEntries, preservedEntries } = useMemo(
    () => splitEntries(value),
    [value],
  );
  const initialPlugins = useMemo(() => buildEntries(booleanEntries), [booleanEntries]);
  const [plugins, setPlugins] = useState(initialPlugins);

  useEffect(() => setPlugins(initialPlugins), [initialPlugins]);

  useEffect(() => {
    const next = buildRecord(plugins, preservedEntries);
    if (!recordsEqual(next, sourceEntries)) onChange(next);
  }, [onChange, plugins, preservedEntries, sourceEntries]);
  const addPlugin = useCallback((pluginId: string, enabled: boolean): boolean => {
    let added = true;
    setPlugins((current) => {
      if (current.some((plugin) => plugin.pluginId === pluginId)) {
        added = false;
        return current;
      }
      return [...current, { id: `plugin:${pluginId}`, pluginId, enabled, committed: true }];
    });
    return added;
  }, []);

  const togglePlugin = useCallback((pluginId: string) => {
    setPlugins((current) =>
      current.map((plugin) =>
        plugin.pluginId === pluginId
          ? { ...plugin, enabled: !plugin.enabled, committed: true }
          : plugin,
      ),
    );
  }, []);

  const removePlugin = useCallback((id: string) => {
    setPlugins((current) => current.filter((plugin) => plugin.id !== id));
  }, []);

  return { plugins, preservedEntries, addPlugin, togglePlugin, removePlugin };
}
```

- [ ] **Step 1.4: 跑测试,确认通过**

Run: `pnpm test -- useEnabledPluginsState`
Expected: 3/3 通过。

- [ ] **Step 1.5: 提交**

```bash
git add src/components/profile-editor/useEnabledPluginsState.ts \
  src/components/profile-editor/__tests__/useEnabledPluginsState.test.tsx
git commit -m "feat(profile-editor): 抽出 useEnabledPluginsState 共享 hook"
```

---

### Task 2: 新建 `marketplace-catalog.ts` 多源拉取模块

**Files:**
- Create: `src/components/profile-editor/marketplace-catalog.ts`
- Create: `src/components/profile-editor/__tests__/marketplace-catalog.test.ts`
- Modify: `src/components/profile-editor/official-plugin-catalog.ts`

阶段 1 仅支持 `source: github`,通过 `repo` + `ref` + `path` 推导 raw URL,与 `OFFICIAL_MARKETPLACE_RAW_URL` 同源结构。

- [ ] **Step 2.1: 写失败测试**

```ts
// src/components/profile-editor/__tests__/marketplace-catalog.test.ts
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
    value: fetchMock, writable: true, configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "fetch", {
    value: originalFetch, writable: true, configurable: true,
  });
});

describe("marketplace-catalog", () => {
  it("buildMarketplaceRawUrl 推导 github raw URL", () => {
    expect(
      buildMarketplaceRawUrl({ sourceType: "github", repo: "anthropics/foo", ref: "main", path: "" }),
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
      plugins: [{ name: "alpha", description: "d", category: "c",
        author: { name: "Anthropic" }, source: { source: "github" }, homepage: "h" }],
    };
    const result = parseMarketplacePluginCatalog(manifest, "claude-plugins-official");
    expect(result).toEqual([{
      pluginId: "alpha@claude-plugins-official",
      marketplaceId: "claude-plugins-official",
      description: "d", category: "c", authorName: "Anthropic",
      sourceType: "github", homepage: "h", isOfficial: true,
    }]);
  });

  it("fetchMarketplaceCatalog 失败抛错", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await expect(
      fetchMarketplaceCatalog({
        marketplaceId: "x", sourceType: "github", repo: "x/y", ref: "", path: "",
      }),
    ).rejects.toThrow();
  });

  it("save / load 缓存按 marketplaceId 索引", () => {
    saveMarketplaceCatalogCache("a", []);
    saveMarketplaceCatalogCache("b", []);
    const cache = loadMarketplaceCatalogCache();
    expect(Object.keys(cache ?? {}).sort()).toEqual(["a", "b"]);
    expect(localStorage.getItem(CACHE_KEY)).toContain("\"a\"");
  });
});
```

- [ ] **Step 2.2: 跑测试,确认失败**

Run: `pnpm test -- marketplace-catalog`
Expected: 模块未找到。

- [ ] **Step 2.3: 实现 marketplace-catalog**

```ts
// src/components/profile-editor/marketplace-catalog.ts
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
  sourceType: string; repo: string; ref: string; path: string;
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
      pluginId, marketplaceId,
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
  marketplaceId: string, plugins: MarketplacePluginEntry[],
): void {
  const current = loadMarketplaceCatalogCache() ?? {};
  current[marketplaceId] = { plugins, cachedAt: new Date().toISOString() };
  const cache: CacheV1 = { version: CACHE_VERSION, byMarketplace: current };
  localStorage.setItem(MARKETPLACE_CATALOG_CACHE_KEY, JSON.stringify(cache));
}

export function isSupportedMarketplaceSource(sourceType: string): boolean {
  return sourceType === "github";
}
```

- [ ] **Step 2.4: 跑测试,确认通过**

Run: `pnpm test -- marketplace-catalog`
Expected: 5/5 通过。

- [ ] **Step 2.5: 把官方目录适配到新模块**

```ts
// src/components/profile-editor/official-plugin-catalog.ts (整体重写)
import {
  fetchMarketplaceCatalog,
  loadMarketplaceCatalogCache,
  type MarketplacePluginEntry,
  saveMarketplaceCatalogCache,
} from "./marketplace-catalog";
import { OFFICIAL_MARKETPLACE_ID, OFFICIAL_MARKETPLACE_REPO } from "./marketplace-presets";

export type OfficialPluginMetadata = MarketplacePluginEntry;
export const OFFICIAL_PLUGIN_CACHE_KEY = "ai-manager-official-plugin-cache:v1";

export function createOfficialPluginMetadataMap(
  plugins: OfficialPluginMetadata[],
): Record<string, OfficialPluginMetadata> {
  return plugins.reduce<Record<string, OfficialPluginMetadata>>((accumulator, plugin) => {
    accumulator[plugin.pluginId] = plugin;
    return accumulator;
  }, {});
}

export function loadOfficialPluginCache(): { plugins: OfficialPluginMetadata[] } | null {
  const cache = loadMarketplaceCatalogCache();
  const entry = cache?.[OFFICIAL_MARKETPLACE_ID];
  return entry ? { plugins: entry.plugins } : null;
}

export function saveOfficialPluginCache(plugins: OfficialPluginMetadata[]) {
  saveMarketplaceCatalogCache(OFFICIAL_MARKETPLACE_ID, plugins);
}

export async function fetchOfficialPluginCatalog(): Promise<OfficialPluginMetadata[]> {
  return fetchMarketplaceCatalog({
    marketplaceId: OFFICIAL_MARKETPLACE_ID,
    sourceType: "github",
    repo: OFFICIAL_MARKETPLACE_REPO,
    ref: "main",
    path: "",
  });
}
```

- [ ] **Step 2.6: 跑现有 EnabledPluginsEditor 测试,确认未破坏官方目录**

Run: `pnpm test -- EnabledPluginsEditor`
Expected: 现有用例通过(本 task 暂不修改 UI,只做了官方目录的内部接线)。

- [ ] **Step 2.7: 提交**

```bash
git add src/components/profile-editor/marketplace-catalog.ts \
  src/components/profile-editor/official-plugin-catalog.ts \
  src/components/profile-editor/__tests__/marketplace-catalog.test.ts
git commit -m "feat(profile-editor): 新增 marketplace-catalog 多源拉取与缓存模块"
```

---

### Task 3: 新建 `useMarketplaceCatalog` hook

**Files:**
- Create: `src/components/profile-editor/useMarketplaceCatalog.ts`
- Create: `src/components/profile-editor/__tests__/useMarketplaceCatalog.test.tsx`

聚合所有已配置 marketplace 的拉取状态,缓存命中,并发限流(chunk=5),刷新单个或全部。

- [ ] **Step 3.1: 写失败测试**

```tsx
// src/components/profile-editor/__tests__/useMarketplaceCatalog.test.tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarketplaceCatalog } from "../useMarketplaceCatalog";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock, writable: true, configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "fetch", {
    value: originalFetch, writable: true, configurable: true,
  });
});

const SOURCES = [
  { marketplaceId: "claude-plugins-official", sourceType: "github",
    repo: "anthropics/claude-plugins-official", ref: "", path: "" },
  { marketplaceId: "dev", sourceType: "github", repo: "my/dev", ref: "", path: "" },
  { marketplaceId: "legacy", sourceType: "url", repo: "", ref: "", path: "" },
];

describe("useMarketplaceCatalog", () => {
  it("active=true 时并发拉取所有 github 源,标注 url 源为 unsupported", async () => {
    fetchMock.mockResolvedValue({
      ok: true, json: async () => ({ plugins: [{ name: "x" }] }),
    } as unknown as Response);
    const { result } = renderHook(() =>
      useMarketplaceCatalog({ sources: SOURCES, active: true }),
    );
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
      ok: true, json: async () => ({ plugins: [] }),
    } as unknown as Response);
    const { result } = renderHook(() =>
      useMarketplaceCatalog({ sources: SOURCES, active: true }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => { await result.current.refreshAll(); });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("单源 fetch 失败标记 status=error 不影响其他源", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ plugins: [] }) } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    const { result } = renderHook(() =>
      useMarketplaceCatalog({ sources: SOURCES, active: true }),
    );
    await waitFor(() => {
      expect(result.current.byMarketplace["claude-plugins-official"].status).toBe("ready");
      expect(result.current.byMarketplace.dev.status).toBe("error");
    });
  });
});
```

- [ ] **Step 3.2: 跑测试,确认失败**

Run: `pnpm test -- useMarketplaceCatalog`
Expected: 模块未找到。

- [ ] **Step 3.3: 实现 hook**

```ts
// src/components/profile-editor/useMarketplaceCatalog.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchMarketplaceCatalog,
  isSupportedMarketplaceSource,
  loadMarketplaceCatalogCache,
  type MarketplaceCatalogState,
  type MarketplaceFetchInput,
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

interface UseMarketplaceCatalogOptions {
  sources: MarketplaceSourceInput[];
  active: boolean;
}

export interface UseMarketplaceCatalogResult {
  byMarketplace: Record<string, MarketplaceCatalogState>;
  refreshAll: () => Promise<void>;
  refreshOne: (marketplaceId: string) => Promise<void>;
}

async function runWithConcurrency<T>(
  items: T[], limit: number, worker: (item: T) => Promise<void>,
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
  sources, active,
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
          unsupported: !isSupportedMarketplaceSource(source.sourceType),
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
    async (input: MarketplaceFetchInput) => {
      if (!isSupportedMarketplaceSource(input.sourceType)) {
        setEntry(input.marketplaceId, {
          status: "ready", unsupported: true, plugins: [],
        });
        return;
      }
      setEntry(input.marketplaceId, { status: "loading", error: undefined });
      try {
        const plugins = await fetchMarketplaceCatalog(input);
        saveMarketplaceCatalogCache(input.marketplaceId, plugins);
        setEntry(input.marketplaceId, {
          status: "ready", plugins, cachedAt: new Date().toISOString(), error: undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "fetch failed";
        setEntry(input.marketplaceId, { status: "error", error: message });
      }
    },
    [setEntry],
  );

  useEffect(() => {
    if (!active) return;
    void runWithConcurrency(sourcesRef.current, CONCURRENCY, (source) => fetchOne(source));
  }, [active, fetchOne]);

  const refreshAll = useCallback(async () => {
    await runWithConcurrency(sourcesRef.current, CONCURRENCY, (source) => fetchOne(source));
  }, [fetchOne]);

  const refreshOne = useCallback(
    async (marketplaceId: string) => {
      const source = sourcesRef.current.find((item) => item.marketplaceId === marketplaceId);
      if (!source) return;
      await fetchOne(source);
    },
    [fetchOne],
  );

  return useMemo(
    () => ({ byMarketplace, refreshAll, refreshOne }),
    [byMarketplace, refreshAll, refreshOne],
  );
}
```

- [ ] **Step 3.4: 跑测试,确认通过**

Run: `pnpm test -- useMarketplaceCatalog`
Expected: 4/4 通过。

- [ ] **Step 3.5: 提交**

```bash
git add src/components/profile-editor/useMarketplaceCatalog.ts \
  src/components/profile-editor/__tests__/useMarketplaceCatalog.test.tsx
git commit -m "feat(profile-editor): 新增 useMarketplaceCatalog 多源拉取 hook"
```

---

### Task 4: 新增 i18n key

**Files:**
- Modify: `src/i18n.ts`

- [ ] **Step 4.1: 在 zh / en 两份 dictionary 中插入新 key**

按 spec 的 i18n 表新增以下 key,放在 `profileEditor.plugins.*` 现有块内。zh / en 两份都加,顺序与 spec 表一致:

```ts
// zh
"profileEditor.plugins.tabEnabled": "已启用",
"profileEditor.plugins.tabBrowse": "浏览市场",
"profileEditor.plugins.browse.searchPlaceholder": "搜索 ID / 描述 / 作者...",
"profileEditor.plugins.browse.marketplaceFilterLabel": "Marketplace",
"profileEditor.plugins.browse.marketplaceFilterAll": "全部 marketplace",
"profileEditor.plugins.browse.statusBarSummary": "共 {total} 个插件 · {enabled} 已启用 · 来自 {sources} 个 marketplace",
"profileEditor.plugins.browse.failureSummary": "{count} 个来源加载失败 · 查看",
"profileEditor.plugins.browse.failurePopoverTitle": "加载失败的来源",
"profileEditor.plugins.browse.failureRetry": "重试",
"profileEditor.plugins.browse.refreshAll": "刷新",
"profileEditor.plugins.browse.actionEnable": "+ 启用",
"profileEditor.plugins.browse.actionEnabled": "已启用",
"profileEditor.plugins.browse.actionDisable": "取消启用",
"profileEditor.plugins.browse.unsupportedSourceHint": "{count} 个来源暂不支持,仅展示 GitHub 来源",
"profileEditor.plugins.browse.emptyNoMarketplace": "未配置插件来源",
"profileEditor.plugins.browse.emptyNoMarketplaceHint": "请在 Marketplace 分区添加来源",
"profileEditor.plugins.browse.emptyAllFailed": "全部来源加载失败,请重试",
"profileEditor.plugins.browse.emptyNoMatch": "未找到匹配插件",
"profileEditor.plugins.browse.sortHint": "显示 {start}-{end},共 {total} 项 · 按 pluginId 升序",
"profileEditor.plugins.browse.verifiedLabel": "已验证",
"profileEditor.plugins.emptyEnabled": "还没启用插件",
"profileEditor.plugins.emptyEnabledGoBrowse": "去浏览市场",
"profileEditor.plugins.emptyEnabledManualId": "手动输入 ID",
```

en 用同一组 key 翻译,变量占位符(`{count}` 等)保持一致。

- [ ] **Step 4.2: 跑测试,确保现有 i18n 用例不破裂**

Run: `pnpm test -- i18n`
Expected: 通过(若未触及 i18n 测试文件,跳过本步)。

- [ ] **Step 4.3: 提交**

```bash
git add src/i18n.ts
git commit -m "feat(i18n): 新增插件管理双 Tab 文案"
```

---

### Task 5: 新建 `EnabledPluginsTab` 组件(纯 UI 抽离)

**Files:**
- Create: `src/components/profile-editor/EnabledPluginsTab.tsx`

把现有 `EnabledPluginsEditor` 中的列表 + 筛选 + 删除 + 手动 ID 录入抽到独立组件。**删除**「加载官方插件」按钮整段。空状态用 shadcn `Empty`。

- [ ] **Step 5.1: 创建文件骨架**

```tsx
// src/components/profile-editor/EnabledPluginsTab.tsx
import { Plus, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import ConfirmAlertDialog from "../ConfirmAlertDialog";
import { Button } from "../ui/button";
import { Empty, EmptyContent, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { InputGroup, InputGroupInput } from "../ui/input-group";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { createRowId, type PluginDraft } from "./editor-utils";
import { type OfficialPluginMetadata } from "./official-plugin-catalog";
import RequiredBadge from "./RequiredBadge";
import { SandboxSwitchControl } from "./SandboxEditor";
import { type PluginEntry } from "./useEnabledPluginsState";

type StatusFilter = "all" | "enabled" | "disabled";
type MetaFilter = "all" | string;

interface EnabledPluginsTabProps {
  plugins: PluginEntry[];
  metadataMap: Record<string, OfficialPluginMetadata>;
  onTogglePlugin: (pluginId: string) => void;
  onRemovePlugin: (id: string) => void;
  onAddPlugin: (pluginId: string) => boolean;
  onGoBrowse: () => void;
  onError: (message: string) => void;
}

export default function EnabledPluginsTab(props: EnabledPluginsTabProps) {
  // 主体在 Step 5.2
  return null;
}
```

- [ ] **Step 5.2: 把现有 `EnabledPluginsEditor` 第 219-913 行的筛选 / 列表 / draft inline / 删除整段移植到此文件**

直接复制原 `EnabledPluginsEditor` 函数体内的:
- 筛选 useState(`searchQuery` / `statusFilter` / `categoryFilter` / `sourceTypeFilter`)
- `categoryOptions` / `sourceTypeOptions` / `filteredPlugins` useMemo
- `visiblePlugins` useMemo(把 `metadataMap` 注入,不再读 `officialPluginMetadataMap`)
- 列表 JSX(grid 列、副标题、SandboxSwitchControl、删除按钮)
- draft inline 表单(`Input` + `Save` / `Cancel`)
- `pendingDeletePlugin` 状态与 `ConfirmAlertDialog`
- 错误冒泡 `useEffect(() => onError(...), [...])`

差异处:

1. **删掉所有「加载官方插件」相关代码**:`officialPluginAction` useMemo、`useEffect(onOfficialActionChange)`、loading 状态、toast 调用、`fetchOfficialPluginCatalog` import、`appendOfficialPlugins` callback、`OFFICIAL_PLUGIN_MIN_LOADING_MS` 常量、`waitForOfficialPluginFeedback` 工具。`showOfficialToolbar` / `officialMarketplaceEnabled` / `onOfficialActionChange` 三个 prop 全删。
2. **空状态用 shadcn Empty**:

```tsx
{plugins.length === 0 && !draft ? (
  <Empty>
    <EmptyTitle>{t("profileEditor.plugins.emptyEnabled")}</EmptyTitle>
    <EmptyContent className="flex flex-row gap-2">
      <Button type="button" onClick={onGoBrowse}>
        {t("profileEditor.plugins.emptyEnabledGoBrowse")}
      </Button>
      <Button type="button" variant="outline" onClick={handleAddPlugin}>
        {t("profileEditor.plugins.emptyEnabledManualId")}
      </Button>
    </EmptyContent>
  </Empty>
) : null}
```

3. **`updatePlugin` 改为调 `onTogglePlugin(plugin.pluginId)`**;`handleRemovePlugin` 改为调 `onRemovePlugin(id)`。
4. **`handleSaveDraft` 改为调 `onAddPlugin(pluginId)`**(`addPlugin` 在 hook 中始终设 `committed: true`,行为等价于原来的"保存 draft");失败(返回 false)时复用 `errorIdDuplicate`。
5. **`metadataMap` 来自 prop 而非内部 state**;移除 `officialPluginCatalog` useState、`createOfficialPluginMetadataMap` 调用。

- [ ] **Step 5.3: 静态检查**

Run: `pnpm biome:ci`
Expected: 通过。如有 unused warning,等 Task 7 接通后消除。

- [ ] **Step 5.4: 提交**

```bash
git add src/components/profile-editor/EnabledPluginsTab.tsx
git commit -m "feat(profile-editor): 抽出 EnabledPluginsTab 列表组件"
```

---

### Task 6: 新建 `BrowseMarketplaceTab` 组件

**Files:**
- Create: `src/components/profile-editor/BrowseMarketplaceTab.tsx`
- Create: `src/components/profile-editor/__tests__/BrowseMarketplaceTab.test.tsx`

- [ ] **Step 6.1: 写失败测试**

```tsx
// src/components/profile-editor/__tests__/BrowseMarketplaceTab.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n";
import BrowseMarketplaceTab from "../BrowseMarketplaceTab";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

const SOURCES = [
  { marketplaceId: "claude-plugins-official", sourceType: "github",
    repo: "anthropics/claude-plugins-official", ref: "", path: "" },
];

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock, writable: true, configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "fetch", {
    value: originalFetch, writable: true, configurable: true,
  });
});

function renderTab(props?: Partial<React.ComponentProps<typeof BrowseMarketplaceTab>>) {
  const onAddPlugin = vi.fn(() => true);
  const onTogglePlugin = vi.fn();
  return render(
    <I18nProvider>
      <BrowseMarketplaceTab
        sources={SOURCES}
        plugins={[]}
        active
        onAddPlugin={onAddPlugin}
        onTogglePlugin={onTogglePlugin}
        {...props}
      />
    </I18nProvider>,
  );
}

describe("BrowseMarketplaceTab", () => {
  it("active 时拉取并按 pluginId 升序渲染插件", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        plugins: [{ name: "zoo" }, { name: "alpha" }],
      }),
    } as unknown as Response);
    renderTab();
    const rows = await waitFor(() => {
      const items = screen.getAllByRole("button", { name: /\+ 启用/ });
      expect(items).toHaveLength(2);
      return items;
    });
    expect(rows[0].closest('[data-slot="browse-row"]')).toHaveTextContent("alpha");
    expect(rows[1].closest('[data-slot="browse-row"]')).toHaveTextContent("zoo");
  });

  it("点击 + 启用 调用 onAddPlugin", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    const onAddPlugin = vi.fn(() => true);
    renderTab({ onAddPlugin });
    fireEvent.click(await screen.findByRole("button", { name: "+ 启用" }));
    expect(onAddPlugin).toHaveBeenCalledWith("alpha@claude-plugins-official");
  });

  it("已启用行 hover 后显示取消启用,点击调用 onTogglePlugin", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    const onTogglePlugin = vi.fn();
    renderTab({
      plugins: [{
        id: "plugin:alpha@claude-plugins-official",
        pluginId: "alpha@claude-plugins-official",
        enabled: true, committed: true,
      }],
      onTogglePlugin,
    });
    const enabledButton = await screen.findByRole("button", { name: "已启用" });
    fireEvent.mouseEnter(enabledButton);
    const disableButton = await screen.findByRole("button", { name: "取消启用" });
    fireEvent.click(disableButton);
    expect(onTogglePlugin).toHaveBeenCalledWith("alpha@claude-plugins-official");
  });

  it("无 marketplace 时显示空状态", () => {
    renderTab({ sources: [] });
    expect(screen.getByText("未配置插件来源")).toBeInTheDocument();
  });

  it("加载失败时状态条显示失败计数,popover 列出失败源", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    renderTab();
    const trigger = await screen.findByText(/1 个来源加载失败/);
    fireEvent.click(trigger);
    expect(await screen.findByText("加载失败的来源")).toBeInTheDocument();
    expect(screen.getByText("claude-plugins-official")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6.2: 跑测试,确认失败**

Run: `pnpm test -- BrowseMarketplaceTab`
Expected: 模块未找到。

- [ ] **Step 6.3: 实现 `BrowseMarketplaceTab`**

```tsx
// src/components/profile-editor/BrowseMarketplaceTab.tsx
import { CircleCheck, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "../ui/empty";
import { InputGroup, InputGroupInput } from "../ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { type MarketplacePluginEntry } from "./marketplace-catalog";
import {
  type MarketplaceSourceInput,
  useMarketplaceCatalog,
} from "./useMarketplaceCatalog";
import { type PluginEntry } from "./useEnabledPluginsState";

interface BrowseMarketplaceTabProps {
  sources: MarketplaceSourceInput[];
  plugins: PluginEntry[];
  active: boolean;
  onAddPlugin: (pluginId: string) => boolean;
  onTogglePlugin: (pluginId: string) => void;
}

function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

export default function BrowseMarketplaceTab({
  sources, plugins, active, onAddPlugin, onTogglePlugin,
}: BrowseMarketplaceTabProps) {
  const { t } = useI18n();
  const { byMarketplace, refreshAll, refreshOne } = useMarketplaceCatalog({ sources, active });
  const [searchQuery, setSearchQuery] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState<"all" | string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | string>("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<"all" | string>("all");
  const [hoverEnabledRow, setHoverEnabledRow] = useState<string | null>(null);

  const enabledMap = useMemo(() => {
    const map = new Map<string, boolean>();
    plugins.forEach((plugin) => map.set(plugin.pluginId, plugin.enabled));
    return map;
  }, [plugins]);

  const allPlugins = useMemo<MarketplacePluginEntry[]>(
    () => Object.values(byMarketplace).flatMap((entry) => entry.plugins),
    [byMarketplace],
  );

  const failures = useMemo(
    () => Object.values(byMarketplace).filter((entry) => entry.status === "error"),
    [byMarketplace],
  );
  const unsupportedCount = useMemo(
    () => Object.values(byMarketplace).filter((entry) => entry.unsupported === true).length,
    [byMarketplace],
  );

  const categoryOptions = useMemo(
    () => Array.from(new Set(allPlugins.map((p) => p.category).filter(Boolean))).sort(),
    [allPlugins],
  );
  const sourceTypeOptions = useMemo(
    () => Array.from(new Set(allPlugins.map((p) => p.sourceType).filter(Boolean))).sort(),
    [allPlugins],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allPlugins
      .filter((plugin) => {
        if (marketplaceFilter !== "all" && plugin.marketplaceId !== marketplaceFilter) return false;
        if (statusFilter === "enabled" && !enabledMap.get(plugin.pluginId)) return false;
        if (statusFilter === "disabled" && enabledMap.get(plugin.pluginId)) return false;
        if (categoryFilter !== "all" && plugin.category !== categoryFilter) return false;
        if (sourceTypeFilter !== "all" && plugin.sourceType !== sourceTypeFilter) return false;
        if (q.length === 0) return true;
        return [plugin.pluginId, plugin.description, plugin.authorName]
          .some((field) => field.toLowerCase().includes(q));
      })
      .sort((a, b) => a.pluginId.localeCompare(b.pluginId, undefined, { sensitivity: "base" }));
  }, [allPlugins, categoryFilter, enabledMap, marketplaceFilter, searchQuery,
      sourceTypeFilter, statusFilter]);

  if (sources.length === 0) {
    return (
      <Empty>
        <EmptyTitle>{t("profileEditor.plugins.browse.emptyNoMarketplace")}</EmptyTitle>
        <EmptyDescription>
          {t("profileEditor.plugins.browse.emptyNoMarketplaceHint")}
        </EmptyDescription>
      </Empty>
    );
  }

  const enabledCount = plugins.filter((p) => p.enabled).length;
  const summary = formatTemplate(
    t("profileEditor.plugins.browse.statusBarSummary"),
    { total: allPlugins.length, enabled: enabledCount, sources: sources.length },
  );
  const failureSummary = formatTemplate(
    t("profileEditor.plugins.browse.failureSummary"), { count: failures.length },
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex w-full flex-nowrap items-stretch gap-3 max-[1120px]:flex-wrap">
        <InputGroup className="h-[42px] min-w-0 flex-[2.4_1_0] bg-card px-2.5">
          <InputGroupInput
            type="text"
            value={searchQuery}
            placeholder={t("profileEditor.plugins.browse.searchPlaceholder")}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-full px-0 py-0"
          />
        </InputGroup>
        <Select value={marketplaceFilter} onValueChange={setMarketplaceFilter}>
          <SelectTrigger className="h-[42px] flex-[1.1_1_0]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">
                {t("profileEditor.plugins.browse.marketplaceFilterAll")}
              </SelectItem>
              {sources.map((s) => (
                <SelectItem key={s.marketplaceId} value={s.marketplaceId}>
                  {s.marketplaceId}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {/* 状态 / 类别 / 来源类型 三个 Select 按相同模式实现,选项分别使用
            statusFilter / categoryOptions / sourceTypeOptions */}
        <Button type="button" variant="outline" onClick={() => void refreshAll()}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {t("profileEditor.plugins.browse.refreshAll")}
        </Button>
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{summary}</span>
        {failures.length > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="text-primary cursor-pointer">
                {failureSummary}
              </button>
            </PopoverTrigger>
            <PopoverContent>
              <div className="font-semibold mb-2">
                {t("profileEditor.plugins.browse.failurePopoverTitle")}
              </div>
              {failures.map((failure) => (
                <div key={failure.marketplaceId}
                  className="flex justify-between items-center py-1 text-sm">
                  <div>
                    <div>{failure.marketplaceId}</div>
                    <div className="text-xs text-muted-foreground">{failure.error}</div>
                  </div>
                  <Button size="sm" variant="outline"
                    onClick={() => void refreshOne(failure.marketplaceId)}>
                    {t("profileEditor.plugins.browse.failureRetry")}
                  </Button>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      {unsupportedCount > 0 ? (
        <p className="text-xs text-muted-foreground m-0">
          {formatTemplate(t("profileEditor.plugins.browse.unsupportedSourceHint"),
            { count: unsupportedCount })}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <Empty>
          <EmptyTitle>
            {failures.length === sources.length - unsupportedCount && failures.length > 0
              ? t("profileEditor.plugins.browse.emptyAllFailed")
              : t("profileEditor.plugins.browse.emptyNoMatch")}
          </EmptyTitle>
        </Empty>
      ) : (
        <div className="flex flex-col rounded-lg border border-border bg-card overflow-hidden">
          {filtered.map((plugin, index) => {
            const enabled = enabledMap.get(plugin.pluginId) ?? false;
            const isHovering = hoverEnabledRow === plugin.pluginId;
            const subTitle = [plugin.authorName, plugin.category, plugin.marketplaceId]
              .filter(Boolean).join(" · ");
            return (
              <div key={plugin.pluginId}
                data-slot="browse-row"
                className="grid grid-cols-[32px_minmax(0,1fr)_80px] gap-3 px-3 py-2 border-t border-border first:border-t-0 items-center text-sm">
                <span className="text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate">{plugin.pluginId.split("@")[0]}</span>
                    {plugin.isOfficial ? (
                      <span className="inline-flex items-center gap-1 text-xs text-chart-2 font-semibold">
                        <CircleCheck className="size-3.5" />
                        {t("profileEditor.plugins.browse.verifiedLabel")}
                      </span>
                    ) : null}
                  </div>
                  {(plugin.description || subTitle) ? (
                    <div className="text-xs text-muted-foreground truncate">
                      {[plugin.description, subTitle].filter(Boolean).join(" · ")}
                    </div>
                  ) : null}
                </div>
                <div className="text-right">
                  {enabled ? (
                    <Button
                      type="button" size="sm"
                      variant={isHovering ? "outline" : "default"}
                      className={isHovering ? "border-destructive text-destructive" : ""}
                      onMouseEnter={() => setHoverEnabledRow(plugin.pluginId)}
                      onMouseLeave={() => setHoverEnabledRow(null)}
                      onClick={() => onTogglePlugin(plugin.pluginId)}
                    >
                      {isHovering
                        ? t("profileEditor.plugins.browse.actionDisable")
                        : t("profileEditor.plugins.browse.actionEnabled")}
                    </Button>
                  ) : (
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => onAddPlugin(plugin.pluginId)}
                    >
                      {t("profileEditor.plugins.browse.actionEnable")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="text-xs text-muted-foreground text-center m-0">
          {formatTemplate(t("profileEditor.plugins.browse.sortHint"),
            { start: 1, end: filtered.length, total: allPlugins.length })}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6.4: 跑测试,确认通过**

Run: `pnpm test -- BrowseMarketplaceTab`
Expected: 5/5 通过。

- [ ] **Step 6.5: 提交**

```bash
git add src/components/profile-editor/BrowseMarketplaceTab.tsx \
  src/components/profile-editor/__tests__/BrowseMarketplaceTab.test.tsx
git commit -m "feat(profile-editor): 新增 BrowseMarketplaceTab 跨源浏览组件"
```

---

### Task 7: 重写 `EnabledPluginsEditor` 为双 Tab 容器

**Files:**
- Modify: `src/components/profile-editor/EnabledPluginsEditor.tsx`

把 916 行的 `EnabledPluginsEditor` 替换为约 100 行的容器,组装 hook + 两个 Tab。

- [ ] **Step 7.1: 替换 `EnabledPluginsEditor` 实现**

```tsx
// src/components/profile-editor/EnabledPluginsEditor.tsx
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import BrowseMarketplaceTab from "./BrowseMarketplaceTab";
import EnabledPluginsTab from "./EnabledPluginsTab";
import {
  createOfficialPluginMetadataMap,
  loadOfficialPluginCache,
} from "./official-plugin-catalog";
import { useEnabledPluginsState } from "./useEnabledPluginsState";
import { type MarketplaceSourceInput } from "./useMarketplaceCatalog";

interface EnabledPluginsEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
  showTitle?: boolean;
  marketplaceSources?: MarketplaceSourceInput[];
}

export default function EnabledPluginsEditor({
  value, onChange, onError,
  showTitle = true,
  marketplaceSources = [],
}: EnabledPluginsEditorProps) {
  const { t } = useI18n();
  const { plugins, addPlugin, togglePlugin, removePlugin } = useEnabledPluginsState({
    value, onChange,
  });
  const [activeTab, setActiveTab] = useState<"enabled" | "browse">("enabled");

  // Tab 1 副标题需要 metadata。第一阶段从官方目录缓存读取;
  // 第二阶段可改为读 useMarketplaceCatalog 状态合并所有源。
  const metadataMap = useMemo(() => {
    const cached = loadOfficialPluginCache()?.plugins ?? [];
    return createOfficialPluginMetadataMap(cached);
  }, []);

  return (
    <div className="flex flex-col gap-3.5">
      {showTitle ? <h4>{t("profileEditor.plugins.title")}</h4> : null}

      <Tabs value={activeTab}
        onValueChange={(v) => setActiveTab(v as "enabled" | "browse")}>
        <TabsList>
          <TabsTrigger value="enabled">
            {t("profileEditor.plugins.tabEnabled")} ({plugins.length})
          </TabsTrigger>
          <TabsTrigger value="browse">
            {t("profileEditor.plugins.tabBrowse")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="enabled">
          <EnabledPluginsTab
            plugins={plugins}
            metadataMap={metadataMap}
            onTogglePlugin={togglePlugin}
            onRemovePlugin={removePlugin}
            onAddPlugin={(pluginId) => addPlugin(pluginId, true)}
            onGoBrowse={() => setActiveTab("browse")}
            onError={onError}
          />
        </TabsContent>

        <TabsContent value="browse">
          <BrowseMarketplaceTab
            sources={marketplaceSources}
            plugins={plugins}
            active={activeTab === "browse"}
            onAddPlugin={(pluginId) => addPlugin(pluginId, true)}
            onTogglePlugin={togglePlugin}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 7.2: 跑现有测试**

Run: `pnpm test -- EnabledPluginsEditor`
Expected: 大量用例失败(原本测试 draft 行 / 加载官方按钮 / 单一表格)。这些将在 Task 8 重写。

- [ ] **Step 7.3: 提交(WIP,Task 8 立即修复测试)**

```bash
git add src/components/profile-editor/EnabledPluginsEditor.tsx
git commit -m "feat(profile-editor): EnabledPluginsEditor 拆为双 Tab 容器"
```

---

### Task 8: 重写 `EnabledPluginsEditor.test.tsx`

**Files:**
- Modify: `src/components/profile-editor/__tests__/EnabledPluginsEditor.test.tsx`

清理过时用例(loadOfficial 按钮、draft 行同时显示在表格、`onOfficialActionChange` prop);保留 / 重写以下场景。

- [ ] **Step 8.1: 删除过时用例**

删除涉及以下断言的整 it 块:
- "加载官方插件" 按钮的 click / loading / toast / cache
- draft 行显示在表格中 + 计数(新设计下 draft 不再混入)
- `onOfficialActionChange` / `showOfficialToolbar` / `officialMarketplaceEnabled` prop

- [ ] **Step 8.2: 写新用例**

在 `describe("EnabledPluginsEditor", ...)` 内追加:

```tsx
describe("双 Tab 行为", () => {
  it("Tab 1 默认显示已启用列表,只展示 committed 条目", () => {
    renderEditor({ value: { "a@x": true, "b@y": false } });
    expect(screen.getByRole("tab", { name: /已启用/ }))
      .toHaveAttribute("data-state", "active");
    expect(screen.getByText("a@x")).toBeInTheDocument();
    expect(screen.getByText("b@y")).toBeInTheDocument();
  });

  it("切到 Tab 2 触发 marketplace 拉取并渲染插件", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    renderEditor({
      marketplaceSources: [{
        marketplaceId: "claude-plugins-official", sourceType: "github",
        repo: "anthropics/claude-plugins-official", ref: "", path: "",
      }],
    });
    fireEvent.click(screen.getByRole("tab", { name: /浏览市场/ }));
    expect(await screen.findByText(/alpha/)).toBeInTheDocument();
  });

  it("Tab 2 + 启用 立即同步到 Tab 1", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, json: async () => ({ plugins: [{ name: "alpha" }] }),
    } as unknown as Response);
    renderEditor({
      marketplaceSources: [{
        marketplaceId: "claude-plugins-official", sourceType: "github",
        repo: "anthropics/claude-plugins-official", ref: "", path: "",
      }],
    });
    fireEvent.click(screen.getByRole("tab", { name: /浏览市场/ }));
    await screen.findByText(/alpha/);
    fireEvent.click(screen.getByRole("button", { name: "+ 启用" }));
    fireEvent.click(screen.getByRole("tab", { name: /已启用/ }));
    expect(screen.getByText("alpha@claude-plugins-official")).toBeInTheDocument();
  });

  it("Tab 1 空状态点击「去浏览市场」切换 Tab", () => {
    renderEditor({ value: {} });
    fireEvent.click(screen.getByRole("button", { name: "去浏览市场" }));
    expect(screen.getByRole("tab", { name: /浏览市场/ }))
      .toHaveAttribute("data-state", "active");
  });

  it("Tab 1 手动输入 ID 仍走 inline draft 表单", () => {
    renderEditor({ value: { "a@x": true } });
    fireEvent.click(screen.getByRole("button", { name: "新增插件" }));
    fireEvent.change(screen.getByRole("textbox", { name: "新插件 ID" }),
      { target: { value: "manual@local" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText("manual@local")).toBeInTheDocument();
  });
});
```

需要更新 `renderEditor` 工具函数,新增 `marketplaceSources` 选项透传到 `<EnabledPluginsEditor>`,并删除已废弃的 `officialMarketplaceEnabled` 选项。

- [ ] **Step 8.3: 跑测试,确认通过**

Run: `pnpm test -- EnabledPluginsEditor`
Expected: 通过。

- [ ] **Step 8.4: 提交**

```bash
git add src/components/profile-editor/__tests__/EnabledPluginsEditor.test.tsx
git commit -m "test(profile-editor): 重写 EnabledPluginsEditor 双 Tab 测试"
```

---

### Task 9: 接通 `marketplaceSources` 到 `StructuredSettingsSections` / `ProfileEditor` / `PresetEditor`

**Files:**
- Modify: `src/components/profile-editor/StructuredSettingsSections.tsx`
- Modify: `src/components/ProfileEditor.tsx`
- Modify: `src/components/PresetEditor.tsx`

`EnabledPluginsEditor` 现在需要 `marketplaceSources` 才能显示 Tab 2 内容。来源从 `settings.extraKnownMarketplaces` 解析。

- [ ] **Step 9.1: 在 `StructuredSettingsSections.tsx` 增加 marketplaceSources 派生**

定位到第 668-678 行的 `EnabledPluginsEditor` 引用块,改为:

```tsx
<EnabledPluginsEditor
  value={settings.enabledPlugins}
  onChange={(value) => onStructuredObjectChange("enabledPlugins", value)}
  onError={(message) => sectionState.setSectionError("enabledPlugins", message)}
  showTitle={false}
  marketplaceSources={marketplaceSources}
/>
```

文件顶部 props 新增 `marketplaceSources: MarketplaceSourceInput[]` 字段(从 `useMarketplaceCatalog` 导出类型)。同步删除以下 prop 与本地 useState:
- `showOfficialToolbar`
- `onOfficialActionChange`
- `officialMarketplaceEnabled`
- `officialPluginAction`(不再有此 ReactNode 状态)

`renderSectionModeRowAction("plugins", messages.plugins, officialPluginAction)` 改为 `renderSectionModeRowAction("plugins", messages.plugins)`。

- [ ] **Step 9.2: 在 `ProfileEditor.tsx` 派生 marketplaceSources**

第 200 行附近 `extraKnownMarketplaces` useMemo 旁追加:

```tsx
import { readObject } from "./profile-editor/editor-utils";

const marketplaceSources = useMemo(() => {
  return Object.entries(readObject(settings.extraKnownMarketplaces)).map(
    ([marketplaceId, entry]) => {
      const record = readObject(entry);
      const source = readObject(record.source);
      return {
        marketplaceId,
        sourceType: typeof source.source === "string" ? source.source : "unknown",
        repo: typeof source.repo === "string" ? source.repo : "",
        ref: typeof source.ref === "string" ? source.ref : "",
        path: typeof source.path === "string" ? source.path : "",
      };
    },
  );
}, [settings.extraKnownMarketplaces]);
```

把 `marketplaceSources` 透传到 `<StructuredSettingsSections marketplaceSources={marketplaceSources} ... />`。

- [ ] **Step 9.3: 在 `PresetEditor.tsx` 同样派生并透传**

第 225-230 行附近 `extraKnownMarketplaces` 引用旁,加同样的 `marketplaceSources` useMemo(读 `settingsPatch.extraKnownMarketplaces`),并透传到 `<StructuredSettingsSections>`。

- [ ] **Step 9.4: 跑全套测试**

Run: `pnpm test`
Expected: 通过。

- [ ] **Step 9.5: 提交**

```bash
git add src/components/profile-editor/StructuredSettingsSections.tsx \
  src/components/ProfileEditor.tsx src/components/PresetEditor.tsx
git commit -m "feat(profile-editor): marketplaceSources 透传到双 Tab 浏览市场"
```

---

### Task 10: 端到端验证

**Files:** 无代码改动

- [ ] **Step 10.1: 静态检查**

Run: `pnpm biome:ci`
Expected: 通过。

- [ ] **Step 10.2: 单测全跑**

Run: `pnpm test`
Expected: 通过。

- [ ] **Step 10.3: 构建**

Run: `pnpm build`
Expected: 通过。

- [ ] **Step 10.4: 启动桌面应用,人工验证**

Run: `pnpm tauri dev`

验证清单:
1. 打开 Profile 编辑抽屉 → 展开「插件」分区 → 默认 Tab 是「已启用」,列表只有 settings 中真实条目。
2. 切到「浏览市场」→ 顶栏 5 个筛选 + 刷新按钮 + 状态条;插件按 pluginId 升序;官方插件有 ✓ 已验证徽标。
3. 点击未启用行的「+ 启用」→ 切回「已启用」Tab,新条目出现在列表。
4. 在「浏览市场」hover 已启用行 → 出现「取消启用」→ 点击 → 回到「+ 启用」状态;切回 Tab 1 该行也已被禁用/移除。
5. 在「已启用」点击「+ 新增插件」→ inline 表单生效,保存后写入。
6. 故意删掉 `extraKnownMarketplaces` → 「浏览市场」显示空状态。
7. 切到 JSON 模式,再切回表单,默认回到 Tab 1。

如发现 UI 问题(密度、对齐、空状态文案),回到对应 Task 修复。

---

## 不在本计划范围

- 后端(Tauri command)接管 marketplace 解析(阶段 2)。
- `git` / `url` / `npm` / `path` / `hostPattern` 来源拉取(阶段 2)。
- 跨 Profile 复用、批量启用、插件详情面板(已在 spec 中明确剔除)。
- 顶级"插件"导航页(C 方向已剔除)。




