import { useEffect, useRef, useState } from 'react';
import type { Page } from '../domain/models';
import { describeError, OnboardingError } from '../domain/errors';

interface PageState<T> {
  key: string;
  cursors: (string | undefined)[];
  index: number;
  items: T[];
  pageIds: string[][];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  reloadToken: number;
}

function emptyState<T>(key: string): PageState<T> {
  return { key, cursors: [undefined], index: 0, items: [], pageIds: [], nextCursor: null, loading: true, error: null, reloadToken: 0 };
}

export function useCatalogPage<T extends { id: string }>(key: string, load: (cursor?: string) => Promise<Page<T>>) {
  const [state, setState] = useState<PageState<T>>(() => emptyState(key));
  const latestRequest = useRef(0);
  const current = state.key === key ? state : emptyState<T>(key);

  useEffect(() => {
    if (state.key !== key) {
      latestRequest.current += 1;
      setState(emptyState(key));
    }
  }, [key, state.key]);

  useEffect(() => {
    if (state.key !== key) return;
    const requestId = ++latestRequest.current;
    let active = true;
    setState((previous) => previous.key === key ? { ...previous, loading: true, error: null, items: [] } : previous);
    void load(state.cursors[state.index]).then((page) => {
      if (!active || requestId !== latestRequest.current) return;
      setState((previous) => {
        if (previous.key !== key) return previous;
        const earlierIds = new Set(previous.pageIds.slice(0, previous.index).flat());
        const currentIds = new Set<string>();
        const items = page.items.filter((item) => {
          if (earlierIds.has(item.id) || currentIds.has(item.id)) return false;
          currentIds.add(item.id);
          return true;
        });
        const pageIds = previous.pageIds.slice();
        pageIds[previous.index] = page.items.map((item) => item.id);
        return { ...previous, items, pageIds, nextCursor: page.nextCursor, loading: false };
      });
    }).catch((error: unknown) => {
      if (!active || requestId !== latestRequest.current) return;
      setState((previous) => {
        if (previous.key !== key) return previous;
        if (error instanceof OnboardingError && error.code === 'PAGINATION_INVALID' && previous.index > 0) {
          return { ...emptyState<T>(key), reloadToken: previous.reloadToken + 1 };
        }
        return { ...previous, items: [], nextCursor: null, loading: false, error: describeError(error).message };
      });
    });
    return () => { active = false; };
  }, [key, load, state.key, state.cursors, state.index, state.reloadToken]);

  const next = () => setState((previous) => {
    if (previous.key !== key || previous.loading || !previous.nextCursor) return previous;
    if (previous.cursors.includes(previous.nextCursor)) return { ...previous, error: 'Phân trang không hợp lệ. Tải lại danh sách.', nextCursor: null };
    return { ...previous, cursors: [...previous.cursors, previous.nextCursor], index: previous.index + 1, items: [], nextCursor: null, loading: true };
  });
  const previous = () => setState((previous) => previous.key === key && previous.index > 0
    ? { ...previous, index: previous.index - 1, items: [], nextCursor: null, loading: true }
    : previous);
  const reload = () => setState((previous) => previous.key === key
    ? { ...emptyState<T>(key), reloadToken: previous.reloadToken + 1 }
    : previous);

  return {
    items: current.items, loading: current.loading, error: current.error,
    canNext: !current.loading && Boolean(current.nextCursor),
    canPrevious: !current.loading && current.index > 0,
    next, previous, reload,
  };
}
