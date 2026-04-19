import { useEffect, useMemo } from "react";
import { useI18n } from "../../i18n";
import { readObject } from "./editor-utils";

interface SandboxEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
  onError: (message: string) => void;
}

function buildSummaryText(extraKeysCount: number, enabled: boolean, isZh: boolean): string {
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

function SandboxEditor({ value, onChange, onError }: SandboxEditorProps) {
  const { language } = useI18n();
  const isZh = language === "zh";
  const sandboxObject = useMemo(() => readObject(value), [value]);
  const sandboxEnabled = sandboxObject.enabled === true;
  const extraKeys = useMemo(
    () =>
      Object.keys(sandboxObject)
        .filter((key) => key !== "enabled")
        .sort(),
    [sandboxObject],
  );

  useEffect(() => {
    onError("");
  }, [onError]);

  function handleToggleChange(checked: boolean) {
    const nextSandbox = { ...sandboxObject };
    if (checked) {
      nextSandbox.enabled = true;
    } else {
      delete nextSandbox.enabled;
    }
    if (JSON.stringify(nextSandbox) !== JSON.stringify(sandboxObject)) {
      onChange(nextSandbox);
    }
  }

  return (
    <div className="profile-section-body">
      <div className="profile-subsection-header">
        <div>
          <h4>{isZh ? "沙盒开关" : "Sandbox Toggle"}</h4>
          <p>{isZh ? "日常只控制启用状态。" : "Use the top-level toggle for everyday changes."}</p>
        </div>
      </div>

      <label className="profile-toggle-item">
        <input
          type="checkbox"
          aria-label={isZh ? "启用 Sandbox" : "Enable sandbox"}
          checked={sandboxEnabled}
          onChange={(event) => handleToggleChange(event.target.checked)}
        />
        <span>{isZh ? "启用 Sandbox" : "Enable sandbox"}</span>
      </label>

      <section className="profile-mini-card">
        <div className="profile-hook-summary-head">
          <strong>
            {sandboxEnabled ? (isZh ? "已启用" : "Enabled") : isZh ? "已关闭" : "Disabled"}
          </strong>
          <span className="profile-hook-summary-meta">
            {buildSummaryText(extraKeys.length, sandboxEnabled, isZh)}
          </span>
        </div>

        {extraKeys.length > 0 ? (
          <div className="profile-chip-list">
            {extraKeys.map((key) => (
              <span key={key} className="profile-key-badge">
                {key}
              </span>
            ))}
          </div>
        ) : (
          <div className="profile-empty-state">
            {isZh
              ? "没有附加的 sandbox 配置键。"
              : "There are no additional sandbox configuration keys."}
          </div>
        )}
      </section>
    </div>
  );
}

export default SandboxEditor;
