import { type KeyboardEvent, memo, useCallback, useMemo } from "react";
import type { HistoryProjectGroup } from "../history-utils";
import { useI18n } from "../i18n";

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
      className="history-projects"
      role="listbox"
      aria-label={t("history.title")}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {items.map((item) => {
        const selected = item.project === selectedProject;
        return (
          <button
            key={item.project ?? "__all__"}
            type="button"
            role="option"
            aria-selected={selected}
            className={`history-project-item${selected ? " selected" : ""}`}
            onClick={() => onSelect(item.project)}
            title={item.project ?? undefined}
          >
            <span className="project-name">{item.label}</span>
            {item.project !== null && <span className="project-count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default memo(HistoryProjectList);
