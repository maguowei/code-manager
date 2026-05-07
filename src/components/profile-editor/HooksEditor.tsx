import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type TranslationKey, useI18n } from "../../i18n";
import ConfirmAlertDialog from "../ConfirmAlertDialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { readObject, readString } from "./editor-utils";
import {
  hasMojibakeHookPreset,
  isMojibakePresetAction,
  mergeMojibakeHookPreset,
} from "./hook-presets";

interface HooksEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
}

interface HookMatcherSummary {
  summaryKey: string;
  matcherLabel: string;
  actionSummaries: HookActionSummary[];
  hasUnsupportedStructure: boolean;
}

interface HookActionSummary {
  summaryKey: string;
  collapsedLabel: string;
  fullLabel: string;
  isBuiltinPreset: boolean;
}

interface HookEventSummary {
  event: string;
  matcherCount: number;
  actionCount: number;
  matchers: HookMatcherSummary[];
  hasUnsupportedStructure: boolean;
}

function truncateText(value: string, maxLength = 72): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function makeOccurrenceKey(value: string, occurrences: Map<string, number>): string {
  const occurrence = occurrences.get(value) ?? 0;
  occurrences.set(value, occurrence + 1);
  return occurrence === 0 ? value : `${value}#${occurrence + 1}`;
}

function buildHookActionSummary(
  action: unknown,
  t: (key: TranslationKey) => string,
): Omit<HookActionSummary, "summaryKey"> {
  if (typeof action !== "object" || action === null) {
    const label = t("profileEditor.hooks.invalidAction");
    return {
      collapsedLabel: label,
      fullLabel: label,
      isBuiltinPreset: false,
    };
  }

  const record = action as Record<string, unknown>;
  const type = readString(record.type) || "unknown";
  const detail =
    type === "command"
      ? readString(record.command)
      : type === "http"
        ? readString(record.url)
        : readString(record.prompt);

  if (!detail) {
    return {
      collapsedLabel: type,
      fullLabel: type,
      isBuiltinPreset: isMojibakePresetAction(action),
    };
  }

  return {
    collapsedLabel: `${type}: ${truncateText(detail)}`,
    fullLabel: `${type}: ${detail}`,
    isBuiltinPreset: isMojibakePresetAction(action),
  };
}

function buildHookSummaries(
  value: unknown,
  t: (key: TranslationKey) => string,
): HookEventSummary[] {
  const hooksObject = readObject(value);
  return Object.entries(hooksObject).map(([event, matchers]) => {
    if (!Array.isArray(matchers)) {
      return {
        event,
        matcherCount: 0,
        actionCount: 0,
        matchers: [],
        hasUnsupportedStructure: true,
      };
    }

    const matcherKeyOccurrences = new Map<string, number>();
    const matcherSummaries = matchers.map((matcher) => {
      if (typeof matcher !== "object" || matcher === null) {
        const matcherLabel = t("profileEditor.hooks.defaultMatcher");
        const matcherKey = makeOccurrenceKey(
          `${matcherLabel}::${t("profileEditor.hooks.invalidAction")}`,
          matcherKeyOccurrences,
        );
        return {
          summaryKey: matcherKey,
          matcherLabel,
          actionSummaries: [],
          hasUnsupportedStructure: true,
        };
      }

      const matcherRecord = matcher as Record<string, unknown>;
      const hooks = Array.isArray(matcherRecord.hooks) ? matcherRecord.hooks : [];
      const actionKeyOccurrences = new Map<string, number>();
      const actionSummaries = hooks.map((action) => {
        const actionSummary = buildHookActionSummary(action, t);
        const actionKey = makeOccurrenceKey(actionSummary.fullLabel, actionKeyOccurrences);
        return {
          ...actionSummary,
          summaryKey: actionKey,
        };
      });
      const matcherLabel =
        readString(matcherRecord.matcher) || t("profileEditor.hooks.defaultMatcher");
      const matcherKey = makeOccurrenceKey(
        `${matcherLabel}::${actionSummaries
          .map((actionSummary) => actionSummary.summaryKey)
          .join("::")}`,
        matcherKeyOccurrences,
      );

      return {
        summaryKey: matcherKey,
        matcherLabel,
        actionSummaries,
        hasUnsupportedStructure: !Array.isArray(matcherRecord.hooks),
      };
    });

    return {
      event,
      matcherCount: matcherSummaries.length,
      actionCount: matcherSummaries.reduce(
        (count, matcherSummary) => count + matcherSummary.actionSummaries.length,
        0,
      ),
      matchers: matcherSummaries,
      hasUnsupportedStructure: matcherSummaries.some(
        (matcherSummary) => matcherSummary.hasUnsupportedStructure,
      ),
    };
  });
}

function HooksEditor({ value, onChange, onError }: HooksEditorProps) {
  const { t } = useI18n();
  const [hooksValue, setHooksValue] = useState(() => readObject(value));
  const [interactionError, setInteractionError] = useState("");
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<string | null>(null);
  const [expandedActionKeys, setExpandedActionKeys] = useState<Set<string>>(() => new Set());
  const hooksObject = useMemo(() => hooksValue, [hooksValue]);
  const summaries = useMemo(() => buildHookSummaries(hooksObject, t), [hooksObject, t]);
  const mojibakePresetApplied = useMemo(() => hasMojibakeHookPreset(hooksObject), [hooksObject]);

  useEffect(() => {
    setHooksValue(readObject(value));
    setInteractionError("");
    setPendingDeleteEvent(null);
    setExpandedActionKeys(new Set());
  }, [value]);

  useEffect(() => {
    onError(interactionError);
  }, [interactionError, onError]);

  function handleAddMojibakePreset() {
    const result = mergeMojibakeHookPreset(hooksObject);
    if (!result.supported) {
      setInteractionError(t("profileEditor.hooks.quickAddUnsupported"));
      return;
    }

    setInteractionError("");
    if (!result.changed) {
      return;
    }

    setHooksValue(result.nextValue);
    onChange(result.nextValue);
  }

  function handleConfirmDeleteHookEvent() {
    if (!pendingDeleteEvent) {
      return;
    }

    const nextValue = { ...hooksObject };
    delete nextValue[pendingDeleteEvent];
    setInteractionError("");
    setHooksValue(nextValue);
    onChange(nextValue);
    setPendingDeleteEvent(null);
  }

  function toggleActionExpanded(actionKey: string) {
    setExpandedActionKeys((current) => {
      const next = new Set(current);
      if (next.has(actionKey)) {
        next.delete(actionKey);
      } else {
        next.add(actionKey);
      }
      return next;
    });
  }

  return (
    <div className="profile-section-body">
      <div className="profile-subsection-header">
        <div>
          <h4>{t("profileEditor.hooks.title")}</h4>
          <p>{t("profileEditor.hooks.summaryHint")}</p>
        </div>
      </div>

      {summaries.length === 0 ? (
        <div className="profile-empty-state flex min-h-[120px] items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-4 text-center">
          {t("profileEditor.hooks.emptyHint")}
        </div>
      ) : (
        <div className="profile-card-stack flex flex-col gap-3">
          {summaries.map((summary) => (
            <Card
              key={summary.event}
              className="profile-mini-card gap-4 rounded-lg border-[var(--border-default)] bg-[var(--card)] p-4 py-4 shadow-none"
            >
              <div className="profile-hook-summary-head flex items-center justify-between gap-3">
                <strong>{summary.event}</strong>
                <div className="profile-hook-summary-actions inline-flex items-center gap-2.5">
                  <span className="profile-hook-summary-meta text-sm text-[var(--text-secondary)]">
                    {t("profileEditor.hooks.matcherActionSummary")
                      .replace("{matcherCount}", String(summary.matcherCount))
                      .replace("{actionCount}", String(summary.actionCount))}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="profile-icon-btn danger profile-hook-delete-btn text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`${t("profileEditor.common.delete")} Hook ${summary.event}`}
                    onClick={() => setPendingDeleteEvent(summary.event)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {summary.matchers.length === 0 ? (
                <div className="profile-empty-state flex min-h-[96px] items-center justify-center rounded-lg border border-[var(--border-default)] px-4 text-center">
                  {t("profileEditor.hooks.cannotSummarize")}
                </div>
              ) : (
                <div className="profile-hook-summary-list flex flex-col gap-3.5" role="list">
                  {summary.matchers.map((matcherSummary) => (
                    <div
                      key={`${summary.event}-${matcherSummary.summaryKey}`}
                      className="profile-hook-summary-item flex flex-col gap-3 rounded-lg border border-[color-mix(in_srgb,var(--border-default)_86%,var(--primary)_14%)] bg-[color-mix(in_srgb,var(--card)_96%,var(--primary)_4%)] p-3"
                      role="listitem"
                    >
                      <div className="profile-hook-summary-matcher flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="profile-key-badge">
                          {matcherSummary.matcherLabel}
                        </Badge>
                      </div>

                      {matcherSummary.actionSummaries.length > 0 ? (
                        <div className="profile-chip-list flex w-full flex-col items-stretch gap-2">
                          {matcherSummary.actionSummaries.map((actionSummary) => {
                            const actionKey = [
                              summary.event,
                              matcherSummary.summaryKey,
                              actionSummary.summaryKey,
                            ].join("::");
                            const isExpanded = expandedActionKeys.has(actionKey);
                            const actionLabel = isExpanded
                              ? actionSummary.fullLabel
                              : actionSummary.collapsedLabel;
                            const actionButtonClassName = [
                              "profile-hook-summary-badge inline-flex min-h-10 w-full max-w-full cursor-pointer items-center rounded-md border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--card)_94%,var(--primary)_6%)] px-3 py-2 text-left font-mono text-xs leading-5 text-[var(--foreground)] transition-colors hover:border-[color-mix(in_srgb,var(--primary)_54%,var(--border-default)_46%)] hover:bg-[color-mix(in_srgb,var(--card)_84%,var(--primary)_16%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--primary)_60%,transparent)]",
                              isExpanded
                                ? "expanded whitespace-pre-wrap [overflow-wrap:anywhere]"
                                : "",
                              actionSummary.isBuiltinPreset ? "pr-24" : "",
                            ]
                              .filter(Boolean)
                              .join(" ");

                            return (
                              <span
                                key={actionKey}
                                className={[
                                  "profile-hook-action-summary relative inline-flex w-full max-w-full flex-wrap items-start gap-1.5",
                                  isExpanded ? "expanded" : "",
                                  actionSummary.isBuiltinPreset ? "has-preset-tag" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                <button
                                  type="button"
                                  className={actionButtonClassName}
                                  aria-expanded={isExpanded}
                                  onClick={() => toggleActionExpanded(actionKey)}
                                >
                                  {actionLabel}
                                </button>
                                {actionSummary.isBuiltinPreset ? (
                                  <Badge
                                    variant="outline"
                                    className="profile-hook-preset-tag absolute top-2 right-2 border-[color-mix(in_srgb,var(--primary)_28%,var(--border-default)_72%)] bg-[color-mix(in_srgb,var(--card)_88%,var(--primary)_12%)] text-[var(--primary)]"
                                  >
                                    {t("profileEditor.hooks.builtinPresetTag")}
                                  </Badge>
                                ) : null}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="profile-empty-state flex min-h-[88px] items-center justify-center rounded-lg border border-[var(--border-default)] px-4 text-center">
                          {matcherSummary.hasUnsupportedStructure
                            ? t("profileEditor.hooks.matcherCannotSummarize")
                            : t("profileEditor.hooks.matcherNoActions")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {summary.hasUnsupportedStructure && summary.matchers.length > 0 ? (
                <p className="form-hint">{t("profileEditor.hooks.partialSummarize")}</p>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {interactionError ? <p className="field-error">{interactionError}</p> : null}

      <div className="profile-env-footer flex justify-end">
        <div className="profile-hook-footer-actions flex flex-wrap gap-3">
          {mojibakePresetApplied ? null : (
            <Button type="button" className="profile-primary-btn" onClick={handleAddMojibakePreset}>
              <Plus className="size-4" aria-hidden="true" />
              {t("profileEditor.hooks.addMojibakePreset")}
            </Button>
          )}
        </div>
      </div>

      {pendingDeleteEvent ? (
        <ConfirmAlertDialog
          title={t("profileEditor.hooks.deleteDialogTitle")}
          message={`${t("profileEditor.hooks.deleteDialogMessagePrefix")}${pendingDeleteEvent}${t("profileEditor.hooks.deleteDialogMessageSuffix")}`}
          confirmText={t("profileEditor.common.delete")}
          cancelText={t("profileEditor.common.cancel")}
          danger
          onConfirm={handleConfirmDeleteHookEvent}
          onCancel={() => setPendingDeleteEvent(null)}
        />
      ) : null}
    </div>
  );
}

export default HooksEditor;
