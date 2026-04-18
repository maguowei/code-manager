import { type DragEvent, type MouseEvent, memo, useCallback, useState } from "react";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type { ClaudeConfig, Provider } from "../types";
import { TrashIcon } from "./Icons";
import "./ConfigItem.css";

interface ConfigItemProps {
  config: ClaudeConfig;
  index: number;
  isActive: boolean;
  isEditing: boolean;
  isDragging: boolean;
  dragOverPosition: "above" | "below" | null;
  providers: Provider[];
  onActivate: (id: string) => void;
  onEdit: (config: ClaudeConfig) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, index: number) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, index: number) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>, index: number) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, index: number) => void;
}

function ConfigItem({
  config,
  index,
  isActive,
  isEditing,
  isDragging,
  dragOverPosition,
  providers,
  onActivate,
  onEdit,
  onDelete,
  onDuplicate,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: ConfigItemProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [envCopied, setEnvCopied] = useState(false);

  // 派生关联的 Provider 名称，用于显示 badge
  const providerName = config.providerId
    ? (providers.find((p) => p.id === config.providerId)?.name ?? null)
    : null;

  const classNames = [
    "config-item",
    isActive ? "active" : "",
    isEditing ? "editing" : "",
    isDragging ? "dragging" : "",
    dragOverPosition === "above" ? "drag-over-above" : "",
    dragOverPosition === "below" ? "drag-over-below" : "",
  ]
    .filter(Boolean)
    .join(" ");

  function handleActionClick(e: MouseEvent<HTMLButtonElement>, action: () => void) {
    e.stopPropagation();
    action();
  }

  function buildEnvExport(cfg: ClaudeConfig): string {
    const lines: string[] = [];
    lines.push(`export ANTHROPIC_AUTH_TOKEN="${cfg.apiKey}"`);
    // baseUrl 优先，为空时回退到 Provider 的默认值
    const effectiveBaseUrl =
      cfg.baseUrl ||
      (cfg.providerId ? providers.find((p) => p.id === cfg.providerId)?.baseUrl : undefined);
    if (effectiveBaseUrl) lines.push(`export ANTHROPIC_BASE_URL="${effectiveBaseUrl}"`);
    if (cfg.model) lines.push(`export ANTHROPIC_MODEL="${cfg.model}"`);
    if (cfg.haikuModel) lines.push(`export ANTHROPIC_DEFAULT_HAIKU_MODEL="${cfg.haikuModel}"`);
    if (cfg.sonnetModel) lines.push(`export ANTHROPIC_DEFAULT_SONNET_MODEL="${cfg.sonnetModel}"`);
    if (cfg.opusModel) lines.push(`export ANTHROPIC_DEFAULT_OPUS_MODEL="${cfg.opusModel}"`);
    if (cfg.effortLevel) lines.push(`export CLAUDE_CODE_EFFORT_LEVEL="${cfg.effortLevel}"`);
    return lines.join("\n");
  }

  function handleCopyEnv(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    navigator.clipboard
      .writeText(buildEnvExport(config))
      .then(() => {
        setEnvCopied(true);
        showToast(t("configItem.envCopied"), "success");
        setTimeout(() => setEnvCopied(false), 2000);
      })
      .catch(() => {
        showToast(t("configItem.envCopyFailed"), "error");
      });
  }

  // 包裹拖拽回调，将 index 传入
  const handleDragStartWrap = useCallback(
    (e: DragEvent<HTMLDivElement>) => onDragStart(e, index),
    [onDragStart, index],
  );
  const handleDragOverWrap = useCallback(
    (e: DragEvent<HTMLDivElement>) => onDragOver(e, index),
    [onDragOver, index],
  );
  const handleDragLeaveWrap = useCallback(
    (e: DragEvent<HTMLDivElement>) => onDragLeave(e, index),
    [onDragLeave, index],
  );
  const handleDropWrap = useCallback(
    (e: DragEvent<HTMLDivElement>) => onDrop(e, index),
    [onDrop, index],
  );

  // 包裹 CRUD 回调
  const handleActivate = useCallback(() => onActivate(config.id), [onActivate, config.id]);
  const handleEdit = useCallback(() => onEdit(config), [onEdit, config]);
  const handleDelete = useCallback(() => onDelete(config.id), [onDelete, config.id]);
  const handleDuplicate = useCallback(() => onDuplicate(config.id), [onDuplicate, config.id]);

  return (
    <div
      className={classNames}
      draggable
      onClick={handleEdit}
      onDragStart={handleDragStartWrap}
      onDragEnd={onDragEnd}
      onDragOver={handleDragOverWrap}
      onDragLeave={handleDragLeaveWrap}
      onDrop={handleDropWrap}
    >
      {/* 头部区域（右上角放置启用/状态与复制） */}
      <div className="config-header">
        <div className="config-badge">
          <span className="badge-text">{config.name?.charAt(0)?.toUpperCase() || "C"}</span>
        </div>

        <div className="config-title">
          <div className="config-name">
            {config.name}
            {providerName && <span className="config-provider-badge">{providerName}</span>}
          </div>
          {config.description && <div className="config-description">{config.description}</div>}
        </div>

        <div className="config-header-actions">
          {isEditing && <span className="status-editing">{t("configItem.editing")}</span>}
          {isActive ? (
            <span className="status-active">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {t("configItem.inUse")}
            </span>
          ) : (
            <button
              type="button"
              className="action-btn activate-btn compact"
              onClick={(e) => handleActionClick(e, handleActivate)}
              title={t("configItem.activateTitle")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>{t("configItem.activate")}</span>
            </button>
          )}
        </div>
      </div>

      {/* 元信息区域 - 仅在有 model 或 plugins 时显示 */}
      {(config.model || config.enabledPlugins) && (
        <div className="config-meta">
          {config.model && (
            <div className="config-meta-item">
              <svg
                className="config-meta-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <div className="config-meta-main">
                <span>
                  {config.model.substring(0, 30)}
                  {config.model.length > 30 ? "..." : ""}
                </span>
                {config.effortLevel && (
                  <span className="config-meta-effort">{config.effortLevel}</span>
                )}
              </div>
            </div>
          )}
          {config.enabledPlugins && Object.keys(config.enabledPlugins).length > 0 && (
            <div className="config-meta-item">
              <svg
                className="config-meta-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="9" x2="15" y2="9" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              <span>
                {Object.keys(config.enabledPlugins).length} {t("configItem.plugins")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="config-actions">
        <button
          type="button"
          className={`action-btn icon-only${envCopied ? " copied" : ""}`}
          onClick={handleCopyEnv}
          title={envCopied ? t("configItem.envCopied") : t("configItem.copyEnv")}
          aria-label={t("configItem.copyEnv")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </button>
        <button
          type="button"
          className="action-btn icon-only"
          onClick={(e) => handleActionClick(e, handleDuplicate)}
          title={t("configItem.duplicate")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
        <button
          type="button"
          className="action-btn icon-only delete"
          onClick={(e) => handleActionClick(e, handleDelete)}
          title={t("configItem.delete")}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

export default memo(ConfigItem);
