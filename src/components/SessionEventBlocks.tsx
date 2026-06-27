import { AlertTriangle, GitBranch, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "../i18n";
import type { MessageBlock } from "../types";
import { Badge } from "./ui/badge";

/** 渲染 hook 触发块：命令列表 + 错误高亮 + 拦截标记 */
export function HookBlock({
  block,
  t,
}: {
  block: Extract<MessageBlock, { type: "hook" }>;
  t: (k: TranslationKey) => string;
}) {
  const hasError = block.errors.length > 0 || block.prevented_continuation;
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        hasError ? "border-destructive/50 bg-destructive/5" : "border-border bg-muted/40",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        <Webhook className="size-3.5" />
        <span>{t("history.hookEvent")}</span>
        {block.prevented_continuation && (
          <Badge variant="destructive" className="ml-1">
            {t("history.hookPrevented")}
          </Badge>
        )}
      </div>
      <ul className="space-y-0.5">
        {block.hooks.map((h, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: command 可重复，复合 key 用 index 消歧
            key={`${h.command}-${i}`}
            className="flex items-center justify-between gap-2"
          >
            <span className="font-mono text-xs">{h.command}</span>
            {h.duration_ms != null && (
              <span className="shrink-0 text-xs text-muted-foreground">{h.duration_ms} ms</span>
            )}
          </li>
        ))}
      </ul>
      {block.errors.map((e, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: error 字符串可重复，复合 key 用 index 消歧
          key={`${e}-${i}`}
          className="mt-1 flex items-center gap-1.5 text-xs text-destructive"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>{e}</span>
        </div>
      ))}
    </div>
  );
}

/** 渲染模式切换块 */
export function ModeChangeBlock({
  block,
  t,
}: {
  block: Extract<MessageBlock, { type: "mode_change" }>;
  t: (k: TranslationKey) => string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <GitBranch className="size-3.5" />
      <span>
        {t("history.modeChange")}: <span className="font-medium">{block.mode}</span>
      </span>
    </div>
  );
}
