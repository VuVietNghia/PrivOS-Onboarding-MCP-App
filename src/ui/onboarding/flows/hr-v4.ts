import type { McpApp } from '@privos_ai/app-react';
import { createCatalogs } from '../data/catalogs';
import { getIsolatedListViaTool } from '../data/isolated-lists';
import { listRoomLists } from '../data/onboarding-lists';
import { unwrapToolResult } from '../data/tool-result';
import { patchFields, queryItems, readItem, readListInfo } from '../data/v2-lists';
import type { Hire, Page, Position } from '../domain/models';
import type { RoomBinding } from '../domain/models';
import { isRoomAdmin } from '../domain/roles';
import { resolveV2FieldIds, V2, V2_HIRE_FIELDS, V2_POSITION_FIELDS } from '../domain/v2-fields';

export interface HrHireRecord {
  hire: Hire;
  runKey: string;
  pendingSubmission: boolean;
}

export interface HrRun {
  id: string;
  roomId: string;
  isolated: boolean;
  key: string;
}

export interface HrV4Gateway {
  readHire(hireId: string): Promise<HrHireRecord>;
  readPosition(positionId: string): Promise<Position>;
  listHires(positionId: string, cursor?: string): Promise<Page<Hire>>;
  readRun(runId: string): Promise<HrRun | null>;
  markCancelPending(hireId: string): Promise<void>;
  clearCancelPending(hireId: string): Promise<void>;
  deleteRun(runId: string): Promise<void>;
  markHireCancelled(hireId: string): Promise<void>;
  deleteFailedHire(hireId: string): Promise<void>;
  markPositionDisabled(positionId: string): Promise<void>;
  writeInUse(positionId: string, count: number): Promise<void>;
}

export interface CancelOutcome { hire: Hire; needsRecount: boolean }

function requireAdmin(roles: readonly string[]): void {
  if (!isRoomAdmin(roles)) throw new Error('NOT_ADMIN');
}

function verifyRun(record: HrHireRecord, run: HrRun, roomId: string): void {
  if (!record.hire.roadmapListId || run.id !== record.hire.roadmapListId || run.roomId !== roomId ||
    !run.isolated || !record.runKey || run.key !== record.runKey) throw new Error('RUN_OWNERSHIP_INVALID');
}

export function createHrV4Actions(gateway: HrV4Gateway, roomId: string, actorRoles: readonly string[]) {
  if (!roomId) throw new Error('ROOM_NOT_CONFIGURED');

  async function recountPosition(positionId: string): Promise<number> {
    requireAdmin(actorRoles);
    const position = await gateway.readPosition(positionId);
    if (position.id !== positionId) throw new Error('POSITION_NOT_FOUND');
    let count = 0;
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await gateway.listHires(positionId, cursor);
      for (const hire of page.items) {
        if (hire.positionId !== positionId) throw new Error('HIRE_POSITION_MISMATCH');
        if (hire.status === 'learning') count++;
      }
      if (page.nextCursor && seen.has(page.nextCursor)) throw new Error('PAGINATION_INVALID');
      if (page.nextCursor) seen.add(page.nextCursor);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    await gateway.writeInUse(positionId, count);
    return count;
  }

  async function deleteVerifiedRun(record: HrHireRecord, allowAbsent: boolean): Promise<void> {
    const runId = record.hire.roadmapListId;
    if (!runId) return;
    const run = await gateway.readRun(runId);
    if (!run) {
      if (!allowAbsent) throw new Error('RUN_UNAVAILABLE');
      return;
    }
    verifyRun(record, run, roomId);
    try { await gateway.deleteRun(runId); }
    catch (error) {
      if (await gateway.readRun(runId)) throw error;
    }
    if (await gateway.readRun(runId)) throw new Error('RUN_DELETE_UNVERIFIED');
  }

  async function cancelActive(hireId: string): Promise<CancelOutcome> {
    requireAdmin(actorRoles);
    const initial = await gateway.readHire(hireId);
    if (initial.hire.status === 'cancelled') {
      let needsRecount = false;
      try { await recountPosition(initial.hire.positionId); } catch { needsRecount = true; }
      return { hire: initial.hire, needsRecount };
    }
    if (initial.hire.status !== 'learning' && initial.hire.status !== 'done') throw new Error('HIRE_STATUS_INVALID');
    if (initial.pendingSubmission) throw new Error('HIRE_BUSY');
    if (!initial.hire.roadmapListId || !initial.runKey) throw new Error('RUN_UNAVAILABLE');
    if (initial.hire.pendingAction !== null && initial.hire.pendingAction !== 'cancel') throw new Error('HIRE_BUSY');
    if (initial.hire.pendingAction === null) {
      const run = await gateway.readRun(initial.hire.roadmapListId);
      if (!run) throw new Error('RUN_UNAVAILABLE');
      verifyRun(initial, run, roomId);
      await gateway.markCancelPending(hireId);
    }
    await deleteVerifiedRun(initial, initial.hire.pendingAction === 'cancel');
    const latest = await gateway.readHire(hireId);
    if (latest.hire.roadmapListId !== initial.hire.roadmapListId || latest.hire.positionId !== initial.hire.positionId ||
      latest.hire.pendingAction !== 'cancel') throw new Error('HIRE_CHANGED');
    if (latest.hire.status !== 'cancelled') await gateway.markHireCancelled(hireId);
    await gateway.clearCancelPending(hireId);
    const final = await gateway.readHire(hireId);
    if (final.hire.status !== 'cancelled' || final.hire.pendingAction !== null) throw new Error('HIRE_CANCEL_UNVERIFIED');
    let needsRecount = false;
    try { await recountPosition(final.hire.positionId); } catch { needsRecount = true; }
    return { hire: final.hire, needsRecount };
  }

  async function cancelFailed(hireId: string): Promise<void> {
    requireAdmin(actorRoles);
    const record = await gateway.readHire(hireId);
    if (record.hire.status !== 'failed') throw new Error('HIRE_STATUS_INVALID');
    if (record.pendingSubmission) throw new Error('HIRE_BUSY');
    if (record.hire.roadmapListId && !record.runKey) throw new Error('RUN_OWNERSHIP_INVALID');
    if (record.hire.pendingAction === null) await gateway.markCancelPending(hireId);
    await deleteVerifiedRun(record, record.hire.pendingAction === 'cancel');
    await gateway.deleteFailedHire(hireId);
    await recountPosition(record.hire.positionId);
  }

  async function disablePosition(positionId: string): Promise<void> {
    requireAdmin(actorRoles);
    const position = await gateway.readPosition(positionId);
    if (position.id !== positionId) throw new Error('POSITION_NOT_FOUND');
    if (position.status === 'disabled') return;
    if (position.status !== 'draft' && position.status !== 'ready') throw new Error('POSITION_STATUS_INVALID');
    await gateway.markPositionDisabled(positionId);
  }

  return { cancelActive, cancelFailed, disablePosition, recountPosition };
}

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

export function createMcpHrV4Gateway(app: McpApp, binding: RoomBinding): HrV4Gateway {
  if (!binding.roomId || !binding.hiresListId || !binding.positionsListId) throw new Error('ROOM_NOT_CONFIGURED');
  const catalogs = createCatalogs(app, binding);
  const detail = async (listId: string) => {
    const info = await readListInfo(app, listId);
    if (info.list.roomId !== binding.roomId) throw new Error('ROOM_MISMATCH');
    return info;
  };
  const hireIds = async () => resolveV2FieldIds((await detail(binding.hiresListId)).list.fieldDefinitions, V2_HIRE_FIELDS);
  const positionIds = async () => resolveV2FieldIds((await detail(binding.positionsListId)).list.fieldDefinitions, V2_POSITION_FIELDS);
  const moveTo = async (listId: string, itemId: string, stageName: string): Promise<void> => {
    const info = await detail(listId);
    const stage = info.stages.find((entry) => entry.name === stageName);
    if (!stage) throw new Error('STAGE_MISSING');
    unwrapToolResult(await app.callServerTool({ name: 'mcpapp.lists.moveItemToStage', arguments: { itemId, stageId: stage._id } }));
    if ((await readItem(app, listId, itemId)).stageId !== stage._id) throw new Error('STAGE_UPDATE_UNVERIFIED');
  };

  const gateway: HrV4Gateway = {
    async readHire(hireId) {
      const hire = await catalogs.hire(hireId);
      const ids = await hireIds();
      const raw = await readItem(app, binding.hiresListId, hireId);
      const pendingSubmission = field(raw, ids[V2.pendingSubmission]);
      if (pendingSubmission !== undefined && pendingSubmission !== null && typeof pendingSubmission !== 'string') throw new Error('SCHEMA_DRIFT');
      return { hire, runKey: provisionRunKey(field(raw, ids[V2.provision])), pendingSubmission: !!pendingSubmission };
    },
    readPosition: (positionId) => catalogs.position(positionId),
    listHires: (positionId, cursor) => catalogs.hires({ text: '', positionId }, cursor),
    async readRun(runId) {
      const matches = (await listRoomLists(app, binding.roomId)).filter((candidate) => candidate._id === runId);
      if (matches.length > 1) throw new Error('RUN_ID_CONFLICT');
      if (!matches.length) return null;
      const run = await getIsolatedListViaTool(app, runId);
      if (run.roomId !== binding.roomId || !run.isolatedList || !matches[0].key) throw new Error('RUN_OWNERSHIP_INVALID');
      return { id: run._id, roomId: run.roomId, isolated: run.isolatedList, key: matches[0].key };
    },
    async markCancelPending(hireId) {
      const record = await gateway.readHire(hireId);
      if (record.hire.pendingAction !== null || record.pendingSubmission ||
        !['learning', 'done', 'failed'].includes(record.hire.status)) throw new Error('HIRE_BUSY');
      const ids = await hireIds();
      await patchFields(app, binding.hiresListId, hireId, { [ids[V2.pendingAction]]: 'cancel' });
    },
    async clearCancelPending(hireId) {
      const ids = await hireIds();
      await patchFields(app, binding.hiresListId, hireId, { [ids[V2.pendingAction]]: '' });
    },
    async deleteRun(runId) {
      const run = await gateway.readRun(runId);
      if (!run || !run.isolated || run.roomId !== binding.roomId) throw new Error('RUN_OWNERSHIP_INVALID');
      unwrapToolResult(await app.callServerTool({ name: 'mcpapp.lists.delete', arguments: { listId: runId } }));
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
      unwrapToolResult(await app.callServerTool({ name: 'mcpapp.lists.deleteItem', arguments: { itemId: hireId } }));
      const ids = await hireIds();
      let cursor: string | undefined;
      const seen = new Set<string>();
      do {
        const page = await queryItems(app, binding.hiresListId, { archived: false,
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
      await patchFields(app, binding.positionsListId, positionId, { [ids[V2.inUse]]: count });
    },
  };
  return gateway;
}
