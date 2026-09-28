import type { RoomBootstrap } from '../ports/bootstrap';
export type { RoomBootstrap } from '../ports/bootstrap';
import { OnboardingError } from '../domain/errors';
import { registryListInput } from '../domain/v2-registry-schema';
import { isRoomAdmin } from '../domain/roles';
import type { ActorSession } from '../ports/session';
import type { ListReadPort, ListLifecyclePort, IsolatedListInfo } from '../ports/lists';

export interface RoomBootstrapDeps {
  read: Pick<ListReadPort, 'registryLists' | 'isolatedInfo'>;
  lifecycle: Pick<ListLifecyclePort, 'createIsolatedList'>;
}

export async function resolveRoomBinding(deps: RoomBootstrapDeps, session: ActorSession): Promise<RoomBootstrap> {
  const roomId = session.roomId;
  const actor = { userId: session.userId, canManage: isRoomAdmin(session.roles) };
  if (!roomId || !actor.userId) return { state: 'blocked', code: 'SCHEMA_DRIFT' };
  // Members only need the hire registry and their assigned run. Reading the position registry
  // here would make an isolated HR List a prerequisite for every employee session.
  const kinds = actor.canManage ? ['positions', 'hires'] as const : ['hires'] as const;
  const foundIds: string[] = [];
  let lists = await deps.read.registryLists(roomId);
  for (const kind of kinds) {
    const input = registryListInput(roomId, kind);
    let matches = lists.filter((list) => list.name === input.name);
    if (matches.length > 1) return { state: 'blocked', code: 'DUPLICATE_REGISTRY' };
    if (matches.length === 0) {
      if (!actor.canManage) return { state: 'needs-admin' };
      let createdId: string | null = null;
      try { createdId = (await deps.lifecycle.createIsolatedList(input))._id; }
      catch (error: unknown) {
        lists = await deps.read.registryLists(roomId);
        matches = lists.filter((list) => list.name === input.name);
        if (matches.length !== 1) {
          if (matches.length > 1) return { state: 'blocked', code: 'DUPLICATE_REGISTRY' };
          throw error;
        }
      }
      if (createdId) {
        lists = await deps.read.registryLists(roomId);
        matches = lists.filter((list) => list.name === input.name);
        if (matches.length !== 1 || matches[0]._id !== createdId) return { state: 'blocked', code: matches.length > 1 ? 'DUPLICATE_REGISTRY' : 'SCHEMA_DRIFT' };
      }
    }
    const summary = matches[0];
    if (!summary.isolatedList) return { state: 'blocked', code: 'SCHEMA_DRIFT' };
    let detail: IsolatedListInfo;
    try { detail = await deps.read.isolatedInfo(summary._id); }
    catch (error: unknown) {
      if (error instanceof OnboardingError && error.code === 'SCHEMA_DRIFT') return { state: 'blocked', code: 'SCHEMA_DRIFT' };
      throw error;
    }
    if (detail.roomId !== roomId || detail.name !== input.name || !detail.isolatedList) return { state: 'blocked', code: 'SCHEMA_DRIFT' };
    if (detail.fieldDefinitions.length !== input.fields.length || input.fields.some((field) => {
      const sameName = detail.fieldDefinitions.filter((candidate) => candidate.name === field.name);
      return sameName.length !== 1 || sameName[0].type !== field.type ||
        (field.options && field.options.join('\u0000') !== (sameName[0].options ?? []).map((option) => option.value).join('\u0000'));
    })) return { state: 'blocked', code: 'SCHEMA_DRIFT' };
    const actualStages = [...detail.stages].sort((a, b) => a.order - b.order).map((stage) => stage.name);
    if (actualStages.join('\u0000') !== input.stages.map((stage) => stage.name).join('\u0000')) {
      return { state: 'blocked', code: 'BOOTSTRAP_STAGE_UNAVAILABLE' };
    }
    foundIds.push(summary._id);
  }
  return { state: 'ready', binding: actor.canManage
    ? { roomId, positionsListId: foundIds[0], hiresListId: foundIds[1] }
    : { roomId, positionsListId: lists.find((list) => list.name === registryListInput(roomId, 'positions').name)?._id ?? '', hiresListId: foundIds[0] } };
}
