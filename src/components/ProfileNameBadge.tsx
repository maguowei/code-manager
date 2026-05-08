import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";

const BADGE_COLOR_COUNT = 12;
const BADGE_COLOR_CLASSES = [
  "bg-chart-1/10 text-chart-1",
  "bg-chart-2/10 text-chart-2",
  "bg-chart-3/10 text-chart-3",
  "bg-chart-4/10 text-chart-4",
  "bg-chart-5/10 text-chart-5",
  "bg-primary/10 text-primary",
  "bg-chart-2/10 text-chart-2",
  "bg-chart-3/10 text-chart-3",
  "bg-chart-4/10 text-chart-4",
  "bg-chart-5/10 text-chart-5",
  "bg-chart-1/10 text-chart-1",
  "bg-primary/10 text-primary",
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
        "shrink-0 border border-border p-0 shadow-sm",
        size === "lg" ? "size-16 rounded-2xl" : "size-9 rounded-[10px]",
        BADGE_COLOR_CLASSES[colorIndex],
        className,
      )}
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
