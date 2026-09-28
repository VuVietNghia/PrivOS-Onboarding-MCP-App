import { createCatalogs } from '../catalogs';
import type { RoomBinding } from '../../domain/models';
import { resolveV2FieldIds, V2, V2_HIRE_FIELDS, V2_POSITION_FIELDS } from '../../domain/v2-fields';
import type { HrV4Gateway } from '../../ports/hr';
import type { ListLifecyclePort, ListReadPort, ListWritePort } from '../../ports/lists';

function field(item: { customFields?: { fieldId: string; value: unknown }[] }, fieldId: string): unknown {
  return item.customFields?.find((entry) => entry.fieldId === fieldId)?.value;
}

function provisionRunKey(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; } catch { throw new Error('PROVISION_CHECKPOINT_INVALID'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('runKey' in parsed)) throw new Error('PROVISION_CHECKPOINT_INVALID');
  return typeof parsed.runKey === 'string' ? parsed.runKey : '';
}

export function createPrivosHrGateway(deps: {
  binding: RoomBinding;
  read: ListReadPort;
  write: ListWritePort;
  lifecycle: ListLifecyclePort;
}): HrV4Gateway {
  const { binding, read, write, lifecycle } = deps;
  if (!binding.roomId || !binding.hiresListId || !binding.positionsListId) throw new Error('ROOM_NOT_CONFIGURED');
  const catalogs = createCatalogs({ binding, read });
  const detail = async (listId: string) => {
    const info = await read.readListInfo(listId);
    if (info.list.roomId !== binding.roomId) throw new Error('ROOM_MISMATCH');
    return info;
  };
  const hireIds = async () => resolveV2FieldIds((await detail(binding.hiresListId)).list.fieldDefinitions, V2_HIRE_FIELDS);
  const positionIds = async () => resolveV2FieldIds((await detail(binding.positionsListId)).list.fieldDefinitions, V2_POSITION_FIELDS);
  const moveTo = async (listId: string, itemId: string, stageName: string): Promise<void> => {
    const info = await detail(listId);
    const stage = info.stages.find((entry) => entry.name === stageName);
    if (!stage) throw new Error('STAGE_MISSING');
    await write.moveItemToStage(itemId, stage._id);
    if ((await read.readItem(listId, itemId)).stageId !== stage._id) throw new Error('STAGE_UPDATE_UNVERIFIED');
  };

  const gateway: HrV4Gateway = {
    async readHire(hireId) {
      const ids = await hireIds();
      const hire = await catalogs.hire(hireId);
      const raw = await read.readItem(binding.hiresListId, hireId);
      const pendingSubmission = field(raw, ids[V2.pendingSubmission]);
      if (pendingSubmission !== undefined && pendingSubmission !== null && typeof pendingSubmission !== 'string') throw new Error('SCHEMA_DRIFT');
      return { hire, runKey: provisionRunKey(field(raw, ids[V2.provision])), pendingSubmission: !!pendingSubmission };
    },
    readPosition: (positionId) => catalogs.position(positionId),
    listHires: (positionId, cursor) => catalogs.hires({ text: '', positionId }, cursor),
    async readRun(runId) {
      const matches = (await read.listRoomLists(binding.roomId)).filter((candidate) => candidate._id === runId);
      if (matches.length > 1) throw new Error('RUN_ID_CONFLICT');
      if (!matches.length) return null;
      const run = await read.isolatedInfo(runId);
      if (run.roomId !== binding.roomId || !run.isolatedList || !matches[0].key) throw new Error('RUN_OWNERSHIP_INVALID');
      return { id: run._id, roomId: run.roomId, isolated: run.isolatedList, key: matches[0].key };
    },
    async markCancelPending(hireId) {
      const record = await gateway.readHire(hireId);
      if (record.hire.pendingAction !== null || record.pendingSubmission ||
        !['learning', 'done', 'failed'].includes(record.hire.status)) throw new Error('HIRE_BUSY');
      const ids = await hireIds();
      await write.patchFields(binding.hiresListId, hireId, { [ids[V2.pendingAction]]: 'cancel' });
    },
    async clearCancelPending(hireId) {
      const ids = await hireIds();
      await write.patchFields(binding.hiresListId, hireId, { [ids[V2.pendingAction]]: '' });
    },
    async deleteRun(runId) {
      const run = await gateway.readRun(runId);
      if (!run || !run.isolated || run.roomId !== binding.roomId) throw new Error('RUN_OWNERSHIP_INVALID');
      await lifecycle.deleteList(runId);
    },
    async markHireCancelled(hireId) {
      const record = await gateway.readHire(hireId);
      if (record.hire.status === 'cancelled') return;
      if (!['learning', 'done'].includes(record.hire.status) || record.hire.pendingAction !== 'cancel') throw new Error('HIRE_STATUS_INVALID');
      await moveTo(binding.hiresListId, hireId, 'Đã huỷ');
    },
    async deleteFailedHire(hireId) {
      const record = await gateway.readHire(hireId);
      if (record.hire.status !== 'failed' || record.hire.pendingAction !== 'cancel') throw new Error('HIRE_STATUS_INVALID');
      await write.deleteItem(hireId);
      const ids = await hireIds();
      let cursor: string | undefined;
      const seen = new Set<string>();
      do {
        const page = await read.queryItems(binding.hiresListId, { archived: false,
          customFields: [{ fieldId: ids[V2.position], op: 'is', value: record.hire.positionId }] }, 200, cursor);
        if (page.items.some((item) => item._id === hireId)) throw new Error('HIRE_DELETE_UNVERIFIED');
        if (page.nextCursor && seen.has(page.nextCursor)) throw new Error('PAGINATION_INVALID');
        if (page.nextCursor) seen.add(page.nextCursor);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
    },
    async markPositionDisabled(positionId) {
      const position = await catalogs.position(positionId);
      if (position.status === 'disabled') return;
      await moveTo(binding.positionsListId, positionId, 'Ngừng dùng');
      if ((await catalogs.position(positionId)).status !== 'disabled') throw new Error('POSITION_DISABLE_UNVERIFIED');
    },
    async writeInUse(positionId, count) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('COUNT_INVALID');
      const ids = await positionIds();
      await write.patchFields(binding.positionsListId, positionId, { [ids[V2.inUse]]: count });
    },
  };
  return gateway;
}
