import { useCallback, useMemo, useState } from "react";
import {
  groupByProject,
  groupBySession,
  type HistoryProjectGroup,
  sortProjectGroupsByMessageCount,
} from "../history-utils";
import { useHistoryEntries } from "../hooks/useHistoryEntries";
import { useI18n } from "../i18n";
import HistoryHeatmap from "./HistoryHeatmap";
import HistoryProjectList from "./HistoryProjectList";
import HistorySessionList from "./HistorySessionList";
import SessionDetailDrawer from "./SessionDetailDrawer";
import "./HistoryPage.css";

function HistoryPage() {
  const { t } = useI18n();
  const { entries: allEntries, loading } = useHistoryEntries(t("history.noData"));
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingSession, setViewingSession] = useState<{
    project: string;
    sessionId: string;
  } | null>(null);

  // sessionId → project 索引，O(1) 查找替代 allEntries.find()
  const sessionProjectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of allEntries) {
      map.set(entry.sessionId, entry.project);
    }
    return map;
  }, [allEntries]);

  const handleViewDetail = useCallback(
    (sessionId: string) => {
      const project = selectedProject || sessionProjectMap.get(sessionId) || "";
      setViewingSession({ project, sessionId });
    },
    [selectedProject, sessionProjectMap],
  );

  // 按项目分组
  const projectGroups = useMemo<HistoryProjectGroup[]>(
    () => sortProjectGroupsByMessageCount(groupByProject(allEntries)),
    [allEntries],
  );

  // 当前显示的条目（受项目筛选和搜索影响）
  const filteredEntries = useMemo(() => {
    let entries = selectedProject
      ? allEntries.filter((e) => e.project === selectedProject)
      : allEntries;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter((e) => e.display.toLowerCase().includes(q));
    }
    return entries;
  }, [allEntries, selectedProject, searchQuery]);

  // 过滤后的会话分组
  const sessionGroups = useMemo(() => groupBySession(filteredEntries), [filteredEntries]);

  if (loading) {
    return (
      <div className="history-page">
        <div className="loading">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="history-page">
      {/* 顶部区域：热力图 + 搜索 */}
      <div className="history-top">
        <HistoryHeatmap entries={allEntries} />
        <div className="history-search">
          <input
            type="text"
            className="history-search-input"
            placeholder={t("history.search")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 主体区域：项目列表 + 会话列表 */}
      <div className="history-body">
        <HistoryProjectList
          groups={projectGroups}
          selectedProject={selectedProject}
          onSelect={setSelectedProject}
        />
        <HistorySessionList
          groups={sessionGroups}
          searchQuery={searchQuery}
          onViewDetail={handleViewDetail}
        />
      </div>

      {viewingSession && (
        <SessionDetailDrawer
          project={viewingSession.project}
          sessionId={viewingSession.sessionId}
          onClose={() => setViewingSession(null)}
        />
      )}
    </div>
  );
}

export default HistoryPage;
