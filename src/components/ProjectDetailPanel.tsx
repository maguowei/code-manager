import { Code2, ExternalLink, Link2, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { DefaultEditorApp, ProjectDetail, ProjectSummary } from "../types";
import {
  agentsStatusLabel,
  agentsStatusTone,
  formatCommitTime,
  formatDuration,
  formatUSD,
  type TranslateFn,
} from "./project-detail-utils";
import { PANEL_SURFACE_CLASS, SUBTLE_SURFACE_CLASS } from "./surface-classes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

type StatusTone = "success" | "warning" | "danger" | "muted";

type ProjectDetailPanelProps = {
  t: TranslateFn;
  summary: ProjectSummary;
  detail: ProjectDetail | null;
  defaultEditorApp: DefaultEditorApp | null;
  canCreateAgentsLink: boolean;
  canOpenRepository: boolean;
  canOpenProjectDirectory: boolean;
  canOpenInEditor: boolean;
  isLinkingAgents: boolean;
  onOpenInTerminal: () => void;
  onOpenInEditor: () => void;
  onOpenRepository: () => void;
  onCreateAgentsLink: () => void;
};

type SectionHeadingProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

type StatusStripItemProps = {
  label: string;
  value: string;
  tone: StatusTone;
};

type BranchesSectionProps = {
  detail: ProjectDetail | null;
  t: TranslateFn;
};

type WorktreesSectionProps = {
  detail: ProjectDetail | null;
  t: TranslateFn;
};

type OverviewPanelProps = {
  detail: ProjectDetail | null;
  summary: ProjectSummary;
  t: TranslateFn;
};

function statusToneClass(tone: StatusTone) {
  switch (tone) {
    case "success":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-600";
    case "warning":
      return "border-yellow-500/20 bg-yellow-500/10 text-yellow-600";
    case "danger":
      return "border-destructive/20 bg-destructive/10 text-destructive";
    case "muted":
      return "border-border bg-muted text-muted-foreground";
  }
}

function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <Badge
      variant="outline"
      className={cn("projects-status-chip max-w-full whitespace-nowrap", statusToneClass(tone))}
    >
      {children}
    </Badge>
  );
}

function SectionHeading({ title, description, action }: SectionHeadingProps) {
  return (
    <div className="projects-section-heading flex items-start justify-between gap-3">
      <div className="projects-section-heading-copy min-w-0">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="projects-section-heading-action shrink-0">{action}</div>}
    </div>
  );
}

function StatusStripItem({ label, value, tone }: StatusStripItemProps) {
  return (
    <div
      className={cn(
        "projects-status-item min-w-0 border-t p-4 first:border-t-0 md:border-t-0 md:border-l md:first:border-l-0",
        SUBTLE_SURFACE_CLASS,
      )}
    >
      <span className="projects-status-item-label text-sm text-muted-foreground">{label}</span>
      <StatusBadge tone={tone}>{value}</StatusBadge>
    </div>
  );
}

function BranchesSection({ detail, t }: BranchesSectionProps) {
  return (
    <Card className={cn("projects-structure-section gap-4 rounded-lg p-5", PANEL_SURFACE_CLASS)}>
      <SectionHeading title={t("projects.branches")} />

      {!detail?.isGitRepo ? (
        <div className="projects-empty-block flex min-h-[120px] items-center justify-center border-t px-4 text-center text-sm text-muted-foreground">
          {t("projects.notGitRepoHint")}
        </div>
      ) : detail.branches.length === 0 ? (
        <div className="projects-empty-block flex min-h-[120px] items-center justify-center border-t px-4 text-center text-sm text-muted-foreground">
          {t("projects.noBranches")}
        </div>
      ) : (
        <div className="projects-table overflow-x-auto border-t">
          <div className="projects-table-inner min-w-[640px]">
            <div className="projects-table-header projects-branch-grid hidden gap-4 border-b py-2 text-sm font-semibold text-muted-foreground sm:grid sm:grid-cols-[minmax(160px,0.9fr)_minmax(260px,1.3fr)_160px]">
              <span>{t("projects.branchColumn")}</span>
              <span>{t("projects.commitColumn")}</span>
              <span>{t("projects.updatedColumn")}</span>
            </div>
            <div className="projects-table-body">
              {detail.branches.map((branch) => (
                <div
                  key={branch.name}
                  className="projects-table-row projects-branch-grid grid gap-2 border-b py-3 last:border-b-0 sm:grid-cols-[minmax(160px,0.9fr)_minmax(260px,1.3fr)_160px] sm:gap-4"
                >
                  <div className="projects-table-cell grid min-w-0 gap-1 sm:block">
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {t("projects.branchColumn")}
                    </span>
                    <div className="projects-row-title-wrap flex flex-wrap items-center gap-2">
                      <span className="projects-row-title text-sm font-semibold leading-6 text-foreground">
                        {branch.name}
                      </span>
                      {branch.isCurrent && (
                        <StatusBadge tone="success">{t("projects.current")}</StatusBadge>
                      )}
                    </div>
                  </div>
                  <div className="projects-table-cell grid min-w-0 gap-1 sm:block">
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {t("projects.commitColumn")}
                    </span>
                    <span className="projects-row-secondary text-sm leading-6 break-words text-muted-foreground">
                      {branch.lastCommitSubject ?? "—"}
                    </span>
                  </div>
                  <div className="projects-table-cell grid min-w-0 gap-1 sm:block">
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {t("projects.updatedColumn")}
                    </span>
                    <span className="projects-row-secondary text-sm leading-6 text-muted-foreground">
                      {formatCommitTime(branch.lastCommitAt) ?? "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function WorktreesSection({ detail, t }: WorktreesSectionProps) {
  return (
    <Card className={cn("projects-structure-section gap-4 rounded-lg p-5", PANEL_SURFACE_CLASS)}>
      <SectionHeading title={t("projects.worktrees")} />

      {!detail?.isGitRepo ? (
        <div className="projects-empty-block flex min-h-[120px] items-center justify-center border-t px-4 text-center text-sm text-muted-foreground">
          {t("projects.notGitRepoHint")}
        </div>
      ) : detail.worktrees.length === 0 ? (
        <div className="projects-empty-block flex min-h-[120px] items-center justify-center border-t px-4 text-center text-sm text-muted-foreground">
          {t("projects.noWorktrees")}
        </div>
      ) : (
        <div className="projects-table overflow-x-auto border-t">
          <div className="projects-table-inner min-w-[760px]">
            <div className="projects-table-header projects-worktree-grid hidden gap-4 border-b py-2 text-sm font-semibold text-muted-foreground sm:grid sm:grid-cols-[minmax(240px,1.45fr)_minmax(140px,0.7fr)_minmax(90px,0.5fr)_120px]">
              <span>{t("projects.worktreePath")}</span>
              <span>{t("projects.branchRef")}</span>
              <span>{t("projects.head")}</span>
              <span>{t("projects.flags")}</span>
            </div>
            <div className="projects-table-body">
              {detail.worktrees.map((worktree) => (
                <div
                  key={worktree.path}
                  className="projects-table-row projects-worktree-grid grid gap-2 border-b py-3 last:border-b-0 sm:grid-cols-[minmax(240px,1.45fr)_minmax(140px,0.7fr)_minmax(90px,0.5fr)_120px] sm:gap-4"
                >
                  <div className="projects-table-cell grid min-w-0 gap-1 sm:block">
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {t("projects.worktreePath")}
                    </span>
                    <span
                      className="projects-row-path text-sm font-semibold leading-6 break-all text-foreground"
                      title={worktree.path}
                    >
                      {worktree.path}
                    </span>
                  </div>
                  <div className="projects-table-cell grid min-w-0 gap-1 sm:block">
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {t("projects.branchRef")}
                    </span>
                    <span className="projects-row-secondary text-sm leading-6 break-words text-muted-foreground">
                      {worktree.branch ?? "—"}
                    </span>
                  </div>
                  <div className="projects-table-cell grid min-w-0 gap-1 sm:block">
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {t("projects.head")}
                    </span>
                    <span className="projects-row-secondary text-sm leading-6 text-muted-foreground">
                      {worktree.head ? worktree.head.slice(0, 8) : "—"}
                    </span>
                  </div>
                  <div className="projects-table-cell grid min-w-0 gap-1 sm:block">
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {t("projects.flags")}
                    </span>
                    <div className="projects-flag-group flex min-h-5 flex-wrap gap-2">
                      {worktree.isCurrent || worktree.isDetached ? (
                        <>
                          {worktree.isCurrent && (
                            <StatusBadge tone="success">{t("projects.current")}</StatusBadge>
                          )}
                          {worktree.isDetached && (
                            <StatusBadge tone="warning">{t("projects.detached")}</StatusBadge>
                          )}
                        </>
                      ) : (
                        <span className="projects-flag-empty text-sm text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function OverviewPanel({ detail, summary, t }: OverviewPanelProps) {
  return (
    <Card
      className={cn(
        "projects-overview-panel gap-4 rounded-lg p-5 lg:sticky lg:top-0",
        PANEL_SURFACE_CLASS,
      )}
    >
      <SectionHeading title={t("projects.overview")} />

      <dl className="projects-definition-list flex flex-col">
        <div className="projects-definition-row grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0 max-sm:grid-cols-1 max-sm:gap-1">
          <dt className="text-sm text-muted-foreground">{t("projects.lastCost")}</dt>
          <dd className="text-sm font-semibold leading-6 text-foreground">
            {formatUSD(summary.lastCost)}
          </dd>
        </div>
        <div className="projects-definition-row grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0 max-sm:grid-cols-1 max-sm:gap-1">
          <dt className="text-sm text-muted-foreground">{t("projects.lastDuration")}</dt>
          <dd className="text-sm font-semibold leading-6 text-foreground">
            {formatDuration(summary.lastDuration)}
          </dd>
        </div>
        <div className="projects-definition-row grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0 max-sm:grid-cols-1 max-sm:gap-1">
          <dt className="text-sm text-muted-foreground">{t("projects.lastSessionId")}</dt>
          <dd
            className="min-w-0 truncate text-sm font-semibold leading-6 text-foreground"
            title={summary.lastSessionId ?? undefined}
          >
            {summary.lastSessionId ?? t("projects.lastSessionIdMissing")}
          </dd>
        </div>
        <div className="projects-definition-row grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0 max-sm:grid-cols-1 max-sm:gap-1">
          <dt className="text-sm text-muted-foreground">{t("projects.repoRoot")}</dt>
          <dd
            className="min-w-0 truncate text-sm font-semibold leading-6 text-foreground"
            title={detail?.repoRoot ?? undefined}
          >
            {detail?.repoRoot ?? t("projects.repoRootUnavailable")}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function ProjectDetailPanel({
  t,
  summary,
  detail,
  defaultEditorApp,
  canCreateAgentsLink,
  canOpenRepository,
  canOpenProjectDirectory,
  canOpenInEditor,
  isLinkingAgents,
  onOpenInTerminal,
  onOpenInEditor,
  onOpenRepository,
  onCreateAgentsLink,
}: ProjectDetailPanelProps) {
  const directoryTone: StatusTone = detail?.exists ? "success" : "danger";
  const gitTone: StatusTone = detail?.isGitRepo ? "success" : detail?.exists ? "warning" : "muted";
  const agentsTone: StatusTone = detail ? agentsStatusTone(detail.agentsStatus) : "muted";
  const agentsLabel = detail
    ? agentsStatusLabel(detail.agentsStatus, t)
    : t("projects.agentsMissing");

  return (
    <div className="projects-detail-scroll flex h-full flex-col gap-6 overflow-y-auto p-5 lg:p-6">
      <header className="projects-hero grid gap-6 border-b pb-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.95fr)]">
        <div className="projects-hero-main flex min-w-0 flex-col gap-4">
          <div className="projects-hero-copy">
            <h2 className="text-xl font-bold leading-tight text-foreground">{summary.shortName}</h2>
            <p className="projects-hero-path mt-2 break-all text-sm text-muted-foreground">
              {summary.project}
            </p>
          </div>

          <div className="projects-identity-meta flex flex-col gap-3">
            <div className="projects-identity-row grid grid-cols-[92px_minmax(0,1fr)] items-start gap-3 border-t pt-3 max-sm:grid-cols-1 max-sm:gap-1">
              <span className="projects-identity-label text-sm text-muted-foreground">
                {t("projects.repository")}
              </span>
              <span className="projects-identity-value break-all text-sm leading-6 text-foreground">
                {detail?.repositoryUrl ?? t("projects.repositoryUnavailable")}
              </span>
            </div>
          </div>
        </div>

        <Card className={cn("projects-hero-side gap-4 rounded-lg p-5", PANEL_SURFACE_CLASS)}>
          <SectionHeading title={t("projects.quickActions")} />
          <div className="projects-hero-actions grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              className="projects-action-btn projects-action-btn-primary sm:col-span-2"
              onClick={onOpenInTerminal}
              disabled={!canOpenProjectDirectory}
            >
              <Terminal className="size-4" />
              {t("projects.openInTerminal")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="projects-link-btn"
              onClick={onOpenInEditor}
              disabled={!canOpenInEditor}
            >
              <Code2 className="size-4" />
              {t("projects.openInEditor")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="projects-link-btn"
              onClick={onOpenRepository}
              disabled={!canOpenRepository}
            >
              <ExternalLink className="size-4" />
              {t("projects.openRepository")}
            </Button>
          </div>
          {!defaultEditorApp && (
            <p className="projects-note projects-note-warning text-sm leading-6 text-yellow-600">
              {t("projects.editorNotConfiguredHint")}
            </p>
          )}
        </Card>
      </header>

      <Card
        className={cn(
          "projects-status-strip grid shrink-0 gap-0 overflow-hidden rounded-lg p-0 py-0 md:grid-cols-3",
          PANEL_SURFACE_CLASS,
        )}
      >
        <StatusStripItem
          label={t("projects.directoryStatus")}
          value={detail?.exists ? t("projects.directoryExists") : t("projects.directoryMissing")}
          tone={directoryTone}
        />
        <StatusStripItem
          label={t("projects.gitStatus")}
          value={detail?.isGitRepo ? t("projects.gitRepo") : t("projects.notGitRepo")}
          tone={gitTone}
        />
        <StatusStripItem label={t("projects.agentsMd")} value={agentsLabel} tone={agentsTone} />
      </Card>

      <div className="projects-alert-stack flex flex-col gap-2">
        {!detail?.exists && (
          <p className="projects-inline-alert rounded-md border-l-4 border-destructive bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">
            {t("projects.directoryMissing")}
          </p>
        )}
        {detail?.exists && !detail.isGitRepo && (
          <p className="projects-inline-alert rounded-md border-l-4 border-yellow-500 bg-yellow-500/10 px-3 py-2 text-sm leading-6 text-yellow-600">
            {t("projects.notGitRepoHint")}
          </p>
        )}
        {detail?.agentsStatus === "plainFileConflict" && (
          <p className="projects-inline-alert rounded-md border-l-4 border-yellow-500 bg-yellow-500/10 px-3 py-2 text-sm leading-6 text-yellow-600">
            {t("projects.agentsDisabledConflict")}
          </p>
        )}
      </div>

      <Card className={cn("projects-agents-panel gap-4 rounded-lg p-5", PANEL_SURFACE_CLASS)}>
        <SectionHeading
          title={t("projects.agentsTitle")}
          description={t("projects.agentsHelp")}
          action={
            <Button
              type="button"
              className="projects-action-btn"
              onClick={onCreateAgentsLink}
              disabled={!canCreateAgentsLink || isLinkingAgents}
            >
              <Link2 className="size-4" />
              {isLinkingAgents ? t("projects.linkingAgents") : t("projects.linkAgents")}
            </Button>
          }
        />

        <div className="projects-agents-layout grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(220px,0.9fr)]">
          <dl className="projects-agents-state-list flex flex-col">
            <div className="projects-status-row grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0 max-sm:grid-cols-1 max-sm:gap-1">
              <dt className="projects-status-label text-sm text-muted-foreground">
                {t("projects.claudeMd")}
              </dt>
              <dd>
                <StatusBadge tone={detail?.hasClaudeMd ? "success" : "muted"}>
                  {detail?.hasClaudeMd
                    ? t("projects.claudeMdPresent")
                    : t("projects.claudeMdMissing")}
                </StatusBadge>
              </dd>
            </div>
            <div className="projects-status-row grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0 max-sm:grid-cols-1 max-sm:gap-1">
              <dt className="projects-status-label text-sm text-muted-foreground">
                {t("projects.agentsMd")}
              </dt>
              <dd>
                <StatusBadge tone={agentsTone}>{agentsLabel}</StatusBadge>
              </dd>
            </div>
          </dl>

          <div className="projects-agents-notes flex flex-col justify-center gap-2">
            {!detail?.hasClaudeMd && (
              <p className="projects-note projects-note-warning text-sm leading-6 text-yellow-600">
                {t("projects.agentsDisabledNoClaude")}
              </p>
            )}
            {detail?.agentsStatus === "wrongSymlink" && (
              <p className="projects-note text-sm leading-6 text-muted-foreground">
                {t("projects.agentsHelp")}
              </p>
            )}
          </div>
        </div>
      </Card>

      <div className="projects-detail-grid grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.85fr)]">
        <div className="projects-detail-main flex min-w-0 flex-col gap-6">
          <BranchesSection detail={detail} t={t} />
          <WorktreesSection detail={detail} t={t} />
        </div>

        <aside className="projects-detail-side min-w-0 xl:border-l xl:pl-5">
          <OverviewPanel detail={detail} summary={summary} t={t} />
        </aside>
      </div>
    </div>
  );
}

export default ProjectDetailPanel;
