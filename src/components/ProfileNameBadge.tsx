import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";

const BADGE_COLOR_COUNT = 12;
const BADGE_COLORS: CSSProperties[] = [
  {
    background:
      "linear-gradient(135deg, color-mix(in oklch, var(--chart-1) 16%, transparent), color-mix(in oklch, var(--chart-1) 34%, transparent))",
    color: "var(--chart-1)",
  },
  {
    background:
      "linear-gradient(135deg, color-mix(in oklch, var(--chart-2) 16%, transparent), color-mix(in oklch, var(--chart-2) 34%, transparent))",
    color: "var(--chart-2)",
  },
  {
    background:
      "linear-gradient(135deg, color-mix(in oklch, var(--chart-3) 16%, transparent), color-mix(in oklch, var(--chart-3) 34%, transparent))",
    color: "var(--chart-3)",
  },
  {
    background:
      "linear-gradient(135deg, color-mix(in oklch, var(--chart-4) 16%, transparent), color-mix(in oklch, var(--chart-4) 34%, transparent))",
    color: "var(--chart-4)",
  },
  {
    background:
      "linear-gradient(135deg, color-mix(in oklch, var(--chart-5) 16%, transparent), color-mix(in oklch, var(--chart-5) 34%, transparent))",
    color: "var(--chart-5)",
  },
  {
    background:
      "linear-gradient(135deg, color-mix(in oklch, var(--primary) 14%, transparent), color-mix(in oklch, var(--primary) 28%, transparent))",
    color: "var(--primary)",
  },
  {
    background:
      "linear-gradient(135deg, color-mix(in oklch, var(--chart-1) 10%, var(--card)), color-mix(in oklch, var(--chart-2) 28%, transparent))",
    color: "var(--chart-2)",
  },
  {
    background:
      "linear-gradient(135deg, color-mix(in oklch, var(--chart-2) 10%, var(--card)), color-mix(in oklch, var(--chart-3) 28%, transparent))",
    color: "var(--chart-3)",
  },
  {
    background:
      "linear-gradient(135deg, color-mix(in oklch, var(--chart-3) 10%, var(--card)), color-mix(in oklch, var(--chart-4) 28%, transparent))",
    color: "var(--chart-4)",
  },
  {
    background:
      "linear-gradient(135deg, color-mix(in oklch, var(--chart-4) 10%, var(--card)), color-mix(in oklch, var(--chart-5) 28%, transparent))",
    color: "var(--chart-5)",
  },
  {
    background:
      "linear-gradient(135deg, color-mix(in oklch, var(--chart-5) 10%, var(--card)), color-mix(in oklch, var(--chart-1) 28%, transparent))",
    color: "var(--chart-1)",
  },
  {
    background:
      "linear-gradient(135deg, color-mix(in oklch, var(--primary) 10%, var(--card)), color-mix(in oklch, var(--chart-4) 28%, transparent))",
    color: "var(--primary)",
  },
];

interface ProfileNameBadgeProps {
  name?: string | null;
  colorSeedScope?: string;
  size?: "sm" | "lg";
  fallbackChar?: string;
  className?: string;
}

function getBadgeColorIndex(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) & 0xffff;
  }
  return hash % BADGE_COLOR_COUNT;
}

function getBadgeText(name: string | null | undefined, fallbackChar: string): string {
  const trimmedName = name?.trim() ?? "";
  const firstChar = Array.from(trimmedName)[0];

  if (!firstChar) {
    return fallbackChar;
  }

  if (/\p{Script=Latin}/u.test(firstChar)) {
    return Array.from(firstChar.toLocaleUpperCase())[0] ?? firstChar;
  }

  return firstChar;
}

function ProfileNameBadge({
  name,
  colorSeedScope,
  size = "sm",
  fallbackChar = "P",
  className,
}: ProfileNameBadgeProps) {
  const badgeText = getBadgeText(name, fallbackChar);
  const trimmedColorSeedScope = colorSeedScope?.trim() ?? "";
  const colorSeed = trimmedColorSeedScope ? `${badgeText}:${trimmedColorSeedScope}` : badgeText;
  const colorIndex = getBadgeColorIndex(colorSeed);

  return (
    <Badge
      variant="ghost"
      data-slot="profile-name-badge"
      data-size={size}
      data-color-index={colorIndex}
      className={cn(
        "shrink-0 border-0 p-0 text-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.08),0_10px_24px_rgb(15_23_42_/_0.18)]",
        size === "lg" ? "size-16 rounded-2xl" : "size-9 rounded-[10px]",
        className,
      )}
      style={BADGE_COLORS[colorIndex]}
      aria-hidden="true"
    >
      <Avatar
        size={size === "lg" ? "lg" : "default"}
        className="size-full rounded-[inherit] bg-transparent"
      >
        <AvatarFallback className="rounded-[inherit] bg-transparent font-bold leading-none text-inherit select-none">
          <span className={size === "lg" ? "text-2xl" : "text-sm"}>{badgeText}</span>
        </AvatarFallback>
      </Avatar>
    </Badge>
  );
}

export default ProfileNameBadge;
