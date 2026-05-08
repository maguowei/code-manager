import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderSurface = "background" | "secondary" | "card";
type PageHeaderVariant = "default" | "list";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  surface?: PageHeaderSurface;
  variant?: PageHeaderVariant;
  className?: string;
  mainClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  actionsClassName?: string;
}

const SURFACE_CLASS: Record<PageHeaderSurface, string> = {
  background: "bg-background",
  secondary: "bg-secondary",
  card: "bg-card",
};

function PageHeader({
  title,
  description,
  actions,
  surface = "background",
  variant = "default",
  className,
  mainClassName,
  titleClassName,
  descriptionClassName,
  actionsClassName,
}: PageHeaderProps) {
  const isListVariant = variant === "list";

  return (
    <header
      className={cn(
        "page-header sticky top-0 z-10 shrink-0 border-b border-border px-5 py-3",
        SURFACE_CLASS[surface],
        isListVariant
          ? "flex min-h-[52px] flex-col items-start gap-2"
          : "flex min-h-[52px] items-center justify-between gap-3 max-[900px]:grid max-[900px]:h-auto max-[900px]:grid-cols-[minmax(0,1fr)_auto] max-[900px]:py-2",
        className,
      )}
    >
      <div
        className={cn(
          "page-header-main flex min-w-0 items-center gap-3",
          isListVariant ? "w-full" : "max-[900px]:flex-wrap max-[900px]:items-baseline",
          mainClassName,
        )}
      >
        <h1
          className={cn(
            "page-title min-w-0 truncate text-xl leading-tight font-semibold text-foreground",
            titleClassName,
          )}
        >
          {title}
        </h1>
        {description ? (
          <p
            className={cn(
              "page-header-description min-w-0 max-w-[min(52vw,560px)] truncate text-xs leading-snug text-muted-foreground max-[900px]:max-w-full",
              descriptionClassName,
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div
          className={cn(
            "page-header-actions flex min-w-0 shrink-0 items-center gap-2",
            isListVariant && "flex-wrap",
            actionsClassName,
          )}
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export default PageHeader;
