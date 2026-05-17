import { useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import BrowseMarketplaceTab from "./BrowseMarketplaceTab";
import EnabledPluginsTab from "./EnabledPluginsTab";
import { loadMarketplaceCatalogCache, type MarketplacePluginEntry } from "./marketplace-catalog";
import { useEnabledPluginsState } from "./useEnabledPluginsState";
import type { MarketplaceSourceInput } from "./useMarketplaceCatalog";

interface EnabledPluginsEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
  showTitle?: boolean;
  marketplaceSources?: MarketplaceSourceInput[];
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

  const metadataMap = useMemo(() => {
    const cache = loadMarketplaceCatalogCache() ?? {};
    const cached = Object.values(cache).flatMap((entry) => entry.plugins);
    return createPluginMetadataMap(cached);
  }, []);

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

  return (
    <div className="flex flex-col gap-3.5">
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
            onAddPlugin={(pluginId) => addPlugin(pluginId, true)}
            onGoBrowse={() => setActiveTab("browse")}
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
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default EnabledPluginsEditor;
