import type { Hasher } from '../../../shared/ports/effects';
import type { Position, RoomBinding, TemplateTree, ContentItem, Week } from '../domain/models';
import type { Catalogs } from './catalogs';
import type { ListLifecyclePort, ListReadPort, ListWritePort } from './lists';
import type { ActorSession } from './session';

export interface PreparedProvisionV4 {
  input: { positionId: string; employeeId: string; employeeName: string; startDate: string; operationId: string };
  position: Position;
  tree: TemplateTree;
  fingerprint: string;
}

export type ProvisionPhase = 'record' | 'list' | 'content' | 'grant' | 'activate' | 'recount';
export interface ProvisionProgress { phase: ProvisionPhase; completed: number; total: number }
export type ProvisionOutcome = { state: 'active' | 'active-needs-recount'; hireId: string; roadmapListId: string };
export interface PlannedRunNode { sourceId: string; parentSourceId: string; node: Week | ContentItem }

export interface ProvisionDeps {
  actor: ActorSession;
  binding: RoomBinding;
  catalogs: Pick<Catalogs, 'position' | 'template' | 'hires'>;
  read: Pick<ListReadPort, 'readListInfo' | 'readItem' | 'readAllItems' | 'queryItems' | 'listRoomLists' | 'isolatedInfo'>;
  write: Pick<ListWritePort, 'createItem' | 'patchFields' | 'moveItemToStage'>;
  lifecycle: Pick<ListLifecyclePort, 'createIsolatedList'>;
  hasher: Hasher;
}

export interface ProvisionService {
  start(prepared: PreparedProvisionV4, onProgress?: (progress: ProvisionProgress) => void): Promise<ProvisionOutcome>;
  resume(hireId: string, prepared: PreparedProvisionV4, onProgress?: (progress: ProvisionProgress) => void): Promise<ProvisionOutcome>;
  recount(positionId: string): Promise<number>;
  fingerprint(tree: TemplateTree): Promise<string>;
  operationId(hireId: string): Promise<string>;
}
