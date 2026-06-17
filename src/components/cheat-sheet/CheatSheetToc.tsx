import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TYPOGRAPHY } from "../typography-classes";
import type { TocEntry } from "./use-cheatsheet-toc";

interface CheatSheetTocProps {
  entries: TocEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
  title: string;
  className?: string;
}

// 速查表右侧目录：列出 H2 分区与 H3 子区，点击跳转，当前区块高亮
function CheatSheetToc({ entries, activeId, onSelect, title, className }: CheatSheetTocProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label={title}
      className={cn("flex w-56 shrink-0 flex-col border-l border-border bg-background", className)}
    >
      <div className={cn("px-3 pt-4 pb-2 font-semibold uppercase", TYPOGRAPHY.auxiliary)}>
        {title}
      </div>
      <ul className="min-h-0 flex-1 list-none overflow-y-auto px-2 pb-4">
        {entries.map((entry) => {
          const isActive = entry.id === activeId;
          const isSection = entry.level === 2;
          // H2 分区：贴左、加粗、前景色；H3 子区：深缩进、小字、弱化色，层级一眼可辨
          const levelClass = isSection
            ? cn("mt-1 px-2 font-semibold", TYPOGRAPHY.fieldLabel)
            : cn("pl-7 pr-2", TYPOGRAPHY.auxiliary);
          const colorClass = isActive
            ? "bg-accent text-foreground"
            : isSection
              ? "text-foreground hover:text-foreground"
              : "text-muted-foreground hover:text-foreground";
          return (
            <li key={entry.id}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSelect(entry.id)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "h-auto w-full justify-start rounded-md py-1",
                  levelClass,
                  colorClass,
                )}
              >
                <span className="min-w-0 flex-1 truncate text-left">{entry.text}</span>
              </Button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default CheatSheetToc;
