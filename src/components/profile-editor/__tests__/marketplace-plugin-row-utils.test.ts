import { describe, expect, it } from "vitest";
import type { MarketplacePluginEntry } from "../marketplace-catalog";
import {
  estimatePluginRowSize,
  hasMarketplacePluginComponents,
} from "../marketplace-plugin-row-utils";
import { emptyPluginCatalog, type PluginComponents } from "../plugin-install-counts";

const PLUGIN: MarketplacePluginEntry = {
  pluginId: "alpha@claude-plugins-official",
  marketplaceId: "claude-plugins-official",
  description: "",
  category: "",
  authorName: "",
  sourceType: "github",
  homepage: "",
  isOfficial: true,
};

function emptyComponents(): PluginComponents {
  return {
    commands: [],
    agents: [],
    skills: [],
    hooks: [],
    mcpServers: [],
    lspServers: [],
  };
}

describe("marketplace-plugin-row-utils", () => {
  it("空 components 不额外估算组成行", () => {
    const catalog = emptyPluginCatalog();
    catalog.entries[PLUGIN.pluginId] = {
      installCount: null,
      components: emptyComponents(),
    };

    expect(hasMarketplacePluginComponents(catalog.entries[PLUGIN.pluginId].components)).toBe(false);
    expect(estimatePluginRowSize(PLUGIN, catalog)).toBe(
      estimatePluginRowSize(PLUGIN, emptyPluginCatalog()),
    );
  });

  it("有组成且展开时把徽章与组件明细纳入估算", () => {
    const catalog = emptyPluginCatalog();
    catalog.entries[PLUGIN.pluginId] = {
      installCount: null,
      components: {
        ...emptyComponents(),
        commands: ["format-code"],
        skills: ["review-code", "explain-code"],
      },
    };

    const collapsed = estimatePluginRowSize(PLUGIN, catalog);
    const expanded = estimatePluginRowSize(PLUGIN, catalog, true);

    expect(hasMarketplacePluginComponents(catalog.entries[PLUGIN.pluginId].components)).toBe(true);
    expect(expanded).toBeGreaterThan(collapsed);

    const longPlugin = { ...PLUGIN, description: "a".repeat(300) };
    expect(estimatePluginRowSize(longPlugin, catalog, true)).toBeGreaterThan(
      estimatePluginRowSize(longPlugin, catalog, false),
    );
  });

  it("没有布局宽度时按默认桌面布局估算徽章行", () => {
    const catalog = emptyPluginCatalog();
    catalog.entries[PLUGIN.pluginId] = {
      installCount: null,
      components: {
        commands: ["command"],
        agents: ["agent"],
        skills: ["skill"],
        hooks: ["hook"],
        mcpServers: ["mcp"],
        lspServers: ["lsp"],
      },
    };

    expect(estimatePluginRowSize(PLUGIN, catalog)).toBe(
      estimatePluginRowSize(PLUGIN, catalog, false, 800),
    );
  });

  it("按列表宽度增加窄列中的详情折行估算", () => {
    const catalog = emptyPluginCatalog();
    const plugin = { ...PLUGIN, description: "a".repeat(100) };

    const wide = estimatePluginRowSize(plugin, catalog, false, 800);
    const narrow = estimatePluginRowSize(plugin, catalog, false, 240);

    expect(narrow).toBeGreaterThan(wide);
  });
});
