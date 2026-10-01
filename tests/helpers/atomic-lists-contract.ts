import { describe, expect, it } from 'vitest';
import type { HubItem } from '../../src/ui/onboarding/domain/fields';
import type { AtomicCommand, AtomicListsPort, AtomicSnapshot, Json } from '../../src/ui/onboarding/ports/atomic-lists';

export type NativeEdit =
  | { kind: 'add'; listId: string; item: HubItem }
  | { kind: 'update'; listId: string; itemId: string; name: string }
  | { kind: 'delete'; listId: string; itemId: string }
  | { kind: 'schema'; listId: string }
  | { kind: 'stage'; listId: string };
export interface AtomicContractState {
  hire: { attempts: Json[]; stageId: string | undefined };
  questions: Json[];
  lastCommittedAnswers: Json[];
  receipts: number;
  snapshots: readonly AtomicSnapshot[];
}
export interface AtomicContractHarness {
  portA: AtomicListsPort;
  portB: AtomicListsPort;
  seed(): void;
  readState(): AtomicContractState;
  nativeEdit(edit: NativeEdit): void;
  revokeActor(): void;
  dropNextCommitResponse(): void;
  failNextTransactionWrite(): void;
  /** Pauses the next transaction after reserving the shared transaction queue. */
  holdNextCommit(): { entered: Promise<void>; release(): void };
}
export const selections = [{ listId: 'hires', kind: 'items', itemIds: ['hire'] }, { listId: 'run', kind: 'all' }] as const;
export async function command(port: AtomicListsPort, operationId = 'op1', answers: Json[] = ['A', 'B']): Promise<AtomicCommand> {
  const snapshots = await port.snapshot(selections);
  return {
    operationId, intent: { version: 1, hireId: 'hire', dayId: 'day', answers },
    expected: snapshots.map(({ listId, token }) => ({ listId, token })),
    patches: [
      ...answers.map((selected, index) => ({ listId: 'run', itemId: `q${index + 1}`, fields: { selected } })),
      { listId: 'hires', itemId: 'hire', fields: { attempts: [{ operationId, answers }] }, stageId: 'done' },
    ], result: { grade: 100, attempt: operationId },
  };
}
export function assertAtomicListsContract(makeHarness: () => AtomicContractHarness): void {
  describe('AtomicListsPort shared transaction contract', () => {
    const fixture = () => { const h = makeHarness(); h.seed(); return h; };
    it('rejects_stale_snapshot_without_partial_writes', async () => {
      const h = fixture(); const ca = await command(h.portA); const cb = await command(h.portB, 'op2', ['B', 'A']);
      const gate = h.holdNextCommit(); const pa = h.portA.commit(ca); await gate.entered;
      const pb = h.portB.commit(cb); gate.release(); const [a, b] = await Promise.all([pa, pb]);
      expect([a.kind, b.kind].sort()).toEqual(['committed', 'conflict']);
      const state = h.readState(); expect(state.hire.attempts).toHaveLength(1);
      expect(state.questions).toEqual(state.lastCommittedAnswers); expect(state.receipts).toBe(1);
    });
    it('deduplicates_inflight_operation_across_independent_instances', async () => {
      const h = fixture(); const c = await command(h.portA); const gate = h.holdNextCommit();
      const pa = h.portA.commit(c); await gate.entered; const pb = h.portB.commit(c); gate.release();
      const [a, b] = await Promise.all([pa, pb]); expect(a).toMatchObject({ kind: 'committed', replayed: false });
      expect(b).toMatchObject({ kind: 'committed', replayed: true }); expect(h.readState().receipts).toBe(1);
    });
    it('replays_original_result_after_later_commit', async () => {
      const h = fixture(); const c = await command(h.portA); const first = await h.portA.commit(c);
      const afterFirst = h.readState();
      const secondCommand = { ...await command(h.portB, 'op2', ['B', 'A']), result: { grade: 0 } };
      expect(await h.portB.commit(secondCommand)).toEqual({ kind: 'committed', replayed: false, result: secondCommand.result });
      expect(h.readState()).not.toEqual(afterFirst);
      expect(h.readState().questions).toEqual(['B', 'A']);
      expect(h.readState().receipts).toBe(2);
      if (first.kind !== 'committed') throw new Error('Fixture did not commit');
      const before = h.readState(); const replay = await h.portB.commit(c);
      expect(replay).toMatchObject({ kind: 'committed', replayed: true, result: first.result });
      expect(await h.portA.receipt(c.operationId, c.intent)).toMatchObject({ result: first.result }); expect(h.readState()).toEqual(before);
    });
    it('rejects_operation_id_reuse_with_changed_intent', async () => {
      const h = fixture(); const c = await command(h.portA); await h.portA.commit(c); const before = h.readState();
      expect(await h.portB.commit({ ...c, intent: { changed: true } })).toEqual({ kind: 'operation-mismatch' });
      await expect(h.portB.receipt(c.operationId, { changed: true })).rejects.toThrow('OPERATION_MISMATCH'); expect(h.readState()).toEqual(before);
    });
    it('canonicalizes_object_keys_without_reordering_generic_arrays', async () => {
      const h = fixture(); const c = await command(h.portA); await h.portA.commit({ ...c, intent: { a: 1, b: [1, 2] } });
      expect(await h.portB.commit({ ...c, intent: { b: [1, 2], a: 1 } })).toMatchObject({ replayed: true });
      expect(await h.portB.commit({ ...c, intent: { b: [2, 1], a: 1 } })).toEqual({ kind: 'operation-mismatch' });
    });
    it('deduplicates_explicitly_normalized_quiz_answer_labels', async () => {
      const h = fixture(); const c = await command(h.portA);
      const quizIntent = (labels: string[]): Json => ({ version: 1, hireId: 'hire', dayId: 'day', answers: { q1: [...labels].sort() } });
      await h.portA.commit({ ...c, intent: quizIntent(['B', 'A']) });
      expect(await h.portB.commit({ ...c, intent: quizIntent(['A', 'B']) })).toMatchObject({ kind: 'committed', replayed: true });
    });
    it('rolls_back_injected_write_failure', async () => {
      const h = fixture(); const c = await command(h.portA); const before = h.readState(); h.failNextTransactionWrite();
      await expect(h.portA.commit(c)).rejects.toThrow('WRITE_FAILED'); expect(h.readState()).toEqual(before);
      expect(await h.portA.receipt(c.operationId, c.intent)).toEqual({ kind: 'absent' });
      expect(await h.portB.commit(c)).toMatchObject({ kind: 'committed' });
    });
    it('recovers_response_loss_using_original_receipt', async () => {
      const h = fixture(); const c = await command(h.portA); h.dropNextCommitResponse();
      await expect(h.portA.commit(c)).rejects.toThrow('RESPONSE_LOST');
      expect(await h.portB.receipt(c.operationId, c.intent)).toMatchObject({ kind: 'committed', result: c.result });
      expect(await h.portB.commit(c)).toMatchObject({ replayed: true }); expect(h.readState().hire.attempts).toHaveLength(1);
    });
    it.each(['add', 'update', 'delete', 'schema', 'stage'] as const)('native_membership_edit_invalidates_snapshot: %s', async kind => {
      const h = fixture(); const c = await command(h.portA);
      switch (kind) {
        case 'add': h.nativeEdit({ kind, listId: 'run', item: { _id: 'q3' } }); break;
        case 'update': h.nativeEdit({ kind, listId: 'run', itemId: 'q1', name: 'edited' }); break;
        case 'delete': h.nativeEdit({ kind, listId: 'run', itemId: 'q2' }); break;
        case 'schema': case 'stage': h.nativeEdit({ kind, listId: 'run' }); break;
      }
      const before = h.readState(); expect(await h.portA.commit(c)).toEqual({ kind: 'conflict' }); expect(h.readState()).toEqual(before);
    });
    it('revoked_acl_denies_commit_and_receipt', async () => {
      const h = fixture(); const c = await command(h.portA); await h.portA.commit(c); const before = h.readState(); h.revokeActor();
      await expect(h.portB.commit(c)).rejects.toThrow('NOT_ALLOWED'); await expect(h.portA.receipt(c.operationId, c.intent)).rejects.toThrow('NOT_ALLOWED');
      await expect(h.portA.snapshot(selections)).rejects.toThrow('NOT_ALLOWED'); expect(h.readState()).toEqual(before);
    });
    it('rejects_oversized_command_before_writes', async () => {
      const h = fixture(); const c = await command(h.portA); const before = h.readState();
      const empty = { ...c, result: '' };
      const baseLength = JSON.stringify(empty).length;
      const oversized = { ...empty, result: '\u754c'.repeat(Math.floor((1024 - baseLength) / 3) + 1) };
      expect(JSON.stringify(oversized).length).toBeLessThanOrEqual(1024);
      expect(new TextEncoder().encode(JSON.stringify(oversized)).length).toBeGreaterThan(1024);
      await expect(h.portA.commit(oversized)).rejects.toThrow('REQUEST_TOO_LARGE'); expect(h.readState()).toEqual(before);
    });
    it('accepts_command_at_exact_utf8_byte_boundary', async () => {
      const h = fixture(); const c = await command(h.portA); const empty = { ...c, result: '' };
      const remaining = 1024 - new TextEncoder().encode(JSON.stringify(empty)).length;
      const boundary = { ...empty, result: '\u754c'.repeat(Math.floor(remaining / 3)) + 'x'.repeat(remaining % 3) };
      expect(new TextEncoder().encode(JSON.stringify(boundary)).length).toBe(1024);
      expect(JSON.stringify(boundary).length).toBeLessThan(1024);
      expect(await h.portA.commit(boundary)).toEqual({ kind: 'committed', replayed: false, result: boundary.result });
      expect(h.readState().receipts).toBe(1);
    });
  });
}
