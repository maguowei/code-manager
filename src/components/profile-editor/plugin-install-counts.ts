import { ipc } from "../../ipc";
import { isTauri } from "../../types";
import { readObject, readString, readStringArray } from "./editor-utils";

// Claude Code 已将插件安装数从独立的 install-counts-cache.json 合并进 plugin-catalog-cache.json
export const PLUGIN_CATALOG_CACHE_PATH = "plugins/plugin-catalog-cache.json";

export type PluginInstallCounts = Record<string, number>;

// catalog 顶层元信息：数据生成 / 本地拉取时间与官方 marketplace SHA
export interface PluginCatalogMeta {
  generatedAt: string | null;
  fetchedAt: string | null;
  installsGeneratedAt: string | null;
  marketplaceSha: string | null;
}

// 单个插件的组成；commands/agents/skills 取 name，hooks/mcpServers/lspServers 本身即字符串
export interface PluginComponents {
  commands: string[];
  agents: string[];
  skills: string[];
  hooks: string[];
  mcpServers: string[];
  lspServers: string[];
}

export interface PluginCatalogEntry {
  installCount: number | null;
  components: PluginComponents;
}

// catalog 缓存仅覆盖官方市场 claude-plugins-official；entries 键为 pluginId(name@marketplace)
export interface PluginCatalog {
  meta: PluginCatalogMeta;
  entries: Record<string, PluginCatalogEntry>;
}

export function emptyPluginCatalog(): PluginCatalog {
  return {
    meta: {
      generatedAt: null,
      fetchedAt: null,
      installsGeneratedAt: null,
      marketplaceSha: null,
    },
    entries: {},
  };
}

function readInstallCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.trunc(value);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

// commands/agents/skills 元素形如 { name, chars: {...} }，提取非空 name
function readComponentNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const names: string[] = [];
  for (const item of value) {
    const name = readString(readObject(item).name).trim();
    if (name) {
      names.push(name);
    }
  }
  return names;
}

function parseComponents(raw: unknown): PluginComponents {
  const components = readObject(raw);
  return {
    commands: readComponentNames(components.commands),
    agents: readComponentNames(components.agents),
    skills: readComponentNames(components.skills),
    // hooks/mcpServers/lspServers 在 catalog 中是字符串数组
    hooks: readStringArray(components.hooks),
    mcpServers: readStringArray(components.mcpServers),
    lspServers: readStringArray(components.lspServers),
  };
}

export function parsePluginCatalog(raw: unknown): PluginCatalog {
  const record = readObject(raw);
  const catalog = readObject(record.catalog);
  const plugins = readObject(catalog.plugins);

  const entries: Record<string, PluginCatalogEntry> = {};
  // catalog.plugins 形如 { "<pluginId>": { unique_installs, components, ... } }，键即 pluginId
  for (const [pluginId, value] of Object.entries(plugins)) {
    if (!pluginId) {
      continue;
    }
    const entry = readObject(value);
    entries[pluginId] = {
      installCount: readInstallCount(entry.unique_installs),
      components: parseComponents(entry.components),
    };
  }

  return {
    meta: {
      generatedAt: readNonEmptyString(catalog.generated_at),
      fetchedAt: readNonEmptyString(record.fetchedAt),
      installsGeneratedAt: readNonEmptyString(catalog.installs_generated_at),
      marketplaceSha: readNonEmptyString(catalog.marketplace_sha),
    },
    entries,
  };
}

export async function loadPluginCatalog(): Promise<PluginCatalog> {
  if (!isTauri()) {
    return emptyPluginCatalog();
  }

  try {
    const preview = await ipc.readClaudeFilePreview(PLUGIN_CATALOG_CACHE_PATH);
    if (preview.isBinary || preview.truncated || !preview.content.trim()) {
      return emptyPluginCatalog();
    }
    return parsePluginCatalog(JSON.parse(preview.content));
  } catch {
    return emptyPluginCatalog();
  }
}
