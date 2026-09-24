import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import OnboardingPanel from '../../src/ui/onboarding/views/OnboardingPanel';

const mockContext = vi.hoisted(() => ({ roomId: 'test-room', userId: 'actor-a', userRoles: ['owner'] }));
vi.mock('@privos_ai/app-react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@privos_ai/app-react')>();
  return { ...original, usePrivosContext: () => mockContext, usePrivosApp: () => ({ rest: async () => ({ statusCode: 200, body: {} }) }) };
});

describe('v4 development surface in the Hub iframe', () => {
  it('shows an admin the v4 HR UI as the primary screen', () => {
    const html = renderToStaticMarkup(<OnboardingPanel />);
    expect(html).toContain('PrivOS Onboarding');
    expect(html).toContain('Manage onboarding');
    expect(html).toContain('Templates');
    expect(html).not.toContain('P0 Hub contract tests');
  });

  it('shows a normal member only their own navigation', () => {
    mockContext.userRoles = ['member'];
    const html = renderToStaticMarkup(<OnboardingPanel />);
    expect(html).toContain('My roadmap');
    expect(html).not.toContain('Manage onboarding');
    expect(html).not.toContain('P0 Hub contract tests');
  });
});
