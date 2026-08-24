import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Bot,
  Braces,
  ChevronDown,
  CircleCheck,
  ExternalLink,
  Plug,
  Plus,
  Settings2,
  Sparkles,
  SquareTerminal,
  Webhook,
} from "lucide-react";
import { type KeyboardEvent, memo } from "react";
import { cn } from "@/lib/utils";
import { type TranslationKey, useI18n } from "../../i18n";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import type { MarketplacePluginEntry } from "./marketplace-catalog";
import { getProviderAffiliation } from "./marketplace-catalog";
import type { PluginComponents } from "./plugin-install-counts";

const DETAILS_COLLAPSE_THRESHOLD = 150;

// 组成类别的展示顺序、图标与 i18n 文案 key
const COMPONENT_KINDS = [
  {
    key: "commands",
    icon: SquareTerminal,
    labelKey: "profileEditor.plugins.browse.componentCommands",
  },
  { key: "agents", icon: Bot, labelKey: "profileEditor.plugins.browse.componentAgents" },
  { key: "skills", icon: Sparkles, labelKey: "profileEditor.plugins.browse.componentSkills" },
  { key: "hooks", icon: Webhook, labelKey: "profileEditor.plugins.browse.componentHooks" },
  { key: "mcpServers", icon: Plug, labelKey: "profileEditor.plugins.browse.componentMcpServers" },
  { key: "lspServers", icon: Braces, labelKey: "profileEditor.plugins.browse.componentLspServers" },
] as const satisfies ReadonlyArray<{
  key: keyof PluginComponents;
  icon: typeof Bot;
  labelKey: TranslationKey;
}>;

interface MarketplacePluginRowProps {
  plugin: MarketplacePluginEntry;
  index: number;
  /** 插件是否已写入 enabledPlugins（不论启用与否）：决定展示「管理」还是「添加并启用」 */
  configured: boolean;
  expanded: boolean;
  installCount: number | null;
  components: PluginComponents | undefined;
  numberFormatter: Intl.NumberFormat;
  onToggleDetails: (pluginId: string) => void;
  onDetailsKeyDown: (event: KeyboardEvent<HTMLSpanElement>, pluginId: string) => void;
  onAddPlugin: (pluginId: string) => void;
  onManagePlugin: (pluginId: string) => void;
}

// 单行插件条目。独立 memo 组件：展开详情、启用插件等操作只改受影响行的 props，
// 其余行被浅比较拦截，避免整列表重渲染。
function MarketplacePluginRow({
  plugin,
  index,
  configured,
  expanded,
  installCount,
  components,
  numberFormatter,
  onToggleDetails,
  onDetailsKeyDown,
  onAddPlugin,
  onManagePlugin,
}: MarketplacePluginRowProps) {
  const { t } = useI18n();
  const subTitle = [plugin.authorName, plugin.marketplaceId].filter(Boolean).join(" · ");
  const details = [plugin.description, subTitle].filter(Boolean).join(" · ");
  const canExpandDetails = details.length > DETAILS_COLLAPSE_THRESHOLD;
  const detailsTooltip = expanded
    ? t("profileEditor.plugins.browse.collapseDetailsTooltip")
    : t("profileEditor.plugins.browse.expandDetailsTooltip");
  const rowLabel = plugin.pluginId;
  const displayName = plugin.pluginId.split("@")[0];
  // 组成数据仅官方市场插件有（来自 catalog 缓存）
  const componentBadges = components
    ? COMPONENT_KINDS.map((kind) => ({
        ...kind,
        count: components[kind.key].length,
      })).filter((badge) => badge.count > 0)
    : [];
  const hasComponents = componentBadges.length > 0;
  // 提供方归属（仅对官方市场插件做行内徽章区分）
  const affiliation = getProviderAffiliation(plugin);
  const installCountLabel =
    installCount === null
      ? t("profileEditor.plugins.browse.installCountUnknown")
      : numberFormatter.format(installCount);

  return (
    <div
      data-slot="browse-row"
      className={cn(
        "grid grid-cols-[32px_minmax(0,1fr)_minmax(88px,104px)_clamp(152px,16vw,190px)] items-start gap-x-3 px-3.5 py-3 text-sm font-medium leading-[1.4] max-[640px]:grid-cols-[32px_minmax(0,1fr)] max-[640px]:gap-y-2",
        index === 0 ? "border-t-0" : "border-t border-border",
      )}
    >
      <span className="inline-flex items-start justify-center pt-0.5 text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {plugin.homepage ? (
            <Button
              type="button"
              variant="ghost"
              className="group h-auto min-w-0 max-w-full justify-start whitespace-normal bg-transparent p-0 text-left text-[inherit] font-[inherit] hover:bg-transparent hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label={`${t("profileEditor.plugins.openHomepageAriaLabel")} ${rowLabel}`}
              title={plugin.homepage}
              onClick={() => {
                void openUrl(plugin.homepage);
              }}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 break-words">{displayName}</span>
                <ExternalLink
                  className="size-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100"
                  aria-hidden="true"
                />
              </span>
            </Button>
          ) : (
            <span className="min-w-0 break-words">{displayName}</span>
          )}
          {plugin.isOfficial &&
            (affiliation === "anthropic" ? (
              <Badge variant="secondary" className="gap-1">
                <CircleCheck className="size-3" aria-hidden="true" />
                {t("profileEditor.plugins.browse.providerAnthropic")}
              </Badge>
            ) : plugin.authorName ? (
              <Badge
                variant="outline"
                className="max-w-full whitespace-normal break-words font-normal"
              >
                {plugin.authorName}
              </Badge>
            ) : (
              <span
                className="inline-flex shrink-0 items-center text-chart-2 opacity-80"
                role="img"
                aria-label={t("profileEditor.plugins.verifiedBadgeAriaLabel")}
              >
                <CircleCheck className="size-[13px]" aria-hidden="true" />
              </span>
            ))}
          {plugin.category && (
            <Badge variant="outline" className="max-w-full whitespace-normal break-words">
              {plugin.category}
            </Badge>
          )}
        </div>
        {details && (
          <div className="mt-1.5 min-w-0">
            {canExpandDetails ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant="ghost"
                    className={cn(
                      "h-auto w-full cursor-pointer justify-start whitespace-normal rounded-md bg-transparent p-0 text-left text-xs font-[inherit] leading-relaxed text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                      !expanded && "line-clamp-3",
                    )}
                  >
                    <span
                      role="button"
                      tabIndex={0}
                      title={detailsTooltip}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? t("profileEditor.plugins.browse.collapseDetailsAriaLabel") : t("profileEditor.plugins.browse.expandDetailsAriaLabel")} ${rowLabel}`}
                      data-expanded={expanded ? "true" : "false"}
                      data-testid={`marketplace-plugin-details-${plugin.pluginId}`}
                      onClick={() => onToggleDetails(plugin.pluginId)}
                      onKeyDown={(event) => onDetailsKeyDown(event, plugin.pluginId)}
                    >
                      {details}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  {detailsTooltip}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div
                className="min-w-0 whitespace-normal break-words text-xs leading-relaxed text-muted-foreground"
                data-expanded="true"
                data-testid={`marketplace-plugin-details-${plugin.pluginId}`}
              >
                {details}
              </div>
            )}
          </div>
        )}
        {hasComponents && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {componentBadges.map(({ key, icon: Icon, labelKey, count }) => (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                      <Icon className="size-3.5" aria-hidden="true" />
                      {count}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    {t(labelKey)}
                  </TooltipContent>
                </Tooltip>
              ))}
              <Button
                type="button"
                variant="ghost"
                className="h-auto gap-1 p-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                aria-expanded={expanded}
                aria-label={`${expanded ? t("profileEditor.plugins.browse.collapseComponentsAriaLabel") : t("profileEditor.plugins.browse.expandComponentsAriaLabel")} ${rowLabel}`}
                onClick={() => onToggleDetails(plugin.pluginId)}
              >
                <ChevronDown
                  className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                  aria-hidden="true"
                />
              </Button>
            </div>
            {expanded && components && (
              <div
                className="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground"
                data-testid={`marketplace-plugin-components-${plugin.pluginId}`}
              >
                {COMPONENT_KINDS.map(({ key, labelKey }) =>
                  components[key].length > 0 ? (
                    <div key={key} className="min-w-0 break-words">
                      <span className="font-medium text-foreground">{t(labelKey)}:</span>{" "}
                      {components[key].join(", ")}
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex min-w-0 items-start justify-end pt-0.5 text-xs font-medium text-muted-foreground tabular-nums max-[640px]:col-start-2 max-[640px]:justify-start max-[640px]:pt-0">
        <span className="hidden shrink-0 text-muted-foreground max-[640px]:inline">
          {t("profileEditor.plugins.browse.columnInstallCount")}:
        </span>
        <span className="max-[640px]:ml-1">{installCountLabel}</span>
      </div>
      <div className="flex justify-end max-[640px]:col-start-2 max-[640px]:justify-start">
        {configured ? (
          <div className="flex flex-wrap items-center justify-end gap-2 max-[640px]:justify-start">
            <Badge variant="secondary">
              <CircleCheck className="size-3" aria-hidden="true" />
              {t("profileEditor.plugins.browse.actionConfigured")}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onManagePlugin(plugin.pluginId)}
            >
              <Settings2 className="size-3.5" aria-hidden="true" />
              {t("profileEditor.plugins.browse.actionManage")}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={() => onAddPlugin(plugin.pluginId)}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {t("profileEditor.plugins.browse.actionEnable")}
          </Button>
        )}
      </div>
    </div>
  );
}

export default memo(MarketplacePluginRow);
