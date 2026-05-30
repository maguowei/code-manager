import { cn } from "@/lib/utils";
import { useI18n } from "../i18n";
import { SegmentedControl } from "./ui/segmented-control";

type ConfigSectionTab = "profiles" | "presets";

interface ConfigSectionTabsProps {
  value: ConfigSectionTab;
  onValueChange: (value: ConfigSectionTab) => void;
  className?: string;
}

function ConfigSectionTabs({ value, onValueChange, className }: ConfigSectionTabsProps) {
  const { t } = useI18n();

  return (
    <div className={cn("flex shrink-0 border-b border-border px-4 py-2", className)}>
      <SegmentedControl
        ariaLabel={t("configTabs.ariaLabel")}
        value={value}
        items={[
          { value: "profiles", label: t("configTabs.profiles") },
          { value: "presets", label: t("configTabs.presets") },
        ]}
        onValueChange={onValueChange}
      />
    </div>
  );
}

export type { ConfigSectionTab };
export default ConfigSectionTabs;
