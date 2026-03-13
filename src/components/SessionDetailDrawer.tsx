import { useState, useEffect, useCallback, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionDetail, MessageBlock, isTauri } from "../types";
import { useI18n, type TranslationKey } from "../i18n";
import useEscapeKey from "../hooks/useEscapeKey";
import { useToast } from "../hooks/useToast";
import "./SessionDetailDrawer.css";

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
      {expanded && <div className="msg-thinking-content">{thinking}</div>}
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

/** 工具调用折叠卡片 - 合并 tool_use 和可选的 tool_result */
function ToolCallCard({
  name,
  inputPreview,
  resultPreview,
  inputLabel,
  resultLabel,
}: {
  name: string;
  inputPreview: string;
  resultPreview?: string;
  inputLabel: string;
  resultLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="msg-block msg-tool-card">
      <button className="msg-tool-card-header" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span className="msg-tool-card-icon">&#x1f6e0;</span>
        <span className="msg-tool-card-name">{name}</span>
        <span className="msg-tool-card-arrow">{expanded ? "\u25BC" : "\u25B6"}</span>
      </button>
      {expanded && (
        <div className="msg-tool-card-body">
          {inputPreview && (
            <div className="msg-tool-card-section">
              <span className="msg-tool-card-label">{inputLabel}</span>
              <pre className="msg-tool-card-code">{inputPreview}</pre>
            </div>
          )}
          {resultPreview && (
            <div className="msg-tool-card-section">
              <span className="msg-tool-card-label">{resultLabel}</span>
              <pre className="msg-tool-card-code">{resultPreview}</pre>
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
        elements.push(<div key={i} className="msg-block">{block.text}</div>);
        break;
      case "thinking":
        elements.push(<ThinkingBlock key={i} thinking={block.thinking} label={t("history.thinking")} />);
        break;
      case "tool_use": {
        const next = blocks[i + 1];
        const resultPreview = next && next.type === "tool_result" ? next.content_preview : undefined;
        elements.push(
          <ToolCallCard
            key={i}
            name={block.name}
            inputPreview={block.input_preview}
            resultPreview={resultPreview}
            inputLabel={t("history.toolInput")}
            resultLabel={t("history.toolResult")}
          />
        );
        if (resultPreview !== undefined) i++;
        break;
      }
      case "tool_result":
        elements.push(
          <div key={i} className="msg-block msg-tool-result">
            \u2190 {block.content_preview || "..."}
          </div>
        );
        break;
      case "command":
        elements.push(<CommandBlock key={i} name={block.name} args={block.args} />);
        break;
      case "system":
        elements.push(<SystemBlock key={i} summary={block.summary} label={t("history.system")} />);
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
                    <span className="session-msg-time">{msg.timestamp}</span>
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
