import { useState, useEffect, useCallback, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { SessionDetail, MessageBlock, isTauri } from "../types";
import { useI18n, type TranslationKey } from "../i18n";
import useEscapeKey from "../hooks/useEscapeKey";
import { useToast } from "../hooks/useToast";
import "./SessionDetailDrawer.css";

/** 根据文件扩展名获取 Prism 语言标识 */
function langFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    rs: "rust", py: "python", sh: "bash", bash: "bash", zsh: "bash",
    css: "css", scss: "scss", html: "html", xml: "xml",
    json: "json", toml: "toml", yaml: "yaml", yml: "yaml",
    md: "markdown", mdx: "markdown", sql: "sql", go: "go",
    java: "java", kt: "kotlin", swift: "swift", c: "c", cpp: "cpp",
    rb: "ruby", php: "php", r: "r",
  };
  return map[ext] ?? "text";
}

/** 剥离 Read 工具返回内容中的行号前缀（如 "     1\t"） */
function stripLineNumbers(content: string): string {
  return content.replace(/^ *\d+\t/gm, "");
}

/** 文件类工具的返回结果用代码高亮渲染 */
function CodeResultBlock({ content, filePath }: { content: string; filePath: string }) {
  const lang = langFromPath(filePath);
  const code = stripLineNumbers(content);
  return (
    <SyntaxHighlighter
      language={lang}
      style={vscDarkPlus}
      customStyle={{
        margin: 0,
        borderRadius: "var(--radius-sm)",
        fontSize: "var(--font-xs)",
        maxHeight: "400px",
        overflowY: "auto",
        background: "var(--bg-primary)",
      }}
      wrapLongLines={false}
      showLineNumbers
      lineNumberStyle={{ opacity: 0.4, fontSize: "10px", minWidth: "2.5em" }}
    >
      {code}
    </SyntaxHighlighter>
  );
}

interface Props {
  project: string;
  sessionId: string;
  onClose: () => void;
}

/** 渲染单个 thinking 块（可折叠） */
function ThinkingBlock({ thinking, label }: { thinking: string; label: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="msg-block">
      <button className="msg-thinking-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? "\u25BC" : "\u25B6"} {label}
      </button>
      {expanded && <div className="msg-thinking-content msg-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{thinking}</ReactMarkdown></div>}
    </div>
  );
}

/** 渲染斜杠命令块 */
function CommandBlock({ name, args }: { name: string; args?: string }) {
  return (
    <div className="msg-block msg-command">
      <span className="msg-command-prompt">&gt;</span>
      <span className="msg-command-name">{name}</span>
      {args && <span className="msg-command-args">{args}</span>}
    </div>
  );
}

/** 渲染系统信息块（可折叠） */
function SystemBlock({ summary, label }: { summary: string; label: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="msg-block msg-system">
      <button className="msg-system-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? "\u25BC" : "\u25B6"} {label}
      </button>
      {expanded && <div className="msg-system-content">{summary}</div>}
    </div>
  );
}

/** 渲染计划块（可折叠） */
function PlanBlock({ summary, content, label }: { summary: string; content: string; label: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="msg-block msg-plan">
      <button className="msg-plan-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span className="msg-plan-icon">&#x1f4cb;</span>
        <span className="msg-plan-label">{label}</span>
        <span className="msg-plan-claude-badge">Claude</span>
        <span className="msg-plan-summary">{summary}</span>
        <span className="msg-plan-arrow">{expanded ? "\u25BC" : "\u25B6"}</span>
      </button>
      {expanded && (
        <div className="msg-plan-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

/** 智能渲染工具输入参数：JSON 对象按字段展示，字符串值用 Markdown 渲染 */
function renderInputPreview(inputPreview: string) {
  try {
    const parsed = JSON.parse(inputPreview);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return (
        <div className="msg-tool-card-input-fields">
          {Object.entries(parsed).map(([key, value]) => (
            <div key={key} className="msg-tool-card-field">
              <span className="msg-tool-card-field-key">{key}</span>
              {typeof value === "string" ? (
                <div className="msg-tool-card-field-value msg-tool-card-result msg-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
                </div>
              ) : (
                <pre className="msg-tool-card-field-value msg-tool-card-code">
                  {JSON.stringify(value, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      );
    }
  } catch {
    // 解析失败，回退到 Markdown 渲染
  }
  return (
    <div className="msg-tool-card-result msg-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{inputPreview}</ReactMarkdown>
    </div>
  );
}

/** 从工具输入 JSON 中提取折叠状态下显示的摘要信息 */
function getHeaderHint(inputPreview: string): { primary?: string; secondary?: string } {
  try {
    const p = JSON.parse(inputPreview);
    if (!p || typeof p !== "object" || Array.isArray(p)) return {};
    const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

    // 文件路径类：Read / Write / Edit / NotebookRead / NotebookEdit
    if (str(p.file_path))     return { primary: p.file_path };
    if (str(p.notebook_path)) return { primary: p.notebook_path };

    // Grep / Glob：pattern + 可选 path
    if (str(p.pattern)) return { primary: p.pattern, secondary: str(p.path) };

    // Bash：展示命令
    if (str(p.command)) return { primary: p.command };

    // WebFetch：展示 URL
    if (str(p.url)) return { primary: p.url };

    // WebSearch：展示查询词
    if (str(p.query)) return { primary: p.query };

    // Agent：展示描述
    if (str(p.description)) return { primary: p.description, secondary: str(p.subagent_type) };

    // SendMessage：展示摘要 + 收件人
    if (str(p.summary)) return { primary: p.summary, secondary: str(p.to) ? `→ ${p.to}` : undefined };

    // Task 工具：TaskCreate
    if (str(p.subject)) return { primary: p.subject };

    // TaskUpdate：任务 ID + 状态
    if (str(p.taskId) || typeof p.taskId === "number") {
      const id = `#${p.taskId}`;
      return { primary: id, secondary: str(p.status) };
    }

    // LSP：操作类型 + 文件路径
    if (str(p.operation) && str(p.filePath)) return { primary: p.operation, secondary: p.filePath };
    if (str(p.filePath)) return { primary: p.filePath };

    // LS / Glob path-only
    if (str(p.path)) return { primary: p.path };

    // CronCreate：展示 prompt 前段
    if (str(p.prompt)) return { primary: p.prompt };
  } catch { /* 忽略解析失败 */ }
  return {};
}

/** 工具调用折叠卡片 - 合并 tool_use 和可选的 tool_result */
function ToolCallCard({
  name,
  inputPreview,
  resultContent,
  inputLabel,
  resultLabel,
}: {
  name: string;
  inputPreview: string;
  resultContent?: string;
  inputLabel: string;
  resultLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const headerHint = getHeaderHint(inputPreview);

  // 从 inputPreview 提取 file_path，用于代码高亮
  let filePath: string | undefined;
  try {
    const p = JSON.parse(inputPreview);
    if (p && typeof p.file_path === "string") filePath = p.file_path;
  } catch { /* 忽略 */ }

  // 文件类工具（Read/Write/Edit）的结果用代码高亮渲染
  const FILE_TOOLS = new Set(["Read", "Write", "Edit", "NotebookRead", "NotebookEdit"]);
  const isFileTool = FILE_TOOLS.has(name) && !!filePath;
  return (
    <div className="msg-block msg-tool-card">
      <button className="msg-tool-card-header" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span className="msg-tool-card-icon">&#x1f6e0;</span>
        <span className="msg-tool-card-name">{name}</span>
        {!expanded && headerHint.primary && (
          <span className="msg-tool-card-header-hint">
            <span className="msg-tool-card-filepath">{headerHint.primary}</span>
            {headerHint.secondary && (
              <span className="msg-tool-card-header-path">{headerHint.secondary}</span>
            )}
          </span>
        )}
        <span className="msg-tool-card-arrow">{expanded ? "\u25BC" : "\u25B6"}</span>
      </button>
      {expanded && (
        <div className="msg-tool-card-body">
          {inputPreview && (
            <div className="msg-tool-card-section">
              <span className="msg-tool-card-label">{inputLabel}</span>
              {renderInputPreview(inputPreview)}
            </div>
          )}
          {resultContent && (
            <div className="msg-tool-card-section">
              <span className="msg-tool-card-label">{resultLabel}</span>
              {isFileTool ? (
                <CodeResultBlock content={resultContent} filePath={filePath!} />
              ) : (
                <div className="msg-tool-card-result msg-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{resultContent}</ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 将 blocks 列表中相邻的 tool_use + tool_result 合并渲染 */
function renderBlocks(blocks: MessageBlock[], t: (key: TranslationKey) => string) {
  const elements: ReactNode[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    switch (block.type) {
      case "text":
        elements.push(
          <div key={i} className="msg-block msg-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
          </div>
        );
        break;
      case "thinking":
        elements.push(<ThinkingBlock key={i} thinking={block.thinking} label={t("history.thinking")} />);
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
          />
        );
        if (resultContent !== undefined) i++;
        break;
      }
      case "tool_result":
        elements.push(
          <div key={i} className="msg-block msg-tool-result msg-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content || "..."}</ReactMarkdown>
          </div>
        );
        break;
      case "command":
        elements.push(<CommandBlock key={i} name={block.name} args={block.args} />);
        break;
      case "system":
        elements.push(<SystemBlock key={i} summary={block.summary} label={t("history.system")} />);
        break;
      case "image":
        elements.push(
          <div key={i} className="msg-block msg-image-wrapper">
            {block.data ? (
              <figure className="msg-image-figure">
                <img
                  src={`data:${block.media_type};base64,${block.data}`}
                  alt={block.media_type}
                  className="msg-image-preview"
                  onError={(e) => {
                    const fig = (e.target as HTMLElement).closest(".msg-image-figure");
                    if (fig) fig.classList.add("msg-image-error");
                  }}
                />
                <figcaption className="msg-image-caption">
                  <span className="msg-image-icon">&#x1f5bc;</span>
                  <span>{t("history.image")} · {block.media_type}</span>
                </figcaption>
              </figure>
            ) : (
              <div className="msg-image-placeholder">
                <span className="msg-image-icon">&#x1f5bc;</span>
                <span className="msg-image-label">{t("history.image")} ({block.media_type})</span>
              </div>
            )}
          </div>
        );
        break;
      case "plan":
        elements.push(
          <PlanBlock key={i} summary={block.summary} content={block.content} label={t("history.plan")} />
        );
        break;
    }
    i++;
  }
  return elements;
}

function SessionDetailDrawer({ project, sessionId, onClose }: Props) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const handleClose = useCallback(() => onClose(), [onClose]);
  useEscapeKey(handleClose);

  useEffect(() => {
    if (!isTauri()) { setLoading(false); return; }
    setLoading(true);
    invoke<SessionDetail>("get_session_detail", { project, sessionId })
      .then(setDetail)
      .catch(() => showToast(t("history.noData"), "error"))
      .finally(() => setLoading(false));
  }, [project, sessionId, showToast, t]);

  return (
    <>
      <div className="session-detail-overlay visible" onClick={handleClose} />
      <div className="session-detail-drawer open">
        {/* 顶部标题栏 - 复用 editor-header 样式 */}
        <div className="editor-header">
          <button className="editor-back-btn" onClick={handleClose} title={t("common.close")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 4L4 12M4 4l8 8" />
            </svg>
          </button>
          <h2>{t("history.conversation")} — {sessionId.slice(0, 8)}</h2>
        </div>

        {/* 内容区 */}
        {loading ? (
          <div className="session-detail-loading">{t("loading")}</div>
        ) : !detail || detail.messages.length === 0 ? (
          <div className="session-detail-empty">{t("history.noData")}</div>
        ) : (
          <div className="session-detail-messages">
            {detail.messages.map((msg, i) => (
              <div key={i} className={`session-msg ${msg.role}`}>
                <div className="session-msg-header">
                  <span className={`session-msg-avatar ${msg.role}`}>
                    {msg.role === "user" ? "U" : "A"}
                  </span>
                  <span className="session-msg-role">
                    {msg.role === "user" ? t("history.roleUser") : t("history.roleAssistant")}
                  </span>
                  {msg.timestamp && (
                    <span className="session-msg-time">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="session-msg-bubble">
                  {renderBlocks(msg.blocks, t)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default SessionDetailDrawer;
