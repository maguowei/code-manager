import { Folder, Folders } from "lucide-react";
import { type KeyboardEvent, memo, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { HistoryProjectGroup } from "../history-utils";
import { useI18n } from "../i18n";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

interface Props {
  groups: HistoryProjectGroup[];
  selectedProject: string | null;
  onSelect: (project: string | null) => void;
}

function HistoryProjectList({ groups, selectedProject, onSelect }: Props) {
  const { t } = useI18n();

  // 用 null 表示 "全部项目" 的虚拟项，所有真实项目跟在后面
  const items = useMemo(
    () =>
      [{ project: null as string | null, label: t("history.allProjects"), count: 0 }].concat(
        groups.map((g) => ({ project: g.project, label: g.shortName, count: g.messageCount })),
      ),
    [groups, t],
  );

  const currentIndex = useMemo(
    () => items.findIndex((it) => it.project === selectedProject),
    [items, selectedProject],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (items.length === 0) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        const next = items[Math.min(items.length - 1, Math.max(0, currentIndex + 1))];
        onSelect(next.project);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const next = items[Math.max(0, currentIndex - 1)];
        onSelect(next.project);
      } else if (e.key === "Home") {
        e.preventDefault();
        onSelect(items[0].project);
      } else if (e.key === "End") {
        e.preventDefault();
        onSelect(items[items.length - 1].project);
      } else if (e.key === "Escape" && selectedProject !== null) {
        e.preventDefault();
        onSelect(null);
      }
    },
    [items, currentIndex, onSelect, selectedProject],
  );

  return (
    <div
      className="history-projects flex w-[220px] shrink-0 flex-col gap-1 overflow-y-auto border-r bg-secondary p-2 max-md:w-full max-md:flex-row max-md:overflow-x-auto max-md:overflow-y-hidden max-md:border-r-0 max-md:border-b max-md:px-3"
      role="listbox"
      aria-label={t("history.title")}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {items.map((item) => {
        const selected = item.project === selectedProject;
        return (
          <Button
            key={item.project ?? "__all__"}
            type="button"
            variant="ghost"
            role="option"
            aria-selected={selected}
            className={cn(
              "history-project-item h-auto w-full min-w-0 justify-between gap-2 rounded-md px-3 py-2 text-left font-medium text-muted-foreground max-md:w-auto max-md:max-w-[180px] max-md:flex-none",
              selected &&
                "selected bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
            )}
            onClick={() => onSelect(item.project)}
            title={item.project ?? undefined}
          >
            <span className="flex min-w-0 items-center gap-2">
              {item.project === null ? (
                <Folders className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Folder className="size-4 shrink-0" aria-hidden="true" />
              )}
              <span className="project-name min-w-0 truncate">{item.label}</span>
            </span>
            {item.project !== null && (
              <Badge
                variant="secondary"
                className="project-count shrink-0 px-2 py-0 text-xs font-normal"
              >
                {item.count}
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
}

export default memo(HistoryProjectList);
