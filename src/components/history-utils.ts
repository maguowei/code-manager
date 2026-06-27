/** 历史页跨页请求载荷 */
export interface HistoryProjectRequest {
  project: string;
  sessionId?: string;
  requestId: number;
}

/** 从跨页请求解析要打开的项目与会话（无 sessionId 时 sessionId 为 null） */
export function resolveRequestedSession(req: HistoryProjectRequest): {
  project: string;
  sessionId: string | null;
} {
  return { project: req.project, sessionId: req.sessionId ?? null };
}
