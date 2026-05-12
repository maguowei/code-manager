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
      className="flex h-screen w-[168px] shrink-0 flex-col items-stretch border-r border-sidebar-border bg-sidebar px-3 py-3 text-sidebar-foreground shadow-panel transition-[width,padding] duration-300 max-[1000px]:w-[60px] max-[1000px]:items-center max-[1000px]:px-2 max-[700px]:w-[48px] max-[700px]:px-1 max-[700px]:py-2"
      aria-label={t("nav.ariaLabel")}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "mb-5 h-10 w-full rounded-lg bg-sidebar-primary text-base font-bold text-sidebar-primary-foreground shadow-panel transition-[background-color,box-shadow,transform] duration-150 hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground active:scale-95 max-[1000px]:size-10 max-[700px]:size-8 max-[700px]:text-sm",
              activeTab === "claudeOverview" && "ring-2 ring-ring/50",
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
                  size="icon-lg"
                  className={cn(
                    "relative h-10 w-full justify-start rounded-lg px-3 text-muted-foreground transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-95 max-[1000px]:size-10 max-[1000px]:justify-center max-[1000px]:px-0 max-[700px]:size-9",
                    active &&
                      "bg-sidebar-accent text-sidebar-accent-foreground shadow-inner before:absolute before:left-[-12px] before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-sm before:bg-sidebar-primary hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-[1000px]:before:left-[-8px] max-[700px]:before:left-[-4px]",
                  )}
                  onClick={() => onTabChange(key)}
                  aria-label={t(label)}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon data-icon="inline-start" data-testid={testId} aria-hidden="true" />
                  <span className="min-w-0 truncate max-[1000px]:sr-only">{t(label)}</span>
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

      <div className="mt-3 flex w-full justify-center border-t border-sidebar-border pt-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="h-10 w-full justify-start rounded-lg px-3 text-muted-foreground transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-95 max-[1000px]:size-10 max-[1000px]:justify-center max-[1000px]:px-0 max-[700px]:size-9"
              onClick={onSettingsClick}
              aria-label={t("header.settings")}
            >
              <Settings data-icon="inline-start" aria-hidden="true" />
              <span className="min-w-0 truncate max-[1000px]:sr-only">{t("header.settings")}</span>
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
