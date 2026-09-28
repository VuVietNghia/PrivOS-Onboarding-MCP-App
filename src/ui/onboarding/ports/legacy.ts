import type { ListDiscovery, ListLifecyclePort, ListReadPort, ListWritePort } from './lists';
import type { FieldIds } from '../domain/fields';
import type { Progress } from '../domain/progress';
import type { StageRef } from '../domain/roadmap-plan';
import type { RoadmapTask } from '../domain/schemas';

export interface LegacyDeps {
  read: ListReadPort;
  write: ListWritePort;
  lifecycle: ListLifecyclePort;
  discovery: ListDiscovery;
}

export interface LoadedRoadmap {
  listId: string; stages: StageRef[]; ids: FieldIds; tasks: RoadmapTask[];
  invalid: { itemId: string; issues: string[] }[]; capped: boolean;
}
export interface LegacyProvisionInput { roomId: string; employeeId: string; templateListId: string; startDate: string; userRoles: readonly string[] }
export interface LegacyProvisionProgress { step: 'preflight' | 'hire' | 'plan' | 'list' | 'items' | 'finish'; done: number; total: number }
export interface LegacyProvisionResult { hireItemId: string; roadmapListId: string; taskCount: number }
export interface RecountInput {
  hireListId: string; hireItemId: string; hireIds: FieldIds; hireStages: StageRef[];
  roadmapListId: string; runIds: FieldIds; today: string; currentStageId?: string;
}
export interface LegacyServices {
  loadRoadmap(roadmapListId: string): Promise<LoadedRoadmap>;
  provisionRoadmap(input: LegacyProvisionInput, onProgress?: (progress: LegacyProvisionProgress) => void): Promise<LegacyProvisionResult>;
  resumeProvision(input: { roomId: string; hireItemId: string; userRoles: readonly string[] }, onProgress?: (progress: LegacyProvisionProgress) => void): Promise<LegacyProvisionResult>;
  cancelProvision(input: { roomId: string; hireItemId: string; userRoles: readonly string[] }): Promise<void>;
  recountHire(input: RecountInput): Promise<Progress>;
  toggleTask(input: RecountInput & { taskId: string; done: boolean }): Promise<Progress>;
}
