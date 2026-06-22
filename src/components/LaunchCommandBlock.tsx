import { Check, Copy, Eye, EyeOff, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { TONE_TEXT_CLASS } from "./tone-classes";
import { TYPOGRAPHY } from "./typography-classes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

// 复制成功后对勾反馈的保留时长（毫秒）。
const COPIED_RESET_MS = 1500;

interface LaunchCommandBlockProps {
  /// 区块标题（如"配置文件路径式"）。
  label: string;
  /// 可选徽标文案（如"推荐"）。
  badge?: string;
  /// 真实命令，复制始终复制它。
  command: string;
  /// 展示用打码命令；提供且未显示时展示它，复制仍用 command。
  maskedCommand?: string;
  /// 区块下方提示文案。
  hint: string;
  /// 提示语气：warning 用告警色并带图标，info 用次级文字色。
  hintTone: "info" | "warning";
  /// 复制回调（沿用页面级 toast）。
  onCopy: (command: string) => void;
  copyLabel: string;
  copiedLabel: string;
  revealLabel: string;
  hideLabel: string;
}

/// 启动命令展示卡片：顶部工具条（标题 + 徽标 + 显示/复制）+ 限高滚动的等宽命令体 + 提示行。
export default function LaunchCommandBlock({
  label,
  badge,
  command,
  maskedCommand,
  hint,
  hintTone,
  onCopy,
  copyLabel,
  copiedLabel,
  revealLabel,
  hideLabel,
}: LaunchCommandBlockProps) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 卸载时清理定时器，避免卸载后 setState。
  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  function handleCopy() {
    onCopy(command);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  const canReveal = Boolean(maskedCommand);
  const display = maskedCommand && !revealed ? maskedCommand : command;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn(TYPOGRAPHY.cardTitle, "truncate")}>{label}</span>
            {badge ? <Badge variant="secondary">{badge}</Badge> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canReveal ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={revealed ? hideLabel : revealLabel}
                title={revealed ? hideLabel : revealLabel}
                onClick={() => setRevealed((prev) => !prev)}
              >
                {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? copiedLabel : copyLabel}
            </Button>
          </div>
        </div>
        <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground">
          {display}
        </pre>
      </div>
      <div
        className={cn(
          "flex items-start gap-1.5 text-xs leading-snug",
          hintTone === "warning" ? TONE_TEXT_CLASS.warning : "text-muted-foreground",
        )}
      >
        {hintTone === "warning" ? (
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        ) : null}
        <span>{hint}</span>
      </div>
    </div>
  );
}
