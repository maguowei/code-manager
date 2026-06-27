import { Bot, ChevronDown, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { TranslationKey } from "../i18n";
import type { MessageBlock, SubagentChain } from "../types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

/** 单条侧链行，持有自身展开/折叠状态 */
function SubagentChainRow({
  chain,
  renderBlocks,
  t,
}: {
  chain: SubagentChain;
  renderBlocks: (blocks: MessageBlock[]) => ReactNode;
  t: (k: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border bg-muted/30">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-3 py-2 text-sm">
        {open ? (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        )}
        <Bot className="size-3.5 text-muted-foreground" />
        <span className="font-medium">{chain.slug ?? t("history.subagentUnnamed")}</span>
        <span className="text-xs text-muted-foreground">
          · {chain.messages.length} {t("history.subagentMessages")}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-3 pb-3">
        {chain.messages.map((m, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 侧链消息无稳定 id，用 agent_id+索引复合 key
            key={`${chain.agent_id}-${i}`}
            className="border-l-2 border-border pl-3"
          >
            {renderBlocks(m.blocks)}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 渲染所有 subagent 侧链为可折叠子时间线 */
export function SessionSubagents({
  subagents,
  renderBlocks,
  t,
}: {
  subagents: SubagentChain[];
  renderBlocks: (blocks: MessageBlock[]) => ReactNode;
  t: (k: TranslationKey) => string;
}) {
  if (subagents.length === 0) return null;
  return (
    <div className="mt-4 space-y-2 border-t pt-3">
      <div className="text-xs font-medium text-muted-foreground">
        {t("history.subagents")} ({subagents.length})
      </div>
      {subagents.map((chain) => (
        <SubagentChainRow key={chain.agent_id} chain={chain} renderBlocks={renderBlocks} t={t} />
      ))}
    </div>
  );
}
