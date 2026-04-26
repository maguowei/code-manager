import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight, vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import useEscapeKey from "../../hooks/useEscapeKey";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../i18n";
import type { ModelTestResult } from "../../types";
import { CopyIcon, TestTubeIcon } from "../Icons";
import "./editor-shared.css";

interface ModelTestResultDialogProps {
  isOpen: boolean;
  result: ModelTestResult | null;
  profileName?: string;
  errorMessage: string;
  rawResponseExpanded: boolean;
  onClose: () => void;
  onToggleRawResponse: () => void;
  onRetest?: (promptText: string) => void;
  isRetesting?: boolean;
}

type MetaItem = {
  key: string;
  label: string;
  value: string;
  isCode?: boolean;
};

type CodePanelKey = "requestHeaders" | "requestBody" | "responseHeaders";

const COLLAPSIBLE_CODE_PANEL_DEFAULTS: Record<CodePanelKey, boolean> = {
  requestHeaders: false,
  requestBody: false,
  responseHeaders: false,
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

function formatHeaders(headers?: Record<string, string>): string {
  return JSON.stringify(headers ?? {}, null, 2);
}

function requestBodyWithPrompt(requestBody: string | undefined, promptText: string): string {
  if (!requestBody?.trim()) {
    return "";
  }

  try {
    const parsed = JSON.parse(requestBody);
    if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
      parsed.messages[0] = {
        ...parsed.messages[0],
        content: promptText,
      };
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return requestBody;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildCurlCommand(result: ModelTestResult, requestBody: string): string {
  if (!result.requestUrl || !result.requestMethod || !result.requestHeaders || !requestBody) {
    return "";
  }

  const headerLines = Object.entries(result.requestHeaders).map(
    ([key, value]) => `  -H ${shellQuote(`${key}: ${value}`)} \\`,
  );
  return [
    `curl -X ${result.requestMethod} ${shellQuote(result.requestUrl)} \\`,
    ...headerLines,
    `  --data ${shellQuote(requestBody)}`,
  ].join("\n");
}

function ModelTestResultDialog({
  isOpen,
  result,
  profileName,
  errorMessage,
  rawResponseExpanded,
  onClose,
  onToggleRawResponse,
  onRetest,
  isRetesting = false,
}: ModelTestResultDialogProps) {
  const { t, theme } = useI18n();
  const { showToast } = useToast();
  const dialogTitleId = "profile-model-test-dialog-title";
  const promptInputId = "profile-model-test-prompt-input";
  const [promptDraft, setPromptDraft] = useState("");
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [expandedCodePanels, setExpandedCodePanels] = useState<Record<CodePanelKey, boolean>>(
    COLLAPSIBLE_CODE_PANEL_DEFAULTS,
  );
  const isSuccess = result?.ok === true && !errorMessage;
  const summaryText = errorMessage || result?.errorMessage || result?.responseText || "";
  const trimmedProfileName = profileName?.trim() ?? "";
  const requestUrl = result?.requestUrl?.trim() ?? "";
  const promptText = result?.promptText?.trim() ?? "";
  const rawResponse = result?.rawResponse?.trim() ? result.rawResponse : "";
  const formattedRawResponse = rawResponse ? formatRawResponse(rawResponse) : null;
  const syntaxTheme = resolveSyntaxTheme(theme);
  const requestBody = useMemo(
    () => requestBodyWithPrompt(result?.requestBody, promptDraft),
    [result?.requestBody, promptDraft],
  );
  const requestHeaders = useMemo(() => formatHeaders(result?.requestHeaders), [result]);
  const responseHeaders = useMemo(() => formatHeaders(result?.responseHeaders), [result]);
  const curlCommand = useMemo(
    () => (result ? buildCurlCommand(result, requestBody) : ""),
    [result, requestBody],
  );
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

  useEffect(() => {
    if (isOpen) {
      setPromptDraft(promptText);
      setIsPromptEditing(false);
      setExpandedCodePanels({ ...COLLAPSIBLE_CODE_PANEL_DEFAULTS });
    }
  }, [isOpen, promptText]);

  if (!isOpen) {
    return null;
  }

  function handleDialogClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  function handleToggleCodePanel(panelKey: CodePanelKey) {
    setExpandedCodePanels((current) => ({
      ...current,
      [panelKey]: !current[panelKey],
    }));
  }

  async function handleCopyCurl() {
    if (!curlCommand) {
      return;
    }

    try {
      await navigator.clipboard.writeText(curlCommand);
      showToast(t("profiles.editor.modelTest.curlCopied"));
    } catch {
      showToast(t("profiles.editor.modelTest.curlCopyFailed"), "error");
    }
  }

  function renderCodePanel(
    panelKey: CodePanelKey,
    label: string,
    viewLabel: string,
    hideLabel: string,
    content: string,
    testId: string,
    language: string = "json",
  ) {
    const expanded = expandedCodePanels[panelKey];

    return (
      <div className="profile-model-test-dialog-raw">
        <div className="profile-model-test-dialog-section-header">
          <span className="profile-model-test-label">{label}</span>
          <button
            type="button"
            className="profile-secondary-btn profile-model-test-compact-action"
            onClick={() => handleToggleCodePanel(panelKey)}
          >
            {expanded ? hideLabel : viewLabel}
          </button>
        </div>
        {expanded ? (
          <div className="profile-model-test-dialog-summary raw" data-testid={testId}>
            <div className="profile-model-test-code-shell">
              <SyntaxHighlighter
                language={language}
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
                {content}
              </SyntaxHighlighter>
            </div>
          </div>
        ) : null}
      </div>
    );
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
          <div className="profile-model-test-dialog-header-top">
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
            <div className="profile-model-test-dialog-actions">
              {onRetest ? (
                <button
                  type="button"
                  className={`profile-secondary-btn profile-model-test-dialog-retest${isRetesting ? " is-testing" : ""}`}
                  disabled={isRetesting}
                  onClick={() => onRetest(promptDraft)}
                >
                  <span className="profile-model-test-dialog-retest-icon" aria-hidden="true">
                    <TestTubeIcon size={15} />
                  </span>
                  <span>
                    {isRetesting
                      ? t("profiles.editor.modelTest.retesting")
                      : t("profiles.editor.modelTest.retest")}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                className="profile-secondary-btn profile-model-test-dialog-copy-curl"
                disabled={!curlCommand}
                onClick={() => {
                  void handleCopyCurl();
                }}
              >
                <CopyIcon size={15} />
                <span>{t("profiles.editor.modelTest.copyCurl")}</span>
              </button>
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
          </div>
          {trimmedProfileName || requestUrl ? (
            <div
              className="profile-model-test-dialog-context profile-model-test-dialog-context--stacked"
              data-testid="model-test-context"
            >
              {trimmedProfileName ? (
                <div
                  className="profile-model-test-dialog-context-item profile-model-test-dialog-context-item--inline"
                  data-testid="model-test-profile-row"
                >
                  <span className="profile-model-test-label">
                    {t("profiles.editor.modelTest.profileName")}
                  </span>
                  <span
                    className="profile-model-test-dialog-context-value"
                    data-testid="model-test-profile-name"
                  >
                    {trimmedProfileName}
                  </span>
                </div>
              ) : null}
              {requestUrl ? (
                <div
                  className="profile-model-test-dialog-context-item profile-model-test-dialog-context-item--inline request-url"
                  data-testid="model-test-request-url-row"
                >
                  <span className="profile-model-test-label">
                    {t("profiles.editor.modelTest.requestUrl")}
                  </span>
                  <span
                    className="profile-model-test-dialog-context-value is-code"
                    data-testid="model-test-request-url"
                  >
                    {result?.requestMethod ? (
                      <span className="profile-model-test-method-badge">
                        {result.requestMethod}
                      </span>
                    ) : null}
                    <span className="profile-model-test-url-text">{requestUrl}</span>
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="profile-model-test-dialog-body">
          {metaItems.length > 0 ? (
            <dl
              className="profile-model-test-dialog-meta-list profile-model-test-dialog-meta-list--compact"
              data-testid="model-test-meta-list"
            >
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

          {isRetesting ? (
            <div
              className="profile-model-test-progress-indicator"
              role="status"
              aria-live="polite"
              data-testid="model-test-progress-indicator"
            >
              <span className="profile-model-test-progress-spinner" aria-hidden="true" />
              <span className="profile-model-test-progress-text">
                {t("profiles.editor.modelTest.retesting")}
              </span>
              <span className="profile-model-test-progress-track" aria-hidden="true" />
            </div>
          ) : null}

          <div
            className="profile-model-test-content-grid profile-model-test-content-grid--stacked"
            data-testid="model-test-content-grid"
          >
            {promptText ? (
              <div
                className="profile-model-test-dialog-panel profile-model-test-content-panel profile-model-test-content-panel--primary"
                data-testid="model-test-prompt-panel"
              >
                <div className="profile-model-test-dialog-section-header">
                  {isPromptEditing ? (
                    <label className="profile-model-test-label" htmlFor={promptInputId}>
                      {t("profiles.editor.modelTest.prompt")}
                    </label>
                  ) : (
                    <span className="profile-model-test-label">
                      {t("profiles.editor.modelTest.prompt")}
                    </span>
                  )}
                  {isPromptEditing ? (
                    <button
                      type="button"
                      className="profile-secondary-btn profile-model-test-compact-action"
                      disabled={isRetesting || !onRetest}
                      onClick={() => {
                        if (!onRetest) {
                          return;
                        }
                        setIsPromptEditing(false);
                        onRetest(promptDraft);
                      }}
                    >
                      {isRetesting
                        ? t("profiles.editor.modelTest.retesting")
                        : t("profiles.editor.modelTest.sendPromptRequest")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="profile-secondary-btn profile-model-test-compact-action"
                      disabled={isRetesting}
                      onClick={() => setIsPromptEditing(true)}
                    >
                      {t("profiles.editor.modelTest.editPrompt")}
                    </button>
                  )}
                </div>
                {isPromptEditing ? (
                  <textarea
                    id={promptInputId}
                    className="profile-model-test-prompt-input"
                    value={promptDraft}
                    disabled={isRetesting}
                    onChange={(event) => setPromptDraft(event.target.value)}
                  />
                ) : (
                  <p className="profile-model-test-dialog-panel-text profile-model-test-prompt-display">
                    {promptDraft}
                  </p>
                )}
              </div>
            ) : null}

            <div
              className={`profile-model-test-dialog-summary profile-model-test-content-panel profile-model-test-content-panel--primary${isSuccess ? " success" : " error"}`}
              data-testid="model-test-response-panel"
            >
              <span className="profile-model-test-label">
                {isSuccess
                  ? t("profiles.editor.modelTest.response")
                  : t("profiles.editor.modelTest.errorMessage")}
              </span>
              <p className="profile-model-test-dialog-panel-text">{summaryText}</p>
            </div>
          </div>

          {(result?.requestHeaders || requestBody || result?.responseHeaders || rawResponse) && (
            <section
              className="profile-model-test-exchange-details"
              data-testid="model-test-exchange-details"
            >
              <div className="profile-model-test-exchange-header">
                <h4>{t("profiles.editor.modelTest.exchangeDetails")}</h4>
              </div>

              {result?.requestHeaders
                ? renderCodePanel(
                    "requestHeaders",
                    t("profiles.editor.modelTest.requestHeaders"),
                    t("profiles.editor.modelTest.viewRequestHeaders"),
                    t("profiles.editor.modelTest.hideRequestHeaders"),
                    requestHeaders,
                    "model-test-request-headers-code",
                  )
                : null}

              {requestBody
                ? renderCodePanel(
                    "requestBody",
                    t("profiles.editor.modelTest.requestBody"),
                    t("profiles.editor.modelTest.viewRequestBody"),
                    t("profiles.editor.modelTest.hideRequestBody"),
                    requestBody,
                    "model-test-request-body-code",
                  )
                : null}

              {result?.responseHeaders
                ? renderCodePanel(
                    "responseHeaders",
                    t("profiles.editor.modelTest.responseHeaders"),
                    t("profiles.editor.modelTest.viewResponseHeaders"),
                    t("profiles.editor.modelTest.hideResponseHeaders"),
                    responseHeaders,
                    "model-test-response-headers-code",
                  )
                : null}

              {rawResponse ? (
                <div className="profile-model-test-dialog-raw">
                  <div className="profile-model-test-dialog-section-header">
                    <span className="profile-model-test-label">
                      {t("profiles.editor.modelTest.rawResponse")}
                    </span>
                    <button
                      type="button"
                      className="profile-secondary-btn profile-model-test-compact-action"
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
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default ModelTestResultDialog;
