import type { LegacyDeps, LegacyServices } from '../ports/legacy';
import { loadRoadmap } from './load-roadmap';
import { cancelProvision, provisionRoadmap, resumeProvision } from './provision-roadmap';
import { recountHire, toggleTask } from './toggle-task';

export function createLegacyServices(deps: LegacyDeps): LegacyServices {
  return {
    loadRoadmap: (roadmapListId: string) => loadRoadmap(deps, roadmapListId),
    provisionRoadmap: (input: Parameters<typeof provisionRoadmap>[1], onProgress?: Parameters<typeof provisionRoadmap>[2]) =>
      provisionRoadmap(deps, input, onProgress),
    resumeProvision: (input: Parameters<typeof resumeProvision>[1], onProgress?: Parameters<typeof resumeProvision>[2]) =>
      resumeProvision(deps, input, onProgress),
    cancelProvision: (input: Parameters<typeof cancelProvision>[1]) => cancelProvision(deps, input),
    recountHire: (input: Parameters<typeof recountHire>[1]) => recountHire(deps, input),
    toggleTask: (input: Parameters<typeof toggleTask>[1]) => toggleTask(deps, input),
  };
}

export type { LegacyServices } from '../ports/legacy';
