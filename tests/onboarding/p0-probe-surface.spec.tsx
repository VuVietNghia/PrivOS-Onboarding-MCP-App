import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import OnboardingPanel from '../../src/ui/onboarding/views/OnboardingPanel';
import { PrivosOnboardingRoot } from '../../src/ui/composition/PrivosOnboardingRoot';
import { OnboardingI18nProvider } from '../../src/ui/i18n/OnboardingI18nProvider';

const mockContext = vi.hoisted(() => ({ roomId: 'test-room', userId: 'actor-a', userRoles: ['owner'] }));
vi.mock('@privos_ai/app-react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@privos_ai/app-react')>();
  return { ...original, usePrivosContext: () => mockContext, usePrivosApp: () => ({ rest: async () => ({ statusCode: 200, body: {} }) }) };
});

describe('v4 development surface in the Hub iframe', () => {
  const preferences = { get: async () => null, set: async () => {} };
  const renderPanel = () => renderToStaticMarkup(
    <OnboardingI18nProvider userId="actor-a" preferences={preferences} browserLocale="en">
      <PrivosOnboardingRoot><OnboardingPanel /></PrivosOnboardingRoot>
    </OnboardingI18nProvider>,
  );

  it('shows an admin the v4 HR UI as the primary screen', () => {
    const html = renderPanel();
    expect(html).toContain('PrivOS Onboarding');
    expect(html).toContain('Manage onboarding');
    expect(html).toContain('Templates');
    expect(html).not.toContain('P0 Hub contract tests');
  });

  it('shows a normal member only their own navigation', () => {
    mockContext.userRoles = ['member'];
    const html = renderPanel();
    expect(html).toContain('My roadmap');
    expect(html).not.toContain('Manage onboarding');
    expect(html).not.toContain('P0 Hub contract tests');
  });
});
