import { GripVerticalIcon } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

function ResizablePanelGroup({ className, ...props }: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn("flex h-full w-full aria-[orientation=vertical]:flex-col", className)}
      {...props}
    />
  );
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        // 命中区透明，分隔线由 after 伪元素绝对定位绘制，hover/拖拽变粗时不挤压相邻面板
        "relative flex items-center justify-center bg-transparent outline-none",
        // 横向分组（aria-orientation=vertical）：竖向分隔条，左右留白
        "aria-[orientation=vertical]:mx-1 aria-[orientation=vertical]:w-2",
        // 纵向分组（aria-orientation=horizontal）：横向分隔条，上下留白
        "aria-[orientation=horizontal]:my-1 aria-[orientation=horizontal]:h-2 aria-[orientation=horizontal]:w-full",
        // 分隔线本体：默认 border 色、圆角、带过渡
        "after:absolute after:rounded-full after:bg-border after:transition-[width,height,background-color]",
        // 竖线：纵向铺满、1px 宽、水平居中
        "aria-[orientation=vertical]:after:inset-y-0 aria-[orientation=vertical]:after:left-1/2 aria-[orientation=vertical]:after:w-px aria-[orientation=vertical]:after:-translate-x-1/2",
        // 横线：横向铺满、1px 高、垂直居中
        "aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:h-px aria-[orientation=horizontal]:after:-translate-y-1/2",
        // hover / focus / 拖拽：竖线加宽到 3px
        "aria-[orientation=vertical]:hover:after:w-[3px] aria-[orientation=vertical]:focus-visible:after:w-[3px] aria-[orientation=vertical]:data-[separator=hover]:after:w-[3px] aria-[orientation=vertical]:data-[separator=active]:after:w-[3px]",
        // hover / focus / 拖拽：横线加高到 3px
        "aria-[orientation=horizontal]:hover:after:h-[3px] aria-[orientation=horizontal]:focus-visible:after:h-[3px] aria-[orientation=horizontal]:data-[separator=hover]:after:h-[3px] aria-[orientation=horizontal]:data-[separator=active]:after:h-[3px]",
        // hover / focus / 拖拽：染成 primary
        "hover:after:bg-primary focus-visible:after:bg-primary data-[separator=hover]:after:bg-primary data-[separator=active]:after:bg-primary",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-xs border bg-border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.Separator>
  );
}

export { useDefaultLayout } from "react-resizable-panels";
export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
