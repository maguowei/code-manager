import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";

const BADGE_COLOR_COUNT = 12;
const BADGE_COLORS: CSSProperties[] = [
  { background: "linear-gradient(135deg, #3a86ff22, #3a86ff44)", color: "#3a86ff" },
  { background: "linear-gradient(135deg, #ff006e22, #ff006e44)", color: "#ff006e" },
  { background: "linear-gradient(135deg, #3fb95022, #3fb95044)", color: "#3fb950" },
  { background: "linear-gradient(135deg, #f7816622, #f7816644)", color: "#f78166" },
  { background: "linear-gradient(135deg, #a371f722, #a371f744)", color: "#a371f7" },
  { background: "linear-gradient(135deg, #ffa50022, #ffa50044)", color: "#ffa500" },
  { background: "linear-gradient(135deg, #06b6d422, #06b6d444)", color: "#06b6d4" },
  { background: "linear-gradient(135deg, #4f46e522, #4f46e544)", color: "#4f46e5" },
  { background: "linear-gradient(135deg, #0f766e22, #0f766e44)", color: "#0f766e" },
  { background: "linear-gradient(135deg, #e11d4822, #e11d4844)", color: "#e11d48" },
  { background: "linear-gradient(135deg, #ca8a0422, #ca8a0444)", color: "#ca8a04" },
  { background: "linear-gradient(135deg, #65a30d22, #65a30d44)", color: "#65a30d" },
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
      className={cn(
        "profile-name-badge",
        `profile-name-badge--${size}`,
        `profile-name-badge--color-${colorIndex}`,
        "shrink-0 border-0 p-0 text-[var(--text-primary)] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.08),0_10px_24px_rgb(15_23_42_/_0.18)]",
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
        <AvatarFallback className="profile-name-badge__text rounded-[inherit] bg-transparent font-bold leading-none text-inherit select-none">
          <span className={size === "lg" ? "text-2xl" : "text-[length:var(--font-md)]"}>
            {badgeText}
          </span>
        </AvatarFallback>
      </Avatar>
    </Badge>
  );
}

export default ProfileNameBadge;
