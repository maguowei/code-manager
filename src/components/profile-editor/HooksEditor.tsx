import { useEffect, useMemo } from "react";
import { useI18n } from "../../i18n";
import { readObject, readString } from "./editor-utils";

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

function buildHookActionSummary(action: unknown, isZh: boolean): string {
  if (typeof action !== "object" || action === null) {
    return isZh ? "invalid action" : "invalid action";
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

function buildHookSummaries(value: unknown, isZh: boolean): HookEventSummary[] {
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
          matcherLabel: isZh ? "默认 matcher" : "Default matcher",
          actionSummaries: [],
          hasUnsupportedStructure: true,
        };
      }

      const matcherRecord = matcher as Record<string, unknown>;
      const hooks = Array.isArray(matcherRecord.hooks) ? matcherRecord.hooks : [];

      return {
        matcherLabel:
          readString(matcherRecord.matcher) || (isZh ? "默认 matcher" : "Default matcher"),
        actionSummaries: hooks.map((action) => buildHookActionSummary(action, isZh)),
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
  const { language } = useI18n();
  const isZh = language === "zh";
  const hooksObject = useMemo(() => readObject(value), [value]);
  const summaries = useMemo(() => buildHookSummaries(hooksObject, isZh), [hooksObject, isZh]);

  useEffect(() => {
    onError("");
  }, [onError]);

  return (
    <div className="profile-section-body">
      <div className="profile-subsection-header">
        <div>
          <h4>{isZh ? "已配置 Hooks" : "Configured Hooks"}</h4>
          <p>{isZh ? "这里仅展示当前 Hooks 摘要。" : "This section shows a hooks summary only."}</p>
        </div>
      </div>

      {summaries.length === 0 ? (
        <div className="profile-empty-state">
          {isZh ? "暂无 Hooks 配置。" : "No hooks configured yet."}
        </div>
      ) : (
        <div className="profile-card-stack">
          {summaries.map((summary) => (
            <section key={summary.event} className="profile-mini-card">
              <div className="profile-hook-summary-head">
                <strong>{summary.event}</strong>
                <span className="profile-hook-summary-meta">
                  {isZh
                    ? `${summary.matcherCount} 个 matcher · ${summary.actionCount} 个动作`
                    : `${summary.matcherCount} matchers · ${summary.actionCount} actions`}
                </span>
              </div>

              {summary.matchers.length === 0 ? (
                <div className="profile-empty-state">
                  {isZh ? "当前事件结构无法摘要。" : "This event cannot be summarized."}
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
                            ? isZh
                              ? "当前 matcher 结构无法摘要。"
                              : "This matcher cannot be summarized."
                            : isZh
                              ? "当前 matcher 没有动作。"
                              : "This matcher has no actions."}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {summary.hasUnsupportedStructure && summary.matchers.length > 0 ? (
                <p className="form-hint">
                  {isZh
                    ? "部分 Hooks 结构无法完整摘要。"
                    : "Some hook entries could not be fully summarized."}
                </p>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default HooksEditor;
