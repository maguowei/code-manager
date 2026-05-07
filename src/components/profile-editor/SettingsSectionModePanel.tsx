import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../../i18n";
import ConfigPreview from "../ConfigPreview";
import { Button } from "../ui/button";

export type SectionEditorMode = "controls" | "json";
export type SettingsSectionVariant = "default" | "accordion";

export interface SectionJsonEditorState {
  rawJson: string;
  jsonError: string;
  hasAppliedDraft: boolean;
  handleJsonChange: (nextValue: string) => void;
  formatJson: () => void;
}

interface SettingsSectionModePanelProps {
  title: string;
  mode: SectionEditorMode;
  onModeChange: (mode: SectionEditorMode) => void;
  controls: ReactNode;
  jsonEditor: SectionJsonEditorState;
  jsonHint: string;
  error?: string;
  variant?: SettingsSectionVariant;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  badgeCount?: number;
  headerMeta?: ReactNode;
  headerControl?: ReactNode;
  modeRowAction?: ReactNode;
  footer?: ReactNode;
}

function SettingsSectionModePanel({
  title,
  mode,
  onModeChange,
  controls,
  jsonEditor,
  jsonHint,
  error,
  variant = "default",
  expanded = true,
  onToggleExpanded,
  badgeCount,
  headerMeta,
  headerControl,
  modeRowAction,
  footer,
}: SettingsSectionModePanelProps) {
  const { t } = useI18n();
  const bodyVisible = variant === "accordion" ? expanded : true;
  const hasHeaderMeta =
    headerMeta !== undefined && headerMeta !== null && headerMeta !== false && headerMeta !== "";

  function renderModeSwitch() {
    return (
      <div
        className="profile-mode-switch inline-flex items-center rounded-full border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--card)_90%,var(--primary)_10%)] p-1"
        role="tablist"
        aria-label={`${title} ${t("common.jsonMode")}`}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`profile-mode-switch-btn min-w-16 rounded-full px-3 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--foreground)]${mode === "controls" ? " active bg-[var(--card)] text-[var(--foreground)]" : ""}`}
          aria-pressed={mode === "controls"}
          onClick={() => onModeChange("controls")}
        >
          {t("common.controlMode")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`profile-mode-switch-btn min-w-16 rounded-full px-3 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--foreground)]${mode === "json" ? " active bg-[var(--card)] text-[var(--foreground)]" : ""}`}
          aria-pressed={mode === "json"}
          onClick={() => onModeChange("json")}
        >
          {t("common.jsonMode")}
        </Button>
      </div>
    );
  }

  function renderSectionContent() {
    if (mode === "controls") {
      return <div className="profile-section-body flex flex-col gap-4">{controls}</div>;
    }

    return (
      <div className="profile-section-body flex flex-col gap-4">
        <div className="profile-json-mode-panel flex flex-col gap-3 rounded-lg border border-dashed border-[var(--border-default)] bg-[color-mix(in_srgb,var(--card)_92%,var(--accent-orange-bg,#fff7ed)_8%)] p-4">
          <div className="profile-json-mode-toolbar flex flex-wrap items-center justify-between gap-3">
            <p className="form-hint m-0 min-w-[220px] flex-1 text-sm text-[var(--text-secondary)]">
              {jsonHint}
            </p>
            <Button
              type="button"
              variant="outline"
              className="profile-secondary-btn"
              onClick={jsonEditor.formatJson}
            >
              {t("common.formatJson")}
            </Button>
          </div>

          {!jsonEditor.hasAppliedDraft ? (
            <p className="profile-json-mode-status form-hint m-0 text-sm text-[var(--text-secondary)]">
              {t("common.sectionJsonDraftPending")}
            </p>
          ) : null}

          <ConfigPreview
            content={jsonEditor.rawJson}
            onChange={jsonEditor.handleJsonChange}
            jsonError={jsonEditor.jsonError}
          />
        </div>
      </div>
    );
  }

  if (variant === "accordion") {
    return (
      <section
        className={`profile-editor-section profile-editor-section-accordion flex flex-col overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--card)]${expanded ? " expanded" : ""}`}
      >
        <div className="profile-accordion-header flex w-full items-center justify-between gap-4 px-6 py-5">
          <button
            type="button"
            className="profile-accordion-trigger profile-accordion-trigger-large-target flex min-w-0 flex-1 items-center justify-between gap-3 self-stretch border-0 bg-transparent py-5 text-left text-[var(--foreground)]"
            aria-expanded={expanded}
            onClick={onToggleExpanded}
          >
            <span className="profile-accordion-header-main inline-flex min-w-0 items-center gap-3">
              <h3>{title}</h3>
              {typeof badgeCount === "number" ? (
                <span className="profile-accordion-badge inline-flex min-w-7 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--secondary,var(--card))_92%,white_8%)] px-2.5 py-1 text-xs font-semibold leading-none text-[var(--text-secondary)]">
                  {badgeCount}
                </span>
              ) : null}
            </span>
            {hasHeaderMeta ? (
              <span className="profile-accordion-header-meta min-w-0 whitespace-nowrap text-right text-sm font-medium text-[var(--text-secondary)]">
                {headerMeta}
              </span>
            ) : null}
          </button>
          <div className="profile-accordion-actions inline-flex shrink-0 items-center gap-2">
            {headerControl ? (
              <div className="profile-accordion-header-control inline-flex min-w-0 items-center">
                {headerControl}
              </div>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="profile-accordion-chevron-btn rounded-full text-[var(--text-secondary)]"
              aria-expanded={expanded}
              aria-label={`${expanded ? t("common.collapse") : t("common.expand")} ${title}`}
              onClick={onToggleExpanded}
            >
              <ChevronDown
                className={`profile-accordion-chevron size-4 transition-transform${expanded ? " expanded rotate-180" : ""}`}
                aria-hidden="true"
              />
            </Button>
          </div>
        </div>

        {bodyVisible ? (
          <div className="profile-accordion-content flex flex-col gap-4 border-t border-[var(--border-default)] px-6 py-5">
            <div
              className={`profile-accordion-mode-row flex flex-wrap items-center justify-between gap-3${modeRowAction ? " has-action" : ""}`}
            >
              {modeRowAction ? (
                <div className="profile-accordion-mode-row-action min-w-0 flex-1">
                  {modeRowAction}
                </div>
              ) : null}
              {renderModeSwitch()}
            </div>
            {renderSectionContent()}
            {footer ? (
              <div className="profile-section-footer flex flex-wrap gap-3">{footer}</div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <span className="field-error px-6 pb-5 text-sm font-medium text-destructive">
            {error}
          </span>
        ) : null}
      </section>
    );
  }

  return (
    <section className="profile-editor-section flex flex-col gap-4 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5">
      <div className="profile-section-heading flex flex-wrap items-center justify-between gap-3">
        <div className="profile-section-heading-main min-w-0 flex-1">
          <h3>{title}</h3>
        </div>

        <div className="profile-subsection-actions flex flex-wrap items-center gap-2">
          {headerControl}
          {modeRowAction}
          {renderModeSwitch()}
        </div>
      </div>

      {renderSectionContent()}
      {footer ? <div className="profile-section-footer flex flex-wrap gap-3">{footer}</div> : null}

      {error ? (
        <span className="field-error text-sm font-medium text-destructive">{error}</span>
      ) : null}
    </section>
  );
}

export default SettingsSectionModePanel;
