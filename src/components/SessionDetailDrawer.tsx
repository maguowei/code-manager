import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionDetail, MessageBlock, isTauri } from "../types";
import { useI18n } from "../i18n";
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
      <button className="msg-thinking-toggle" onClick={() => setExpanded(!expanded)}>
        {expanded ? "▼" : "▶"} {label}
      </button>
      {expanded && <div className="msg-thinking-content">{thinking}</div>}
    </div>
  );
}

/** 渲染单个内容块 */
function BlockRenderer({ block }: { block: MessageBlock }) {
  const { t } = useI18n();
  switch (block.type) {
    case "text":
      return <div className="msg-block">{block.text}</div>;
    case "thinking":
      return <ThinkingBlock thinking={block.thinking} label={t("history.thinking")} />;
    case "tool_use":
      return (
        <div className="msg-block msg-tool-use">
          <span>🛠</span>
          <span className="msg-tool-name">{block.name}</span>
          {block.input_preview && (
            <span className="msg-tool-preview">{block.input_preview}</span>
          )}
        </div>
      );
    case "tool_result":
      return (
        <div className="msg-block msg-tool-result">
          ← {block.content_preview || "..."}
        </div>
      );
    default:
      return null;
  }
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
                <span className="session-msg-role">{msg.role}</span>
                <div className="session-msg-bubble">
                  {msg.blocks.map((block, j) => (
                    <BlockRenderer key={j} block={block} />
                  ))}
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
