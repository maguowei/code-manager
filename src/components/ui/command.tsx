import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import type * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        // base-nova：容器自己带 p-1 内边距，命令列表不再靠外层覆盖；圆角保留项目的 rounded-md —
        // nova 的 rounded-xl! 比宿主浮层（PopoverContent 的 rounded-md、DialogContent 的 rounded-lg）
        // 更大，会在转角处压住宿主的描边，等浮层整体迁移后再对齐。
        "flex size-full flex-col overflow-hidden rounded-md bg-popover p-1 text-popover-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title,
  description,
  children,
  className,
  showCloseButton = true,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  // Base UI 的 Dialog children 允许渲染函数形式，cmdk 只接受 ReactNode，这里收窄类型
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const dialogTitle = title ?? t("ui.commandDialogTitle");
  const dialogDescription = description ?? t("ui.commandDialogDescription");

  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{dialogTitle}</DialogTitle>
        <DialogDescription>{dialogDescription}</DialogDescription>
      </DialogHeader>
      <DialogContent
        // base-nova：调色板固定在上三分之一处（nova 用 top-1/3 + translate-y-0 取代垂直居中）。
        className={cn("top-1/3 translate-y-0 overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        {/* base-nova 把调色板尺寸收回到 CommandInput / CommandItem 自身（输入组 h-8、行 py-1.5、
            图标 size-4），旧 shadcn 通过 cmdk 选择器覆盖的 h-12 输入、py-3 行与 20px 图标已移除。 */}
        <Command>{children}</Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    // base-nova：搜索框换成项目的 InputGroup，搜索图标移到 InputGroupAddon；cmdk 的 Input 直接
    // 渲染 <input>，仍是 InputGroup 的直接子元素。上游对输入组的尺寸/圆角/阴影重写（h-8 / rounded-lg /
    // shadow-none）原样保留，调色板专属的淡色描边与底色（border-input/30 bg-input/30）在此叠加。
    <div data-slot="command-input-wrapper" className="p-1 pb-0">
      <InputGroup className="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!">
        <CommandPrimitive.Input
          data-slot="command-input"
          className={cn(
            "w-full text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        <InputGroupAddon>
          <SearchIcon className="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      // nova 写 no-scrollbar，本项目没有该工具类，改用 index.css 中等价的 scrollbar-none。
      className={cn(
        "scrollbar-none max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      // base-nova：className 走 cn 合并，调用方的类不再整体替换默认样式。
      className={cn("py-6 text-center text-sm", className)}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        // base-nova：选中态改为 bg-muted / text-foreground，并给命名分组 group/command-item，
        // 供 CommandShortcut 联动；圆角在调色板里放宽到 rounded-lg。
        // 未采用 nova 的裸 data-selected：cmdk 1.1.1 的 Item 恒定输出 data-selected="false"，
        // 裸 data-* 变体在本项目按「属性存在即命中」，会让所有条目看起来都是选中态。
        "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-muted data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[selected=true]:*:[svg]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-data-[selected=true]/command-item:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
