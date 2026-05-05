import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../i18n";
import HistoryHeatmap, { getResponsiveHeatmapWeeks } from "../HistoryHeatmap";

function renderHeatmap() {
  return render(
    <I18nProvider>
      <HistoryHeatmap entries={[]} />
    </I18nProvider>,
  );
}

describe("getResponsiveHeatmapWeeks", () => {
  it("uses 13 weeks when the heatmap has very little horizontal space", () => {
    expect(getResponsiveHeatmapWeeks(340)).toBe(13);
  });

  it("uses 26 weeks once half-year cells fit", () => {
    expect(getResponsiveHeatmapWeeks(400)).toBe(26);
  });

  it("uses 39 weeks once three-quarter-year cells fit", () => {
    expect(getResponsiveHeatmapWeeks(590)).toBe(39);
  });

  it("uses the full 53 weeks when a one-year heatmap fits", () => {
    expect(getResponsiveHeatmapWeeks(800)).toBe(53);
  });
});

describe("HistoryHeatmap", () => {
  it("keeps the less-to-more legend inside the heatmap frame", () => {
    const { container } = renderHeatmap();

    const frame = container.querySelector<HTMLElement>(".heatmap-frame");
    const legend = screen.getByText("少").closest<HTMLElement>(".heatmap-legend");

    expect(frame).toContainElement(legend);
  });
});
