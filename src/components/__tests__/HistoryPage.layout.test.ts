import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const historyCss = readFileSync("src/components/HistoryPage.css", "utf8");
const drawerCss = readFileSync("src/components/SessionDetailDrawer.css", "utf8");

describe("HistoryPage responsive layout CSS", () => {
  it("aligns the heatmap legend to the heatmap content instead of the full page", () => {
    expect(historyCss).toMatch(
      /\.heatmap-frame\s*\{[\s\S]*?width:\s*max-content;[\s\S]*?max-width:\s*100%;/,
    );
    expect(historyCss).toMatch(
      /\.heatmap-frame\s+\.heatmap-legend\s*\{[\s\S]*?justify-content:\s*flex-end;/,
    );
  });

  it("moves the project list into a horizontal filter on narrow pages", () => {
    expect(historyCss).toMatch(
      /@media\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\.history-body\s*\{[\s\S]*?flex-direction:\s*column;/,
    );
    expect(historyCss).toMatch(
      /@media\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\.history-projects\s*\{[\s\S]*?display:\s*flex;[\s\S]*?overflow-x:\s*auto;/,
    );
  });

  it("compresses low-priority session row columns on very narrow pages", () => {
    expect(historyCss).toMatch(
      /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.history-session-row\s*\{[\s\S]*?--id-width:\s*56px;/,
    );
    expect(historyCss).toMatch(
      /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.session-count\s*\{[\s\S]*?display:\s*none;/,
    );
  });
});

describe("SessionDetailDrawer responsive layout CSS", () => {
  it("keeps long drawer content inside narrow viewports", () => {
    expect(drawerCss).toMatch(
      /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.session-detail-messages\s*\{[\s\S]*?padding:\s*var\(--space-4\);/,
    );
    expect(drawerCss).toMatch(
      /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.msg-command\s*\{[\s\S]*?overflow-x:\s*auto;/,
    );
    expect(drawerCss).toMatch(
      /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.msg-markdown pre\s*\{[\s\S]*?max-width:\s*100%;/,
    );
  });
});
