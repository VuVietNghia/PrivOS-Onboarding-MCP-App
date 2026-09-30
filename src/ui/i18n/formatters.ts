import type { UiLocale } from './locale';

const localeTags: Readonly<Record<UiLocale, string>> = {
  vi: 'vi-VN',
  en: 'en-US',
};

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export function formatDateOnly(value: string, locale: UiLocale): string {
  const date = parseDateOnly(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(localeTags[locale], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDateRange(start: string, end: string, locale: UiLocale): string {
  return `${formatDateOnly(start, locale)} – ${formatDateOnly(end, locale)}`;
}

export function formatNumber(value: number, locale: UiLocale): string {
  return new Intl.NumberFormat(localeTags[locale]).format(value);
}

export function formatPercent(ratio: number, locale: UiLocale): string {
  return new Intl.NumberFormat(localeTags[locale], {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(ratio);
}

export function formatList(values: readonly string[], locale: UiLocale): string {
  return new Intl.ListFormat(localeTags[locale], { style: 'long', type: 'conjunction' }).format(values);
}
