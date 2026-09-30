// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivosI18nRoot } from '../../src/ui/composition/PrivosI18nRoot';
import { PrivosOnboardingRoot, useOnboardingSession } from '../../src/ui/composition/PrivosOnboardingRoot';
import { LocalizedLazyBoundary } from '../../src/ui/lazy-boundary';
import OnboardingPanel from '../../src/ui/onboarding/views/OnboardingPanel';
import { useUiLocale } from '../../src/ui/i18n/OnboardingI18nProvider';
import type { RoomBootstrap } from '../../src/ui/onboarding/ports/bootstrap';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve(value) { resolvePromise?.(value); } };
}

const host = vi.hoisted(() => ({
  context: {
    roomId: '',
    userId: 'user-a',
    userRoles: ['admin'],
    effectiveScopes: ['lists:read'],
    roomType: 'c' as const,
    theme: 'light',
  },
  reads: new Map<string, Promise<unknown>>(),
  writes: [] as Array<{ key: string; value: unknown }>,
  bootstrap: vi.fn<() => Promise<RoomBootstrap>>(),
}));

const appMock = {
  storage: {
    get: (key: string) => host.reads.get(key) ?? Promise.resolve(null),
    set: async (key: string, value: unknown) => { host.writes.push({ key, value }); },
  },
};

vi.mock('@privos_ai/app-react', () => ({
  usePrivosApp: () => appMock,
  usePrivosContext: () => host.context,
}));

vi.mock('../../src/ui/onboarding/data/room-bootstrap', () => ({
  resolveRoomBinding: host.bootstrap,
}));

afterEach(cleanup);

beforeEach(() => {
  host.context.roomId = '';
  host.context.userId = 'user-a';
  host.context.userRoles = ['admin'];
  host.context.theme = 'light';
  host.reads.clear();
  host.writes.length = 0;
  host.bootstrap.mockReset();
});

function LocaleControls() {
  const { locale, setLocale } = useUiLocale();
  return <div><output aria-label="active-locale">{locale}</output><button type="button" onClick={() => setLocale('en')}>EN</button></div>;
}

function LoadedScreen() {
  const session = useOnboardingSession();
  const { setLocale } = useUiLocale();
  return <div>
    <input aria-label="draft" defaultValue={session?.services ? 'kept' : 'pending'} />
    <button type="button" onClick={() => setLocale('en')}>Switch to English</button>
  </div>;
}

describe('application locale composition', () => {
  it('localizes pre-bootstrap and chunk failure surfaces', async () => {
    const user = userEvent.setup();
    const view = render(
      <PrivosI18nRoot>
        <LocaleControls />
        <PrivosOnboardingRoot><OnboardingPanel /></PrivosOnboardingRoot>
      </PrivosI18nRoot>,
    );
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByText('Open this app inside a room.')).toBeTruthy();
    view.unmount();

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Broken(): never { throw new Error('CHUNK_UNAVAILABLE'); }
    try {
      render(
        <PrivosI18nRoot>
          <LocaleControls />
          <LocalizedLazyBoundary reloadPage={{ reload() {} }} logger={{ event() {} }}>
            <Broken />
          </LocalizedLazyBoundary>
        </PrivosI18nRoot>,
      );
      await user.click(screen.getByRole('button', { name: 'EN' }));
      expect(screen.getByText('A new version of this app is available.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('does not rebootstrap or remount loaded state when locale changes', async () => {
    host.context.roomId = 'room-a';
    host.bootstrap.mockResolvedValue({
      state: 'ready',
      binding: { roomId: 'room-a', positionsListId: 'positions-a', hiresListId: 'hires-a' },
    });
    const user = userEvent.setup();
    render(<PrivosI18nRoot><PrivosOnboardingRoot><LoadedScreen /></PrivosOnboardingRoot></PrivosI18nRoot>);
    await waitFor(() => expect(host.bootstrap).toHaveBeenCalledTimes(1));
    const draft = screen.getByRole('textbox', { name: 'draft' });
    await user.clear(draft);
    await user.type(draft, 'draft survives');
    await user.click(screen.getByRole('button', { name: 'Switch to English' }));
    expect(screen.getByRole('textbox', { name: 'draft' })).toBe(draft);
    expect((draft as HTMLInputElement).value).toBe('draft survives');
    expect(host.bootstrap).toHaveBeenCalledTimes(1);
  });

  it('ignores a pending locale read from the previous actor', async () => {
    const userA = deferred<unknown>();
    const userB = deferred<unknown>();
    host.reads.set('ui:language:user-a', userA.promise);
    host.reads.set('ui:language:user-b', userB.promise);
    const view = render(<PrivosI18nRoot><LocaleControls /></PrivosI18nRoot>);
    host.context.userId = 'user-b';
    view.rerender(<PrivosI18nRoot><LocaleControls /></PrivosI18nRoot>);
    await act(async () => userB.resolve('en'));
    await act(async () => userA.resolve('vi'));
    expect(screen.getByLabelText('active-locale').textContent).toBe('en');
  });
});
