import { useCallback, useEffect, useMemo } from "react";
import {
  groupByProject,
  groupBySession,
  type HistoryProjectGroup,
  sortProjectGroupsByRecency,
} from "../history-utils";
import { useHistoryEntries } from "../hooks/useHistoryEntries";
import { useUrlSearchParam } from "../hooks/useUrlState";
import { useI18n } from "../i18n";
import HistoryHeatmap from "./HistoryHeatmap";
import HistoryProjectList from "./HistoryProjectList";
import HistorySessionList from "./HistorySessionList";
import SessionDetailDrawer from "./SessionDetailDrawer";
import "./HistoryPage.css";

function HistoryPage() {
  const { t } = useI18n();
  const { entries: allEntries, loading } = useHistoryEntries(t("history.noData"));

  // URL 同步状态：?project=&q=&session=
  const [projectParam, setProjectParam] = useUrlSearchParam("project", "");
  const [searchQuery, setSearchQuery] = useUrlSearchParam("q", "");
  const [sessionParam, setSessionParam] = useUrlSearchParam("session", "");

  const selectedProject = projectParam === "" ? null : projectParam;

  const sessionProjectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of allEntries) {
      map.set(entry.sessionId, entry.project);
    }
    return map;
  }, [allEntries]);

  // viewingSession 派生自 URL 参数 + sessionProjectMap（若有项目限定优先取它）
  // project 解析为空（数据未加载或 sessionId 已无效）时不渲染 Drawer
  const viewingSession = useMemo(() => {
    if (!sessionParam) return null;
    const project = selectedProject || sessionProjectMap.get(sessionParam) || "";
    if (!project) return null;
    return { project, sessionId: sessionParam };
  }, [sessionParam, selectedProject, sessionProjectMap]);

  const handleSelectProject = useCallback(
    (project: string | null) => {
      setProjectParam(project ?? "");
      // 切换项目时清空搜索词，避免误以为"无结果"
      if (searchQuery !== "") setSearchQuery("");
    },
    [setProjectParam, setSearchQuery, searchQuery],
  );

  const handleViewDetail = useCallback(
    (sessionId: string) => {
      setSessionParam(sessionId);
    },
    [setSessionParam],
  );

  const handleCloseDetail = useCallback(() => {
    setSessionParam("");
  }, [setSessionParam]);

  // URL 中携带的 sessionId 在数据加载完后若不存在，做一次清理
  useEffect(() => {
    if (!sessionParam || allEntries.length === 0) return;
    if (!sessionProjectMap.has(sessionParam)) {
      setSessionParam("");
    }
  }, [sessionParam, allEntries.length, sessionProjectMap, setSessionParam]);

  const projectGroups = useMemo<HistoryProjectGroup[]>(
    () => sortProjectGroupsByRecency(groupByProject(allEntries)),
    [allEntries],
  );

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

  const sessionGroups = useMemo(() => groupBySession(filteredEntries), [filteredEntries]);

  if (loading) {
    return (
      <div className="history-page">
        <div className="page-header">
          <h1 className="page-title">{t("history.title")}</h1>
        </div>
        <div className="loading">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="history-page">
      <div className="page-header">
        <h1 className="page-title">{t("history.title")}</h1>
      </div>

      <div className="history-body">
        <HistoryProjectList
          groups={projectGroups}
          selectedProject={selectedProject}
          onSelect={handleSelectProject}
        />
        <div className="history-main">
          <div className="history-top">
            <HistoryHeatmap entries={allEntries} />
            <div className="history-search">
              <input
                type="search"
                className="history-search-input"
                placeholder={t("history.search")}
                aria-label={t("history.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <HistorySessionList
            groups={sessionGroups}
            searchQuery={searchQuery}
            onViewDetail={handleViewDetail}
          />
        </div>
      </div>

      {viewingSession && (
        <SessionDetailDrawer
          project={viewingSession.project}
          sessionId={viewingSession.sessionId}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
}

export default HistoryPage;
