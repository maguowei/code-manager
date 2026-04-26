import "./ProfileNameBadge.css";

const BADGE_COLOR_COUNT = 12;

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
    <div
      className={[
        "profile-name-badge",
        `profile-name-badge--${size}`,
        `profile-name-badge--color-${colorIndex}`,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      <span className="profile-name-badge__text">{badgeText}</span>
    </div>
  );
}

export default ProfileNameBadge;
