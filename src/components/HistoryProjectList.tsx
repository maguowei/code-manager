import { memo } from "react";
import type { HistoryProjectGroup } from "../history-utils";
import { useI18n } from "../i18n";

interface Props {
  groups: HistoryProjectGroup[];
  selectedProject: string | null;
  onSelect: (project: string | null) => void;
}

function HistoryProjectList({ groups, selectedProject, onSelect }: Props) {
  const { t } = useI18n();
  return (
    <div className="history-projects">
      <div
        className={`history-project-item${selectedProject === null ? " selected" : ""}`}
        onClick={() => onSelect(null)}
      >
        {t("history.allProjects")}
      </div>
      {groups.map((g) => (
        <div
          key={g.project}
          className={`history-project-item${selectedProject === g.project ? " selected" : ""}`}
          onClick={() => onSelect(g.project)}
          title={g.project}
        >
          <span className="project-name">{g.shortName}</span>
          <span className="project-count">{g.messageCount}</span>
        </div>
      ))}
    </div>
  );
}

export default memo(HistoryProjectList);
