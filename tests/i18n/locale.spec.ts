import { describe, expect, it } from 'vitest';
import { parseLocale, resolveLocale } from '../../src/ui/i18n/locale';

describe('UI locale resolution', () => {
  it('normalizes supported regional tags', () => {
    expect(parseLocale('en-US')).toBe('en');
    expect(parseLocale('vi_VN')).toBe('vi');
    expect(parseLocale(' EN-gb ')).toBe('en');
  });

  it('rejects unsupported and non-string values', () => {
    expect(parseLocale('fr-FR')).toBeNull();
    expect(parseLocale('')).toBeNull();
    expect(parseLocale(null)).toBeNull();
  });

  it('uses saved, host, browser, then Vietnamese priority', () => {
    expect(resolveLocale('xx', undefined, 'vi-VN')).toBe('vi');
    expect(resolveLocale('en', 'vi', 'vi-VN')).toBe('en');
    expect(resolveLocale(undefined, 'en-US', 'vi-VN')).toBe('en');
    expect(resolveLocale(undefined, undefined, 'fr-FR')).toBe('vi');
  });
});
