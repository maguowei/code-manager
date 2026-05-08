import type * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "./button";

interface SegmentedControlItem<TValue extends string> {
  value: TValue;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<TValue extends string> {
  ariaLabel: string;
  value: TValue;
  items: SegmentedControlItem<TValue>[];
  onValueChange: (value: TValue) => void;
  className?: string;
  itemClassName?: string;
}

function SegmentedControl<TValue extends string>({
  ariaLabel,
  value,
  items,
  onValueChange,
  className,
  itemClassName,
}: SegmentedControlProps<TValue>) {
  return (
    <div
      className={cn("inline-flex rounded-md border border-border bg-secondary p-1", className)}
      role="group"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <Button
            key={item.value}
            type="button"
            variant="ghost"
            size="xs"
            className={cn(
              "h-auto rounded-sm px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground",
              selected && "bg-background text-foreground shadow-sm",
              itemClassName,
            )}
            aria-pressed={selected}
            disabled={item.disabled}
            onClick={() => {
              if (!selected) {
                onValueChange(item.value);
              }
            }}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}

export type { SegmentedControlItem, SegmentedControlProps };
export { SegmentedControl };
