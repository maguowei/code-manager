import { ExternalLink, FilePlus2, Sparkles } from "lucide-react";
import { useI18n } from "../i18n";
import { cn } from "../lib/utils";
import {
  KARPATHY_MEMORY_PRESET_ID,
  KARPATHY_MEMORY_PRESET_SOURCE_URL,
} from "./memory-preset-utils";
import { PANEL_SURFACE_CLASS } from "./surface-classes";
import { Button } from "./ui/button";

export { KARPATHY_MEMORY_PRESET_ID, KARPATHY_MEMORY_PRESET_SOURCE_URL };

interface MemoryPresetPanelProps {
  isApplying: boolean;
  onApply: () => void;
  onOpenSource: () => void;
}

function MemoryPresetPanel({ isApplying, onApply, onOpenSource }: MemoryPresetPanelProps) {
  const { t } = useI18n();

  return (
    <section className={cn("mx-2 mt-3 rounded-lg border p-3", PANEL_SURFACE_CLASS)}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 truncate text-sm font-semibold text-foreground">
              {t("memory.presets.karpathyName")}
            </h2>
            <p className="m-0 mt-0.5 truncate text-xs text-muted-foreground">
              {t("memory.presets.karpathySummary")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            aria-label={t("memory.presets.sourceAriaLabel")}
            title={t("memory.presets.sourceAriaLabel")}
            onClick={onOpenSource}
          >
            <span>{t("memory.presets.source")}</span>
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 px-2.5 text-xs"
            aria-busy={isApplying}
            disabled={isApplying}
            onClick={onApply}
          >
            <FilePlus2 className="size-3.5" aria-hidden="true" />
            <span>{t("memory.presets.action.importClaude")}</span>
          </Button>
        </div>
      </div>
    </section>
  );
}

export default MemoryPresetPanel;
