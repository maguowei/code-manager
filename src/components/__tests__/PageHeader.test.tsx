import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PageHeader from "../PageHeader";
import { Button } from "../ui/button";

describe("PageHeader", () => {
  it("renders title, description, and actions in a shared responsive shell", () => {
    render(
      <PageHeader
        title="配置"
        description="管理 Claude Code 的本地配置"
        actions={
          <Button type="button" size="sm" variant="outline">
            刷新
          </Button>
        }
      />,
    );

    const header = screen.getByRole("banner");
    expect(header).toHaveClass(
      "page-header",
      "sticky",
      "min-h-[52px]",
      "border-b",
      "shadow-toolbar",
      "backdrop-blur",
    );
    expect(within(header).getByRole("heading", { name: "配置" })).toHaveClass("page-title");
    expect(within(header).getByText("管理 Claude Code 的本地配置")).toHaveClass(
      "text-muted-foreground",
    );
    expect(within(header).getByRole("button", { name: "刷新" })).toBeInTheDocument();
  });

  it("supports secondary surface for compact list panes", () => {
    render(<PageHeader title="预设" surface="secondary" />);

    expect(screen.getByRole("banner")).toHaveClass("bg-secondary");
  });
});
