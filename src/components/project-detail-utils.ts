import type { useI18n } from "../i18n";
import type { AgentsStatus } from "../types";

export type TranslateFn = ReturnType<typeof useI18n>["t"];

export function formatUSD(val: number) {
  return val < 0.01 && val > 0 ? "< $0.01" : `$${val.toFixed(2)}`;
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = sec / 60;
  if (min < 60) return `${min.toFixed(1)}m`;
  return `${(min / 60).toFixed(1)}h`;
}

export function formatCommitTime(timestamp?: number) {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toLocaleString();
}

export function formatHistoryTimestamp(timestamp?: number) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString();
}

export function agentsStatusLabel(status: AgentsStatus, t: TranslateFn) {
  switch (status) {
    case "correctSymlink":
      return t("projects.agentsCorrect");
    case "wrongSymlink":
      return t("projects.agentsWrong");
    case "plainFileConflict":
      return t("projects.agentsConflict");
    default:
      return t("projects.agentsMissing");
  }
}

export function agentsSkillsStatusLabel(status: AgentsStatus, t: TranslateFn) {
  switch (status) {
    case "correctSymlink":
      return t("projects.agentsSkillsCorrect");
    case "wrongSymlink":
      return t("projects.agentsSkillsWrong");
    case "plainFileConflict":
      return t("projects.agentsSkillsConflict");
    default:
      return t("projects.agentsSkillsMissing");
  }
}

export function agentsStatusTone(status: AgentsStatus) {
  switch (status) {
    case "correctSymlink":
      return "success";
    case "wrongSymlink":
      return "warning";
    case "plainFileConflict":
      return "danger";
    default:
      return "muted";
  }
}
