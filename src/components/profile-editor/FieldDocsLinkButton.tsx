import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

interface FieldDocsLinkButtonProps {
  href: string;
  ariaLabel: string;
}

// 字段级别的官方文档外链按钮，与 FieldHelpButton 同尺寸（size-6 圆形 ghost），
// 点击走 Tauri opener 调起系统浏览器，避免在应用内打开。
// 提示用 shadcn Tooltip（Radix）替代原生 title，延迟可控、带样式。
function FieldDocsLinkButton({ href, ariaLabel }: FieldDocsLinkButtonProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="inline-flex size-6 items-center justify-center rounded-full border border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label={ariaLabel}
            data-tooltip={ariaLabel}
            onClick={() => {
              void openUrl(href);
            }}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{ariaLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default FieldDocsLinkButton;
