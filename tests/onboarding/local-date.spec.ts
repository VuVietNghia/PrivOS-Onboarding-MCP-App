import { afterEach, describe, expect, it, vi } from 'vitest';
import { localTodayIso } from '../../src/ui/onboarding/domain/local-date';

afterEach(() => vi.restoreAllMocks());

describe('localTodayIso', () => {
  it('uses local calendar fields even when UTC is still yesterday', () => {
    const now = new Date('2026-09-24T18:30:00.000Z');
    vi.spyOn(now, 'getFullYear').mockReturnValue(2026);
    vi.spyOn(now, 'getMonth').mockReturnValue(8);
    vi.spyOn(now, 'getDate').mockReturnValue(25);
    expect(localTodayIso(now)).toBe('2026-09-25');
  });

  it('pads a one-digit month and day', () => {
    expect(localTodayIso(new Date(2026, 0, 2, 9))).toBe('2026-01-02');
  });
});
