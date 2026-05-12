import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n";
import Sidebar from "../Sidebar";

function renderSidebar() {
  render(
    <I18nProvider>
      <TooltipProvider>
        <Sidebar
          activeTab="configs"
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

    for (const label of ["配置", "预设", "记忆", "Skills", "项目", "历史", "统计", "用量"]) {
      const button = screen.getByRole("button", { name: label });

      expect(within(button).getByText(label)).toBeInTheDocument();
    }
  });

  it("keeps the sidebar labels collapsible at the existing narrow breakpoint", () => {
    const source = readFileSync("src/components/Sidebar.tsx", "utf8");

    expect(source).toContain("max-[1000px]:w-[60px]");
    expect(source).toContain("max-[1000px]:sr-only");
    expect(source).toContain("max-[700px]:w-[48px]");
  });
});
