import { isRoomAdmin } from '../domain/roles';
import type { CancelOutcome, HrActions, HrHireRecord, HrRun, HrV4Gateway } from '../ports/hr';

export type { CancelOutcome, HrHireRecord, HrRun, HrV4Gateway } from '../ports/hr';

function requireAdmin(roles: readonly string[]): void {
  if (!isRoomAdmin(roles)) throw new Error('NOT_ADMIN');
}

function verifyRun(record: HrHireRecord, run: HrRun, roomId: string): void {
  if (!record.hire.roadmapListId || run.id !== record.hire.roadmapListId || run.roomId !== roomId ||
    !run.isolated || !record.runKey || run.key !== record.runKey) throw new Error('RUN_OWNERSHIP_INVALID');
}

export function createHrV4Actions(gateway: HrV4Gateway, roomId: string, actorRoles: readonly string[]): HrActions {
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
      let final = initial;
      if (initial.hire.pendingAction === 'cancel') {
        try { await gateway.clearCancelPending(hireId); }
        catch { /* A lost response is reconciled only by verified readback. */ }
        final = await gateway.readHire(hireId);
        if (final.hire.status !== 'cancelled' || final.hire.pendingAction !== null) throw new Error('HIRE_CANCEL_UNVERIFIED');
      }
      let needsRecount = false;
      try { await recountPosition(final.hire.positionId); } catch { needsRecount = true; }
      return { hire: final.hire, needsRecount };
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
