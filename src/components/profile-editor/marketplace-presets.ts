import type { MarketplaceDraft } from "./editor-utils";

export const OFFICIAL_MARKETPLACE_ID = "claude-plugins-official";
export const OFFICIAL_MARKETPLACE_REPO = "anthropics/claude-plugins-official";

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
