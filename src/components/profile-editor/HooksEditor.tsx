import { useEffect, useMemo } from "react";
import { type TranslationKey, useI18n } from "../../i18n";
import { readObject, readString } from "./editor-utils";
import "./HooksEditor.css";

interface HooksEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
}

interface HookMatcherSummary {
  matcherLabel: string;
  actionSummaries: string[];
  hasUnsupportedStructure: boolean;
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

function buildHookActionSummary(action: unknown, t: (key: TranslationKey) => string): string {
  if (typeof action !== "object" || action === null) {
    return t("profileEditor.hooks.invalidAction");
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
    return type;
  }

  return `${type}: ${truncateText(detail)}`;
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

    const matcherSummaries = matchers.map((matcher) => {
      if (typeof matcher !== "object" || matcher === null) {
        return {
          matcherLabel: t("profileEditor.hooks.defaultMatcher"),
          actionSummaries: [],
          hasUnsupportedStructure: true,
        };
      }

      const matcherRecord = matcher as Record<string, unknown>;
      const hooks = Array.isArray(matcherRecord.hooks) ? matcherRecord.hooks : [];

      return {
        matcherLabel: readString(matcherRecord.matcher) || t("profileEditor.hooks.defaultMatcher"),
        actionSummaries: hooks.map((action) => buildHookActionSummary(action, t)),
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

function HooksEditor({ value, onError }: HooksEditorProps) {
  const { t } = useI18n();
  const hooksObject = useMemo(() => readObject(value), [value]);
  const summaries = useMemo(() => buildHookSummaries(hooksObject, t), [hooksObject, t]);

  useEffect(() => {
    onError("");
  }, [onError]);

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
                <span className="profile-hook-summary-meta">
                  {t("profileEditor.hooks.matcherActionSummary")
                    .replace("{matcherCount}", String(summary.matcherCount))
                    .replace("{actionCount}", String(summary.actionCount))}
                </span>
              </div>

              {summary.matchers.length === 0 ? (
                <div className="profile-empty-state">
                  {t("profileEditor.hooks.cannotSummarize")}
                </div>
              ) : (
                <div className="profile-hook-summary-list">
                  {summary.matchers.map((matcherSummary) => (
                    <div
                      key={`${summary.event}-${matcherSummary.matcherLabel}`}
                      className="profile-hook-summary-item"
                    >
                      <div className="profile-hook-summary-matcher">
                        <span className="profile-key-badge">{matcherSummary.matcherLabel}</span>
                      </div>

                      {matcherSummary.actionSummaries.length > 0 ? (
                        <div className="profile-chip-list">
                          {matcherSummary.actionSummaries.map((actionSummary) => (
                            <span
                              key={`${summary.event}-${matcherSummary.matcherLabel}-${actionSummary}`}
                              className="profile-hook-summary-badge"
                              title={actionSummary}
                            >
                              {actionSummary}
                            </span>
                          ))}
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
    </div>
  );
}

export default HooksEditor;
