import { useCallback, useEffect, useState } from 'react';
import { usePrivosApp } from '@privos_ai/app-react';
import { findHiresList, loadListWithFields } from '../data/find-lists';
import { listAllItems, type HubList } from '../data/onboarding-lists';
import { HIRES_FIELDS, type FieldIds } from '../domain/fields';
import type { StageRef } from '../domain/roadmap-plan';
import { parseHire, type Hire } from '../domain/schemas';

export interface HiresState {
  state: 'loading' | 'ready' | 'error';
  list: HubList | null; ids: FieldIds; stages: StageRef[];
  hires: Hire[]; invalid: { itemId: string; issues: string[] }[];
  capped: boolean; error: unknown | null;
  reload: () => void;
}

export function useHires(roomId: string): HiresState {
  const app = usePrivosApp();
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<Omit<HiresState, 'reload'>>({ state: 'loading', list: null, ids: {}, stages: [], hires: [], invalid: [], capped: false, error: null });
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    setData((d) => ({ ...d, state: 'loading', error: null }));
    (async () => {
      const list = await findHiresList(app, roomId);
      if (!list) return { state: 'ready' as const, list: null, ids: {}, stages: [], hires: [], invalid: [], capped: false, error: null };
      const loaded = await loadListWithFields(app, list._id, HIRES_FIELDS);
      const { items, capped } = await listAllItems(app, list._id);
      const hires: Hire[] = []; const invalid: { itemId: string; issues: string[] }[] = [];
      for (const item of items) { const r = parseHire(item, loaded.ids); if (r.ok) hires.push(r.value); else invalid.push({ itemId: r.itemId, issues: r.issues }); }
      return { state: 'ready' as const, list, ids: loaded.ids, stages: loaded.stages, hires, invalid, capped, error: null };
    })()
      .then((next) => { if (!cancelled) setData(next); })
      .catch((error: unknown) => { if (!cancelled) setData((d) => ({ ...d, state: 'error', error })); });
    return () => { cancelled = true; };
  }, [app, roomId, tick]);

  return { ...data, reload };
}
