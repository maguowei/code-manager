import { useCallback, useEffect, useState } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import type { SummaryDocument, SummaryListItem } from "../bindings";
import { useI18n } from "../i18n";
import { ipc } from "../ipc";
import { localDateKey, yesterdayKey } from "../lib/work-summary-date";
import { isTauri } from "../types";
import useTauriEvent from "./useTauriEvent";
import { useToast } from "./useToast";

/** 后端 work-summary-progress 事件负载 */
export type WorkSummaryProgress = {
  phase: "scanning" | "summarizing" | "writing" | "done";
  projectCount: number;
};

export function useWorkSummaries(language: "zh" | "en") {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [items, setItems] = useState<SummaryListItem[]>([]);
  const [selected, setSelected] = useState<SummaryDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<WorkSummaryProgress | null>(null);
  const [cliAvailable, setCliAvailable] = useState(true);

  useTauriEvent<WorkSummaryProgress>("work-summary-progress", setProgress);

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
      } catch (error) {
        showOperationError(showToast, t("worklog.loadError"), error);
      }
    },
    [showToast, t],
  );

  const summarizeYesterday = useCallback(async () => {
    setGenerating(true);
    setProgress(null);
    try {
      const date = yesterdayKey();
      const changes = await ipc.scanDayChanges(date);
      if (changes.length === 0) {
        showToast(t("worklog.noChanges"));
        return;
      }
      const doc = await ipc.summarizeDay(date, language);
      setSelected(doc);
      await reload();
      showToast(t("worklog.generated"));
    } catch (error) {
      showOperationError(showToast, t("worklog.generateError"), error);
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  }, [language, reload, showToast, t]);

  const generateWeek = useCallback(async () => {
    setGenerating(true);
    setProgress(null);
    try {
      const doc = await ipc.generateWeeklySummary(localDateKey(new Date()), language);
      setSelected(doc);
      await reload();
      showToast(t("worklog.generated"));
    } catch (error) {
      showOperationError(showToast, t("worklog.generateError"), error);
    } finally {
      setGenerating(false);
      setProgress(null);
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
    progress,
    cliAvailable,
    reload,
    select,
    summarizeYesterday,
    generateWeek,
  };
}
