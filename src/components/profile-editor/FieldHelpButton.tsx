import { Info } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

interface FieldHelpButtonProps {
  helperKey?: string;
}

function FieldHelpButton({ helperKey }: FieldHelpButtonProps) {
  if (!helperKey) {
    return null;
  }

  // 用 shadcn Tooltip（Radix）替代原生 title：延迟可控（约 150ms）、带样式，避免原生提示迟滞
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="inline-flex size-6 items-center justify-center rounded-full border border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label={helperKey}
            data-tooltip={helperKey}
          >
            <Info className="size-3.5" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{helperKey}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default FieldHelpButton;
