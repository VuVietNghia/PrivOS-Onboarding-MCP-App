import { describe, expect, it } from 'vitest';
import { createUiI18n } from '../../src/ui/i18n/config';
import { resources } from '../../src/ui/i18n/resources';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

function interpolationNames(value: unknown): string[] {
  if (typeof value === 'string') {
    return [...value.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((match) => match[1] ?? '').sort();
  }
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(interpolationNames).sort();
}

describe('bundled localization resources', () => {
  it('keeps English and Vietnamese leaf paths and interpolation names in parity', () => {
    expect(leafPaths(resources.en)).toEqual(leafPaths(resources.vi));
    expect(interpolationNames(resources.en)).toEqual(interpolationNames(resources.vi));
  });

  it('selects plural forms through count', () => {
    const en = createUiI18n('en');
    const vi = createUiI18n('vi');
    expect(en.t('common:dayCount', { count: 1 })).toBe('1 day');
    expect(en.t('common:dayCount', { count: 2 })).toBe('2 days');
    expect(vi.t('common:dayCount', { count: 0 })).toBe('0 ngày');
  });

  it('creates isolated instances', async () => {
    const en = createUiI18n('en');
    const vi = createUiI18n('vi');
    await en.changeLanguage('vi');
    expect(en.language).toBe('vi');
    expect(vi.language).toBe('vi');
    await vi.changeLanguage('en');
    expect(en.language).toBe('vi');
    expect(vi.language).toBe('en');
  });

  it('throws for a missing key in development', () => {
    const instance = createUiI18n('en');
    expect(() => instance.t('common:notARealKey' as never)).toThrow(/missing translation/i);
  });
});
