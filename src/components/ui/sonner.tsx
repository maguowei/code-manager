import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/components/theme-provider";

// base-nova 的 Toaster 与本文件在类名上一致（className="toaster group"、图标 size-4、
// --normal-* 变量），差异只有两处，都保留项目版本：
// 1. 主题来源：nova 用 next-themes，本项目用 @/components/theme-provider；
// 2. toast 外观类：nova 用占位类 cn-toast，本项目用 index.css 里定义的 ai-toast*，
//    并通过下面的 toastOptions 合并保留调用方传入的 classNames。
const toastClassNames: NonNullable<NonNullable<ToasterProps["toastOptions"]>["classNames"]> = {
  content: "ai-toast-content",
  description: "ai-toast-description",
  error: "ai-toast-error",
  icon: "ai-toast-icon",
  title: "ai-toast-title",
  toast: "ai-toast",
};

const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...toastClassNames,
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
