import { memo } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../i18n";
import type { UnmanagedMemory } from "../types";
import ProfileNameBadge from "./ProfileNameBadge";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface UnmanagedMemoryItemProps {
  memory: UnmanagedMemory;
  onImport: () => void;
}

function UnmanagedMemoryItem({ memory, onImport }: UnmanagedMemoryItemProps) {
  const { t } = useI18n();
  const preview = memory.content.split("\n")[0] || "";
  const targetLabel =
    memory.targetType === "rule" ? t("memory.targetType.rule") : t("memory.targetType.claude");
  const canImport = memory.importStatus === "ready";
  const disabledImportHint =
    memory.importStatus === "unsupportedSymlink"
      ? t("memory.unmanagedSymlinkUnsupported")
      : t("memory.unmanagedPathConflict");

  return (
    <Card className="memory-item memory-item-unmanaged relative flex cursor-default flex-col gap-4 rounded-[var(--radius-xl)] border border-dashed border-[var(--border-default)] bg-[var(--card)] p-4 text-[var(--foreground)] shadow-none transition-[transform,border-color,box-shadow,background-color,opacity] duration-200 hover:-translate-y-px hover:border-[var(--accent-orange)] hover:shadow-[0_4px_12px_rgb(247_129_102_/_0.14)]">
      <div className="memory-header flex items-start justify-between gap-3 group-[.compressed]/list:grid group-[.compressed]/list:grid-cols-[auto_minmax(0,1fr)] group-[.compressed]/list:justify-stretch">
        <ProfileNameBadge
          name={memory.name}
          colorSeedScope={`unmanaged:${memory.sourcePath}`}
          size="sm"
          fallbackChar="U"
        />

        <div className="memory-info flex min-w-0 flex-1 flex-col gap-1.5 pt-px">
          <h3 className="memory-name truncate text-[length:var(--font-lg)] leading-snug font-semibold text-[var(--foreground)]">
            {memory.name}
          </h3>
          <div className="memory-target-row flex min-w-0 items-center gap-2 leading-none">
            <Badge
              className={cn(
                "memory-target-badge h-[22px] shrink-0 rounded-[7px] px-2 text-xs leading-none font-semibold",
                memory.targetType === "rule"
                  ? "memory-target-badge--rule bg-[var(--accent-green-bg)] text-[var(--accent-green)]"
                  : "memory-target-badge--claude bg-[rgb(59_130_246_/_0.14)] text-[var(--primary)]",
              )}
            >
              {targetLabel}
            </Badge>
            <span className="memory-target-path min-w-0 flex-1 truncate text-xs leading-[22px] text-[var(--text-muted)]">
              {memory.sourcePath}
            </span>
          </div>
          {memory.pathPatterns.length > 0 ? (
            <p className="memory-path-patterns m-0 text-[length:var(--font-sm)] leading-normal text-[var(--text-muted)] [overflow-wrap:anywhere]">
              {t("memory.pathPatternsShort")}: {memory.pathPatterns.join(", ")}
            </p>
          ) : null}
          <p className="memory-preview m-0 line-clamp-2 text-[length:var(--font-sm)] leading-normal text-[var(--text-secondary)] [overflow-wrap:anywhere]">
            {preview}
          </p>
        </div>

        <div className="memory-header-actions flex shrink-0 flex-wrap items-center justify-end gap-1.5 pt-0.5 group-[.compressed]/list:col-span-full group-[.compressed]/list:w-full group-[.compressed]/list:justify-start group-[.compressed]/list:pt-0">
          <Badge className="memory-status unmanaged rounded-[var(--radius-md)] bg-[var(--accent-orange-bg)] px-2.5 py-1.5 text-[length:var(--font-sm)] font-semibold text-[var(--accent-orange)]">
            {t("memory.unmanaged")}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="memory-import-btn border-[var(--accent-orange)] bg-[var(--accent-orange-bg)] text-[var(--accent-orange)] hover:bg-[rgb(247_129_102_/_0.18)] hover:text-[var(--accent-orange)]"
            disabled={!canImport}
            title={canImport ? t("memory.import") : disabledImportHint}
            onClick={onImport}
          >
            {t("memory.import")}
          </Button>
        </div>
      </div>

      {!canImport ? (
        <p className="memory-unmanaged-hint m-0 text-[length:var(--font-sm)] leading-normal text-[var(--text-muted)] [overflow-wrap:anywhere]">
          {disabledImportHint}
        </p>
      ) : (
        <p className="memory-unmanaged-hint m-0 text-[length:var(--font-sm)] leading-normal text-[var(--text-muted)] [overflow-wrap:anywhere]">
          {t("memory.unmanagedImportHint")}
        </p>
      )}
    </Card>
  );
}

export default memo(UnmanagedMemoryItem);
