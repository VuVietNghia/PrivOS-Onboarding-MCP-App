import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('v4 production source contract', () => {
  it('uses the v4 room app without a demo role switch or legacy task flow', () => {
    const entry = source('src/ui/App.tsx');
    const panel = source('src/ui/onboarding/views/OnboardingPanel.tsx');
    const surface = source('src/ui/onboarding/views/V4Onboarding.tsx');
    expect(entry).toContain('OnboardingPanel');
    expect(panel).toContain('V4Onboarding');
    expect(panel).not.toMatch(/(?:RoadmapView|toggleTask|role-switch|demoPositions)/);
    expect(surface).not.toMatch(/(?:roleSwitch|role-switch|RoadmapView|toggleTask|demoPositions)/);
  });

  it('keeps v4 List and File access on public mediated tools', () => {
    const paths = [
      'src/ui/onboarding/data/v2-lists.ts',
      'src/ui/onboarding/data/isolated-lists.ts',
      'src/ui/onboarding/data/files.ts',
      'src/ui/onboarding/flows/save-template-v4.ts',
      'src/ui/onboarding/flows/provision-v4.ts',
      'src/ui/onboarding/flows/learning-v4.ts',
      'src/ui/onboarding/flows/browser-import-v4.ts',
      'scripts/onboarding-import/import-source-v4.ts',
    ];
    for (const path of paths) {
      expect(source(path), path).not.toMatch(/\/(?:internal|admin)\//);
    }
  });
});
