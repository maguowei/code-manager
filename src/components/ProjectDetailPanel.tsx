import type { ReactNode } from "react";
import type { DefaultEditorApp, ProjectDetail, ProjectSummary } from "../types";
import {
  agentsStatusLabel,
  agentsStatusTone,
  formatCommitTime,
  formatDuration,
  formatUSD,
  type TranslateFn,
} from "./project-detail-utils";

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

function SectionHeading({ title, description, action }: SectionHeadingProps) {
  return (
    <div className="projects-section-heading">
      <div className="projects-section-heading-copy">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="projects-section-heading-action">{action}</div>}
    </div>
  );
}

function StatusStripItem({ label, value, tone }: StatusStripItemProps) {
  return (
    <div className="projects-status-item">
      <span className="projects-status-item-label">{label}</span>
      <span className={`projects-status-chip tone-${tone}`}>{value}</span>
    </div>
  );
}

function BranchesSection({ detail, t }: BranchesSectionProps) {
  return (
    <section className="projects-structure-section">
      <SectionHeading title={t("projects.branches")} />

      {!detail?.isGitRepo ? (
        <div className="projects-empty-block">{t("projects.notGitRepoHint")}</div>
      ) : detail.branches.length === 0 ? (
        <div className="projects-empty-block">{t("projects.noBranches")}</div>
      ) : (
        <div className="projects-table">
          <div className="projects-table-header projects-branch-grid">
            <span>{t("projects.branchColumn")}</span>
            <span>{t("projects.commitColumn")}</span>
            <span>{t("projects.updatedColumn")}</span>
          </div>
          <div className="projects-table-body">
            {detail.branches.map((branch) => (
              <div key={branch.name} className="projects-table-row projects-branch-grid">
                <div className="projects-table-cell" data-label={t("projects.branchColumn")}>
                  <div className="projects-row-title-wrap">
                    <span className="projects-row-title">{branch.name}</span>
                    {branch.isCurrent && (
                      <span className="projects-inline-badge tone-success">
                        {t("projects.current")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="projects-table-cell" data-label={t("projects.commitColumn")}>
                  <span className="projects-row-secondary">{branch.lastCommitSubject ?? "—"}</span>
                </div>
                <div className="projects-table-cell" data-label={t("projects.updatedColumn")}>
                  <span className="projects-row-secondary">
                    {formatCommitTime(branch.lastCommitAt) ?? "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function WorktreesSection({ detail, t }: WorktreesSectionProps) {
  return (
    <section className="projects-structure-section">
      <SectionHeading title={t("projects.worktrees")} />

      {!detail?.isGitRepo ? (
        <div className="projects-empty-block">{t("projects.notGitRepoHint")}</div>
      ) : detail.worktrees.length === 0 ? (
        <div className="projects-empty-block">{t("projects.noWorktrees")}</div>
      ) : (
        <div className="projects-table">
          <div className="projects-table-header projects-worktree-grid">
            <span>{t("projects.worktreePath")}</span>
            <span>{t("projects.branchRef")}</span>
            <span>{t("projects.head")}</span>
            <span>{t("projects.flags")}</span>
          </div>
          <div className="projects-table-body">
            {detail.worktrees.map((worktree) => (
              <div key={worktree.path} className="projects-table-row projects-worktree-grid">
                <div className="projects-table-cell" data-label={t("projects.worktreePath")}>
                  <span className="projects-row-path break-all">{worktree.path}</span>
                </div>
                <div className="projects-table-cell" data-label={t("projects.branchRef")}>
                  <span className="projects-row-secondary">{worktree.branch ?? "—"}</span>
                </div>
                <div className="projects-table-cell" data-label={t("projects.head")}>
                  <span className="projects-row-secondary">
                    {worktree.head ? worktree.head.slice(0, 8) : "—"}
                  </span>
                </div>
                <div className="projects-table-cell" data-label={t("projects.flags")}>
                  <div className="projects-flag-group">
                    {worktree.isCurrent || worktree.isDetached ? (
                      <>
                        {worktree.isCurrent && (
                          <span className="projects-inline-badge tone-success">
                            {t("projects.current")}
                          </span>
                        )}
                        {worktree.isDetached && (
                          <span className="projects-inline-badge tone-warning">
                            {t("projects.detached")}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="projects-flag-empty">—</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function OverviewPanel({ detail, summary, t }: OverviewPanelProps) {
  return (
    <section className="projects-overview-panel">
      <SectionHeading title={t("projects.overview")} />

      <dl className="projects-definition-list">
        <div className="projects-definition-row">
          <dt>{t("projects.lastCost")}</dt>
          <dd>{formatUSD(summary.lastCost)}</dd>
        </div>
        <div className="projects-definition-row">
          <dt>{t("projects.lastDuration")}</dt>
          <dd>{formatDuration(summary.lastDuration)}</dd>
        </div>
        <div className="projects-definition-row">
          <dt>{t("projects.lastSessionId")}</dt>
          <dd className="break-all">
            {summary.lastSessionId ?? t("projects.lastSessionIdMissing")}
          </dd>
        </div>
        <div className="projects-definition-row">
          <dt>{t("projects.repoRoot")}</dt>
          <dd className="break-all">{detail?.repoRoot ?? t("projects.repoRootUnavailable")}</dd>
        </div>
      </dl>
    </section>
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
    <div className="projects-detail-scroll">
      <header className="projects-hero">
        <div className="projects-hero-main">
          <div className="projects-hero-copy">
            <h2>{summary.shortName}</h2>
            <p className="projects-hero-path">{summary.project}</p>
          </div>

          <div className="projects-identity-meta">
            <div className="projects-identity-row">
              <span className="projects-identity-label">{t("projects.repository")}</span>
              <span className="projects-identity-value break-all">
                {detail?.repositoryUrl ?? t("projects.repositoryUnavailable")}
              </span>
            </div>
          </div>
        </div>

        <div className="projects-hero-side">
          <SectionHeading title={t("projects.quickActions")} />
          <div className="projects-hero-actions">
            <button
              type="button"
              className="projects-action-btn projects-action-btn-primary"
              onClick={onOpenInTerminal}
              disabled={!canOpenProjectDirectory}
            >
              {t("projects.openInTerminal")}
            </button>
            <button
              type="button"
              className="projects-link-btn"
              onClick={onOpenInEditor}
              disabled={!canOpenInEditor}
            >
              {t("projects.openInEditor")}
            </button>
            <button
              type="button"
              className="projects-link-btn"
              onClick={onOpenRepository}
              disabled={!canOpenRepository}
            >
              {t("projects.openRepository")}
            </button>
          </div>
          {!defaultEditorApp && (
            <p className="projects-note projects-note-warning">
              {t("projects.editorNotConfiguredHint")}
            </p>
          )}
        </div>
      </header>

      <div className="projects-status-strip">
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
      </div>

      <div className="projects-alert-stack">
        {!detail?.exists && (
          <p className="projects-inline-alert tone-danger">{t("projects.directoryMissing")}</p>
        )}
        {detail?.exists && !detail.isGitRepo && (
          <p className="projects-inline-alert tone-warning">{t("projects.notGitRepoHint")}</p>
        )}
        {detail?.agentsStatus === "plainFileConflict" && (
          <p className="projects-inline-alert tone-warning">
            {t("projects.agentsDisabledConflict")}
          </p>
        )}
      </div>

      <section className="projects-agents-panel">
        <SectionHeading
          title={t("projects.agentsTitle")}
          description={t("projects.agentsHelp")}
          action={
            <button
              type="button"
              className="projects-action-btn"
              onClick={onCreateAgentsLink}
              disabled={!canCreateAgentsLink || isLinkingAgents}
            >
              {isLinkingAgents ? t("projects.linkingAgents") : t("projects.linkAgents")}
            </button>
          }
        />

        <div className="projects-agents-layout">
          <dl className="projects-agents-state-list">
            <div className="projects-status-row">
              <dt className="projects-status-label">{t("projects.claudeMd")}</dt>
              <dd>
                <span
                  className={`projects-status-chip ${detail?.hasClaudeMd ? "tone-success" : "tone-muted"}`}
                >
                  {detail?.hasClaudeMd
                    ? t("projects.claudeMdPresent")
                    : t("projects.claudeMdMissing")}
                </span>
              </dd>
            </div>
            <div className="projects-status-row">
              <dt className="projects-status-label">{t("projects.agentsMd")}</dt>
              <dd>
                <span className={`projects-status-chip tone-${agentsTone}`}>{agentsLabel}</span>
              </dd>
            </div>
          </dl>

          <div className="projects-agents-notes">
            {!detail?.hasClaudeMd && (
              <p className="projects-note projects-note-warning">
                {t("projects.agentsDisabledNoClaude")}
              </p>
            )}
            {detail?.agentsStatus === "wrongSymlink" && (
              <p className="projects-note">{t("projects.agentsHelp")}</p>
            )}
          </div>
        </div>
      </section>

      <div className="projects-detail-grid">
        <div className="projects-detail-main">
          <BranchesSection detail={detail} t={t} />
          <WorktreesSection detail={detail} t={t} />
        </div>

        <aside className="projects-detail-side">
          <OverviewPanel detail={detail} summary={summary} t={t} />
        </aside>
      </div>
    </div>
  );
}

export default ProjectDetailPanel;
