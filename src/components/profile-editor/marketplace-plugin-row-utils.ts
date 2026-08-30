import { Bot, Braces, Plug, Sparkles, SquareTerminal, Webhook } from "lucide-react";
import type { TranslationKey } from "../../i18n";
import type { MarketplacePluginEntry } from "./marketplace-catalog";
import type { PluginCatalog, PluginComponents } from "./plugin-install-counts";

export const DETAILS_COLLAPSE_THRESHOLD = 150;

// 组成类别的展示顺序、图标与 i18n 文案 key
export const COMPONENT_KINDS = [
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

// 统一行组件和行高估算使用的详情文本，避免折行依据与实际文案分叉
export function getMarketplacePluginDetails(plugin: MarketplacePluginEntry): string {
  const subTitle = [plugin.authorName, plugin.marketplaceId].filter(Boolean).join(" · ");
  return [plugin.description, subTitle].filter(Boolean).join(" · ");
}

// catalog entry 即使没有任何组成，也会带一个空 components 对象；只有存在非空类别时才占行高
export function hasMarketplacePluginComponents(
  components: PluginComponents | undefined,
): components is PluginComponents {
  return components !== undefined && COMPONENT_KINDS.some(({ key }) => components[key].length > 0);
}

const ROW_BASE_SIZE = 45;
const ROW_DETAILS_GAP = 6;
const ROW_DETAILS_LINE_SIZE = 20;
const ROW_DETAILS_CHAR_WIDTH = 7;
const ROW_DETAILS_MAX_LINES = 3;
const ROW_COMPONENTS_GAP = 6;
const ROW_COMPONENT_LINE_SIZE = 20;
const ROW_COMPONENT_LINE_GAP = 4;
const ROW_COMPONENT_DETAIL_GAP = 6;
const ROW_COMPONENT_BADGE_WIDTH = 28;
const ROW_COMPONENT_BADGE_GAP = 12;
// 首次渲染还没有真实宽度时按默认桌面布局估算；6 个类别加展开按钮最多 7 项
const ROW_COMPONENTS_PER_LINE_FALLBACK = COMPONENT_KINDS.length + 1;
const DEFAULT_ROW_CONTENT_WIDTH = 504;
const MIN_ROW_CONTENT_WIDTH = 160;

function getRowContentWidth(containerWidth: number | undefined): number {
  if (!containerWidth || containerWidth <= 0) return DEFAULT_ROW_CONTENT_WIDTH;

  const viewportWidth = typeof window === "undefined" ? containerWidth : window.innerWidth;
  if (viewportWidth <= 640) {
    return Math.max(MIN_ROW_CONTENT_WIDTH, containerWidth - 72);
  }

  const actionWidth = Math.min(Math.max(viewportWidth * 0.16, 152), 190);
  // 对应行 grid 的 px-3.5、索引列、安装数列、操作列和三个 gap
  return Math.max(MIN_ROW_CONTENT_WIDTH, containerWidth - 28 - 32 - 36 - 104 - actionWidth);
}

function getCharsPerLine(containerWidth: number | undefined): number {
  return Math.max(20, Math.floor(getRowContentWidth(containerWidth) / ROW_DETAILS_CHAR_WIDTH));
}

function estimateLineCount(textLength: number, charsPerLine: number, maxLines?: number): number {
  const lines = Math.max(1, Math.ceil(textLength / charsPerLine));
  return maxLines === undefined ? lines : Math.min(maxLines, lines);
}

function estimateComponentBadgeLines(
  components: PluginComponents,
  contentWidth: number | undefined,
): number {
  const badgeCount = COMPONENT_KINDS.filter(({ key }) => components[key].length > 0).length + 1;
  const width = getRowContentWidth(contentWidth);
  const badgesPerLine = Math.max(
    1,
    Math.floor(
      (width + ROW_COMPONENT_BADGE_GAP) / (ROW_COMPONENT_BADGE_WIDTH + ROW_COMPONENT_BADGE_GAP),
    ),
  );
  // 没有真实布局宽度时沿用当前桌面布局的默认基线
  const effectivePerLine =
    contentWidth === undefined ? ROW_COMPONENTS_PER_LINE_FALLBACK : badgesPerLine;
  return Math.max(1, Math.ceil(badgeCount / effectivePerLine));
}

function estimateComponentDetailLines(components: PluginComponents, charsPerLine: number): number {
  return COMPONENT_KINDS.reduce((total, { key }) => {
    const values = components[key];
    if (values.length === 0) return total;
    const textLength = key.length + 2 + values.join(", ").length;
    return total + estimateLineCount(textLength, charsPerLine);
  }, 0);
}

// 行高先按当前内容估算，再由 virtualizer.measureElement 用真实 DOM 高度校准
export function estimatePluginRowSize(
  plugin: MarketplacePluginEntry | undefined,
  catalog: PluginCatalog,
  expanded = false,
  containerWidth?: number,
): number {
  if (!plugin) return ROW_BASE_SIZE;

  const charsPerLine = getCharsPerLine(containerWidth);
  let size = ROW_BASE_SIZE;
  const details = getMarketplacePluginDetails(plugin);
  if (details) {
    const lines = estimateLineCount(
      details.length,
      charsPerLine,
      details.length > DETAILS_COLLAPSE_THRESHOLD && !expanded ? ROW_DETAILS_MAX_LINES : undefined,
    );
    size += ROW_DETAILS_GAP + lines * ROW_DETAILS_LINE_SIZE;
  }

  const components = catalog.entries[plugin.pluginId]?.components;
  if (hasMarketplacePluginComponents(components)) {
    const badgeLines = estimateComponentBadgeLines(components, containerWidth);
    size +=
      ROW_COMPONENTS_GAP +
      badgeLines * ROW_COMPONENT_LINE_SIZE +
      Math.max(0, badgeLines - 1) * ROW_COMPONENT_LINE_GAP;

    if (expanded) {
      const detailLines = estimateComponentDetailLines(components, charsPerLine);
      if (detailLines > 0) {
        size +=
          ROW_COMPONENT_DETAIL_GAP +
          detailLines * ROW_DETAILS_LINE_SIZE +
          Math.max(0, detailLines - 1) * ROW_COMPONENT_LINE_GAP;
      }
    }
  }

  return size;
}
