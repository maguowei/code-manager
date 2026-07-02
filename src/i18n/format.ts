import type { Language } from "../i18n";

const LANGUAGE_LOCALES: Record<Language, string> = {
  zh: "zh-CN",
  en: "en-US",
};

let activeLanguage: Language = "en";

export function localeForLanguage(language: Language): string {
  return LANGUAGE_LOCALES[language];
}

export function setActiveFormatLanguage(language: Language): void {
  activeLanguage = language;
}

export function getActiveFormatLanguage(): Language {
  return activeLanguage;
}

export function formatNumber(
  value: number,
  language: Language = activeLanguage,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(localeForLanguage(language), options).format(value);
}

export function formatCompactNumber(value: number, language: Language = activeLanguage): string {
  const absoluteValue = Math.abs(value);
  const compactUnit =
    absoluteValue >= 1_000_000_000
      ? { divisor: 1_000_000_000, suffix: "B" }
      : absoluteValue >= 1_000_000
        ? { divisor: 1_000_000, suffix: "M" }
        : absoluteValue >= 1_000
          ? { divisor: 1_000, suffix: "K" }
          : null;
  if (!compactUnit) {
    return formatNumber(value, language);
  }
  return `${formatNumber(value / compactUnit.divisor, language, { maximumFractionDigits: 1 })}${compactUnit.suffix}`;
}

export function formatPercent(value: number, language: Language = activeLanguage): string {
  return formatNumber(value / 100, language, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function formatUsd(
  value: number,
  language: Language = activeLanguage,
  options?: Intl.NumberFormatOptions,
): string {
  return formatNumber(value, language, {
    style: "currency",
    currency: "USD",
    ...options,
  });
}

export function formatDateTime(
  value: Date | number,
  language: Language = activeLanguage,
  options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" },
): string {
  return new Intl.DateTimeFormat(localeForLanguage(language), options).format(value);
}

export function compareLocalized(
  left: string,
  right: string,
  language: Language = activeLanguage,
): number {
  return new Intl.Collator(localeForLanguage(language), { sensitivity: "base" }).compare(
    left,
    right,
  );
}
