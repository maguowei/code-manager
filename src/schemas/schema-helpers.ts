export function trimToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function isValidSkillId(value: string): boolean {
  return /^[a-z0-9-]+$/.test(value);
}
