import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { HistoryProjectGroup } from "../../history-utils";
import { I18nProvider } from "../../i18n";
import HistoryHeatmap from "../HistoryHeatmap";
import HistoryProjectList from "../HistoryProjectList";

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
    render(createElement(I18nProvider, null, createElement(HistoryHeatmap, { entries: [] })));

    const legend = screen.getByText("少").closest<HTMLElement>('[data-slot="heatmap-legend"]');
    const frame = legend?.closest<HTMLElement>('[data-slot="heatmap-frame"]');

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

    expect(screen.getByRole("listbox", { name: "使用历史" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /ai-manager/ })).toBeInTheDocument();
  });

  it("compresses low-priority session row columns on very narrow pages", () => {
    expect(sessionListSource).toContain("max-sm:[--id-width:56px]");
    expect(sessionListSource).toContain("max-sm:hidden");
  });
});
