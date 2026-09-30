// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import type { Preferences } from '../../src/shared/ports/effects';
import { OnboardingI18nProvider, useUiLocale } from '../../src/ui/i18n/OnboardingI18nProvider';

afterEach(cleanup);

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value) { resolvePromise?.(value); },
    reject(reason) { rejectPromise?.(reason); },
  };
}

function Probe({ name }: { name: string }) {
  const { locale, setLocale } = useUiLocale();
  return (
    <section>
      <output aria-label={`${name}-locale`}>{locale}</output>
      <button type="button" onClick={() => setLocale('en')}>{`set-${name}-en`}</button>
      <button type="button" onClick={() => setLocale('vi')}>{`set-${name}-vi`}</button>
    </section>
  );
}

function Harness({ children, preferences, userId = 'user-a', hostLocale = 'vi' }: {
  children: ReactNode;
  preferences: Preferences;
  userId?: string;
  hostLocale?: string;
}) {
  return (
    <OnboardingI18nProvider
      userId={userId}
      preferences={preferences}
      hostLocale={hostLocale}
      browserLocale="vi-VN"
    >
      {children}
    </OnboardingI18nProvider>
  );
}

describe('OnboardingI18nProvider', () => {
  it('does not let a delayed preference read overwrite an explicit choice', async () => {
    const pending = deferred<unknown>();
    const preferences: Preferences = { get: () => pending.promise, set: async () => {} };
    const user = userEvent.setup();
    render(<Harness preferences={preferences}><Probe name="first" /></Harness>);
    await user.click(screen.getByRole('button', { name: 'set-first-en' }));
    await act(async () => pending.resolve('vi'));
    expect(screen.getByLabelText('first-locale').textContent).toBe('en');
  });

  it('ignores an old actor read after switching users', async () => {
    const reads = new Map<string, Deferred<unknown>>([
      ['ui:language:user-a', deferred<unknown>()],
      ['ui:language:user-b', deferred<unknown>()],
    ]);
    const preferences: Preferences = {
      get: (key) => reads.get(key)?.promise ?? Promise.resolve(null),
      set: async () => {},
    };
    const view = render(<Harness preferences={preferences} userId="user-a"><Probe name="actor" /></Harness>);
    view.rerender(<Harness preferences={preferences} userId="user-b" hostLocale="en"><Probe name="actor" /></Harness>);
    await act(async () => reads.get('ui:language:user-b')?.resolve('en'));
    await act(async () => reads.get('ui:language:user-a')?.resolve('vi'));
    expect(screen.getByLabelText('actor-locale').textContent).toBe('en');
  });

  it('keeps two provider instances independent', async () => {
    const preferences: Preferences = { get: async () => null, set: async () => {} };
    const user = userEvent.setup();
    render(
      <>
        <Harness preferences={preferences}><Probe name="left" /></Harness>
        <Harness preferences={preferences}><Probe name="right" /></Harness>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'set-left-en' }));
    expect(screen.getByLabelText('left-locale').textContent).toBe('en');
    expect(screen.getByLabelText('right-locale').textContent).toBe('vi');
  });

  it('uses fallback when reading a preference fails', async () => {
    const preferences: Preferences = { get: async () => { throw new Error('read failed'); }, set: async () => {} };
    render(<Harness preferences={preferences} hostLocale="en"><Probe name="fallback" /></Harness>);
    await waitFor(() => expect(screen.getByLabelText('fallback-locale').textContent).toBe('en'));
  });

  it('keeps the chosen locale visible when persistence fails', async () => {
    const preferences: Preferences = { get: async () => null, set: async () => { throw new Error('write failed'); } };
    const user = userEvent.setup();
    render(<Harness preferences={preferences}><Probe name="failed-write" /></Harness>);
    await user.click(screen.getByRole('button', { name: 'set-failed-write-en' }));
    expect(screen.getByLabelText('failed-write-locale').textContent).toBe('en');
  });

  it('serializes rapid writes so the stored locale ends at the latest choice', async () => {
    const writes: Array<{ value: unknown; pending: Deferred<void> }> = [];
    let stored: unknown = null;
    const preferences: Preferences = {
      get: async () => null,
      set: async (_key, value) => {
        const pending = deferred<void>();
        writes.push({ value, pending });
        await pending.promise;
        stored = value;
      },
    };
    const user = userEvent.setup();
    render(<Harness preferences={preferences}><Probe name="rapid" /></Harness>);
    await user.click(screen.getByRole('button', { name: 'set-rapid-en' }));
    await user.click(screen.getByRole('button', { name: 'set-rapid-vi' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.value).toBe('en');
    await act(async () => writes[0]?.pending.resolve());
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]?.value).toBe('vi');
    await act(async () => writes[1]?.pending.resolve());
    await waitFor(() => expect(stored).toBe('vi'));
  });
});
