import { describe, expect, it } from 'vitest';
import type { Hire, Page, Position } from '../../src/ui/onboarding/domain/models';
import { createHrV4Actions, createMcpHrV4Gateway, type HrV4Gateway, type HrHireRecord, type HrRun } from '../../src/ui/onboarding/flows/hr-v4';
import { fakeRestApp, ok } from './fake-app';

const baseHire: Hire = { id: 'h1', employeeId: 'u1', name: 'An', positionId: 'p1', positionName: 'Kỹ sư', totalDays: 4,
  startDate: '2026-09-24', roadmapListId: 'r1', status: 'learning', doneDays: 2,
  scores: { '1': { first: '1/2', attempts: ['2/2'] } }, errorCode: null, pendingAction: null };
const basePosition: Position = { id: 'p1', name: 'Kỹ sư', templateListId: 't1', status: 'ready',
  weeks: 1, days: 4, lessons: 4, questions: 4, missingAnswers: 0, inUse: 1 };

function fakeGateway(): { gateway: HrV4Gateway; events: string[]; setHire: (value: Hire) => void; setRun: (value: HrRun | null) => void } {
  let hire: Hire = { ...baseHire };
  let run: HrRun | null = { id: 'r1', roomId: 'room1', isolated: true, key: 'run-key' };
  const events: string[] = [];
  const gateway: HrV4Gateway = {
    async readHire(): Promise<HrHireRecord> { events.push('readHire'); return { hire: { ...hire }, runKey: 'run-key', pendingSubmission: false }; },
    async readPosition() { events.push('readPosition'); return { ...basePosition }; },
    async listHires(): Promise<Page<Hire>> { events.push('listHires'); return { items: [hire], nextCursor: null }; },
    async readRun() { events.push('readRun'); return run; },
    async markCancelPending() { events.push('marker'); hire = { ...hire, pendingAction: 'cancel' }; },
    async clearCancelPending() { events.push('clearMarker'); hire = { ...hire, pendingAction: null }; },
    async deleteRun() { events.push('deleteRun'); run = null; },
    async markHireCancelled() { events.push('cancelled'); hire = { ...hire, status: 'cancelled' }; },
    async deleteFailedHire() { events.push('deleteFailedHire'); },
    async markPositionDisabled() { events.push('disabled'); },
    async writeInUse(_positionId, count) { events.push(`inUse:${count}`); },
  };
  return { gateway, events, setHire: (value) => { hire = value; }, setRun: (value) => { run = value; } };
}

describe('HR v4 actions', () => {
  it('rejects non-admin before any Hub read or write', async () => {
    const fake = fakeGateway();
    const actions = createHrV4Actions(fake.gateway, 'room1', ['member']);
    await expect(actions.cancelActive('h1')).rejects.toThrow('NOT_ADMIN');
    expect(fake.events).toEqual([]);
  });

  it('cancels active hire after verifying run ownership and keeps scores', async () => {
    const fake = fakeGateway();
    const result = await createHrV4Actions(fake.gateway, 'room1', ['admin']).cancelActive('h1');
    expect(result.hire.status).toBe('cancelled');
    expect(result.hire.scores).toEqual(baseHire.scores);
    expect(fake.events).toEqual(['readHire', 'readRun', 'marker', 'readRun', 'deleteRun', 'readRun', 'readHire', 'cancelled', 'clearMarker', 'readHire', 'readPosition', 'listHires', 'inUse:0']);
  });

  it('does not delete a run from another room', async () => {
    const fake = fakeGateway();
    fake.setRun({ id: 'r1', roomId: 'other', isolated: true, key: 'run-key' });
    await expect(createHrV4Actions(fake.gateway, 'room1', ['owner']).cancelActive('h1')).rejects.toThrow('RUN_OWNERSHIP_INVALID');
    expect(fake.events).not.toContain('deleteRun');
  });

  it('resumes when delete response was lost and verified run is absent', async () => {
    const fake = fakeGateway();
    let first = true;
    const originalDelete = fake.gateway.deleteRun;
    fake.gateway.deleteRun = async (id) => { await originalDelete(id); if (first) { first = false; throw new Error('network lost'); } };
    const result = await createHrV4Actions(fake.gateway, 'room1', ['admin']).cancelActive('h1');
    expect(result.hire.status).toBe('cancelled');
    expect(fake.events.filter((event) => event === 'deleteRun')).toHaveLength(1);
  });

  it('does not call delete when a pending retry finds the run already absent', async () => {
    const fake = fakeGateway();
    fake.setHire({ ...baseHire, pendingAction: 'cancel' });
    fake.setRun(null);
    await createHrV4Actions(fake.gateway, 'room1', ['admin']).cancelActive('h1');
    expect(fake.events).not.toContain('deleteRun');
  });

  it('rejects first cancel when the referenced run is absent', async () => {
    const fake = fakeGateway();
    fake.setRun(null);
    await expect(createHrV4Actions(fake.gateway, 'room1', ['admin']).cancelActive('h1')).rejects.toThrow('RUN_UNAVAILABLE');
    expect(fake.events).not.toContain('cancelled');
  });

  it('routes failed provision to a separate delete flow and guards statuses', async () => {
    const fake = fakeGateway();
    fake.setHire({ ...baseHire, status: 'failed' });
    const actions = createHrV4Actions(fake.gateway, 'room1', ['admin']);
    await expect(actions.cancelActive('h1')).rejects.toThrow('HIRE_STATUS_INVALID');
    await actions.cancelFailed('h1');
    expect(fake.events).toContain('deleteFailedHire');
    expect(fake.events).not.toContain('cancelled');
  });

  it('disables a position without deleting its template or existing runs', async () => {
    const fake = fakeGateway();
    await createHrV4Actions(fake.gateway, 'room1', ['admin']).disablePosition('p1');
    expect(fake.events).toEqual(['readPosition', 'disabled']);
  });

  it('recounts only learning hires and writes an absolute value', async () => {
    const fake = fakeGateway();
    fake.gateway.listHires = async (_positionId, cursor) => {
      fake.events.push(`page:${cursor ?? 'first'}`);
      return cursor ? { items: [{ ...baseHire, id: 'h3', status: 'done' }], nextCursor: null }
        : { items: [{ ...baseHire }, { ...baseHire, id: 'h2', status: 'cancelled' }], nextCursor: 'page2' };
    };
    const result = await createHrV4Actions(fake.gateway, 'room1', ['owner']).recountPosition('p1');
    expect(result).toBe(1);
    expect(fake.events).toEqual(['readPosition', 'page:first', 'page:page2', 'inUse:1']);
  });

  it('uses mediated List tools to verify room ownership and soft delete the exact run', async () => {
    let active = true;
    const { app, toolCalls } = fakeRestApp([
      { method: 'GET', path: 'lists.listByRoomId', reply: () => ok({ lists: active ? [{ _id: 'r1', name: 'Run', roomId: 'room1', key: 'run-key', isolatedList: true }] : [] }) },
      { method: 'GET', path: 'lists.info', reply: () => ok({ list: { _id: 'r1', name: 'Run', roomId: 'room1', isolatedList: true, fieldDefinitions: [] }, stages: [] }) },
      { method: 'POST', path: 'lists.delete', reply: () => { active = false; return ok({ deleted: true }); } },
    ]);
    const gateway = createMcpHrV4Gateway(app, { roomId: 'room1', hiresListId: 'h-list', positionsListId: 'p-list' });
    expect(await gateway.readRun('r1')).toEqual({ id: 'r1', roomId: 'room1', isolated: true, key: 'run-key' });
    await gateway.deleteRun('r1');
    expect(await gateway.readRun('r1')).toBeNull();
    expect(toolCalls.filter((call) => call.name === 'mcpapp.lists.delete')).toEqual([
      { name: 'mcpapp.lists.delete', arguments: { listId: 'r1' } },
    ]);
  });
});
