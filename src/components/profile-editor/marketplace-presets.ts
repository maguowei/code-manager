import type { MarketplaceDraft } from "./editor-utils";

export const OFFICIAL_MARKETPLACE_ID = "claude-plugins-official";
export const OFFICIAL_MARKETPLACE_REPO = "anthropics/claude-plugins-official";
export const OFFICIAL_MARKETPLACE_RAW_URL = `https://raw.githubusercontent.com/${OFFICIAL_MARKETPLACE_REPO}/main/.claude-plugin/marketplace.json`;

export const BUILTIN_MARKETPLACES = [
  {
    marketplaceId: OFFICIAL_MARKETPLACE_ID,
    repo: OFFICIAL_MARKETPLACE_REPO,
    editorLabel: "profileEditor.marketplace.addOfficial",
    browseLabel: "profileEditor.plugins.browse.addMarketplaceOfficial",
  },
  {
    marketplaceId: "claude-community",
    repo: "anthropics/claude-plugins-community",
    editorLabel: "profileEditor.marketplace.addCommunity",
    browseLabel: "profileEditor.plugins.browse.addMarketplaceCommunity",
  },
] as const;

export type BuiltinMarketplace = (typeof BUILTIN_MARKETPLACES)[number];

export function buildBuiltinMarketplaceDraft(preset: BuiltinMarketplace): MarketplaceDraft {
  return {
    id: `marketplace:${preset.marketplaceId}`,
    marketplaceId: preset.marketplaceId,
    sourceType: "github",
    url: "",
    hostPattern: "",
    repo: preset.repo,
    ref: "",
    path: "",
    packageName: "",
    installLocation: "",
  };
}

export function buildOfficialPluginId(name: string): string {
  return `${name}@${OFFICIAL_MARKETPLACE_ID}`;
}
