import { ChevronDown } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n";
import ConfigPreview from "../ConfigPreview";
import { TYPOGRAPHY } from "../typography-classes";
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
        className="inline-flex items-center rounded-full border border-border bg-muted/50 p-1"
        role="tablist"
        aria-label={`${title} ${t("common.jsonMode")}`}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "min-w-16 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:text-foreground",
            mode === "controls" && "bg-background text-foreground shadow-xs",
          )}
          aria-pressed={mode === "controls"}
          onClick={() => onModeChange("controls")}
        >
          {t("common.controlMode")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "min-w-16 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:text-foreground",
            mode === "json" && "bg-background text-foreground shadow-xs",
          )}
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
      return <div className="flex flex-col gap-4">{controls}</div>;
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border/80 bg-muted/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 min-w-[220px] flex-1 text-sm text-muted-foreground">{jsonHint}</p>
            <Button type="button" variant="outline" onClick={jsonEditor.formatJson}>
              {t("common.formatJson")}
            </Button>
          </div>

          {!jsonEditor.hasAppliedDraft ? (
            <p className="m-0 text-sm text-muted-foreground">
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

  function handleAccordionHeaderClick() {
    onToggleExpanded?.();
  }

  function handleAccordionControlClick(event: MouseEvent) {
    event.stopPropagation();
  }

  if (variant === "accordion") {
    return (
      <section
        data-slot="settings-section"
        className="group flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-panel transition-colors hover:border-muted-foreground/40 focus-within:border-muted-foreground/40"
      >
        <div
          data-slot="settings-section-header"
          className="flex w-full cursor-pointer items-center justify-between gap-4 bg-transparent px-6 py-5"
          onClick={handleAccordionHeaderClick}
        >
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-w-0 flex-1 justify-between gap-3 self-stretch whitespace-normal rounded-md bg-transparent px-2 py-5 text-left text-foreground hover:bg-transparent hover:text-foreground focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary/60 dark:hover:bg-transparent"
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpanded?.();
            }}
          >
            <span className="inline-flex min-w-0 items-center gap-3">
              <h3 className={TYPOGRAPHY.sectionTitle}>{title}</h3>
              {typeof badgeCount === "number" ? (
                <span
                  data-slot="settings-section-badge"
                  className="inline-flex min-w-7 items-center justify-center rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold leading-none text-muted-foreground"
                >
                  {badgeCount}
                </span>
              ) : null}
            </span>
            {hasHeaderMeta ? (
              <span
                data-slot="settings-section-header-meta"
                className="min-w-0 whitespace-nowrap text-right text-sm font-medium text-muted-foreground"
              >
                {headerMeta}
              </span>
            ) : null}
          </Button>
          <div className="inline-flex shrink-0 items-center gap-2">
            {headerControl ? (
              <div
                className="inline-flex min-w-0 items-center"
                data-slot="settings-section-header-control"
                onClick={handleAccordionControlClick}
              >
                {headerControl}
              </div>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-full bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
              aria-expanded={expanded}
              aria-label={`${expanded ? t("common.collapse") : t("common.expand")} ${title}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpanded?.();
              }}
            >
              <ChevronDown
                className={cn("size-4 transition-transform", expanded && "rotate-180")}
                aria-hidden="true"
              />
            </Button>
          </div>
        </div>

        {bodyVisible ? (
          <div className="flex flex-col gap-4 border-t border-border/80 px-6 py-5">
            <div
              data-slot="settings-section-mode-row"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              {modeRowAction ? <div className="min-w-0 flex-1">{modeRowAction}</div> : null}
              {renderModeSwitch()}
            </div>
            {renderSectionContent()}
            {footer ? <div className="flex flex-wrap gap-3">{footer}</div> : null}
          </div>
        ) : null}

        {error ? (
          <span className="px-6 pb-5 text-sm font-medium text-destructive">{error}</span>
        ) : null}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border/80 bg-card p-5 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className={TYPOGRAPHY.sectionTitle}>{title}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {headerControl}
          {modeRowAction}
          {renderModeSwitch()}
        </div>
      </div>

      {renderSectionContent()}
      {footer ? <div className="flex flex-wrap gap-3">{footer}</div> : null}

      {error ? <span className="text-sm font-medium text-destructive">{error}</span> : null}
    </section>
  );
}

export default SettingsSectionModePanel;
