import type { MouseEvent } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight, vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import useEscapeKey from "../../hooks/useEscapeKey";
import { useI18n } from "../../i18n";
import type { ModelTestResult } from "../../types";
import "./editor-shared.css";

interface ModelTestResultDialogProps {
  isOpen: boolean;
  result: ModelTestResult | null;
  errorMessage: string;
  rawResponseExpanded: boolean;
  onClose: () => void;
  onToggleRawResponse: () => void;
}

type MetaItem = {
  key: string;
  label: string;
  value: string;
  isCode?: boolean;
};

const MONOSPACE_FONT_FAMILY =
  '"SFMono-Regular", "SF Mono", "JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace';

function formatRawResponse(rawResponse: string): { content: string; language: string } {
  try {
    return {
      content: JSON.stringify(JSON.parse(rawResponse), null, 2),
      language: "json",
    };
  } catch {
    return {
      content: rawResponse,
      language: "text",
    };
  }
}

function resolveSyntaxTheme(theme: "light" | "dark" | "system") {
  if (theme === "light") {
    return oneLight;
  }
  if (theme === "dark") {
    return vscDarkPlus;
  }
  if (
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme") === "light"
  ) {
    return oneLight;
  }
  return vscDarkPlus;
}

function ModelTestResultDialog({
  isOpen,
  result,
  errorMessage,
  rawResponseExpanded,
  onClose,
  onToggleRawResponse,
}: ModelTestResultDialogProps) {
  const { t, theme } = useI18n();
  const dialogTitleId = "profile-model-test-dialog-title";
  const isSuccess = result?.ok === true && !errorMessage;
  const summaryText = errorMessage || result?.errorMessage || result?.responseText || "";
  const promptText = result?.promptText?.trim() ?? "";
  const rawResponse = result?.rawResponse?.trim() ? result.rawResponse : "";
  const formattedRawResponse = rawResponse ? formatRawResponse(rawResponse) : null;
  const syntaxTheme = resolveSyntaxTheme(theme);
  const metaItems: MetaItem[] = [
    result?.resolvedModel
      ? {
          key: "resolvedModel",
          label: t("profiles.editor.modelTest.resolvedModel"),
          value: result.resolvedModel,
          isCode: true,
        }
      : null,
    result?.providerModel
      ? {
          key: "providerModel",
          label: t("profiles.editor.modelTest.providerModel"),
          value: result.providerModel,
          isCode: true,
        }
      : null,
    typeof result?.statusCode === "number"
      ? {
          key: "statusCode",
          label: t("profiles.editor.modelTest.statusCode"),
          value: String(result.statusCode),
        }
      : null,
    typeof result?.durationMs === "number"
      ? {
          key: "duration",
          label: t("profiles.editor.modelTest.duration"),
          value: `${result.durationMs} ms`,
        }
      : null,
    result?.requestId
      ? {
          key: "requestId",
          label: t("profiles.editor.modelTest.requestId"),
          value: result.requestId,
          isCode: true,
        }
      : null,
    result?.stopReason
      ? {
          key: "stopReason",
          label: t("profiles.editor.modelTest.stopReason"),
          value: result.stopReason,
          isCode: true,
        }
      : null,
  ].filter((item): item is MetaItem => item !== null);

  useEscapeKey((event) => {
    event?.stopImmediatePropagation();
    onClose();
  }, isOpen);

  if (!isOpen) {
    return null;
  }

  function handleDialogClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  return (
    <div className="profile-model-test-dialog-overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        className="profile-model-test-dialog"
        onClick={handleDialogClick}
      >
        <div className="profile-model-test-dialog-header">
          <div className="profile-model-test-dialog-header-main">
            <div className="profile-model-test-dialog-title-wrap">
              <h3 id={dialogTitleId}>{t("profiles.editor.modelTest.dialogTitle")}</h3>
              <span
                className={`profile-model-test-status-badge${isSuccess ? " success" : " error"}`}
              >
                {isSuccess
                  ? t("profiles.editor.modelTest.status.success")
                  : t("profiles.editor.modelTest.status.error")}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="profile-model-test-dialog-close"
            aria-label={t("common.close")}
            title={t("common.close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="profile-model-test-dialog-body">
          {metaItems.length > 0 ? (
            <dl className="profile-model-test-dialog-meta-list" data-testid="model-test-meta-list">
              {metaItems.map((item) => (
                <div key={item.key} className="profile-model-test-dialog-meta-item">
                  <dt className="profile-model-test-label">{item.label}</dt>
                  <dd
                    className={`profile-model-test-dialog-meta-value${item.isCode ? " is-code" : ""}`}
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {promptText ? (
            <div className="profile-model-test-dialog-panel">
              <span className="profile-model-test-label">
                {t("profiles.editor.modelTest.prompt")}
              </span>
              <p className="profile-model-test-dialog-panel-text">{promptText}</p>
            </div>
          ) : null}

          <div className={`profile-model-test-dialog-summary${isSuccess ? " success" : " error"}`}>
            <span className="profile-model-test-label">
              {isSuccess
                ? t("profiles.editor.modelTest.response")
                : t("profiles.editor.modelTest.errorMessage")}
            </span>
            <p className="profile-model-test-dialog-panel-text">{summaryText}</p>
          </div>

          {rawResponse ? (
            <div className="profile-model-test-dialog-raw">
              <div className="profile-model-test-dialog-section-header">
                <span className="profile-model-test-label">
                  {t("profiles.editor.modelTest.rawResponse")}
                </span>
                <button
                  type="button"
                  className="profile-secondary-btn"
                  onClick={onToggleRawResponse}
                >
                  {rawResponseExpanded
                    ? t("profiles.editor.modelTest.hideRawResponse")
                    : t("profiles.editor.modelTest.viewRawResponse")}
                </button>
              </div>
              {rawResponseExpanded ? (
                <div
                  className="profile-model-test-dialog-summary raw"
                  data-testid="model-test-raw-response-code"
                >
                  <div className="profile-model-test-code-shell">
                    <SyntaxHighlighter
                      language={formattedRawResponse?.language ?? "text"}
                      style={syntaxTheme}
                      customStyle={{
                        margin: 0,
                        padding: 0,
                        background: "transparent",
                        fontSize: "13px",
                        lineHeight: 1.7,
                        fontFamily: MONOSPACE_FONT_FAMILY,
                      }}
                      codeTagProps={{ style: { fontFamily: MONOSPACE_FONT_FAMILY } }}
                      wrapLongLines
                    >
                      {formattedRawResponse?.content ?? rawResponse}
                    </SyntaxHighlighter>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ModelTestResultDialog;
