// src/ui/onboarding/flows/load-roadmap.ts
import type { McpApp } from '@privos_ai/app-react';
import { loadListWithFields } from '../data/find-lists';
import { listAllItems } from '../data/onboarding-lists';
import { RUN_FIELDS, type FieldIds } from '../domain/fields';
import type { StageRef } from '../domain/roadmap-plan';
import { parseRoadmapTask, type RoadmapTask } from '../domain/schemas';

export interface LoadedRoadmap {
  listId: string; stages: StageRef[]; ids: FieldIds; tasks: RoadmapTask[];
  invalid: { itemId: string; issues: string[] }[]; capped: boolean;
}

export async function loadRoadmap(app: McpApp, roadmapListId: string): Promise<LoadedRoadmap> {
  const { stages, ids } = await loadListWithFields(app, roadmapListId, RUN_FIELDS);
  const { items, capped } = await listAllItems(app, roadmapListId);
  const tasks: RoadmapTask[] = [];
  const invalid: { itemId: string; issues: string[] }[] = [];
  for (const item of items) {
    const r = parseRoadmapTask(item, ids);
    if (r.ok) tasks.push(r.value); else invalid.push({ itemId: r.itemId, issues: r.issues });
  }
  return { listId: roadmapListId, stages, ids, tasks, invalid, capped };
}
