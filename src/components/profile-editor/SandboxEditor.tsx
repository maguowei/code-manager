import { Plus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Switch } from "../ui/switch";
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
  const switchClassName = cn(
    "inline-flex w-fit max-w-full cursor-pointer select-none items-center rounded-full text-left text-foreground transition-colors",
    variant === "panel"
      ? "gap-2.5 border border-border/80 bg-card px-2.5 py-1.5 shadow-xs hover:bg-accent/60"
      : "mr-0.5 gap-1.5 px-1.5 py-1 hover:bg-accent/50",
    visibleLabel &&
      "gap-2 border border-border bg-card px-2.5 py-1.5 shadow-xs hover:border-muted-foreground max-[900px]:px-2",
  );

  return (
    <div
      className={switchClassName}
      data-slot="switch-hit-area"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {visibleLabel ? (
        <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">
          {visibleLabel}
        </span>
      ) : null}
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        aria-label={ariaLabel}
        size={variant === "header" ? "sm" : "default"}
        onClick={(event) => event.stopPropagation()}
      />
      {variant === "panel" ? (
        <span
          className={`text-sm font-semibold leading-tight transition-colors${enabled ? " text-chart-2" : " text-muted-foreground"}`}
        >
          {statusText}
        </span>
      ) : null}
    </div>
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
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4>{t("profileEditor.sandbox.statusTitle")}</h4>
        </div>
      </div>

      <Card className="gap-3 rounded-lg border-border bg-card p-4 py-4 shadow-none">
        <div className="flex min-w-0 flex-col gap-1.5">
          <strong className="text-[15px] font-bold">
            {isZh
              ? `当前状态：${presentation.enabled ? t("profileEditor.sandbox.statusEnabled") : t("profileEditor.sandbox.statusDisabled")}`
              : `Current status: ${presentation.enabled ? t("profileEditor.sandbox.statusEnabled") : t("profileEditor.sandbox.statusDisabled")}`}
          </strong>
          <span className="text-sm leading-6 text-muted-foreground">
            {presentation.detailSummary}
          </span>
        </div>

        {presentation.extraKeys.length > 0 ? (
          <div className=" flex flex-wrap gap-2">
            {presentation.extraKeys.map((key) => (
              <Badge key={key} variant="outline" className="">
                {key}
              </Badge>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[96px] items-center justify-center rounded-lg border border-border px-4 text-center">
            {presentation.emptyState}
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        {recommendedPresetApplied ? null : (
          <Button type="button" className="" onClick={handleAddRecommendedPreset}>
            <Plus className="size-4" aria-hidden="true" />
            {t("profileEditor.sandbox.addRecommendedPreset")}
          </Button>
        )}
      </div>
    </div>
  );
}

export default SandboxEditor;
