import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChartContainer, ChartTooltipContent } from "./chart";

vi.mock("recharts", () => ({
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
}));

function renderTooltip(formatter: React.ComponentProps<typeof ChartTooltipContent>["formatter"]) {
  const payload = [
    {
      color: "var(--chart-1)",
      dataKey: "input",
      name: "input",
      payload: { input: 12.34 },
      value: 12.34,
    },
  ] as unknown as React.ComponentProps<typeof ChartTooltipContent>["payload"];

  render(
    <ChartContainer config={{ input: { label: "Input" }, renamed: { label: "Renamed input" } }}>
      <ChartTooltipContent
        active
        formatter={formatter}
        label="2026-05-24 14:00"
        labelFormatter={(value) => value}
        payload={payload}
      />
    </ChartContainer>,
  );
}

describe("ChartTooltipContent", () => {
  it("keeps the series label when a formatter returns a primitive value", () => {
    renderTooltip((value) => `$${Number(value).toFixed(2)}`);

    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("$12.34")).toBeInTheDocument();
  });

  it("uses tuple formatter output for both value and series label", () => {
    renderTooltip((value) => [`$${Number(value).toFixed(2)}`, "renamed"]);

    expect(screen.getByText("Renamed input")).toBeInTheDocument();
    expect(screen.getByText("$12.34")).toBeInTheDocument();
  });

  it("allows custom formatter elements to replace the full tooltip row", () => {
    renderTooltip(() => <span>Custom row</span>);

    expect(screen.getByText("Custom row")).toBeInTheDocument();
    expect(screen.queryByText("Input")).not.toBeInTheDocument();
  });
});
