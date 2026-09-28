// src/ui/onboarding/flows/load-roadmap.ts
import type { LegacyDeps, LoadedRoadmap } from '../ports/legacy';
import { RUN_FIELDS } from '../domain/fields';
import { parseRoadmapTask, type RoadmapTask } from '../domain/schemas';

export type { LoadedRoadmap } from '../ports/legacy';

export async function loadRoadmap(deps: Pick<LegacyDeps, 'read' | 'discovery'>, roadmapListId: string): Promise<LoadedRoadmap> {
  const { stages, ids } = await deps.discovery.loadListWithFields(roadmapListId, RUN_FIELDS);
  const { items, capped } = await deps.read.listAllItems(roadmapListId);
  const tasks: RoadmapTask[] = [];
  const invalid: { itemId: string; issues: string[] }[] = [];
  for (const item of items) {
    const r = parseRoadmapTask(item, ids);
    if (r.ok) tasks.push(r.value); else invalid.push({ itemId: r.itemId, issues: r.issues });
  }
  return { listId: roadmapListId, stages, ids, tasks, invalid, capped };
}
