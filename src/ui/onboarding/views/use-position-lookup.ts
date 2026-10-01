import { useCallback, useEffect, useRef, useState } from 'react';
import type { Scheduler } from '../../../shared/ports/effects';
import type { Catalogs } from '../ports/catalogs';
import type { Position } from '../domain/models';
import { OnboardingError } from '../domain/errors';
import { toUiError, type UiError } from '../../i18n/ui-error';

export function usePositionLookup(catalogs: Catalogs, scheduler: Scheduler, selected: Position | null, onSelect: (position: Position | null) => void) {
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Position[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [revision, setRevision] = useState(0);
  const request = useRef(0);
  const busy = useRef(false);
  const cursors = useRef(new Set<string>());

  const fetchPage = useCallback(async (next: string | undefined, version: number) => {
    busy.current = true; setLoading(true); setError(null);
    try {
      const page = await catalogs.positions({ text: query.trim() }, next);
      if (version !== request.current) return;
      if (page.nextCursor && (page.nextCursor === next || cursors.current.has(page.nextCursor))) throw new OnboardingError('PAGINATION_INVALID');
      if (next) cursors.current.add(next);
      setItems((previous) => [...new Map([...(next ? previous : []), ...page.items].map((item) => [item.id, item])).values()]);
      setCursor(page.nextCursor);
    } catch (cause) {
      if (version === request.current) setError(toUiError(cause));
    } finally {
      if (version === request.current) { busy.current = false; setLoading(false); }
    }
  }, [catalogs, query]);

  useEffect(() => {
    const version = ++request.current;
    if (!open) return;
    setItems([]); setCursor(null); setError(null); setLoading(true);
    busy.current = true; cursors.current.clear();
    const cancel = scheduler.after(300, () => { void fetchPage(undefined, version); });
    return () => { cancel(); if (request.current === version) request.current += 1; };
  }, [open, fetchPage, scheduler, revision]);

  const invalidate = () => { request.current += 1; busy.current = false; setLoading(false); };
  const close = () => { invalidate(); setOpen(false); setQuery(selected?.name ?? ''); };
  const select = (position: Position | null) => {
    invalidate(); onSelect(position); setQuery(position?.name ?? ''); setOpen(false);
    setItems([]); setCursor(null); setError(null);
  };
  return {
    query, open, items, loading, error, hasMore: cursor !== null,
    focus: () => { if (!open) { setLoading(true); setOpen(true); } },
    change: (value: string) => { invalidate(); setQuery(value); setItems([]); setCursor(null); setError(null); setLoading(true); setOpen(true); },
    close, select, clear: () => select(null),
    more: () => { if (open && cursor && !busy.current) void fetchPage(cursor, request.current); },
    retry: () => { invalidate(); setRevision((value) => value + 1); },
  };
}
