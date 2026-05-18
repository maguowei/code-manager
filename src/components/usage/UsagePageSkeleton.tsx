import { cn } from "@/lib/utils";
import {
  PANEL_SURFACE_CLASS,
  SUBTLE_SURFACE_CLASS,
  TOOLBAR_SURFACE_CLASS,
} from "../surface-classes";
import { Skeleton } from "../ui/skeleton";

interface UsagePageSkeletonProps {
  ariaLabel: string;
}

// 与 UsagePage 真实布局对齐的加载骨架，避免数据回填时整页重排
const QUICK_RANGE_KEYS = Array.from({ length: 7 }, (_, index) => index);
const METRIC_CARD_KEYS = Array.from({ length: 4 }, (_, index) => index);
const SIDE_LIST_KEYS = Array.from({ length: 4 }, (_, index) => index);
const TAB_KEYS = Array.from({ length: 4 }, (_, index) => index);
const TABLE_ROW_KEYS = Array.from({ length: 6 }, (_, index) => index);

function UsagePageSkeleton({ ariaLabel }: UsagePageSkeletonProps) {
  return (
    <div
      className="usage-skeleton flex flex-col gap-4"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{ariaLabel}</span>

      <div
        className={cn(
          "usage-skeleton-toolbar flex flex-wrap items-end gap-3 rounded-lg border p-3",
          TOOLBAR_SURFACE_CLASS,
        )}
        aria-hidden="true"
      >
        <Skeleton className="h-8 w-[296px]" />
        <div className="flex flex-wrap gap-1">
          {QUICK_RANGE_KEYS.map((key) => (
            <Skeleton key={key} className="h-7 w-14" />
          ))}
        </div>
        <Skeleton className="h-8 w-38" />
        <Skeleton className="h-8 w-38" />
        <Skeleton className="h-8 w-16" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-[1180px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-4">
          <section
            className="grid grid-cols-[minmax(280px,0.9fr)_minmax(0,1.6fr)] gap-4 max-[900px]:grid-cols-1"
            aria-hidden="true"
          >
            <div
              className={cn(
                "flex h-full min-h-[150px] flex-col justify-between gap-4 rounded-lg border px-5 py-4",
                PANEL_SURFACE_CLASS,
              )}
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
              {METRIC_CARD_KEYS.map((key) => (
                <div
                  key={key}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border px-4 py-4",
                    PANEL_SURFACE_CLASS,
                  )}
                >
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-32" />
                </div>
              ))}
            </div>
          </section>

          <section className={cn("rounded-xl border p-4", PANEL_SURFACE_CLASS)} aria-hidden="true">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Skeleton className="h-5 w-24" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-8 w-32" />
              </div>
            </div>
            <div className={cn("mb-4 rounded-lg border p-4", PANEL_SURFACE_CLASS)}>
              <Skeleton className="mb-3 h-4 w-32" />
              <Skeleton className="h-[300px] w-full" />
            </div>
            <div className={cn("rounded-lg border p-4", PANEL_SURFACE_CLASS)}>
              <Skeleton className="mb-3 h-4 w-32" />
              <Skeleton className="h-[240px] w-full" />
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4" aria-hidden="true">
          <div className={cn("rounded-lg border p-4", PANEL_SURFACE_CLASS)}>
            <Skeleton className="mb-3 h-4 w-24" />
            <Skeleton className="mx-auto mb-3 h-[150px] w-full rounded-full" />
            <div className="flex flex-col gap-3">
              {SIDE_LIST_KEYS.map((key) => (
                <div key={key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-1.5 w-full" />
                </div>
              ))}
            </div>
          </div>

          <div className={cn("rounded-lg border p-4", PANEL_SURFACE_CLASS)}>
            <Skeleton className="mb-3 h-4 w-32" />
            <div className={cn("mb-3 rounded-md border p-3", SUBTLE_SURFACE_CLASS)}>
              <Skeleton className="mb-2 h-3 w-20" />
              <Skeleton className="h-5 w-28" />
            </div>
            <div className="flex flex-col gap-3">
              {SIDE_LIST_KEYS.map((key) => (
                <div key={key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <section className={cn("rounded-xl border p-4", PANEL_SURFACE_CLASS)} aria-hidden="true">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>

        <div className="mb-4 inline-flex gap-1 rounded-md border border-border/80 bg-muted/50 p-1">
          {TAB_KEYS.map((key) => (
            <Skeleton key={key} className="h-7 w-20" />
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border">
          {TABLE_ROW_KEYS.map((key) => (
            <Skeleton key={key} className="h-9 w-full rounded-none border-b border-border/40" />
          ))}
        </div>
      </section>
    </div>
  );
}

export default UsagePageSkeleton;
