"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import * as React from "react";

import { cn } from "@/lib/utils";

// Base UI 的 Slider 多了一层 Control：布局类从 Root 移到 Control，
// 已完成区间由 Range 改名为 Indicator，拇指仍在 Track 内。
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  "aria-label": ariaLabel,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );
  const thumbIds = React.useMemo(
    () =>
      Array.from(
        { length: _values.length },
        () =>
          globalThis.crypto?.randomUUID?.() ??
          `slider-thumb-${Math.random().toString(36).slice(2)}`,
      ),
    [_values.length],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      aria-label={ariaLabel}
      className={cn("data-horizontal:w-full data-vertical:h-full", className)}
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className={cn(
          "relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
        )}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "relative grow overflow-hidden rounded-full bg-muted data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1",
          )}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={cn("absolute bg-primary data-horizontal:h-full data-vertical:w-full")}
          />
        </SliderPrimitive.Track>
        {thumbIds.map((thumbId) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={thumbId}
            aria-label={ariaLabel}
            className="relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

/** Base UI 的 Slider 回调对单值场景给 number、多值场景给数组，这里统一取首个值。 */
function firstSliderValue(value: number | readonly number[]): number | undefined {
  return typeof value === "number" ? value : value[0];
}

export { firstSliderValue, Slider };
