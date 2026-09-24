// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useCallback } from 'react';
import { useCatalogPage } from '../../src/ui/onboarding/views/use-catalog-page';
import { OnboardingError } from '../../src/ui/onboarding/domain/errors';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(cleanup);

describe('catalog page identity', () => {
  it('returns to the first page when a later cursor expires', async () => {
    let calls = 0;
    function Catalog() {
      const load = useCallback(async (cursor?: string) => {
        calls += 1;
        if (cursor) throw new OnboardingError('PAGINATION_INVALID');
        return { items: [{ id: `first-${calls}` }], nextCursor: 'cursor-2' };
      }, []);
      const page = useCatalogPage('room-a', load);
      return <><output>{page.items.map((item) => item.id).join(',')}</output><button type="button" onClick={page.next} disabled={!page.canNext}>Next</button></>;
    }
    render(<Catalog />);
    await screen.findByText('first-1');
    await act(async () => { screen.getByText('Next').click(); });
    await screen.findByText('first-3');
    expect(calls).toBe(3);
  });
  it('hides an old room response when a new room resolves first', async () => {
    const first = deferred<{ items: { id: string }[]; nextCursor: null }>();
    const second = deferred<{ items: { id: string }[]; nextCursor: null }>();
    function Catalog({ roomId }: { roomId: string }) {
      const load = useCallback(() => roomId === 'room-a' ? first.promise : second.promise, [roomId]);
      const page = useCatalogPage(roomId, load);
      return <output>{page.items.map((item) => item.id).join(',') || (page.loading ? 'loading' : 'empty')}</output>;
    }
    const view = render(<Catalog roomId="room-a" />);
    view.rerender(<Catalog roomId="room-b" />);
    second.resolve({ items: [{ id: 'room-b-item' }], nextCursor: null });
    await waitFor(() => expect(screen.getByText('room-b-item')).toBeTruthy());
    await act(async () => { first.resolve({ items: [{ id: 'room-a-item' }], nextCursor: null }); });
    expect(screen.queryByText('room-a-item')).toBeNull();
    expect(screen.getByText('room-b-item')).toBeTruthy();
  });
});
