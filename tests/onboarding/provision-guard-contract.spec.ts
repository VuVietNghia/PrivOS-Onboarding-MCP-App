import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuardedProvisionAccess } from '../../src/ui/onboarding/ports/provision-guard';
import type { CreateItemInput, CreateListInput } from '../../src/ui/onboarding/ports/lists';
import { FakeProvisionGuard } from './helpers/fake-provision-guard';

const hireInput: CreateItemInput = { listId: 'hires', name: 'Employee', stageId: 'provisioning', customFields: [] };
const runInput: CreateListInput = { roomId: 'room', name: 'run-op', key: 'run-op', fields: [], stages: [], isolated: true };
function deferred() {
  let resolve: () => void = () => { throw new Error('not initialized'); };
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('LOCAL proposed provision guard contract', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => vi.useRealTimers());

  it('active_guard_returns_busy', async () => {
    const guard = new FakeProvisionGuard();
    const wait = deferred();
    const active = guard.run('hire-1', 'provision', () => wait.promise);
    await expect(guard.run('hire-1', 'provision', async () => undefined)).rejects.toThrow('HIRE_BUSY');
    await expect(guard.run('hire-1', 'cancel', async () => undefined)).rejects.toThrow('HIRE_BUSY');
    await expect(guard.run('hire-2', 'provision', async () => 'independent')).resolves.toBe('independent');
    wait.resolve(); await active;
    await expect(guard.run('hire-1', 'cancel', async () => 'released')).resolves.toBe('released');
  });

  it('old_worker_cannot_mutate_after_cancel_takes_guard', async () => {
    const guard = new FakeProvisionGuard();
    const wait = deferred(); const cancelWait = deferred();
    let stale: GuardedProvisionAccess | undefined;
    const old = guard.run('hire-1', 'provision', async (access) => { stale = access; await wait.promise; });
    vi.setSystemTime(1000);
    const cancel = guard.run('hire-1', 'cancel', async (access) => {
      await access.lifecycle.deleteList('run');
      await access.write.moveItemToStage('hire-1', 'cancelled');
      await cancelWait.promise;
    });
    if (!stale) throw new Error('access missing');
    const staleAccess = stale;
    await expect(staleAccess.lifecycle.createIsolatedList(runInput)).rejects.toThrow('WRITE_CONFLICT');
    await expect(staleAccess.write.createItem(hireInput)).rejects.toThrow('WRITE_CONFLICT');
    await expect(staleAccess.write.patchFields('hires', 'hire-1', { run: 'new' })).rejects.toThrow('WRITE_CONFLICT');
    await expect(staleAccess.write.deleteItem('hire-1')).rejects.toThrow('WRITE_CONFLICT');
    await expect(staleAccess.lifecycle.deleteList('run')).rejects.toThrow('WRITE_CONFLICT');
    await expect(staleAccess.write.moveItemToStage('hire-1', 'learning')).rejects.toThrow('WRITE_CONFLICT');
    wait.resolve(); await old;
    await expect(guard.run('hire-1', 'provision', async () => undefined)).rejects.toThrow('HIRE_BUSY');
    cancelWait.resolve(); await cancel;
    expect(guard.state.newRunsAfterCancel).toBe(0);
    expect(guard.state.hire.stage).toBe('cancelled');
  });

  it('expired_guard_blocks_list_create_and_activation', async () => {
    const guard = new FakeProvisionGuard();
    await guard.run('hire-1', 'provision', async (access) => {
      await access.lifecycle.deleteList('old-run');
      vi.setSystemTime(1000);
      await expect(access.lifecycle.createIsolatedList(runInput)).rejects.toThrow('WRITE_CONFLICT');
      await expect(access.write.moveItemToStage('hire-1', 'learning')).rejects.toThrow('WRITE_CONFLICT');
    });
    expect(guard.state.hire.stage).toBe('provisioning');
    expect(guard.state.createdRuns).toBe(0);
  });

  it('lost_create_hire_response_returns_same_id', async () => {
    const guard = new FakeProvisionGuard(); guard.loseNextCreateResponse = true;
    await expect(guard.createHireOnce('op', hireInput)).rejects.toThrow('RESPONSE_LOST');
    const recovered = await guard.createHireOnce('op', hireInput);
    const replay = await guard.createHireOnce('op', hireInput);
    expect([recovered._id, replay._id]).toEqual(['hire-1', 'hire-1']);
    expect(guard.state.createdHires).toBe(1);
    await expect(guard.createHireOnce('op', { ...hireInput, name: 'Other' })).rejects.toThrow('OPERATION_MISMATCH');
    expect(guard.state.createdHires).toBe(1);
  });

  it('successful_concurrent_create_hire_deduplicates', async () => {
    const guard = new FakeProvisionGuard();
    const hires = await Promise.all([guard.createHireOnce('op', hireInput), guard.createHireOnce('op', hireInput)]);
    expect(hires.map((hire) => hire._id)).toEqual(['hire-1', 'hire-1']);
    await expect(guard.createHireOnce('op', { ...hireInput, stageId: 'different' })).rejects.toThrow('OPERATION_MISMATCH');
    expect(guard.state.createdHires).toBe(1);
  });

  it('changed_date_payload_rejected_and_equivalent_wire_json_replays', async () => {
    const guard = new FakeProvisionGuard();
    const dateInput: CreateItemInput = { ...hireInput, customFields: [
      { fieldId: 'start', value: new Date('2026-10-01T00:00:00Z') },
      { fieldId: 'details', value: { first: 1, second: 2 } },
    ] };
    await guard.createHireOnce('date-op', dateInput);
    await expect(guard.createHireOnce('date-op', { ...dateInput, customFields: [
      { fieldId: 'start', value: new Date('2026-10-02T00:00:00Z') },
      { fieldId: 'details', value: { first: 1, second: 2 } },
    ] })).rejects.toThrow('OPERATION_MISMATCH');
    const reordered: CreateItemInput = { customFields: [
      { value: '2026-10-01T00:00:00.000Z', fieldId: 'start' },
      { value: { second: 2, first: 1 }, fieldId: 'details' },
    ], stageId: 'provisioning', name: 'Employee', listId: 'hires' };
    expect(await guard.createHireOnce('date-op', reordered)).toMatchObject({ _id: 'hire-1' });
    expect(guard.state.createdHires).toBe(1);
  });

  it('stores_wire_fields_and_prepares_before_creation', async () => {
    const guard = new FakeProvisionGuard();
    const input: CreateItemInput = { ...hireInput, customFields: [
      { fieldId: 'details', value: { kept: 1, omitted: () => undefined } },
    ] };
    const created = await guard.createHireOnce('wire-op', input);
    expect(created.customFields).toEqual([{ fieldId: 'details', value: { kept: 1 } }]);
    const replay = await guard.createHireOnce('wire-op', { ...hireInput, customFields: [
      { fieldId: 'details', value: { kept: 1 } },
    ] });
    expect(replay._id).toBe('hire-1');
    const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
    await expect(guard.createHireOnce('invalid-op', { ...hireInput,
      customFields: [{ fieldId: 'details', value: cyclic }],
    })).rejects.toThrow('INVALID_PAYLOAD');
    expect(guard.state.createdHires).toBe(1);
    expect((await guard.createHireOnce('invalid-op', hireInput))._id).toBe('hire-2');
  });

  it('released_callback_access_cannot_mutate', async () => {
    const guard = new FakeProvisionGuard();
    const released = await guard.run('hire-1', 'provision', async (access) => access);
    await expect(released.lifecycle.createIsolatedList(runInput)).rejects.toThrow('WRITE_CONFLICT');
    await expect(released.write.moveItemToStage('hire-1', 'learning')).rejects.toThrow('WRITE_CONFLICT');
    expect(guard.state.createdRuns).toBe(0);
  });

  it('create_receipt_uses_canonical_payload_and_does_not_expose_mutable_state', async () => {
    const guard = new FakeProvisionGuard();
    const created = await guard.createHireOnce('op', hireInput);
    created.name = 'caller change';
    const reordered: CreateItemInput = { customFields: [], stageId: 'provisioning', name: 'Employee', listId: 'hires' };
    expect(await guard.createHireOnce('op', reordered)).toMatchObject({ _id: 'hire-1', name: 'Employee' });
    expect(guard.state.createdHires).toBe(1);
  });
});
