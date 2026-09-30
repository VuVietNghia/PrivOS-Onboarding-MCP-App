import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const onboardingCss = readFileSync(resolve(process.cwd(), 'src/ui/onboarding/onboarding-v4.css'), 'utf8');
const themesCss = readFileSync(resolve(process.cwd(), 'src/ui/onboarding/styles/themes.css'), 'utf8');

describe('member learning theme isolation', () => {
  it('scopes learning colors to onboarding and uses semantic theme tokens', () => {
    expect(onboardingCss).toContain('@scope (.onboarding-v4)');
    expect(onboardingCss).toContain('.onboarding-v4 h1, .v4-learning-day h2, .v4-learning-quiz legend { color: var(--v4-text); }');
    expect(onboardingCss).toContain('.v4-learning-quiz label');
    expect(onboardingCss).toContain('color: var(--v4-text-2);');
    expect(onboardingCss).toContain('.v4-learning-quiz input[type="radio"], .v4-learning-quiz input[type="checkbox"]');
    expect(onboardingCss).toContain('width: auto;');
    expect(themesCss).toContain('.onboarding-v4[data-theme-mode="light"]');
    expect(themesCss).toContain('--v4-text: #0B1113;');
    expect(themesCss).not.toContain('--base-text-primary');
  });
});
