import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
}

function EmptyState({ title, hint, icon: Icon, loading = false, className }: EmptyStateProps) {
  return (
    <Empty className={cn("min-h-[240px] border-0 px-6 py-10", className)}>
      <EmptyHeader>
        {loading ? (
          <EmptyMedia variant="icon">
            <Spinner aria-hidden="true" />
          </EmptyMedia>
        ) : Icon ? (
          <EmptyMedia variant="icon">
            <Icon aria-hidden="true" />
          </EmptyMedia>
        ) : null}
        <EmptyTitle className="text-base font-medium">{title}</EmptyTitle>
        {hint ? (
          <EmptyDescription className="max-w-[360px] leading-normal">{hint}</EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );
}

export default EmptyState;
