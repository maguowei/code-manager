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

// 匹配标题开头的 emoji 图标（含变体选择符 U+FE0F 与 ZWJ U+200D 组合）及其后随空白
const LEADING_ICON = /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s+/u;

// 从标题文本中分离前导 emoji 与正文，让带图标的分区标题和子区文本左缘对齐
function splitLeadingIcon(text: string): { icon: string | null; label: string } {
  const match = LEADING_ICON.exec(text);
  if (!match) {
    return { icon: null, label: text };
  }
  return { icon: match[1], label: text.slice(match[0].length) };
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
          const { icon, label } = splitLeadingIcon(entry.text);
          // H2 分区：略大上间距 + 自身略高，与上一组子项拉开形成分组呼吸；H3 子区：小字、弱化色、收紧行高与上下间距使同组子项更密
          const levelClass = isSection
            ? cn(TYPOGRAPHY.fieldLabel, "mt-2 py-1 font-semibold")
            : cn(TYPOGRAPHY.auxiliary, "py-0.5 leading-tight");
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
                  "h-auto w-full justify-start rounded-md px-2",
                  levelClass,
                  colorClass,
                )}
              >
                {/* 固定宽度图标列：分区 emoji 挂在左侧，无图标项留空，保证两级文本左缘对齐 */}
                <span aria-hidden className="w-5 shrink-0 text-center">
                  {icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-left">{label}</span>
              </Button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default CheatSheetToc;
