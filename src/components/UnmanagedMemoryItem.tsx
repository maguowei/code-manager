import { FolderTree, HardDrive } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../i18n";
import type { UnmanagedMemory } from "../types";
import { formatMemorySize } from "./memory-card-utils";
import ProfileNameBadge from "./ProfileNameBadge";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface UnmanagedMemoryItemProps {
  memory: UnmanagedMemory;
  onImport: () => void;
}

function UnmanagedMemoryItem({ memory, onImport }: UnmanagedMemoryItemProps) {
  const { t } = useI18n();
  const targetLabel =
    memory.targetType === "rule" ? t("memory.targetType.rule") : t("memory.targetType.claude");
  const canImport = memory.importStatus === "ready";
  const disabledImportHint =
    memory.importStatus === "unsupportedSymlink"
      ? t("memory.unmanagedSymlinkUnsupported")
      : t("memory.unmanagedPathConflict");

  return (
    <Card
      className="memory-item memory-item-unmanaged relative flex cursor-default flex-col gap-4 rounded-lg border border-dashed border-border bg-card p-4 text-foreground shadow-panel transition-[transform,border-color,box-shadow,background-color,opacity] duration-300 hover:-translate-y-px hover:border-chart-3 hover:bg-accent/40"
      data-slot="memory-item"
    >
      <div className="memory-header flex gap-3">
        <ProfileNameBadge
          name={memory.name}
          colorSeedScope={`unmanaged:${memory.sourcePath}`}
          size="sm"
          fallbackChar="U"
        />

        <div className="memory-info flex min-w-0 flex-1 flex-col gap-1.5 pt-px">
          <div className="memory-title-row flex items-start justify-between gap-3 group-[.compressed]/list:flex-col group-[.compressed]/list:gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <h3 className="memory-name truncate text-base leading-snug font-semibold text-foreground">
                  {memory.name}
                </h3>
              </TooltipTrigger>
              <TooltipContent className="max-w-[320px] [overflow-wrap:anywhere]">
                {memory.name}
              </TooltipContent>
            </Tooltip>

            <div className="memory-header-actions flex shrink-0 flex-wrap items-center justify-end gap-1.5 group-[.compressed]/list:w-full group-[.compressed]/list:justify-start">
              <Badge className="memory-status unmanaged rounded-md bg-chart-3/10 px-2.5 py-1.5 text-xs font-semibold text-chart-3">
                {t("memory.unmanaged")}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="memory-import-btn border-chart-3 bg-chart-3/10 text-chart-3 hover:bg-chart-3/20 hover:text-chart-3"
                disabled={!canImport}
                title={canImport ? t("memory.import") : disabledImportHint}
                onClick={onImport}
              >
                {t("memory.import")}
              </Button>
            </div>
          </div>

          <div className="memory-target-row flex min-w-0 items-center gap-2 leading-none">
            <Badge
              className={cn(
                "memory-target-badge h-[22px] shrink-0 rounded-[7px] px-2 text-xs leading-none font-semibold",
                memory.targetType === "rule"
                  ? "memory-target-badge--rule bg-chart-2/10 text-chart-2"
                  : "memory-target-badge--claude bg-primary/10 text-primary",
              )}
            >
              {targetLabel}
            </Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="memory-target-path min-w-0 flex-1 truncate text-xs leading-[22px] text-muted-foreground">
                  {memory.sourcePath}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[420px] [overflow-wrap:anywhere]">
                {memory.sourcePath}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="memory-meta flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {memory.pathPatterns.length > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="memory-meta-paths inline-flex shrink-0 cursor-default items-center gap-1">
                    <FolderTree className="size-3.5" aria-hidden="true" />
                    {t("memory.pathPatternsCount", { count: memory.pathPatterns.length })}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[320px] [overflow-wrap:anywhere]">
                  <ul className="m-0 flex flex-col gap-0.5 p-0">
                    {memory.pathPatterns.map((pattern) => (
                      <li key={pattern} className="font-mono">
                        {pattern}
                      </li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            ) : null}
            <span className="memory-meta-size inline-flex shrink-0 items-center gap-1">
              <HardDrive className="size-3.5" aria-hidden="true" />
              {formatMemorySize(memory.size)}
            </span>
          </div>
        </div>
      </div>

      {!canImport ? (
        <p className="memory-unmanaged-hint m-0 text-xs leading-normal text-muted-foreground [overflow-wrap:anywhere]">
          {disabledImportHint}
        </p>
      ) : (
        <p className="memory-unmanaged-hint m-0 text-xs leading-normal text-muted-foreground [overflow-wrap:anywhere]">
          {t("memory.unmanagedImportHint")}
        </p>
      )}
    </Card>
  );
}

export default memo(UnmanagedMemoryItem);
