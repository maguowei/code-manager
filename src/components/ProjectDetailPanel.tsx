import {
  Code2,
  DollarSign,
  ExternalLink,
  Link2,
  List,
  MessageSquareText,
  SearchCheck,
  Terminal,
} from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "../hooks/useToast";
import type { TranslationKey } from "../i18n";
import { showOperationError } from "../lib/user-facing-error";
import type { DefaultEditorApp, ProjectDetail, ProjectSummary } from "../types";
import {
  agentsStatusLabel,
  agentsStatusTone,
  formatCommitTime,
  formatHistoryTimestamp,
  type TranslateFn,
} from "./project-detail-utils";
import { PROJECT_TAG_CLASS, PROJECT_TAG_PAIR_CLASS } from "./project-tag-classes";
import { PANEL_SURFACE_CLASS } from "./surface-classes";
import { TONE_ALERT_CLASS, TONE_BADGE_CLASS, TONE_TEXT_CLASS } from "./tone-classes";
import { TYPOGRAPHY } from "./typography-classes";
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
  onPreviewBranchCleanup?: () => void;
  onPreviewWorktreeCleanup?: () => void;
  onOpenWorktreeInTerminal?: (path: string) => void;
  onOpenSession: (sessionId: string) => void;
  onOpenProjectHistory: () => void;
  onOpenProjectUsage: () => void;
  isBranchCleanupPreviewing?: boolean;
  isWorktreeCleanupPreviewing?: boolean;
};

type SectionHeadingProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

type BranchesSectionProps = {
  detail: ProjectDetail | null;
  isPreviewing?: boolean;
  onPreviewCleanup?: () => void;
  t: TranslateFn;
};

type WorktreesSectionProps = {
  detail: ProjectDetail | null;
  isPreviewing?: boolean;
  onCopyWorktreePath: (path: string) => void;
  onOpenWorktreeInTerminal?: (path: string) => void;
  onPreviewCleanup?: () => void;
  t: TranslateFn;
};

type OverviewPanelProps = {
  onCopySessionId: (sessionId: string) => void;
  summary: ProjectSummary;
  t: TranslateFn;
};

type RecentSessionsSectionProps = {
  summary: ProjectSummary;
  t: TranslateFn;
  onOpenSession: (sessionId: string) => void;
  onOpenProjectHistory: () => void;
};

function statusToneClass(tone: StatusTone) {
  switch (tone) {
    case "success":
      return TONE_BADGE_CLASS.success;
    case "warning":
      return TONE_BADGE_CLASS.warning;
    case "danger":
      return TONE_BADGE_CLASS.danger;
    case "muted":
      return TONE_BADGE_CLASS.muted;
  }
}

function shortSessionId(sessionId: string) {
  return sessionId.slice(0, 8);
}

function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "projects-status-chip truncate whitespace-nowrap",
        PROJECT_TAG_CLASS,
        statusToneClass(tone),
      )}
    >
      {children}
    </Badge>
  );
}

function SectionHeading({ title, description, action }: SectionHeadingProps) {
  return (
    <div className="projects-section-heading flex flex-wrap items-start justify-between gap-3">
      <div className="projects-section-heading-copy min-w-0 flex-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <div className="projects-section-heading-action shrink-0 max-sm:w-full max-sm:[&>button]:w-full">
          {action}
        </div>
      )}
    </div>
  );
}

function QuickActionLabel({ children }: { children: ReactNode }) {
  return <span className="min-w-0 truncate">{children}</span>;
}

function BranchesSection({ detail, isPreviewing, onPreviewCleanup, t }: BranchesSectionProps) {
  return (
    <Card className={cn("projects-structure-section gap-4 rounded-lg p-5", PANEL_SURFACE_CLASS)}>
      <SectionHeading
        title={t("projects.branches")}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="projects-cleanup-preview-btn"
            onClick={onPreviewCleanup}
            disabled={!detail?.isGitRepo || isPreviewing || !onPreviewCleanup}
          >
            <SearchCheck className="size-4" aria-hidden="true" />
            {isPreviewing ? t("projects.cleanupDetecting") : t("projects.detectCleanableBranches")}
          </Button>
        }
      />

      {!detail?.isGitRepo ? (
        <div className="projects-empty-block flex min-h-[120px] items-center justify-center border-t px-4 text-center text-sm text-muted-foreground">
          {t("projects.notGitRepoHint")}
        </div>
      ) : detail.branches.length === 0 ? (
        <div className="projects-empty-block flex min-h-[120px] items-center justify-center border-t px-4 text-center text-sm text-muted-foreground">
          {t("projects.noBranches")}
        </div>
      ) : (
        <div className="projects-table border-t">
          <div className="projects-table-inner w-full">
            <div className="projects-table-header projects-branch-grid hidden gap-4 border-b py-2 text-sm font-semibold text-muted-foreground sm:grid sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(120px,0.7fr)]">
              <span>{t("projects.branchColumn")}</span>
              <span>{t("projects.commitColumn")}</span>
              <span>{t("projects.updatedColumn")}</span>
            </div>
            <div className="projects-table-body">
              {detail.branches.map((branch) => (
                <div
                  key={branch.name}
                  className="projects-table-row projects-branch-grid grid gap-2 border-b py-3 last:border-b-0 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(120px,0.7fr)] sm:gap-4"
                >
                  <div className="projects-table-cell grid min-w-0 gap-1 sm:block">
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {t("projects.branchColumn")}
                    </span>
                    <div className="projects-row-title-wrap flex flex-wrap items-center gap-2">
                      <span className="projects-row-title text-sm font-semibold leading-6 break-words text-foreground [overflow-wrap:anywhere]">
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
                    <span className="projects-row-secondary text-sm leading-6 break-words text-muted-foreground [overflow-wrap:anywhere]">
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

function WorktreesSection({
  detail,
  isPreviewing,
  onCopyWorktreePath,
  onOpenWorktreeInTerminal,
  onPreviewCleanup,
  t,
}: WorktreesSectionProps) {
  return (
    <Card className={cn("projects-structure-section gap-4 rounded-lg p-5", PANEL_SURFACE_CLASS)}>
      <SectionHeading
        title={t("projects.worktrees")}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="projects-cleanup-preview-btn"
            onClick={onPreviewCleanup}
            disabled={!detail?.isGitRepo || isPreviewing || !onPreviewCleanup}
          >
            <SearchCheck className="size-4" aria-hidden="true" />
            {isPreviewing ? t("projects.cleanupDetecting") : t("projects.detectCleanableWorktrees")}
          </Button>
        }
      />

      {!detail?.isGitRepo ? (
        <div className="projects-empty-block flex min-h-[120px] items-center justify-center border-t px-4 text-center text-sm text-muted-foreground">
          {t("projects.notGitRepoHint")}
        </div>
      ) : detail.worktrees.length === 0 ? (
        <div className="projects-empty-block flex min-h-[120px] items-center justify-center border-t px-4 text-center text-sm text-muted-foreground">
          {t("projects.noWorktrees")}
        </div>
      ) : (
        <div className="projects-table border-t">
          <div className="projects-table-inner w-full">
            <div className="projects-table-header projects-worktree-grid hidden gap-4 border-b py-2 text-sm font-semibold text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)_minmax(0,0.45fr)_minmax(0,0.55fr)_48px]">
              <span>{t("projects.worktreePath")}</span>
              <span>{t("projects.branchRef")}</span>
              <span>{t("projects.head")}</span>
              <span>{t("projects.flags")}</span>
              <span>{t("projects.actions")}</span>
            </div>
            <div className="projects-table-body">
              {detail.worktrees.map((worktree) => (
                <div
                  key={worktree.path}
                  className="projects-table-row projects-worktree-grid grid gap-2 border-b py-3 last:border-b-0 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)_minmax(0,0.45fr)_minmax(0,0.55fr)_48px] sm:gap-4"
                >
                  <div className="projects-table-cell grid min-w-0 gap-1 sm:block">
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {t("projects.worktreePath")}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="projects-row-path h-auto max-w-full min-w-0 shrink justify-start whitespace-normal rounded-md border border-transparent px-1 py-0 text-left text-sm font-semibold leading-6 break-all text-foreground hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:border-primary/70 focus-visible:bg-accent focus-visible:ring-0"
                      title={worktree.path}
                      aria-label={`${t("projects.copyWorktreePath")} ${worktree.path}`}
                      onClick={() => onCopyWorktreePath(worktree.path)}
                    >
                      {worktree.path}
                    </Button>
                  </div>
                  <div className="projects-table-cell grid min-w-0 gap-1 sm:block">
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {t("projects.branchRef")}
                    </span>
                    <span className="projects-row-secondary text-sm leading-6 break-words text-muted-foreground [overflow-wrap:anywhere]">
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
                  <div className="projects-table-cell grid min-w-0 gap-1 sm:block">
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {t("projects.actions")}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="projects-worktree-terminal-btn size-7 rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                      onClick={() => onOpenWorktreeInTerminal?.(worktree.path)}
                      disabled={!onOpenWorktreeInTerminal}
                      aria-label={`${t("projects.openWorktreeInTerminal")} ${worktree.path}`}
                      title={`${t("projects.openWorktreeInTerminal")} ${worktree.path}`}
                    >
                      <Terminal className="size-3.5" aria-hidden="true" />
                    </Button>
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

function OverviewPanel({ onCopySessionId, summary, t }: OverviewPanelProps) {
  const lastSessionId = summary.lastSessionId;

  return (
    <Card className={cn("projects-overview-panel gap-4 rounded-lg p-5", PANEL_SURFACE_CLASS)}>
      <SectionHeading title={t("projects.overview")} />

      <dl className="projects-definition-list flex flex-col">
        <div className="projects-definition-row grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0 max-sm:grid-cols-1 max-sm:gap-1">
          <dt className="text-sm text-muted-foreground">{t("projects.sessionCount")}</dt>
          <dd className="text-sm font-semibold leading-6 text-foreground">
            {summary.sessionCount}
          </dd>
        </div>
        <div className="projects-definition-row grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0 max-sm:grid-cols-1 max-sm:gap-1">
          <dt className="text-sm text-muted-foreground">{t("projects.messageCount")}</dt>
          <dd className="text-sm font-semibold leading-6 text-foreground">
            {summary.messageCount}
          </dd>
        </div>
        <div className="projects-definition-row grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0 max-sm:grid-cols-1 max-sm:gap-1">
          <dt className="text-sm text-muted-foreground">{t("projects.lastSessionId")}</dt>
          <dd className="min-w-0">
            {lastSessionId ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="projects-overview-session-id-btn h-auto max-w-full min-w-0 justify-start truncate rounded-md border border-transparent px-1 py-0 text-sm font-semibold leading-6 text-foreground hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:border-primary/70 focus-visible:bg-accent focus-visible:ring-0"
                title={lastSessionId}
                aria-label={t("projects.copySessionId")}
                onClick={() => onCopySessionId(lastSessionId)}
              >
                <span className="min-w-0 truncate font-mono tabular-nums">
                  {shortSessionId(lastSessionId)}
                </span>
              </Button>
            ) : (
              <span className="text-sm font-semibold leading-6 text-foreground">
                {t("projects.lastSessionIdMissing")}
              </span>
            )}
          </dd>
        </div>
        <div className="projects-definition-row grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0 max-sm:grid-cols-1 max-sm:gap-1">
          <dt className="text-sm text-muted-foreground">{t("projects.lastActive")}</dt>
          <dd className="text-sm font-semibold leading-6 text-foreground">
            {formatHistoryTimestamp(summary.lastActiveAt)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function RecentSessionsSection({
  summary,
  t,
  onOpenSession,
  onOpenProjectHistory,
}: RecentSessionsSectionProps) {
  return (
    <Card className={cn("projects-recent-sessions gap-4 rounded-lg p-5", PANEL_SURFACE_CLASS)}>
      <SectionHeading
        title={t("projects.recentSessions")}
        action={
          summary.sessionCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="projects-view-all-sessions-btn"
              onClick={onOpenProjectHistory}
            >
              <List className="size-4" aria-hidden="true" />
              {t("projects.viewAllSessions")}
            </Button>
          ) : undefined
        }
      />

      {summary.recentSessions.length === 0 ? (
        <div className="projects-empty-block flex min-h-[120px] items-center justify-center border-t px-4 text-center text-sm text-muted-foreground">
          {t("projects.noRecentSessions")}
        </div>
      ) : (
        <div className="projects-recent-session-list flex flex-col gap-2 border-t pt-3">
          {summary.recentSessions.map((session) => (
            <Button
              key={session.sessionId}
              type="button"
              variant="ghost"
              className="projects-recent-session-item h-auto min-w-0 flex-col items-stretch justify-start gap-2 rounded-md border bg-card p-3 text-left whitespace-normal hover:bg-muted/60"
              onClick={() => onOpenSession(session.sessionId)}
              aria-label={session.sessionId}
              title={session.sessionId}
            >
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 truncate font-mono text-sm font-semibold">
                  {session.sessionId.slice(0, 8)}
                </span>
                <Badge variant="secondary" className={cn(PROJECT_TAG_CLASS, "font-normal")}>
                  {session.messageCount} {t("projects.inputsUnit")}
                </Badge>
              </div>
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <MessageSquareText className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{session.firstPrompt || "—"}</span>
              </div>
              <span className="projects-recent-session-time w-full text-right text-xs text-muted-foreground">
                {formatHistoryTimestamp(session.lastTimestamp)}
              </span>
            </Button>
          ))}
        </div>
      )}
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
  onPreviewBranchCleanup,
  onPreviewWorktreeCleanup,
  onOpenWorktreeInTerminal,
  onOpenSession,
  onOpenProjectHistory,
  onOpenProjectUsage,
  isBranchCleanupPreviewing,
  isWorktreeCleanupPreviewing,
}: ProjectDetailPanelProps) {
  const { showToast } = useToast();
  const agentsTone: StatusTone = detail ? agentsStatusTone(detail.agentsStatus) : "muted";
  const agentsLabel = detail
    ? agentsStatusLabel(detail.agentsStatus, t)
    : t("projects.agentsMissing");
  const repositoryUrl = detail?.repositoryUrl;
  const handleCopyValue = useCallback(
    async (value: string, successKey: TranslationKey, errorKey: TranslationKey) => {
      try {
        if (!value) throw new Error(t("projects.copyValueEmpty"));
        await navigator.clipboard.writeText(value);
        showToast(t(successKey));
      } catch (error) {
        showOperationError(showToast, t(errorKey), error);
      }
    },
    [showToast, t],
  );
  const handleCopyProjectPath = useCallback(
    (projectPath: string) =>
      handleCopyValue(projectPath, "projects.projectPathCopied", "projects.projectPathCopyError"),
    [handleCopyValue],
  );
  const handleCopyRepositoryUrl = useCallback(
    (repositoryUrl: string) =>
      handleCopyValue(
        repositoryUrl,
        "projects.repositoryUrlCopied",
        "projects.repositoryUrlCopyError",
      ),
    [handleCopyValue],
  );
  const handleCopySessionId = useCallback(
    (sessionId: string) =>
      handleCopyValue(sessionId, "projects.sessionIdCopied", "projects.sessionIdCopyError"),
    [handleCopyValue],
  );
  const handleCopyWorktreePath = useCallback(
    (path: string) =>
      handleCopyValue(path, "projects.worktreePathCopied", "projects.worktreePathCopyError"),
    [handleCopyValue],
  );

  return (
    <div className="projects-detail-scroll flex h-full flex-col gap-6 overflow-y-auto p-5 lg:p-6">
      <header className="projects-hero grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.95fr)]">
        <Card
          className={cn(
            "projects-hero-main flex min-w-0 flex-col gap-4 rounded-lg p-5",
            PANEL_SURFACE_CLASS,
          )}
        >
          <div className="projects-hero-copy">
            <h2 className="min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "projects-hero-title-btn h-auto max-w-full min-w-0 justify-start truncate rounded-md border border-transparent px-1 py-0 text-left hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:border-primary/70 focus-visible:bg-accent focus-visible:ring-0",
                  TYPOGRAPHY.pageTitle,
                )}
                title={summary.project}
                aria-label={t("projects.copyProjectPath")}
                onClick={() => void handleCopyProjectPath(summary.project)}
              >
                <span className="min-w-0 truncate">{summary.shortName}</span>
              </Button>
            </h2>
          </div>

          <div className="projects-identity-meta flex flex-col gap-3">
            <div className="projects-identity-row grid grid-cols-[92px_minmax(0,1fr)] items-start gap-3 border-t pt-3 max-sm:grid-cols-1 max-sm:gap-1">
              <span className="projects-identity-label text-sm text-muted-foreground">
                {t("projects.repository")}
              </span>
              {repositoryUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="projects-identity-value h-auto max-w-full min-w-0 shrink justify-start whitespace-normal rounded-md border border-transparent px-1 py-0 text-left text-sm leading-6 break-all text-foreground hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:border-primary/70 focus-visible:bg-accent focus-visible:ring-0"
                  title={repositoryUrl}
                  aria-label={`${t("projects.copyRepositoryUrl")} ${repositoryUrl}`}
                  onClick={() => void handleCopyRepositoryUrl(repositoryUrl)}
                >
                  {repositoryUrl}
                </Button>
              ) : (
                <span className="projects-identity-value break-all text-sm leading-6 text-foreground">
                  {t("projects.repositoryUnavailable")}
                </span>
              )}
            </div>
          </div>
        </Card>

        <Card
          className={cn("projects-hero-side min-w-0 gap-4 rounded-lg p-5", PANEL_SURFACE_CLASS)}
        >
          <SectionHeading title={t("projects.quickActions")} />
          <div className="projects-hero-actions grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              className="projects-action-btn projects-action-btn-primary min-w-0 overflow-hidden sm:col-span-2"
              onClick={onOpenInTerminal}
              disabled={!canOpenProjectDirectory}
            >
              <Terminal className="size-4" aria-hidden="true" />
              <QuickActionLabel>{t("projects.openInTerminal")}</QuickActionLabel>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="projects-link-btn min-w-0 overflow-hidden"
              onClick={onOpenInEditor}
              disabled={!canOpenInEditor}
            >
              <Code2 className="size-4" aria-hidden="true" />
              <QuickActionLabel>{t("projects.openInEditor")}</QuickActionLabel>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="projects-link-btn min-w-0 overflow-hidden"
              onClick={onOpenProjectUsage}
            >
              <DollarSign className="size-4" aria-hidden="true" />
              <QuickActionLabel>{t("projects.viewTokenUsageCost")}</QuickActionLabel>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="projects-link-btn min-w-0 overflow-hidden"
              onClick={onOpenRepository}
              disabled={!canOpenRepository}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              <QuickActionLabel>{t("projects.openRepository")}</QuickActionLabel>
            </Button>
          </div>
          {!defaultEditorApp && (
            <p
              className={cn(
                "projects-note projects-note-warning text-sm leading-6",
                TONE_TEXT_CLASS.warning,
              )}
            >
              {t("projects.editorNotConfiguredHint")}
            </p>
          )}
        </Card>
      </header>

      <div className="projects-alert-stack flex flex-col gap-2">
        {detail?.exists && !detail.isGitRepo && (
          <p
            className={cn(
              "projects-inline-alert rounded-md border-l-4 px-3 py-2 text-sm leading-6",
              TONE_ALERT_CLASS.warning,
            )}
          >
            {t("projects.notGitRepoHint")}
          </p>
        )}
        {detail?.agentsStatus === "plainFileConflict" && (
          <p
            className={cn(
              "projects-inline-alert rounded-md border-l-4 px-3 py-2 text-sm leading-6",
              TONE_ALERT_CLASS.warning,
            )}
          >
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
            <div
              className={cn(
                "projects-status-row border-b py-3 first:pt-0 last:border-b-0 last:pb-0",
                PROJECT_TAG_PAIR_CLASS,
              )}
            >
              <dt className="projects-status-label shrink-0 text-sm leading-5 text-muted-foreground">
                {t("projects.claudeMd")}
              </dt>
              <dd className="min-w-0">
                <StatusBadge tone={detail?.hasClaudeMd ? "success" : "muted"}>
                  {detail?.hasClaudeMd
                    ? t("projects.claudeMdPresent")
                    : t("projects.claudeMdMissing")}
                </StatusBadge>
              </dd>
            </div>
            <div
              className={cn(
                "projects-status-row border-b py-3 first:pt-0 last:border-b-0 last:pb-0",
                PROJECT_TAG_PAIR_CLASS,
              )}
            >
              <dt className="projects-status-label shrink-0 text-sm leading-5 text-muted-foreground">
                {t("projects.agentsMd")}
              </dt>
              <dd className="min-w-0">
                <StatusBadge tone={agentsTone}>{agentsLabel}</StatusBadge>
              </dd>
            </div>
          </dl>

          <div className="projects-agents-notes flex flex-col justify-center gap-2">
            {!detail?.hasClaudeMd && (
              <p
                className={cn(
                  "projects-note projects-note-warning text-sm leading-6",
                  TONE_TEXT_CLASS.warning,
                )}
              >
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
          <BranchesSection
            detail={detail}
            isPreviewing={isBranchCleanupPreviewing}
            onPreviewCleanup={onPreviewBranchCleanup}
            t={t}
          />
          <WorktreesSection
            detail={detail}
            isPreviewing={isWorktreeCleanupPreviewing}
            onCopyWorktreePath={handleCopyWorktreePath}
            onOpenWorktreeInTerminal={onOpenWorktreeInTerminal}
            onPreviewCleanup={onPreviewWorktreeCleanup}
            t={t}
          />
        </div>

        <aside className="projects-detail-side flex min-w-0 flex-col gap-6 xl:border-l xl:pl-5">
          <OverviewPanel onCopySessionId={handleCopySessionId} summary={summary} t={t} />
          <RecentSessionsSection
            summary={summary}
            t={t}
            onOpenSession={onOpenSession}
            onOpenProjectHistory={onOpenProjectHistory}
          />
        </aside>
      </div>
    </div>
  );
}

export default ProjectDetailPanel;
