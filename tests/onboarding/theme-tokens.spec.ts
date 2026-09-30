import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const themesPath = resolve(process.cwd(), 'src/ui/onboarding/styles/themes.css');

function hexToRgb(value: string): readonly [number, number, number] {
  const match = /^#([0-9a-f]{6})$/iu.exec(value.trim());
  if (!match) throw new Error(`Expected six-digit hex color, received ${value}`);
  const number = Number.parseInt(match[1], 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function luminance(value: string): number {
  const channels = hexToRgb(value).map((channel) => {
    const ratio = channel / 255;
    return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function themeTokens(css: string, theme: 'light' | 'dark' | 'brand'): Readonly<Record<string, string>> {
  const selector = `.onboarding-v4[data-theme-mode="${theme}"]`;
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Missing ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const entries = [...css.slice(open + 1, close).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/giu)]
    .map((match) => [match[1], match[2].trim()] as const);
  return Object.fromEntries(entries);
}

describe('onboarding semantic theme tokens', () => {
  it('meets text, focus, boundary, and primary control contrast in every theme', () => {
    const css = readFileSync(themesPath, 'utf8');
    for (const theme of ['light', 'dark', 'brand'] as const) {
      const tokens = themeTokens(css, theme);
      expect(contrast(tokens['--v4-text'], tokens['--v4-bg']), `${theme} foreground`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens['--v4-text-2'], tokens['--v4-surface']), `${theme} secondary`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens['--v4-focus'], tokens['--v4-bg']), `${theme} focus`).toBeGreaterThanOrEqual(3);
      expect(contrast(tokens['--v4-control-border'], tokens['--v4-surface']), `${theme} boundary`).toBeGreaterThanOrEqual(3);
      if (theme !== 'brand') {
        expect(contrast(tokens['--v4-primary-text'], tokens['--v4-primary-bg']), `${theme} primary`).toBeGreaterThanOrEqual(4.5);
      }
    }
    const brand = themeTokens(css, 'brand');
    expect(contrast(brand['--v4-primary-text'], brand['--v4-primary-gradient-start'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(brand['--v4-primary-text'], brand['--v4-primary-gradient-end'])).toBeGreaterThanOrEqual(4.5);
  });

  it('loads ordered styles without the legacy application stylesheet', () => {
    const entry = readFileSync(resolve(process.cwd(), 'src/ui/onboarding/onboarding-v4.css'), 'utf8');
    const main = readFileSync(resolve(process.cwd(), 'src/ui/main.tsx'), 'utf8');
    expect(entry).toContain("@import './styles/tokens.css'");
    expect(entry).toContain("@import './styles/themes.css'");
    expect(entry).toContain("@import './styles/layout.css'");
    expect(entry).toContain("@import './styles/components.css'");
    expect(entry).toContain("@import './styles/responsive.css'");
    expect(main).not.toContain('contact-form-styles.css');
  });

  it('keeps native controls on the active theme foreground', () => {
    const components = readFileSync(resolve(process.cwd(), 'src/ui/onboarding/styles/components.css'), 'utf8');
    expect(components).toMatch(/\.onboarding-v4\s+:is\(button,\s*input,\s*select,\s*textarea\)\s*\{[^}]*color:\s*inherit;/su);
  });

  it('uses selectors strong enough to override desktop grids at responsive widths', () => {
    const responsive = readFileSync(resolve(process.cwd(), 'src/ui/onboarding/styles/responsive.css'), 'utf8');
    const mobile = /@media \(max-width: 760px\)\s*\{([\s\S]*?)\n\}/u.exec(responsive)?.[1] ?? '';
    const tablet = /@media \(min-width: 761px\) and \(max-width: 1050px\)\s*\{([\s\S]*?)\n\}/u.exec(responsive)?.[1] ?? '';
    expect(mobile).toMatch(/\.onboarding-v4 \.v4-builder-grid\s*\{[^}]*grid-template-columns:\s*(?:minmax\(0,\s*1fr\)|1fr)/su);
    expect(mobile).toMatch(/\.onboarding-v4 \.v4-app\s*\{[^}]*display:\s*block/su);
    expect(tablet).toMatch(/\.onboarding-v4 \.v4-app\s*\{[^}]*grid-template-columns:\s*72px\s+minmax\(0,\s*1fr\)/su);
  });

  it('gives the new-onboarding form themed labels and controls', () => {
    const form = readFileSync(resolve(process.cwd(), 'src/ui/onboarding/views/ProvisionV4Form.tsx'), 'utf8');
    const components = readFileSync(resolve(process.cwd(), 'src/ui/onboarding/styles/components.css'), 'utf8');
    expect(form).toContain('className="v4-provision-form"');
    expect(components).toMatch(/\.onboarding-v4 \.v4-provision-form label\s*\{[^}]*display:\s*grid;[^}]*font-weight:\s*600;/su);
    expect(components).toMatch(/\.onboarding-v4 \.v4-provision-form :is\(input, select\)\s*\{[^}]*min-height:\s*44px;[^}]*border-radius:\s*var\(--v4-radius-md\);[^}]*background:\s*var\(--v4-surface\);/su);
  });
});
