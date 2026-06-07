import { Copy, TestTube, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";
import type { ModelTestResult } from "../../types";
import { redactSecretText } from "../../utils/logger";
import SyntaxHighlightedCode from "../SyntaxHighlightedCode";
import { useTheme } from "../theme-provider";
import { TONE_SOLID_CLASS } from "../tone-classes";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Separator } from "../ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";

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

type ResultTab = "overview" | "request" | "response";
type SyntaxThemeType = "light" | "dark";

const MONOSPACE_FONT_FAMILY =
  '"SFMono-Regular", "SF Mono", "JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace';
const REDACTED_SECRET_VALUE = "<redacted>";
const SENSITIVE_REQUEST_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "api-key",
]);

interface CodeViewportProps {
  label: string;
  content: string;
  testId: string;
  language: string;
  syntaxThemeType: SyntaxThemeType;
}

function CodeViewport({ label, content, testId, language, syntaxThemeType }: CodeViewportProps) {
  return (
    <div
      className="raw min-w-0 max-w-full overflow-visible rounded-md bg-muted/50 p-3 font-mono text-[13px] leading-7 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid={testId}
      role="textbox"
      tabIndex={0}
      aria-label={label}
      aria-multiline="true"
      aria-readonly="true"
    >
      <SyntaxHighlightedCode
        code={content}
        language={language}
        themeType={syntaxThemeType}
        customStyle={{
          margin: 0,
          padding: 0,
          background: "transparent",
          fontSize: "13px",
          lineHeight: 1.7,
          fontFamily: MONOSPACE_FONT_FAMILY,
          maxWidth: "100%",
          overflow: "visible",
          overflowWrap: "anywhere",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
        codeTagProps={{
          style: {
            fontFamily: MONOSPACE_FONT_FAMILY,
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          },
        }}
        wrapLongLines
      />
    </div>
  );
}

function formatRawResponse(rawResponse: string): { content: string; language: string } {
  try {
    return {
      content: JSON.stringify(redactJsonSecrets(JSON.parse(rawResponse)), null, 2),
      language: "json",
    };
  } catch {
    return {
      content: redactSecretText(rawResponse),
      language: "text",
    };
  }
}

function isSensitiveFieldName(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === "authorization" ||
    normalized === "token" ||
    normalized.endsWith("_token") ||
    normalized.endsWith("-token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("api_key") ||
    normalized.includes("api-key") ||
    normalized === "apikey"
  );
}

function redactJsonSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactJsonSecrets);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        isSensitiveFieldName(key) ? REDACTED_SECRET_VALUE : redactJsonSecrets(child),
      ]),
    );
  }

  return value;
}

function redactRequestHeaders(headers?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [
      key,
      SENSITIVE_REQUEST_HEADERS.has(key.toLowerCase()) ? REDACTED_SECRET_VALUE : value,
    ]),
  );
}

function formatHeaders(headers?: Record<string, string>): string {
  return JSON.stringify(redactRequestHeaders(headers), null, 2);
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

  const headerLines = Object.entries(redactRequestHeaders(result.requestHeaders)).map(
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
  const promptInputId = "model-test-prompt-input";
  const rawResponsePanelRef = useRef<HTMLDivElement | null>(null);
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<ResultTab>("overview");
  const isSuccess = result?.ok === true && !errorMessage;
  const summaryText = errorMessage || result?.errorMessage || result?.responseText || "";
  const trimmedProfileName = profileName?.trim() ?? "";
  const requestUrl = result?.requestUrl?.trim() ?? "";
  const promptText = result?.promptText?.trim() ?? "";
  const rawResponse = result?.rawResponse?.trim() ? result.rawResponse : "";
  const formattedRawResponse = rawResponse ? formatRawResponse(rawResponse) : null;
  const syntaxThemeType = isDark ? "dark" : "light";
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
      setActiveTab("overview");
    }
  }, [isOpen, promptText]);

  useEffect(() => {
    if (activeTab !== "response" || !rawResponseExpanded || !rawResponse) {
      return;
    }

    window.requestAnimationFrame(() => {
      rawResponsePanelRef.current?.scrollIntoView?.({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }, [activeTab, rawResponseExpanded, rawResponse]);

  if (!isOpen) {
    return null;
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

  function handleShowRawResponse() {
    setActiveTab("response");
    if (!rawResponseExpanded) {
      onToggleRawResponse();
    }
  }

  function handleToggleRawResponse() {
    setActiveTab("response");
    onToggleRawResponse();
  }

  function handleScrollBodyWheel(event: WheelEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.deltaY === 0 || event.ctrlKey || event.metaKey) {
      return;
    }

    const scrollBody = scrollBodyRef.current;
    if (!scrollBody) {
      return;
    }

    const startTop = scrollBody.scrollTop;
    const maxTop = Math.max(0, scrollBody.scrollHeight - scrollBody.clientHeight);
    if ((event.deltaY < 0 && startTop <= 0) || (event.deltaY > 0 && startTop >= maxTop)) {
      return;
    }

    window.requestAnimationFrame(() => {
      const currentScrollBody = scrollBodyRef.current;
      if (!currentScrollBody || currentScrollBody.scrollTop !== startTop) {
        return;
      }

      const nextMaxTop = Math.max(
        0,
        currentScrollBody.scrollHeight - currentScrollBody.clientHeight,
      );
      currentScrollBody.scrollTop = Math.min(nextMaxTop, Math.max(0, startTop + event.deltaY));
    });
  }

  function renderCodeViewport(
    label: string,
    content: string,
    testId: string,
    language: string = "json",
  ) {
    return (
      <CodeViewport
        label={label}
        content={content}
        testId={testId}
        language={language}
        syntaxThemeType={syntaxThemeType}
      />
    );
  }

  function renderCodePanel(
    label: string,
    content: string,
    testId: string,
    language: string = "json",
  ) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {renderCodeViewport(label, content, testId, language)}
      </div>
    );
  }

  return (
    <Dialog modal={false} open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="!flex h-[min(860px,calc(100dvh-2rem))] w-[min(1040px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <div className="flex shrink-0 flex-col gap-3 px-5 py-4">
          <div className="flex min-w-0 items-start justify-between gap-3 max-[640px]:flex-col">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <DialogTitle asChild>
                  <h3>{t("profiles.editor.modelTest.dialogTitle")}</h3>
                </DialogTitle>
                <Badge
                  variant={isSuccess ? "default" : "destructive"}
                  className={cn("font-bold", isSuccess && TONE_SOLID_CLASS.success)}
                  data-testid="model-test-status-badge"
                >
                  {isSuccess
                    ? t("profiles.editor.modelTest.status.success")
                    : t("profiles.editor.modelTest.status.error")}
                </Badge>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 max-[640px]:justify-start">
              {onRetest ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRetesting}
                  onClick={() => onRetest(getRetestPromptOverride())}
                >
                  <TestTube data-icon="inline-start" aria-hidden="true" />
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
                <Copy data-icon="inline-start" aria-hidden="true" />
                <span>{t("profiles.editor.modelTest.copyCurl")}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("common.close")}
                title={t("common.close")}
                onClick={onClose}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        <Tabs
          className="min-h-0 flex-1 gap-0"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ResultTab)}
          data-testid="model-test-exchange-details"
        >
          <div className="shrink-0 px-5 py-2">
            <TabsList variant="line" className="max-w-full overflow-x-auto">
              <TabsTrigger value="overview">
                {t("profiles.editor.modelTest.tabs.overview")}
              </TabsTrigger>
              <TabsTrigger value="request">
                {t("profiles.editor.modelTest.tabs.request")}
              </TabsTrigger>
              <TabsTrigger value="response">
                {t("profiles.editor.modelTest.tabs.response")}
              </TabsTrigger>
            </TabsList>
          </div>

          <Separator />

          <div
            ref={scrollBodyRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
            data-testid="model-test-result-scroll-body"
            onWheelCapture={handleScrollBodyWheel}
          >
            <div className="min-w-0">
              <TabsContent value="overview" className="m-0 flex-none">
                <div className="flex flex-col gap-4">
                  {trimmedProfileName || requestUrl ? (
                    <div
                      className="grid gap-2 rounded-md border border-border bg-card p-3"
                      data-testid="model-test-context"
                    >
                      {trimmedProfileName ? (
                        <div
                          className="flex min-w-0 items-center gap-2"
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
                          className="flex min-w-0 items-center gap-2"
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
                              <Badge variant="secondary" className="shrink-0 rounded-md font-mono">
                                {result.requestMethod}
                              </Badge>
                            ) : null}
                            <span className="min-w-0 truncate font-mono text-xs">{requestUrl}</span>
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

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
                            className={cn(
                              "truncate text-sm font-medium text-foreground",
                              item.isCode && "font-mono",
                            )}
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
                          <Textarea
                            id={promptInputId}
                            className="min-h-[120px] font-mono text-sm leading-6"
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
                      className={cn(
                        "flex flex-col gap-2 rounded-md border bg-card p-3",
                        isSuccess ? "border-chart-2" : "border-destructive bg-destructive/10",
                      )}
                      data-testid="model-test-response-panel"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {isSuccess
                            ? t("profiles.editor.modelTest.response")
                            : t("profiles.editor.modelTest.errorMessage")}
                        </span>
                        {rawResponse ? (
                          <Button
                            type="button"
                            variant="link"
                            size="xs"
                            className="h-auto shrink-0 p-0 text-xs font-medium"
                            onClick={handleShowRawResponse}
                          >
                            {t("profiles.editor.modelTest.viewRawResponse")}
                          </Button>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground [overflow-wrap:anywhere]">
                        {summaryText}
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="request" className="m-0 flex-none">
                <section
                  className="flex min-w-0 flex-col gap-4"
                  data-testid="model-test-request-tab-panel"
                >
                  {result?.requestHeaders
                    ? renderCodePanel(
                        t("profiles.editor.modelTest.requestHeaders"),
                        requestHeaders,
                        "model-test-request-headers-code",
                      )
                    : null}

                  {requestBody
                    ? renderCodePanel(
                        t("profiles.editor.modelTest.requestBody"),
                        requestBody,
                        "model-test-request-body-code",
                      )
                    : null}
                </section>
              </TabsContent>

              <TabsContent value="response" className="m-0 flex-none">
                <section
                  className="flex min-w-0 flex-col gap-4"
                  data-testid="model-test-response-tab-panel"
                >
                  {result?.responseHeaders
                    ? renderCodePanel(
                        t("profiles.editor.modelTest.responseHeaders"),
                        responseHeaders,
                        "model-test-response-headers-code",
                      )
                    : null}

                  {rawResponse ? (
                    <div className="flex min-w-0 flex-col gap-2" ref={rawResponsePanelRef}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {t("profiles.editor.modelTest.rawResponse")}
                        </span>
                        <Button
                          type="button"
                          variant="link"
                          size="xs"
                          className="h-auto shrink-0 p-0 text-xs font-medium"
                          onClick={handleToggleRawResponse}
                        >
                          {rawResponseExpanded
                            ? t("profiles.editor.modelTest.hideRawResponse")
                            : t("profiles.editor.modelTest.viewRawResponse")}
                        </Button>
                      </div>
                      {rawResponseExpanded
                        ? renderCodeViewport(
                            t("profiles.editor.modelTest.rawResponse"),
                            formattedRawResponse?.content ?? rawResponse,
                            "model-test-raw-response-code",
                            formattedRawResponse?.language ?? "text",
                          )
                        : null}
                    </div>
                  ) : null}
                </section>
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default ModelTestResultDialog;
