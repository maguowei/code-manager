import type { MarketplaceDraft } from "./editor-utils";

export const OFFICIAL_MARKETPLACE_ID = "claude-plugins-official";
export const OFFICIAL_MARKETPLACE_REPO = "anthropics/claude-plugins-official";
export const OFFICIAL_MARKETPLACE_RAW_URL = `https://raw.githubusercontent.com/${OFFICIAL_MARKETPLACE_REPO}/main/.claude-plugin/marketplace.json`;

export function buildOfficialMarketplaceDraft(): MarketplaceDraft {
  return {
    id: `marketplace:${OFFICIAL_MARKETPLACE_ID}`,
    marketplaceId: OFFICIAL_MARKETPLACE_ID,
    sourceType: "github",
    url: "",
    hostPattern: "",
    repo: OFFICIAL_MARKETPLACE_REPO,
    ref: "",
    path: "",
    packageName: "",
    installLocation: "",
  };
}

export function buildOfficialPluginId(name: string): string {
  return `${name}@${OFFICIAL_MARKETPLACE_ID}`;
}
