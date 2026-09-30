export type UiLocale = 'vi' | 'en';

const DEFAULT_LOCALE: UiLocale = 'vi';

export function parseLocale(value: unknown): UiLocale | null {
  if (typeof value !== 'string') return null;
  const language = value.trim().toLowerCase().replace('_', '-').split('-')[0];
  if (language === 'vi' || language === 'en') return language;
  return null;
}

export function resolveLocale(saved: unknown, host: unknown, browser: unknown): UiLocale {
  return parseLocale(saved) ?? parseLocale(host) ?? parseLocale(browser) ?? DEFAULT_LOCALE;
}
