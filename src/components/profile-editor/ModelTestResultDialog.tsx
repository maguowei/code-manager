import { Copy, TestTube, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight, vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { showOperationError } from "@/lib/user-facing-error";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../i18n";
import type { ModelTestResult } from "../../types";
import { useTheme } from "../theme-provider";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

interface ModelTestResultDialogProps {
  isOpen: boolean;
  result: ModelTestResult | null;
  profileName?: string;
  errorMessage: string;
  rawResponseExpanded: boolean;
  onClose: () => void;
  onToggleRawResponse: () => void;
  onRetest?: (promptText?: string) => void;
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

function resolveSyntaxTheme(isDark: boolean) {
  return isDark ? vscDarkPlus : oneLight;
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
  const { t } = useI18n();
  const { isDark } = useTheme();
  const { showToast } = useToast();
  const dialogTitleId = "model-test-dialog-title";
  const promptInputId = "model-test-prompt-input";
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
  const syntaxTheme = resolveSyntaxTheme(isDark);
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
  const canSendPromptRequest = promptDraft.trim().length > 0;
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
    } catch (error) {
      showOperationError(showToast, t("profiles.editor.modelTest.curlCopyFailed"), error);
    }
  }

  function getRetestPromptOverride() {
    return promptDraft.trim() ? promptDraft : undefined;
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto shrink-0 p-0 text-xs font-medium"
            onClick={() => handleToggleCodePanel(panelKey)}
          >
            {expanded ? hideLabel : viewLabel}
          </Button>
        </div>
        {expanded ? (
          <div className="raw" data-testid={testId}>
            <div className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-[13px] leading-7">
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
    <Dialog modal={false} open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        aria-labelledby={dialogTitleId}
        className="flex max-h-[80vh] w-[min(960px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-start justify-between gap-3 max-[640px]:flex-col">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <DialogTitle asChild>
                  <h3 id={dialogTitleId}>{t("profiles.editor.modelTest.dialogTitle")}</h3>
                </DialogTitle>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${isSuccess ? "bg-chart-2 text-white" : "bg-destructive text-destructive-foreground"}`}
                  data-testid="model-test-status-badge"
                >
                  {isSuccess
                    ? t("profiles.editor.modelTest.status.success")
                    : t("profiles.editor.modelTest.status.error")}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onRetest ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRetesting}
                  onClick={() => onRetest(getRetestPromptOverride())}
                >
                  <span className="inline-flex items-center" aria-hidden="true">
                    <TestTube className="size-[15px]" aria-hidden="true" />
                  </span>
                  <span>
                    {isRetesting
                      ? t("profiles.editor.modelTest.retesting")
                      : t("profiles.editor.modelTest.retest")}
                  </span>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!curlCommand}
                onClick={() => {
                  void handleCopyCurl();
                }}
              >
                <Copy className="size-[15px]" aria-hidden="true" />
                <span>{t("profiles.editor.modelTest.copyCurl")}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("common.close")}
                title={t("common.close")}
                onClick={onClose}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          {trimmedProfileName || requestUrl ? (
            <div className="flex flex-col gap-1.5" data-testid="model-test-context">
              {trimmedProfileName ? (
                <div
                  className="inline-flex items-center gap-2"
                  data-testid="model-test-profile-row"
                >
                  <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t("profiles.editor.modelTest.profileName")}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-xs"
                    data-testid="model-test-profile-name"
                  >
                    {trimmedProfileName}
                  </span>
                </div>
              ) : null}
              {requestUrl ? (
                <div
                  className="inline-flex min-w-0 items-center gap-2"
                  data-testid="model-test-request-url-row"
                >
                  <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t("profiles.editor.modelTest.requestUrl")}
                  </span>
                  <span
                    className="inline-flex min-w-0 items-center gap-1"
                    data-testid="model-test-request-url"
                  >
                    {result?.requestMethod ? (
                      <span className="mr-1 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-bold text-muted-foreground">
                        {result.requestMethod}
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate font-mono text-xs">{requestUrl}</span>
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {metaItems.length > 0 ? (
            <dl
              className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2"
              data-testid="model-test-meta-list"
            >
              {metaItems.map((item) => (
                <div
                  key={item.key}
                  className="flex flex-col gap-0.5 rounded-md border border-border bg-card px-3 py-2"
                >
                  <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd
                    className={`truncate text-sm font-medium text-foreground${item.isCode ? " font-mono" : ""}`}
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {isRetesting ? (
            <div
              className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
              role="status"
              aria-live="polite"
              data-testid="model-test-progress-indicator"
            >
              <span
                className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
                aria-hidden="true"
              />
              <span className="text-sm font-medium text-muted-foreground">
                {t("profiles.editor.modelTest.retesting")}
              </span>
              <span className="hidden" aria-hidden="true" />
            </div>
          ) : null}

          <div className="grid gap-3" data-testid="model-test-content-grid">
            {promptText ? (
              <div
                className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
                data-testid="model-test-prompt-panel"
              >
                <div className="flex items-center justify-between gap-2">
                  {isPromptEditing ? (
                    <label
                      className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground"
                      htmlFor={promptInputId}
                    >
                      {t("profiles.editor.modelTest.prompt")}
                    </label>
                  ) : (
                    <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {t("profiles.editor.modelTest.prompt")}
                    </span>
                  )}
                  {isPromptEditing ? (
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="h-auto shrink-0 p-0 text-xs font-medium"
                      disabled={isRetesting || !onRetest || !canSendPromptRequest}
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
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="h-auto shrink-0 p-0 text-xs font-medium"
                      disabled={isRetesting}
                      onClick={() => setIsPromptEditing(true)}
                    >
                      {t("profiles.editor.modelTest.editPrompt")}
                    </Button>
                  )}
                </div>
                {isPromptEditing ? (
                  <textarea
                    id={promptInputId}
                    className="w-full min-h-[120px] rounded-md border border-border bg-card p-3 font-mono text-sm leading-6 text-foreground"
                    value={promptDraft}
                    disabled={isRetesting}
                    onChange={(event) => setPromptDraft(event.target.value)}
                  />
                ) : (
                  <p className="whitespace-pre-wrap font-mono text-sm leading-6 text-foreground [overflow-wrap:anywhere]">
                    {promptDraft}
                  </p>
                )}
              </div>
            ) : null}

            <div
              className={`flex flex-col gap-2 rounded-md border bg-card p-3 ${isSuccess ? "border-chart-2" : "border-destructive bg-destructive/10"}`}
              data-testid="model-test-response-panel"
            >
              <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {isSuccess
                  ? t("profiles.editor.modelTest.response")
                  : t("profiles.editor.modelTest.errorMessage")}
              </span>
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground [overflow-wrap:anywhere]">
                {summaryText}
              </p>
            </div>
          </div>

          {(result?.requestHeaders || requestBody || result?.responseHeaders || rawResponse) && (
            <section className="flex flex-col gap-3" data-testid="model-test-exchange-details">
              <div className="flex items-center gap-2">
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
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {t("profiles.editor.modelTest.rawResponse")}
                    </span>
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="h-auto shrink-0 p-0 text-xs font-medium"
                      onClick={onToggleRawResponse}
                    >
                      {rawResponseExpanded
                        ? t("profiles.editor.modelTest.hideRawResponse")
                        : t("profiles.editor.modelTest.viewRawResponse")}
                    </Button>
                  </div>
                  {rawResponseExpanded ? (
                    <div className="raw" data-testid="model-test-raw-response-code">
                      <div className="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-[13px] leading-7">
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
      </DialogContent>
    </Dialog>
  );
}

export default ModelTestResultDialog;
