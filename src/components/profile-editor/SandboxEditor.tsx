import { useEffect, useMemo } from "react";
import { useI18n } from "../../i18n";
import { readObject } from "./editor-utils";

interface SandboxEditorProps {
  value: unknown;
  onError: (message: string) => void;
}

interface SandboxPresentation {
  enabled: boolean;
  extraKeys: string[];
  headerSummary: string;
  detailSummary: string;
  emptyState: string;
}

interface SandboxSwitchControlProps {
  enabled: boolean;
  isZh: boolean;
  ariaLabel: string;
  onToggle: () => void;
  variant?: "header" | "panel";
  visibleLabel?: string;
}

function buildHeaderSummary(extraKeysCount: number, enabled: boolean, isZh: boolean): string {
  if (extraKeysCount === 0) {
    return enabled
      ? isZh
        ? "已启用 · 无附加配置"
        : "Enabled · No additional configuration"
      : isZh
        ? "已关闭 · 无附加配置"
        : "Disabled · No additional configuration";
  }

  return enabled
    ? isZh
      ? `已启用 · ${extraKeysCount} 个附加配置键`
      : `Enabled · ${extraKeysCount} additional keys`
    : isZh
      ? `已关闭 · ${extraKeysCount} 个附加配置键`
      : `Disabled · ${extraKeysCount} additional keys`;
}

function buildDetailSummary(extraKeysCount: number, enabled: boolean, isZh: boolean): string {
  if (extraKeysCount === 0) {
    if (enabled) {
      return isZh
        ? "当前仅启用沙盒，没有附加配置。"
        : "Sandbox is enabled with no extra configuration.";
    }
    return isZh
      ? "当前未启用沙盒，也没有附加配置。"
      : "Sandbox is disabled and has no extra configuration.";
  }

  return isZh
    ? `当前有 ${extraKeysCount} 个附加配置键。`
    : `There are ${extraKeysCount} additional configuration keys.`;
}

export function getSandboxPresentation(value: unknown, isZh: boolean): SandboxPresentation {
  const sandboxObject = readObject(value);
  const enabled = sandboxObject.enabled === true;
  const extraKeys = Object.keys(sandboxObject)
    .filter((key) => key !== "enabled")
    .sort();

  return {
    enabled,
    extraKeys,
    headerSummary: buildHeaderSummary(extraKeys.length, enabled, isZh),
    detailSummary: buildDetailSummary(extraKeys.length, enabled, isZh),
    emptyState: isZh
      ? "没有附加的 sandbox 配置键。"
      : "There are no additional sandbox configuration keys.",
  };
}

export function setSandboxEnabled(value: unknown, enabled: boolean): Record<string, unknown> {
  const sandboxObject = readObject(value);
  const nextSandbox = { ...sandboxObject };
  if (enabled) {
    nextSandbox.enabled = true;
  } else {
    delete nextSandbox.enabled;
  }
  return nextSandbox;
}

export function SandboxSwitchControl({
  enabled,
  isZh,
  ariaLabel,
  onToggle,
  variant = "panel",
  visibleLabel,
}: SandboxSwitchControlProps) {
  const statusText = enabled ? (isZh ? "已启用" : "Enabled") : isZh ? "已关闭" : "Disabled";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      className={`profile-sandbox-switch profile-sandbox-switch-compact profile-sandbox-switch-${variant}${visibleLabel ? " profile-sandbox-switch-with-label" : ""}${enabled ? " is-on" : ""}`}
      onClick={onToggle}
    >
      {visibleLabel ? <span className="profile-sandbox-switch-label">{visibleLabel}</span> : null}
      <span className="profile-sandbox-switch-track" aria-hidden="true">
        <span className="profile-sandbox-switch-thumb" />
      </span>
      {variant === "panel" ? (
        <span className={`profile-sandbox-switch-status${enabled ? " is-on" : ""}`}>
          {statusText}
        </span>
      ) : null}
    </button>
  );
}

function SandboxEditor({ value, onError }: SandboxEditorProps) {
  const { language } = useI18n();
  const isZh = language === "zh";
  const presentation = useMemo(() => getSandboxPresentation(value, isZh), [value, isZh]);

  useEffect(() => {
    onError("");
  }, [onError]);

  return (
    <div className="profile-section-body">
      <div className="profile-subsection-header">
        <div>
          <h4>{isZh ? "沙盒状态" : "Sandbox Status"}</h4>
        </div>
      </div>

      <section className="profile-mini-card profile-sandbox-status-card">
        <div className="profile-sandbox-state-copy">
          <strong>
            {isZh
              ? `当前状态：${presentation.enabled ? "已启用" : "已关闭"}`
              : `Current status: ${presentation.enabled ? "Enabled" : "Disabled"}`}
          </strong>
          <span>{presentation.detailSummary}</span>
        </div>

        {presentation.extraKeys.length > 0 ? (
          <div className="profile-chip-list">
            {presentation.extraKeys.map((key) => (
              <span key={key} className="profile-key-badge">
                {key}
              </span>
            ))}
          </div>
        ) : (
          <div className="profile-empty-state">{presentation.emptyState}</div>
        )}
      </section>
    </div>
  );
}

export default SandboxEditor;
