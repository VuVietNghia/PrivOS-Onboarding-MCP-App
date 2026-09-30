// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingPanel from '../../src/ui/onboarding/views/OnboardingPanel';
import DiagnosticsEntry from '../../src/ui/onboarding/dev/DiagnosticsEntry';
import { PrivosOnboardingRoot } from '../../src/ui/composition/PrivosOnboardingRoot';
import { OnboardingI18nProvider } from '../../src/ui/i18n/OnboardingI18nProvider';
import { LocalizedLazyBoundary } from '../../src/ui/lazy-boundary';
import { ThemeProvider } from '../../src/ui/theme-provider';
import type { RoomBootstrap } from '../../src/ui/onboarding/ports/bootstrap';

const mocks = vi.hoisted(() => ({
  context: { roomId: 'room-a', userId: 'member-a', theme: 'dark', userRoles: ['owner'] },
  savedTheme: undefined as 'light' | 'dark' | 'brand' | undefined,
  bootstrap: vi.fn<() => Promise<RoomBootstrap>>(),
}));
const preferences = {
  get: async (key: string): Promise<unknown> => key.includes('ui:theme:') ? mocks.savedTheme : undefined,
  set: async () => {},
};
const app = { storage: preferences };
vi.mock('@privos_ai/app-react', () => ({ usePrivosApp: () => app, usePrivosContext: () => mocks.context }));
vi.mock('../../src/ui/onboarding/data/room-bootstrap', () => ({ resolveRoomBinding: mocks.bootstrap }));
vi.mock('../../src/ui/onboarding/data/catalogs', () => ({ createCatalogs: () => ({
  hires: async () => ({ items: [], nextCursor: null }), positions: async () => ({ items: [], nextCursor: null }),
}) }));
// Probe transport is an external boundary; render the actual diagnostics shell without calling Hub.
vi.mock('../../src/ui/onboarding/dev/privos-probes', () => ({ default: () => null }));

function Wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider hostTheme="dark" preferences={preferences} target={{ apply: () => {} }}>
    <OnboardingI18nProvider userId="member-a" preferences={preferences} hostLocale="en">{children}</OnboardingI18nProvider>
  </ThemeProvider>;
}
const panel = () => <PrivosOnboardingRoot><OnboardingPanel /></PrivosOnboardingRoot>;
function renderSurface(children: ReactNode) { return render(children, { wrapper: Wrapper }); }
beforeEach(() => {
  mocks.context.roomId = 'room-a'; mocks.context.theme = 'dark'; mocks.savedTheme = undefined;
  mocks.bootstrap.mockResolvedValue({ state: 'ready', binding: { roomId: 'room-a', positionsListId: 'positions-a', hiresListId: 'hires-a' } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('theme roots outside the onboarding shell', () => {
  it('themes both the closed and open diagnostics surface', async () => {
    const user = userEvent.setup();
    renderSurface(<DiagnosticsEntry roomId="room-a" userId="member-a" admin={false} theme="dark" />);
    const open = screen.getByRole('button', { name: 'Open P0 diagnostics' });
    expect(open.closest('.onboarding-v4')?.getAttribute('data-theme-mode')).toBe('dark');
    await user.click(open);
    expect(screen.getByRole('button', { name: 'Return to the v4 interface' }).closest('.onboarding-v4')?.getAttribute('data-theme-mode')).toBe('dark');
  });

  it('gives the missing-room message a resolved theme', () => {
    mocks.context.roomId = '';
    renderSurface(panel());
    expect(screen.getByText('Open this app inside a room.').closest('.onboarding-v4')?.getAttribute('data-theme-mode')).toBe('dark');
  });

  it('uses a themed recovery button and keeps internal errors out of the message', async () => {
    const user = userEvent.setup();
    const reload = vi.fn(); const logger = { event: vi.fn() };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function BrokenChunk(): never { throw new Error('PRIVATE_CHUNK_DETAILS'); }
    renderSurface(<LocalizedLazyBoundary reloadPage={{ reload }} logger={logger}><BrokenChunk /></LocalizedLazyBoundary>);
    const button = screen.getByRole('button', { name: 'Reload' });
    expect(button.closest('.onboarding-v4')?.getAttribute('data-theme-mode')).toBe('dark');
    expect(button.classList.contains('v4-primary-button')).toBe(true);
    expect(screen.queryByText(/PRIVATE_CHUNK_DETAILS/)).toBeNull();
    await user.click(button);
    expect(reload).toHaveBeenCalledOnce();
    expect(logger.event).toHaveBeenCalledWith('ui.chunk_failed', { code: 'CHUNK_UNAVAILABLE' });
  });

  it('shares saved Brand and manual Light with the diagnostics sibling', async () => {
    mocks.savedTheme = 'brand';
    const user = userEvent.setup();
    renderSurface(panel());
    const diagnostics = await screen.findByRole('button', { name: 'Open P0 diagnostics' });
    await waitFor(() => expect(diagnostics.closest('.onboarding-v4')?.getAttribute('data-theme-mode')).toBe('brand'));
    await user.click(screen.getByRole('button', { name: 'Light theme' }));
    await waitFor(() => expect(diagnostics.closest('.onboarding-v4')?.getAttribute('data-theme-mode')).toBe('light'));
  });

  it('does not carry the old identity theme into a new room', async () => {
    mocks.savedTheme = 'brand';
    const view = renderSurface(panel());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open P0 diagnostics' }).closest('.onboarding-v4')?.getAttribute('data-theme-mode')).toBe('brand'));
    mocks.context.roomId = 'room-b'; mocks.context.theme = 'light'; mocks.savedTheme = undefined;
    view.rerender(panel());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open P0 diagnostics' }).closest('.onboarding-v4')?.getAttribute('data-theme-mode')).toBe('light'));
  });
});
