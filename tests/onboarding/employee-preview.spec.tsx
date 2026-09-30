// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrivosOnboardingRoot } from '../../src/ui/composition/PrivosOnboardingRoot';
import OnboardingPanel from '../../src/ui/onboarding/views/OnboardingPanel';
import { OnboardingI18nProvider } from '../../src/ui/i18n/OnboardingI18nProvider';

const testContext = vi.hoisted(() => ({ roles: ['owner'] as string[] }));
const appMock = vi.hoisted(() => ({ storage: { get: async () => null, set: async () => undefined } }));

vi.mock('@privos_ai/app-react', () => ({
  usePrivosApp: () => appMock,
  usePrivosContext: () => ({ roomId: 'room-a', userId: 'actor-a', userRoles: testContext.roles, theme: 'light' }),
}));

vi.mock('../../src/ui/onboarding/data/room-bootstrap', () => ({
  resolveRoomBinding: async () => ({ state: 'blocked', code: 'BOOTSTRAP_STAGE_UNAVAILABLE' }),
}));

afterEach(() => {
  cleanup();
  testContext.roles = ['owner'];
  vi.unstubAllEnvs();
});

describe('temporary employee preview', () => {
  const renderPanel = () => render(
    <OnboardingI18nProvider userId="actor-a" preferences={appMock.storage} browserLocale="en">
      <PrivosOnboardingRoot><OnboardingPanel /></PrivosOnboardingRoot>
    </OnboardingI18nProvider>,
  );

  it('lets a room admin enter the employee screen and return to administration', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'VI' }));
    expect(screen.getByRole('button', { name: 'Nhân sự' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Xem giao diện nhân sự' }));
    expect(screen.getByRole('button', { name: 'Lộ trình của tôi' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nhân sự' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Quay lại quản trị' }));
    expect(screen.getByRole('button', { name: 'Nhân sự' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Lộ trình của tôi' })).toBeNull();
  });

  it('offers the employee preview to an owner in a production UI build', async () => {
    vi.stubEnv('DEV', false);
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'VI' }));
    await user.click(screen.getByRole('button', { name: 'Xem giao diện nhân sự' }));
    expect(screen.getByText('Chế độ xem thử nhân sự')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lộ trình của tôi' })).toBeTruthy();
  });

  it('does not offer the preview control to a normal member', async () => {
    testContext.roles = ['member'];
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'VI' }));
    expect(screen.getByRole('button', { name: 'Lộ trình của tôi' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xem giao diện nhân sự' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quay lại quản trị' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nhân sự' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Onboarding mới' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Template' })).toBeNull();
  });
});
