import {
  BarChart3,
  Brain,
  Clock,
  DollarSign,
  FolderOpen,
  type LucideIcon,
  Server,
  Settings,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type TranslationKey, useI18n } from "../i18n";
import type { TabType } from "../types";

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onClaudeOverviewClick: () => void;
  onSettingsClick: () => void;
}

interface NavItem {
  key: TabType;
  label: TranslationKey;
  icon: LucideIcon;
  testId?: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "configs", label: "nav.configs", icon: SlidersHorizontal },
  { key: "memory", label: "nav.memory", icon: Brain },
  { key: "skills", label: "nav.skills", icon: Zap },
  { key: "providers", label: "nav.providers", icon: Server },
  { key: "projects", label: "nav.projects", icon: FolderOpen },
  { key: "history", label: "nav.history", icon: Clock },
  { key: "stats", label: "nav.stats", icon: BarChart3 },
  { key: "usage", label: "nav.usage", icon: DollarSign, testId: "usage-dollar-icon" },
];

function Sidebar({ activeTab, onTabChange, onClaudeOverviewClick, onSettingsClick }: SidebarProps) {
  const { t } = useI18n();
  return (
    <nav
      className="flex h-screen w-[var(--sidebar-width)] shrink-0 flex-col items-center border-r border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-3 transition-[width,padding] duration-300 max-[700px]:w-[var(--sidebar-width-small)] max-[700px]:px-1 max-[700px]:py-2"
      aria-label={t("nav.ariaLabel")}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "mb-5 size-10 rounded-lg bg-linear-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] text-base font-bold text-white shadow-[var(--glow-blue)] transition-[filter,transform,box-shadow] duration-150 hover:text-white hover:brightness-110 active:scale-95 max-[700px]:size-8 max-[700px]:text-sm",
              activeTab === "claudeOverview" && "brightness-110 shadow-[var(--shadow-blue-md)]",
            )}
            onClick={onClaudeOverviewClick}
            aria-label={t("nav.claudeOverview")}
            aria-current={activeTab === "claudeOverview" ? "page" : undefined}
          >
            AI
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {t("nav.claudeOverview")}
        </TooltipContent>
      </Tooltip>

      <div className="flex w-full flex-col gap-2">
        {NAV_ITEMS.map(({ key, label, icon: Icon, testId }) => {
          const active = activeTab === key;
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "relative size-11 rounded-lg text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] active:scale-95 max-[700px]:size-9",
                    active &&
                      "bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] before:absolute before:left-[-8px] before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-sm before:bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-bg)] hover:text-[var(--accent-blue)] max-[700px]:before:left-[-4px]",
                  )}
                  onClick={() => onTabChange(key)}
                  aria-label={t(label)}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    data-testid={testId}
                    className="size-5 max-[700px]:size-[18px]"
                    aria-hidden="true"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {t(label)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="mt-3 flex w-full justify-center border-t border-[var(--border-default)] pt-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 rounded-lg text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] active:scale-95 max-[700px]:size-9"
              onClick={onSettingsClick}
              aria-label={t("header.settings")}
            >
              <Settings className="size-5 max-[700px]:size-[18px]" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {t("header.settings")}
          </TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}

export default Sidebar;
