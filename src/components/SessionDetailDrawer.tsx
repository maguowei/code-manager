import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror from "@uiw/react-codemirror";
import {
  AlertTriangle,
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  Copy,
  Image as ImageIcon,
  Info,
  MessageSquare,
  Terminal,
  User,
  Wrench,
  X,
} from "lucide-react";
import { memo, type ReactNode, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { useCodeMirrorTheme } from "../hooks/useCodeMirrorTheme";
import { useToast } from "../hooks/useToast";
import { type TranslationKey, useI18n } from "../i18n";
import { isTauri, type MessageBlock, type SessionDetail, type SessionMessage } from "../types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";

/** 文件类工具集合（模块级常量，避免每次渲染重建 Set） */
const FILE_TOOLS = new Set(["Read", "Write", "Edit", "NotebookRead", "NotebookEdit"]);

/** ReactMarkdown 插件列表（模块级常量，所有实例共享，避免每次渲染重建数组） */
const REMARK_PLUGINS = [remarkGfm];
const JSON_EXTENSIONS = [json(), EditorView.lineWrapping];
const READONLY_CODEMIRROR_SETUP = {
  lineNumbers: true,
  foldGutter: false,
};

/** ANSI CSI / OSC 控制序列，历史原文不变，仅展示时清洗 */
const ESC_PATTERN = "\\x1B";
const BEL_PATTERN = "\\x07";
const C1_CSI_PATTERN = "\\x9B";
const ANSI_SEQUENCE_RE = new RegExp(
  `(?:${ESC_PATTERN}\\][^${BEL_PATTERN}]*(?:${BEL_PATTERN}|${ESC_PATTERN}\\\\)|${ESC_PATTERN}\\[[0-?]*[ -/]*[@-~]|${C1_CSI_PATTERN}[0-?]*[ -/]*[@-~])`,
  "g",
);
const EVENT_BLOCK_TYPES = new Set<MessageBlock["type"]>(["command", "system", "plan"]);

/** 扩展名到 Prism 语言标识的映射（模块级常量） */
const EXT_LANG_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  rs: "rust",
  py: "python",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  css: "css",
  scss: "scss",
  html: "html",
  xml: "xml",
  json: "json",
  toml: "toml",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  mdx: "markdown",
  sql: "sql",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  rb: "ruby",
  php: "php",
  r: "r",
};

export type MessagePresentation = {
  kind: "message" | "event";
  tone: "default" | "error";
};

export function stripAnsiForDisplay(value: string): string {
  return stripInvisibleControls(
    value.replace(ANSI_SEQUENCE_RE, "").replaceAll("\r\n", "\n").replaceAll("\r", "\n"),
  );
}

function stripInvisibleControls(value: string): string {
  let result = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      (code >= 0x7f && code <= 0x9f)
    ) {
      continue;
    }
    result += char;
  }
  return result;
}

function isEventBlock(block: MessageBlock): boolean {
  return EVENT_BLOCK_TYPES.has(block.type);
}

function isErrorText(value: string): boolean {
  return /^(?:api\s+error|error):/i.test(value.trim());
}

export function getMessagePresentation(message: SessionMessage): MessagePresentation {
  const visibleBlocks = message.blocks.filter((block) => {
    if (block.type === "text") return stripAnsiForDisplay(block.text).trim().length > 0;
    if (block.type === "tool_result") return stripAnsiForDisplay(block.content).trim().length > 0;
    return true;
  });
  const kind = visibleBlocks.length > 0 && visibleBlocks.every(isEventBlock) ? "event" : "message";
  const tone = visibleBlocks.some(
    (block) => block.type === "text" && isErrorText(stripAnsiForDisplay(block.text)),
  )
    ? "error"
    : "default";

  return { kind, tone };
}

/** 根据文件扩展名获取 Prism 语言标识 */
function langFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG_MAP[ext] ?? "text";
}

/** 剥离 Read 工具返回内容中的行号前缀（如 "     1\t"） */
function stripLineNumbers(content: string): string {
  return content.replace(/^ *\d+\t/gm, "");
}

function formatTimestamp(timestamp?: string): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return stripAnsiForDisplay(timestamp);
  return date.toLocaleString();
}

function formatDateRange(messages: SessionMessage[], fallback: string): string {
  const timestamps = messages
    .map((msg) => formatTimestamp(msg.timestamp))
    .filter((timestamp): timestamp is string => Boolean(timestamp));
  if (timestamps.length === 0) return fallback;
  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  return first === last ? first : `${first} - ${last}`;
}

function formatMessageCount(count: number, unit: string): string {
  return `${count} ${unit}`;
}

function messageBlockToCopyText(block: MessageBlock, t: (key: TranslationKey) => string): string {
  switch (block.type) {
    case "text":
      return stripAnsiForDisplay(block.text);
    case "thinking":
      return `${t("history.thinking")}\n${stripAnsiForDisplay(block.thinking)}`;
    case "tool_use":
      return `${t("history.toolUse")} ${stripAnsiForDisplay(block.name)}\n${stripAnsiForDisplay(
        block.input_preview,
      )}`;
    case "tool_result":
      return `${t("history.toolResult")}\n${stripAnsiForDisplay(block.content || "...")}`;
    case "command":
      return `${stripAnsiForDisplay(block.name)}${block.args ? ` ${stripAnsiForDisplay(block.args)}` : ""}`;
    case "system":
      return `${t("history.system")}\n${stripAnsiForDisplay(block.summary)}`;
    case "image":
      return `${t("history.image")} · ${stripAnsiForDisplay(block.media_type)}`;
    case "plan":
      return `${stripAnsiForDisplay(block.summary)}\n\n${stripAnsiForDisplay(block.content)}`;
  }
}

function messageToCopyText(message: SessionMessage, t: (key: TranslationKey) => string): string {
  return message.blocks
    .map((block) => messageBlockToCopyText(block, t).trim())
    .filter(Boolean)
    .join("\n\n");
}

/** 文件类工具的返回结果用代码高亮渲染 */
function CodeResultBlock({ content, filePath }: { content: string; filePath: string }) {
  const lang = langFromPath(filePath);
  const code = stripLineNumbers(stripAnsiForDisplay(content));
  return (
    <SyntaxHighlighter
      language={lang}
      style={vscDarkPlus}
      customStyle={{
        margin: 0,
        borderRadius: "calc(var(--radius) - 4px)",
        fontSize: "0.75rem",
        maxHeight: "400px",
        maxWidth: "100%",
        overflowY: "auto",
        overflowX: "auto",
        background: "var(--card)",
      }}
      wrapLongLines={false}
      showLineNumbers
      lineNumberStyle={{ opacity: 0.4, fontSize: "10px", minWidth: "2.5em" }}
    >
      {code}
    </SyntaxHighlighter>
  );
}

function MarkdownBlock({
  children,
  className,
  variant = "default",
}: {
  children: string;
  className?: string;
  variant?: "default" | "error";
}) {
  const content = stripAnsiForDisplay(children);

  return (
    <div
      data-variant={variant === "error" ? "error" : undefined}
      className={cn(
        "min-w-0 max-w-full [overflow-wrap:anywhere] [&_*]:max-w-full [&_ol]:pl-5 [&_p]:my-1 [&_pre]:overflow-x-auto [&_ul]:pl-5",
        variant === "error" &&
          "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
    </div>
  );
}

/** 通用可折叠块，ThinkingBlock / SystemBlock / PlanBlock 共用 */
function CollapsibleBlock({
  wrapClass,
  contentClass,
  label,
  summary,
  icon,
  children,
}: {
  wrapClass?: string;
  contentClass: string;
  label: ReactNode;
  summary?: ReactNode;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className={cn("min-w-0 max-w-full [overflow-wrap:anywhere]", wrapClass)}
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-w-0 max-w-full justify-start gap-2 bg-transparent p-0 text-left text-xs text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
        >
          <Chevron className="size-3 shrink-0" aria-hidden="true" />
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
          <span className="shrink-0 font-medium">{label}</span>
          {summary && <span className="min-w-0 truncate">{summary}</span>}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className={cn("min-w-0 max-w-full", contentClass)}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 渲染单个 thinking 块（可折叠） */
function ThinkingBlock({ thinking, label }: { thinking: string; label: string }) {
  const content = stripAnsiForDisplay(thinking);
  return (
    <CollapsibleBlock
      icon={<Brain className="size-3.5" />}
      contentClass="mt-2 rounded-md border bg-background p-3 text-sm leading-6 [&_pre]:overflow-x-auto [&_p]:my-1"
      label={label}
      summary={content.split("\n")[0]}
    >
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
    </CollapsibleBlock>
  );
}

/** 渲染斜杠命令块 */
function CommandBlock({ name, args, label }: { name: string; args?: string; label: string }) {
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm [overflow-wrap:anywhere]">
      <Terminal className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
      <code className="min-w-0 rounded-sm bg-card px-1.5 py-0.5 font-mono font-medium [overflow-wrap:anywhere]">
        {stripAnsiForDisplay(name)}
      </code>
      {args && (
        <span className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">
          {stripAnsiForDisplay(args)}
        </span>
      )}
    </div>
  );
}

/** 渲染系统信息块（可折叠） */
function SystemBlock({ summary, label }: { summary: string; label: string }) {
  const content = stripAnsiForDisplay(summary);
  return (
    <CollapsibleBlock
      icon={<Info className="size-3.5" />}
      contentClass="mt-2 rounded-md border bg-background px-3 py-2 text-sm leading-6 text-muted-foreground"
      label={label}
      summary={content}
    >
      {content}
    </CollapsibleBlock>
  );
}

/** 渲染计划块（可折叠，复用 CollapsibleBlock） */
function PlanBlock({
  summary,
  content,
  label,
  sourceLabel,
}: {
  summary: string;
  content: string;
  label: string;
  sourceLabel: string;
}) {
  const cleanSummary = stripAnsiForDisplay(summary);
  const cleanContent = stripAnsiForDisplay(content);

  return (
    <CollapsibleBlock
      wrapClass="rounded-md border bg-background p-3"
      icon={<ClipboardList className="size-3.5" />}
      contentClass="mt-3 border-t pt-3 text-sm leading-6 [&_pre]:overflow-x-auto [&_p]:my-1"
      label={
        <span className="inline-flex items-center gap-2">
          {label}
          <Badge variant="outline" className="h-5 px-1.5 text-xs">
            {sourceLabel}
          </Badge>
        </span>
      }
      summary={cleanSummary}
    >
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{cleanContent}</ReactMarkdown>
    </CollapsibleBlock>
  );
}

/** 从已解析的工具输入对象中提取折叠状态下的摘要信息 */
function getHeaderHintFromParsed(p: Record<string, unknown> | null): {
  primary?: string;
  secondary?: string;
} {
  if (!p) return {};
  const str = (v: unknown): string | undefined =>
    typeof v === "string" ? stripAnsiForDisplay(v) : undefined;

  if (str(p.file_path)) return { primary: str(p.file_path) };
  if (str(p.notebook_path)) return { primary: str(p.notebook_path) };
  if (str(p.pattern)) return { primary: str(p.pattern), secondary: str(p.path) };
  if (str(p.command)) return { primary: str(p.command) };
  if (str(p.url)) return { primary: str(p.url) };
  if (str(p.query)) return { primary: str(p.query) };
  if (str(p.description)) return { primary: str(p.description), secondary: str(p.subagent_type) };
  if (str(p.summary))
    return {
      primary: str(p.summary),
      secondary: str(p.to) ? `-> ${str(p.to)}` : undefined,
    };
  if (str(p.subject)) return { primary: str(p.subject) };
  if (str(p.taskId) || typeof p.taskId === "number") {
    return { primary: `#${p.taskId}`, secondary: str(p.status) };
  }
  if (str(p.operation) && str(p.filePath))
    return { primary: str(p.operation), secondary: str(p.filePath) };
  if (str(p.filePath)) return { primary: str(p.filePath) };
  if (str(p.path)) return { primary: str(p.path) };
  if (str(p.prompt)) return { primary: str(p.prompt) };
  return {};
}

function JsonCodeCard({ value }: { value: string }) {
  const editorTheme = useCodeMirrorTheme();

  return (
    <Card className="min-w-0 max-w-full gap-0 overflow-hidden rounded-md border bg-card p-0 py-0">
      <CodeMirror
        value={stripAnsiForDisplay(value)}
        extensions={JSON_EXTENSIONS}
        theme={editorTheme}
        editable={false}
        basicSetup={READONLY_CODEMIRROR_SETUP}
      />
    </Card>
  );
}

/** 工具输入参数渲染：JSON 对象按字段展示，字符串值用 Markdown 渲染 */
function InputPreview({
  inputPreview,
  parsedInput,
}: {
  inputPreview: string;
  parsedInput: Record<string, unknown> | null;
}) {
  if (parsedInput) {
    return (
      <div className="flex min-w-0 max-w-full flex-col gap-3">
        {Object.entries(parsedInput).map(([key, value]) => (
          <div key={key} className="min-w-0 max-w-full">
            <span className="block text-xs font-semibold text-muted-foreground">{key}</span>
            {typeof value === "string" ? (
              <MarkdownBlock className="text-sm leading-6">{value}</MarkdownBlock>
            ) : (
              <JsonCodeCard value={JSON.stringify(value, null, 2)} />
            )}
          </div>
        ))}
      </div>
    );
  }
  return <MarkdownBlock className="text-sm leading-6">{inputPreview}</MarkdownBlock>;
}

/** 工具调用折叠卡片 - 合并 tool_use 和可选的 tool_result */
function ToolCallCard({
  name,
  inputPreview,
  resultContent,
  inputLabel,
  resultLabel,
  toolLabel,
}: {
  name: string;
  inputPreview: string;
  resultContent?: string;
  inputLabel: string;
  resultLabel: string;
  toolLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  // 统一解析一次，供 getHeaderHintFromParsed / InputPreview / filePath 共用
  const parsedInput = useMemo<Record<string, unknown> | null>(() => {
    try {
      const p = JSON.parse(inputPreview);
      if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      /* 忽略解析失败 */
    }
    return null;
  }, [inputPreview]);

  const headerHint = getHeaderHintFromParsed(parsedInput);
  const filePath =
    typeof parsedInput?.file_path === "string" ? stripAnsiForDisplay(parsedInput.file_path) : "";
  const isFileTool = FILE_TOOLS.has(name) && !!filePath;

  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      data-slot="session-tool-card"
      className="min-w-0 max-w-full rounded-md border bg-card"
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-w-0 max-w-full justify-start gap-2 px-3 py-2 text-left whitespace-normal"
        >
          <Chevron className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Wrench className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">{toolLabel}</span>
          <span className="shrink-0 font-semibold">{stripAnsiForDisplay(name)}</span>
          {!expanded && headerHint.primary && (
            <span className="flex min-w-0 flex-1 gap-2 text-muted-foreground">
              <span className="min-w-0 truncate">{headerHint.primary}</span>
              {headerHint.secondary && (
                <span className="min-w-0 truncate">{headerHint.secondary}</span>
              )}
            </span>
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-3 py-3">
        <div className="flex min-w-0 max-w-full flex-col gap-3">
          {inputPreview && (
            <div className="min-w-0 max-w-full">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                {inputLabel}
              </span>
              <InputPreview inputPreview={inputPreview} parsedInput={parsedInput} />
            </div>
          )}
          {resultContent && (
            <div className="min-w-0 max-w-full">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                {resultLabel}
              </span>
              {isFileTool ? (
                <CodeResultBlock content={resultContent} filePath={filePath} />
              ) : (
                <MarkdownBlock className="text-sm leading-6">{resultContent}</MarkdownBlock>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function MessageImageBlock({
  block,
  t,
}: {
  block: Extract<MessageBlock, { type: "image" }>;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="min-w-0 max-w-full">
      {block.data ? (
        <figure
          data-slot="msg-image-figure"
          className="group/figure relative overflow-hidden rounded-md border"
        >
          <img
            src={`data:${block.media_type};base64,${block.data}`}
            alt={block.media_type}
            className="max-h-[500px] max-w-full object-contain group-data-[error]/figure:opacity-50"
            onError={(e) => {
              const fig = (e.target as HTMLElement).closest('[data-slot="msg-image-figure"]');
              if (fig) fig.setAttribute("data-error", "true");
            }}
          />
          <figcaption className="flex items-center gap-1.5 border-t bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
            <ImageIcon className="size-3.5" aria-hidden="true" />
            <span>
              {t("history.image")} · {stripAnsiForDisplay(block.media_type)}
            </span>
          </figcaption>
        </figure>
      ) : (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <ImageIcon className="size-4" aria-hidden="true" />
          <span>
            {t("history.image")} ({stripAnsiForDisplay(block.media_type)})
          </span>
        </div>
      )}
    </div>
  );
}

/** 渲染消息的 blocks 列表，相邻 tool_use + tool_result 自动合并为卡片 */
const MessageBlocks = memo(function MessageBlocks({
  blocks,
  t,
}: {
  blocks: MessageBlock[];
  t: (key: TranslationKey) => string;
}) {
  const elements: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    switch (block.type) {
      case "text": {
        const content = stripAnsiForDisplay(block.text);
        elements.push(
          <MarkdownBlock
            key={i}
            className="text-sm leading-6"
            variant={isErrorText(content) ? "error" : "default"}
          >
            {content}
          </MarkdownBlock>,
        );
        break;
      }
      case "thinking":
        elements.push(
          <ThinkingBlock key={i} thinking={block.thinking} label={t("history.thinking")} />,
        );
        break;
      case "tool_use": {
        const next = blocks[i + 1];
        const resultContent = next && next.type === "tool_result" ? next.content : undefined;
        elements.push(
          <ToolCallCard
            key={i}
            name={block.name}
            inputPreview={block.input_preview}
            resultContent={resultContent}
            inputLabel={t("history.toolInput")}
            resultLabel={t("history.toolResult")}
            toolLabel={t("history.toolUse")}
          />,
        );
        if (resultContent !== undefined) i++;
        break;
      }
      case "tool_result":
        elements.push(
          <MarkdownBlock key={i} className="text-sm leading-6">
            {block.content || "..."}
          </MarkdownBlock>,
        );
        break;
      case "command":
        elements.push(
          <CommandBlock key={i} name={block.name} args={block.args} label={t("history.command")} />,
        );
        break;
      case "system":
        elements.push(<SystemBlock key={i} summary={block.summary} label={t("history.system")} />);
        break;
      case "image":
        elements.push(<MessageImageBlock key={i} block={block} t={t} />);
        break;
      case "plan":
        elements.push(
          <PlanBlock
            key={i}
            summary={block.summary}
            content={block.content}
            label={t("history.plan")}
            sourceLabel={t("history.planSourceClaude")}
          />,
        );
        break;
    }
    i++;
  }
  return <>{elements}</>;
});

function MessageHoverActions({
  timestamp,
  onCopy,
  t,
}: {
  timestamp: string | null;
  onCopy: () => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div
      data-slot="session-message-actions"
      className="pointer-events-none absolute right-2 bottom-2 flex max-w-[calc(100%-1rem)] translate-y-1 items-center justify-end gap-1.5 rounded-md border bg-card/95 px-1 py-0.5 opacity-0 shadow-xs transition-[opacity,transform] duration-150 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none"
    >
      {timestamp && (
        <span className="text-right text-xs tabular-nums text-muted-foreground">{timestamp}</span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={t("history.copyMessage")}
        title={t("history.copyMessage")}
        onClick={(event) => {
          event.stopPropagation();
          onCopy();
        }}
      >
        <Copy aria-hidden="true" />
      </Button>
    </div>
  );
}

function EventMessage({
  msg,
  t,
  onCopy,
}: {
  msg: SessionMessage;
  t: (key: TranslationKey) => string;
  onCopy: () => void;
}) {
  const timestamp = formatTimestamp(msg.timestamp);

  return (
    <div
      data-slot="session-event"
      className="group grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_2rem] gap-3"
    >
      <div className="col-start-1 row-start-1 flex flex-col items-center gap-1 pt-1 text-xs text-muted-foreground">
        <span className="flex size-7 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-xs">
          <Clock3 className="size-3.5" aria-hidden="true" />
        </span>
        <span className="font-semibold leading-none">{t("history.event")}</span>
      </div>
      <div className="relative col-start-2 row-start-1 min-w-0 rounded-md border bg-card px-3 py-2 shadow-xs transition-colors group-hover:border-muted-foreground/40 group-focus-within:border-muted-foreground/40">
        <div className="flex min-w-0 flex-col gap-2">
          <MessageBlocks blocks={msg.blocks} t={t} />
        </div>
        <MessageHoverActions timestamp={timestamp} onCopy={onCopy} t={t} />
      </div>
    </div>
  );
}

function RoleIcon({ role }: { role: SessionMessage["role"] }) {
  if (role === "assistant") return <Bot className="size-4" aria-hidden="true" />;
  return <User className="size-4" aria-hidden="true" />;
}

function ConversationMessage({
  msg,
  presentation,
  t,
  onCopy,
}: {
  msg: SessionMessage;
  presentation: MessagePresentation;
  t: (key: TranslationKey) => string;
  onCopy: () => void;
}) {
  const roleLabel = msg.role === "assistant" ? t("history.roleAssistant") : t("history.roleUser");
  const timestamp = formatTimestamp(msg.timestamp);
  const isError = presentation.tone === "error";
  const isUser = msg.role === "user";

  return (
    <article
      data-slot="session-message"
      data-role={msg.role}
      data-variant={isError ? "error" : undefined}
      className="group grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_2rem] gap-3"
    >
      <div
        className={cn(
          "row-start-1 flex flex-col items-center gap-1 pt-1 text-xs text-muted-foreground",
          isUser ? "col-start-3" : "col-start-1",
        )}
      >
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full border bg-background text-muted-foreground",
            msg.role === "assistant" && "bg-primary/10 text-primary",
            isUser && "bg-card text-foreground",
            isError && "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {isError ? (
            <AlertTriangle className="size-4" aria-hidden="true" />
          ) : (
            <RoleIcon role={msg.role} />
          )}
        </span>
        <span className={cn("font-semibold leading-none", isError && "text-destructive")}>
          {roleLabel}
        </span>
      </div>
      <div
        className={cn(
          "relative col-start-2 row-start-1 min-w-0 rounded-md border bg-card px-4 py-3 transition-colors group-hover:border-muted-foreground/40 group-focus-within:border-muted-foreground/40",
          isError &&
            "border-destructive/40 bg-destructive/5 group-hover:border-destructive/60 group-focus-within:border-destructive/60",
        )}
      >
        <div className="flex min-w-0 max-w-3xl flex-col gap-2 text-foreground">
          <MessageBlocks blocks={msg.blocks} t={t} />
        </div>
        <MessageHoverActions timestamp={timestamp} onCopy={onCopy} t={t} />
      </div>
    </article>
  );
}

interface Props {
  project: string;
  sessionId: string;
  onClose: () => void;
}

function SessionDetailDrawer({ project, sessionId, onClose }: Props) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    invoke<SessionDetail>("get_session_detail", { project, sessionId })
      .then(setDetail)
      .catch(() => showToast(t("history.noData"), "error"))
      .finally(() => setLoading(false));
  }, [project, sessionId, showToast, t]);

  const messages = detail?.messages;
  const headerProject = detail?.project ?? project;
  const messageMeta = messages
    ? formatMessageCount(messages.length, t("history.messageCountUnit"))
    : null;
  const timeRange = messages ? formatDateRange(messages, t("history.timeUnknown")) : null;
  const handleCopyMessage = async (message: SessionMessage) => {
    try {
      const content = messageToCopyText(message, t);
      if (!content) throw new Error("empty message");
      await navigator.clipboard.writeText(content);
      showToast(t("history.messageCopied"));
    } catch {
      showToast(t("history.messageCopyError"), "error");
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="left-[60px] w-auto min-w-0 gap-0 overflow-hidden border-l bg-secondary p-0 sm:max-w-none max-[700px]:left-[48px]"
      >
        <SheetHeader className="shrink-0 border-b bg-card/95 px-5 py-4 pr-12 shadow-toolbar">
          <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="flex min-w-0 flex-wrap items-baseline gap-2 text-base">
                <span>{t("history.conversation")}</span>
                <span className="min-w-0 font-mono text-muted-foreground">
                  {sessionId.slice(0, 8)}
                </span>
              </SheetTitle>
              <SheetDescription className="mt-1 truncate">
                {stripAnsiForDisplay(headerProject)}
              </SheetDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-4"
              onClick={onClose}
              title={t("common.close")}
            >
              <X className="size-4" />
              <span className="sr-only">{t("common.close")}</span>
            </Button>
          </div>
          {messageMeta && timeRange && (
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="gap-1.5 rounded-md px-2 py-1 font-normal">
                <MessageSquare className="size-3.5" aria-hidden="true" />
                {messageMeta}
              </Badge>
              <span className="flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 tabular-nums">
                <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">{timeRange}</span>
              </span>
            </div>
          )}
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            {t("loading")}
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            {t("history.noData")}
          </div>
        ) : (
          <div className="min-w-0 flex-1 overflow-y-auto bg-secondary">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-5 max-sm:px-3">
              {messages.map((msg) => {
                const presentation = getMessagePresentation(msg);
                const messageKey = `${msg.timestamp ?? "untimed"}-${messageToCopyText(msg, t)}`;
                return presentation.kind === "event" ? (
                  <EventMessage
                    key={messageKey}
                    msg={msg}
                    t={t}
                    onCopy={() => void handleCopyMessage(msg)}
                  />
                ) : (
                  <ConversationMessage
                    key={messageKey}
                    msg={msg}
                    presentation={presentation}
                    t={t}
                    onCopy={() => void handleCopyMessage(msg)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default SessionDetailDrawer;
