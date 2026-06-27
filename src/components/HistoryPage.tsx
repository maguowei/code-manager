import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
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
import { type HistoryProjectRequest, resolveRequestedSession } from "./history-utils";
import PageHeader from "./PageHeader";
import SessionDetailDrawer from "./SessionDetailDrawer";
import { CONTROL_SURFACE_CLASS, PANEL_SURFACE_CLASS } from "./surface-classes";
import { Input } from "./ui/input";

type HistoryPageProps = {
  projectRequest?: HistoryProjectRequest | null;
};

function HistoryPage({ projectRequest = null }: HistoryPageProps) {
  const { t } = useI18n();
  const { entries: allEntries, loading } = useHistoryEntries(t("history.noData"));
  const handledProjectRequestIdRef = useRef<number | null>(null);

  // URL 同步状态：?project=&q=&session=
  const [projectParam, setProjectParam] = useUrlSearchParam("project", "");
  const [searchQuery, setSearchQuery] = useUrlSearchParam("q", "");
  const [sessionParam, setSessionParam] = useUrlSearchParam("session", "");

  const selectedProject = projectParam === "" ? null : projectParam;

  useEffect(() => {
    if (!projectRequest || handledProjectRequestIdRef.current === projectRequest.requestId) {
      return;
    }

    handledProjectRequestIdRef.current = projectRequest.requestId;
    const { project, sessionId } = resolveRequestedSession(projectRequest);
    setProjectParam(project);
    if (searchQuery !== "") setSearchQuery("");
    // 携带 sessionId 时直接打开会话详情，否则清空已选会话
    if (sessionId) {
      setSessionParam(sessionId);
    } else if (sessionParam !== "") {
      setSessionParam("");
    }
  }, [projectRequest, searchQuery, sessionParam, setProjectParam, setSearchQuery, setSessionParam]);

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
      <div className="history-page flex h-full w-full flex-col overflow-hidden bg-secondary">
        <PageHeader title={t("history.title")} surface="secondary" />
        <div className="loading">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="history-page flex h-full w-full flex-col overflow-hidden bg-secondary">
      <PageHeader title={t("history.title")} surface="secondary" />

      <div className="history-body grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] gap-3 overflow-hidden bg-secondary p-3 max-md:grid-cols-1 max-md:grid-rows-[auto_minmax(0,1fr)] max-md:p-2">
        <HistoryProjectList
          groups={projectGroups}
          selectedProject={selectedProject}
          onSelect={handleSelectProject}
        />
        <div
          className={cn(
            "history-main flex min-w-0 flex-col overflow-hidden rounded-lg border",
            PANEL_SURFACE_CLASS,
          )}
        >
          <div className="history-top flex shrink-0 flex-wrap items-start gap-4 border-b bg-card/95 p-3 md:p-4">
            <HistoryHeatmap entries={allEntries} />
            <div className="history-search group relative mt-1 ml-auto w-full flex-none md:w-[220px]">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary group-hover:text-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                className={cn(
                  CONTROL_SURFACE_CLASS,
                  "history-search-input border-border/80 bg-background/70 pl-9 hover:bg-card focus-visible:border-primary/70 focus-visible:bg-card focus-visible:ring-0",
                )}
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
