export function trimToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function isValidSkillId(value: string): boolean {
  return /^[a-z0-9-]+$/.test(value);
}

export function isValidSkillFileName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const normalized = trimmed.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return false;
  }

  return !normalized.split("/").some((segment) => segment === "..");
}
