import { useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import BrowseMarketplaceTab, { type AddMarketplaceInput } from "./BrowseMarketplaceTab";
import EnabledPluginsTab from "./EnabledPluginsTab";
import { readObject } from "./editor-utils";
import { loadMarketplaceCatalogCache, type MarketplacePluginEntry } from "./marketplace-catalog";
import { useEnabledPluginsState } from "./useEnabledPluginsState";
import type { MarketplaceSourceInput } from "./useMarketplaceCatalog";

interface EnabledPluginsEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
  showTitle?: boolean;
  marketplaceSources?: MarketplaceSourceInput[];
  marketplacesValue?: unknown;
  onMarketplacesChange?: (next: Record<string, unknown>) => void;
  onOpenMarketplaceConfig?: () => void;
}

// 构建 github 市场条目的持久化 shape，与 MarketplaceEditor.buildMarketplaceRecord 保持一致
function buildGithubMarketplaceEntry(
  repo: string,
  ref: string,
  path: string,
): Record<string, unknown> {
  const source: Record<string, unknown> = { source: "github", repo };
  if (ref) {
    source.ref = ref;
  }
  if (path) {
    source.path = path;
  }
  return { source };
}

function createPluginMetadataMap(
  plugins: MarketplacePluginEntry[],
): Record<string, MarketplacePluginEntry> {
  return plugins.reduce<Record<string, MarketplacePluginEntry>>((accumulator, plugin) => {
    accumulator[plugin.pluginId] = plugin;
    return accumulator;
  }, {});
}

function EnabledPluginsEditor({
  value,
  onChange,
  onError,
  showTitle = true,
  marketplaceSources = [],
  marketplacesValue,
  onMarketplacesChange,
  onOpenMarketplaceConfig,
}: EnabledPluginsEditorProps) {
  const { t } = useI18n();
  const { plugins, addPlugin, togglePlugin, removePlugin } = useEnabledPluginsState({
    value,
    onChange,
  });
  const [activeTab, setActiveTab] = useState<"enabled" | "browse">("enabled");
  const [manageTarget, setManageTarget] = useState<{
    pluginId: string;
    requestId: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const metadataMap = useMemo(() => {
    const cache = loadMarketplaceCatalogCache() ?? {};
    const cached = Object.values(cache).flatMap((entry) => entry.plugins);
    return createPluginMetadataMap(cached);
  }, []);

  const existingMarketplaceIds = useMemo(
    () => marketplaceSources.map((source) => source.marketplaceId),
    [marketplaceSources],
  );

  function handleManagePlugin(pluginId: string) {
    setManageTarget((current) => ({
      pluginId,
      requestId: (current?.requestId ?? 0) + 1,
    }));
    setActiveTab("enabled");
  }

  function handleTabChange(value: string) {
    setActiveTab(value as "enabled" | "browse");
    setManageTarget(null);
  }

  // 从已配置切到浏览市场后，把插件区顶部滚回视口（避免停留在原列表底部看到浏览列表中段）
  function handleGoBrowse() {
    setActiveTab("browse");
    requestAnimationFrame(() => {
      containerRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    });
  }

  // 浏览页快速添加 github 市场，merge 写回 settings.extraKnownMarketplaces，与 MarketplaceEditor 同源
  function handleAddMarketplace(input: AddMarketplaceInput) {
    if (!onMarketplacesChange) {
      return;
    }
    const marketplaceId = input.marketplaceId.trim();
    const repo = input.repo.trim();
    if (!marketplaceId || !repo) {
      return;
    }
    const current = readObject(marketplacesValue);
    onMarketplacesChange({
      ...current,
      [marketplaceId]: buildGithubMarketplaceEntry(repo, input.ref.trim(), input.path.trim()),
    });
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-3.5">
      {showTitle ? <h4>{t("profileEditor.plugins.title")}</h4> : null}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="enabled">
            {t("profileEditor.plugins.tabConfigured")} ({plugins.length})
          </TabsTrigger>
          <TabsTrigger value="browse">{t("profileEditor.plugins.tabBrowse")}</TabsTrigger>
        </TabsList>

        <TabsContent value="enabled">
          <EnabledPluginsTab
            plugins={plugins}
            metadataMap={metadataMap}
            onTogglePlugin={togglePlugin}
            onRemovePlugin={removePlugin}
            onGoBrowse={handleGoBrowse}
            manageTarget={manageTarget}
            onError={onError}
          />
        </TabsContent>

        <TabsContent value="browse">
          <BrowseMarketplaceTab
            sources={marketplaceSources}
            plugins={plugins}
            active={activeTab === "browse"}
            onAddPlugin={(pluginId) => addPlugin(pluginId, true)}
            onManagePlugin={handleManagePlugin}
            existingMarketplaceIds={existingMarketplaceIds}
            onAddMarketplace={onMarketplacesChange ? handleAddMarketplace : undefined}
            onOpenAdvancedConfig={onOpenMarketplaceConfig}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default EnabledPluginsEditor;
