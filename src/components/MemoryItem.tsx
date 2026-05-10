import { Copy, Trash2 } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, memo } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../i18n";
import type { Memory } from "../types";
import ProfileNameBadge from "./ProfileNameBadge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Switch } from "./ui/switch";

interface MemoryItemProps {
  memory: Memory;
  isEditing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function MemoryItem({
  memory,
  isEditing,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: MemoryItemProps) {
  const { t } = useI18n();

  // 截取第一行作为预览
  const preview = memory.content.split("\n")[0] || "";
  const targetLabel =
    memory.targetType === "rule" ? t("memory.targetType.rule") : t("memory.targetType.claude");
  const targetPath = memory.targetType === "rule" ? memory.rulePath : undefined;
  const colorSeedScope = targetPath ?? targetLabel;

  function handleActionClick(e: MouseEvent<HTMLElement>, action: () => void) {
    e.stopPropagation();
    action();
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onEdit();
    }
  }

  return (
    <Card
      className={cn(
        "memory-item group relative flex cursor-pointer flex-col gap-4 rounded-lg border border-border bg-card p-4 text-foreground shadow-panel transition-[transform,border-color,box-shadow,background-color,opacity] duration-200 hover:-translate-y-px hover:border-primary hover:bg-accent/40",
        memory.isActive && "active border-primary ring-1 ring-primary/30",
        isEditing && "editing border-chart-3 ring-1 ring-chart-3/30 hover:border-chart-3",
      )}
      role="button"
      tabIndex={0}
      aria-label={memory.name}
      data-slot="memory-item"
      onClick={onEdit}
      onKeyDown={handleCardKeyDown}
    >
      <div className="memory-header flex items-start justify-between gap-3 group-[.compressed]/list:grid group-[.compressed]/list:grid-cols-[auto_minmax(0,1fr)] group-[.compressed]/list:justify-stretch">
        <ProfileNameBadge
          name={memory.name}
          colorSeedScope={colorSeedScope}
          size="sm"
          fallbackChar="M"
        />

        <div className="memory-info flex min-w-0 flex-1 flex-col gap-1.5 pt-px">
          <h3 className="memory-name truncate text-base leading-snug font-semibold text-foreground">
            {memory.name}
          </h3>
          <div className="memory-target-row flex min-w-0 items-center gap-2 leading-none">
            <span
              className={cn(
                "memory-target-badge inline-flex h-[22px] shrink-0 items-center justify-center overflow-hidden rounded-[7px] px-2 text-xs leading-none font-semibold whitespace-nowrap text-ellipsis",
                memory.targetType === "rule"
                  ? "memory-target-badge--rule bg-chart-2/10 text-chart-2"
                  : "memory-target-badge--claude bg-primary/10 text-primary",
              )}
            >
              {targetLabel}
            </span>
            {targetPath ? (
              <span className="memory-target-path min-w-0 flex-1 truncate text-xs leading-[22px] text-muted-foreground">
                {targetPath}
              </span>
            ) : null}
          </div>
          {memory.targetType === "rule" && memory.pathPatterns?.length ? (
            <p className="memory-path-patterns m-0 text-xs leading-normal text-muted-foreground [overflow-wrap:anywhere]">
              {t("memory.pathPatternsShort")}: {memory.pathPatterns.join(", ")}
            </p>
          ) : null}
          <p className="memory-preview m-0 line-clamp-2 text-xs leading-normal text-muted-foreground [overflow-wrap:anywhere]">
            {preview}
          </p>
        </div>

        <div className="memory-header-actions flex shrink-0 flex-wrap items-center justify-end gap-1.5 pt-0.5 group-[.compressed]/list:col-span-full group-[.compressed]/list:w-full group-[.compressed]/list:justify-start group-[.compressed]/list:pt-0">
          {isEditing && (
            <span className="memory-status editing inline-flex items-center gap-1 rounded-md bg-chart-3/10 px-2.5 py-1.5 text-xs font-semibold text-chart-3">
              {t("memory.editing")}
            </span>
          )}
          <div
            className="memory-toggle-control inline-flex cursor-pointer select-none items-center gap-2 rounded-full border border-transparent bg-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border/80 hover:bg-card/80 hover:text-foreground focus-within:border-border/80 focus-within:bg-card/80"
            data-slot="switch-hit-area"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <Switch
              size="sm"
              checked={memory.isActive}
              onCheckedChange={onToggle}
              onClick={(event) => event.stopPropagation()}
              aria-label={memory.isActive ? t("memory.enabled") : t("memory.activate")}
              className="memory-toggle-switch data-[state=checked]:bg-chart-2"
            />
            <span
              className={cn("toggle-label whitespace-nowrap", memory.isActive && "text-chart-2")}
            >
              {memory.isActive ? t("memory.enabled") : t("memory.activate")}
            </span>
          </div>
        </div>
      </div>

      <div className="memory-actions pointer-events-none mt-[calc(1rem*-1)] flex max-h-0 translate-y-2 flex-wrap justify-end gap-2 self-end overflow-hidden opacity-0 transition-[max-height,margin-top,opacity,transform] duration-200 group-hover:mt-0 group-hover:max-h-12 group-hover:translate-y-0 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:mt-0 group-focus-within:max-h-12 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="memory-action-btn border border-border bg-muted text-foreground hover:border-primary hover:text-primary"
          onClick={(e) => handleActionClick(e, onDuplicate)}
          aria-label={t("memory.duplicate")}
          title={t("memory.duplicate")}
        >
          <Copy aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="memory-action-btn delete border border-border bg-muted text-foreground hover:border-destructive hover:text-destructive"
          onClick={(e) => handleActionClick(e, onDelete)}
          aria-label={t("memory.delete")}
          title={t("memory.delete")}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}

export default memo(MemoryItem);
