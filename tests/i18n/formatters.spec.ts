import { describe, expect, it } from 'vitest';
import { formatDateOnly, formatDateRange, formatList, formatNumber, formatPercent } from '../../src/ui/i18n/formatters';

describe('locale formatters', () => {
  it('formats date-only values without shifting the calendar day', () => {
    expect(formatDateOnly('2026-09-29', 'en')).toBe('09/29/2026');
    expect(formatDateOnly('2026-09-29', 'vi')).toBe('29/09/2026');
    expect(formatDateOnly('2026-02-30', 'vi')).toBe('—');
    expect(formatDateOnly('not-a-date', 'en')).toBe('—');
  });

  it('formats ranges, numbers, ratios, and lists by locale', () => {
    expect(formatDateRange('2026-09-29', '2026-09-30', 'en')).toBe('09/29/2026 – 09/30/2026');
    expect(formatNumber(1234, 'en')).toBe('1,234');
    expect(formatNumber(1234, 'vi')).toBe('1.234');
    expect(formatPercent(0, 'en')).toBe('0%');
    expect(formatPercent(1, 'en')).toBe('100%');
    expect(formatPercent(0.425, 'vi')).toBe('43%');
    expect(formatList(['Alpha', 'Beta'], 'en')).toBe('Alpha and Beta');
  });
});
