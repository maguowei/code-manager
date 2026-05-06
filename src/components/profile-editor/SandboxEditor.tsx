import { Plus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useI18n } from "../../i18n";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { readObject } from "./editor-utils";
import { hasRecommendedSandboxPreset, mergeRecommendedSandboxPreset } from "./sandbox-presets";

interface SandboxEditorProps {
  value: unknown;
  onChange: (next: Record<string, unknown>) => void;
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
  ariaLabel,
  onToggle,
  variant = "panel",
  visibleLabel,
}: SandboxSwitchControlProps) {
  const { t } = useI18n();
  const statusText = enabled
    ? t("profileEditor.sandbox.statusEnabled")
    : t("profileEditor.sandbox.statusDisabled");
  const switchClassName = [
    "profile-sandbox-switch profile-sandbox-switch-compact inline-flex w-fit max-w-full cursor-pointer items-center rounded-full bg-transparent p-0 text-left text-[var(--text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent-blue)]",
    `profile-sandbox-switch-${variant}`,
    variant === "panel" ? "gap-2.5" : "mr-0.5 gap-1.5",
    visibleLabel
      ? "profile-sandbox-switch-with-label gap-2 border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--bg-primary)_92%,white_8%)] px-2.5 py-1.5 hover:border-[var(--text-muted)] max-[900px]:px-2"
      : "",
    enabled ? "is-on" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const trackClassName = [
    "profile-sandbox-switch-track relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors",
    enabled
      ? "border-[#3edc6d] bg-[#3edc6d]"
      : "border-[var(--border-default)] bg-[var(--bg-primary)]",
  ].join(" ");
  const thumbClassName = [
    "profile-sandbox-switch-thumb absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
    enabled ? "translate-x-4" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      className={switchClassName}
      onClick={onToggle}
    >
      {visibleLabel ? (
        <span className="profile-sandbox-switch-label whitespace-nowrap text-xs font-semibold text-[var(--text-secondary)] max-[900px]:text-[11px]">
          {visibleLabel}
        </span>
      ) : null}
      <span className={trackClassName} aria-hidden="true">
        <span className={thumbClassName} />
      </span>
      {variant === "panel" ? (
        <span
          className={`profile-sandbox-switch-status text-sm font-semibold leading-tight transition-colors${enabled ? " is-on text-[#3edc6d]" : " text-[var(--text-secondary)]"}`}
        >
          {statusText}
        </span>
      ) : null}
    </button>
  );
}

function SandboxEditor({ value, onChange, onError }: SandboxEditorProps) {
  const { language, t } = useI18n();
  const isZh = language === "zh";
  const presentation = useMemo(() => getSandboxPresentation(value, isZh), [value, isZh]);
  const recommendedPresetApplied = useMemo(() => hasRecommendedSandboxPreset(value), [value]);

  useEffect(() => {
    onError("");
  }, [onError]);

  function handleAddRecommendedPreset() {
    const result = mergeRecommendedSandboxPreset(value);
    if (!result.changed) {
      return;
    }
    onChange(result.nextValue);
  }

  return (
    <div className="profile-section-body">
      <div className="profile-subsection-header">
        <div>
          <h4>{t("profileEditor.sandbox.statusTitle")}</h4>
        </div>
      </div>

      <Card className="profile-mini-card profile-sandbox-status-card gap-3 rounded-lg border-[var(--border-default)] bg-[var(--bg-primary)] p-4 py-4 shadow-none">
        <div className="profile-sandbox-state-copy flex min-w-0 flex-col gap-1.5">
          <strong className="text-[15px] font-bold">
            {isZh
              ? `当前状态：${presentation.enabled ? t("profileEditor.sandbox.statusEnabled") : t("profileEditor.sandbox.statusDisabled")}`
              : `Current status: ${presentation.enabled ? t("profileEditor.sandbox.statusEnabled") : t("profileEditor.sandbox.statusDisabled")}`}
          </strong>
          <span className="text-sm leading-6 text-[var(--text-secondary)]">
            {presentation.detailSummary}
          </span>
        </div>

        {presentation.extraKeys.length > 0 ? (
          <div className="profile-chip-list flex flex-wrap gap-2">
            {presentation.extraKeys.map((key) => (
              <Badge key={key} variant="outline" className="profile-key-badge">
                {key}
              </Badge>
            ))}
          </div>
        ) : (
          <div className="profile-empty-state flex min-h-[96px] items-center justify-center rounded-lg border border-[var(--border-default)] px-4 text-center">
            {presentation.emptyState}
          </div>
        )}
      </Card>

      <div className="profile-env-footer flex justify-end">
        {recommendedPresetApplied ? null : (
          <Button
            type="button"
            className="profile-primary-btn"
            onClick={handleAddRecommendedPreset}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("profileEditor.sandbox.addRecommendedPreset")}
          </Button>
        )}
      </div>
    </div>
  );
}

export default SandboxEditor;
