const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function toIso(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

export function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const utcMs = toUtc(iso);
  if (!isFinite(utcMs)) return false;
  return toIso(utcMs) === iso;
}

export function isWorkingDay(isoDate: string): boolean {
  if (!isValidIsoDate(isoDate)) return false;
  const dow = new Date(toUtc(isoDate)).getUTCDay();
  return dow !== 0 && dow !== 6;
}

export function addWorkingDays(isoStart: string, n: number): string {
  if (!isValidIsoDate(isoStart)) throw new Error('INVALID_DATE');
  if (n < 0) throw new Error('NEGATIVE_WORKING_DAYS');
  if (!isWorkingDay(isoStart)) throw new Error('START_NOT_WORKING_DAY');
  let cursor = toUtc(isoStart);
  let remaining = n;
  while (remaining > 0) {
    cursor += DAY_MS;
    if (isWorkingDay(toIso(cursor))) remaining -= 1;
  }
  return toIso(cursor);
}

export function workingDaysUntil(isoFrom: string, isoTo: string): number {
  if (!isValidIsoDate(isoFrom) || !isValidIsoDate(isoTo)) throw new Error('INVALID_DATE');
  const from = toUtc(isoFrom);
  const to = toUtc(isoTo);
  const step = to >= from ? DAY_MS : -DAY_MS;
  let cursor = from;
  let count = 0;
  while (cursor !== to) {
    cursor += step;
    if (isWorkingDay(toIso(cursor))) count += step > 0 ? 1 : -1;
  }
  return count;
}
