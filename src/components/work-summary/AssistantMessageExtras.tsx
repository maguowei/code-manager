import { Check, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummaryIntent } from "../../bindings";
import { useI18n } from "../../i18n";
import { SUBTLE_SURFACE_CLASS } from "../surface-classes";
import { TYPOGRAPHY } from "../typography-classes";
import { Badge } from "../ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";

/** 助手消息 metadata.custom 的业务形状（来自 useSummaryConversation.toThreadMessage） */
export type Custom = {
  intent?: SummaryIntent;
  process?: { phase: "scanning" | "summarizing" | "done"; prompt?: string };
  docPath?: string;
  streaming?: boolean;
};

/** 渲染助手消息的意图 chip / 提示词折叠 / 生成状态 / 已保存路径（正文由 streamdown 渲染） */
function AssistantMessageExtras({ custom }: { custom: Custom }) {
  const { t } = useI18n();
  const { intent, process, docPath, streaming } = custom;

  // 无任何附加信息时不渲染容器，避免空白占位
  if (!intent && !process?.prompt && !streaming && !docPath) return null;

  return (
    <div className="flex flex-col gap-2">
      {intent && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{intent.title}</Badge>
          {(intent.projectFilter?.length ?? 0) > 0 && (
            <Badge variant="ghost">{intent.projectFilter?.join(" / ")}</Badge>
          )}
          {intent.style !== "default" && (
            <Badge variant="ghost">
              {intent.style === "concise" ? t("worklog.styleConcise") : t("worklog.styleDetailed")}
            </Badge>
          )}
        </div>
      )}
      {process?.prompt && (
        <Collapsible className={cn("rounded-md p-2", SUBTLE_SURFACE_CLASS)}>
          <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-left">
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <span className={TYPOGRAPHY.auxiliary}>{t("worklog.promptSection")}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className={cn("mt-1 whitespace-pre-wrap", TYPOGRAPHY.auxiliary)}>
            {process.prompt}
          </CollapsibleContent>
        </Collapsible>
      )}
      {streaming && (
        <div className="flex items-center gap-1.5">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span className={TYPOGRAPHY.auxiliary}>{t("worklog.generating")}</span>
        </div>
      )}
      {!streaming && docPath && (
        <div className="flex items-center gap-1.5">
          <Check className="size-4 text-primary" aria-hidden="true" />
          <span className={cn(TYPOGRAPHY.auxiliary, "break-all")}>{docPath}</span>
        </div>
      )}
    </div>
  );
}

export default AssistantMessageExtras;
