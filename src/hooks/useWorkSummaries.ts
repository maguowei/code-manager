import { useCallback, useEffect, useState } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import type { ProjectChangeset, SummaryDocument, SummaryListItem } from "../bindings";
import { useI18n } from "../i18n";
import { ipc } from "../ipc";
import { localDateKey, yesterdayKey } from "../lib/work-summary-date";
import { isTauri } from "../types";
import useTauriEvent from "./useTauriEvent";
import { useToast } from "./useToast";

type WorkSummaryPhase = "scanning" | "scanned" | "summarizing" | "done";

/** 透明过程视图的累积状态（前端编排 phase，prompt 由后端事件下发） */
export type WorkSummaryProcess = {
  kind: "daily" | "weekly";
  phase: WorkSummaryPhase;
  candidateCount?: number;
  projects?: ProjectChangeset[];
  prompt?: string;
  summarizedCount?: number;
  doc?: SummaryDocument;
};

/** 后端 work-summary-progress 事件负载（仅 prompt 阶段携带 prompt 文本） */
type ProgressEvent = {
  phase: string;
  projectCount: number;
  prompt?: string;
  summarizedCount?: number;
};

export function useWorkSummaries(language: "zh" | "en") {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [items, setItems] = useState<SummaryListItem[]>([]);
  const [selected, setSelected] = useState<SummaryDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [process, setProcess] = useState<WorkSummaryProcess | null>(null);
  const [cliAvailable, setCliAvailable] = useState(true);

  // 事件只用于下发最终提示词；phase 由前端编排，避免与后端阶段相互覆盖
  const onProgress = useCallback((e: ProgressEvent) => {
    if (e.prompt === undefined) return;
    setProcess((prev) =>
      prev ? { ...prev, prompt: e.prompt, summarizedCount: e.summarizedCount } : prev,
    );
  }, []);
  useTauriEvent<ProgressEvent>("work-summary-progress", onProgress);

  const reload = useCallback(async () => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    try {
      const [list, cli] = await Promise.all([ipc.listSummaries(), ipc.checkClaudeCli()]);
      setItems(list);
      setCliAvailable(cli.available);
    } catch (error) {
      showOperationError(showToast, t("worklog.loadError"), error);
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  const select = useCallback(
    async (item: SummaryListItem) => {
      try {
        const doc = await ipc.readSummary(item.kind, item.key);
        setSelected(doc);
        setProcess(null);
      } catch (error) {
        showOperationError(showToast, t("worklog.loadError"), error);
      }
    },
    [showToast, t],
  );

  /** 完成卡片「查看总结」：在应用内渲染该文档 */
  const viewSummary = useCallback((doc: SummaryDocument) => {
    setSelected(doc);
    setProcess(null);
  }, []);

  const summarizeYesterday = useCallback(async () => {
    setGenerating(true);
    setProcess({ kind: "daily", phase: "scanning" });
    try {
      const date = yesterdayKey();
      const scan = await ipc.scanDayChanges(date);
      setProcess({
        kind: "daily",
        phase: "scanned",
        candidateCount: scan.candidateCount,
        projects: scan.projects,
      });
      if (scan.projects.length === 0) {
        showToast(t("worklog.noChanges"));
        return;
      }
      setProcess((prev) => (prev ? { ...prev, phase: "summarizing" } : prev));
      const doc = await ipc.summarizeDay(date, language);
      setProcess((prev) => (prev ? { ...prev, phase: "done", doc } : prev));
      await reload();
    } catch (error) {
      setProcess(null);
      showOperationError(showToast, t("worklog.generateError"), error);
    } finally {
      setGenerating(false);
    }
  }, [language, reload, showToast, t]);

  const generateWeek = useCallback(async () => {
    setGenerating(true);
    setProcess({ kind: "weekly", phase: "summarizing" });
    try {
      const doc = await ipc.generateWeeklySummary(localDateKey(new Date()), language);
      setProcess((prev) => (prev ? { ...prev, phase: "done", doc } : prev));
      await reload();
    } catch (error) {
      setProcess(null);
      showOperationError(showToast, t("worklog.generateError"), error);
    } finally {
      setGenerating(false);
    }
  }, [language, reload, showToast, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    items,
    selected,
    loading,
    generating,
    process,
    cliAvailable,
    reload,
    select,
    viewSummary,
    summarizeYesterday,
    generateWeek,
  };
}
