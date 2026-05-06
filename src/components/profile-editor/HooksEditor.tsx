import { useEffect, useMemo, useState } from "react";
import { type TranslationKey, useI18n } from "../../i18n";
import ConfirmAlertDialog from "../ConfirmAlertDialog";
import { readObject, readString } from "./editor-utils";
import {
  hasMojibakeHookPreset,
  isMojibakePresetAction,
  mergeMojibakeHookPreset,
} from "./hook-presets";
import "./HooksEditor.css";

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
        <div className="profile-empty-state">{t("profileEditor.hooks.emptyHint")}</div>
      ) : (
        <div className="profile-card-stack">
          {summaries.map((summary) => (
            <section key={summary.event} className="profile-mini-card">
              <div className="profile-hook-summary-head">
                <strong>{summary.event}</strong>
                <div className="profile-hook-summary-actions">
                  <span className="profile-hook-summary-meta">
                    {t("profileEditor.hooks.matcherActionSummary")
                      .replace("{matcherCount}", String(summary.matcherCount))
                      .replace("{actionCount}", String(summary.actionCount))}
                  </span>
                  <button
                    type="button"
                    className="profile-icon-btn danger profile-hook-delete-btn"
                    aria-label={`${t("profileEditor.common.delete")} Hook ${summary.event}`}
                    onClick={() => setPendingDeleteEvent(summary.event)}
                  >
                    ×
                  </button>
                </div>
              </div>

              {summary.matchers.length === 0 ? (
                <div className="profile-empty-state">
                  {t("profileEditor.hooks.cannotSummarize")}
                </div>
              ) : (
                <div className="profile-hook-summary-list" role="list">
                  {summary.matchers.map((matcherSummary) => (
                    <div
                      key={`${summary.event}-${matcherSummary.summaryKey}`}
                      className="profile-hook-summary-item"
                      role="listitem"
                    >
                      <div className="profile-hook-summary-matcher">
                        <span className="profile-key-badge">{matcherSummary.matcherLabel}</span>
                      </div>

                      {matcherSummary.actionSummaries.length > 0 ? (
                        <div className="profile-chip-list">
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

                            return (
                              <span
                                key={actionKey}
                                className={[
                                  "profile-hook-action-summary",
                                  isExpanded ? "expanded" : "",
                                  actionSummary.isBuiltinPreset ? "has-preset-tag" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                <button
                                  type="button"
                                  className={`profile-hook-summary-badge${isExpanded ? " expanded" : ""}`}
                                  aria-expanded={isExpanded}
                                  onClick={() => toggleActionExpanded(actionKey)}
                                >
                                  {actionLabel}
                                </button>
                                {actionSummary.isBuiltinPreset ? (
                                  <span className="profile-hook-preset-tag">
                                    {t("profileEditor.hooks.builtinPresetTag")}
                                  </span>
                                ) : null}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="profile-empty-state">
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
            </section>
          ))}
        </div>
      )}

      {interactionError ? <p className="field-error">{interactionError}</p> : null}

      <div className="profile-env-footer">
        <div className="profile-hook-footer-actions">
          {mojibakePresetApplied ? null : (
            <button type="button" className="profile-primary-btn" onClick={handleAddMojibakePreset}>
              {t("profileEditor.hooks.addMojibakePreset")}
            </button>
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
