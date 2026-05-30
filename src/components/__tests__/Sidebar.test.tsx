import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n";
import type { TabType } from "@/types";
import Sidebar from "../Sidebar";

function renderSidebar({
  activeTab = "configs",
  collapseSidebarByDefault = false,
}: {
  activeTab?: TabType;
  collapseSidebarByDefault?: boolean;
} = {}) {
  render(
    <I18nProvider>
      <TooltipProvider>
        <Sidebar
          activeTab={activeTab}
          collapseSidebarByDefault={collapseSidebarByDefault}
          onTabChange={vi.fn()}
          onClaudeOverviewClick={vi.fn()}
          onSettingsClick={vi.fn()}
        />
      </TooltipProvider>
    </I18nProvider>,
  );
}

describe("Sidebar", () => {
  it("shows short menu labels next to icons on desktop", () => {
    renderSidebar();

    for (const label of ["配置", "记忆", "Skills", "项目", "历史", "统计", "用量"]) {
      const button = screen.getByRole("button", { name: label });

      expect(within(button).getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "预设" })).not.toBeInTheDocument();
  });

  it("treats the internal presets tab as part of the config sidebar item", () => {
    renderSidebar({ activeTab: "providers" });

    const configsButton = screen.getByRole("button", { name: "配置" });

    expect(configsButton).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "预设" })).not.toBeInTheDocument();
  });

  it("keeps the sidebar labels collapsible at the existing narrow breakpoint", () => {
    const source = readFileSync("src/components/Sidebar.tsx", "utf8");

    expect(source).toContain("max-[1000px]:w-[60px]");
    expect(source).toContain("max-[1000px]:sr-only");
    expect(source).toContain("max-[700px]:w-[48px]");
  });

  it("hides menu labels on desktop when the icon-only default is enabled", () => {
    renderSidebar({ collapseSidebarByDefault: true });

    const configsButton = screen.getByRole("button", { name: "配置" });

    expect(within(configsButton).getByText("配置")).toHaveClass("sr-only");
  });
});
