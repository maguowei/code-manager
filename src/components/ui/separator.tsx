import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import type * as React from "react";

import { cn } from "@/lib/utils";

// Base UI 的 Separator 是单一部件（可直接调用），且不再有 decorative 属性；
// 无装饰性场景由调用方自行加 aria-hidden。
function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive>) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
