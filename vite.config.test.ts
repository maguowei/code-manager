import { describe, expect, it } from "vitest";

import viteConfig from "./vite.config";

const highRiskVendorGroups = ["codemirror-vendor", "markdown-vendor", "charts-vendor"];

async function resolveConfig() {
  if (typeof viteConfig === "function") {
    return await viteConfig({
      command: "build",
      mode: "production",
      isSsrBuild: false,
      isPreview: false,
    });
  }

  return await viteConfig;
}

describe("vite config", () => {
  it("does not force-split cyclic editor, markdown, or chart dependency graphs", async () => {
    const config = await resolveConfig();
    const groups = config.build?.rolldownOptions?.output?.codeSplitting?.groups ?? [];
    const groupNames = groups.map((group) => group.name);

    expect(groupNames).not.toEqual(expect.arrayContaining(highRiskVendorGroups));
  });
});
