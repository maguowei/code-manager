import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { HistoryProjectGroup } from "../../history-utils";
import { I18nProvider } from "../../i18n";
import HistoryHeatmap from "../HistoryHeatmap";
import HistoryProjectList from "../HistoryProjectList";

const drawerCss = readFileSync("src/components/SessionDetailDrawer.css", "utf8");
const sessionListSource = readFileSync("src/components/HistorySessionList.tsx", "utf8");

const PROJECT_GROUPS: HistoryProjectGroup[] = [
  {
    project: "/work/ai-manager",
    shortName: "ai-manager",
    messageCount: 12,
    sessionCount: 2,
    lastTimestamp: 3,
    entries: [],
  },
];

describe("HistoryPage responsive layout CSS", () => {
  it("aligns the heatmap legend to the heatmap content instead of the full page", () => {
    const { container } = render(
      createElement(I18nProvider, null, createElement(HistoryHeatmap, { entries: [] })),
    );

    const frame = container.querySelector<HTMLElement>(".heatmap-frame");
    const legend = screen.getByText("少").closest<HTMLElement>(".heatmap-legend");

    expect(frame?.className).toContain("w-max");
    expect(frame?.className).toContain("max-w-full");
    expect(legend?.className).toContain("justify-end");
    expect(frame).toContainElement(legend);
  });

  it("moves the project list into a horizontal filter on narrow pages", () => {
    render(
      createElement(
        I18nProvider,
        null,
        createElement(HistoryProjectList, {
          groups: PROJECT_GROUPS,
          selectedProject: null,
          onSelect: () => {},
        }),
      ),
    );

    const projectList = screen.getByRole("listbox", { name: "使用历史" });

    expect(projectList.className).toContain("max-md:flex-row");
    expect(projectList.className).toContain("max-md:overflow-x-auto");
  });

  it("compresses low-priority session row columns on very narrow pages", () => {
    expect(sessionListSource).toContain("max-sm:[--id-width:56px]");
    expect(sessionListSource).toContain("max-sm:hidden");
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
