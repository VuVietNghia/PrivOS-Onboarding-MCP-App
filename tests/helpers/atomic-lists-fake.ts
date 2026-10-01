import type { HubItem } from '../../src/ui/onboarding/domain/fields';
import type { AtomicCommand, AtomicCommitResult, AtomicListsPort, AtomicSnapshot, Json, SnapshotSelection } from '../../src/ui/onboarding/ports/atomic-lists';
import type { AtomicContractHarness, NativeEdit } from './atomic-lists-contract';

interface FakeList { revision: number; info: AtomicSnapshot['info']; items: HubItem[] }
interface StoredReceipt { intent: string; result: Json }
function canonical(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  // Array.isArray does not narrow readonly arrays; retain only the JSON object member.
  const object = value as { readonly [key: string]: Json };
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
}
function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve };
}
/** Test-only transaction model; 1,024 bytes is a fixture limit, not a Hub limit. */
export function makeAtomicListsHarness(requestLimitBytes = 1024): AtomicContractHarness {
  let lists = new Map<string, FakeList>();
  const receipts = new Map<string, StoredReceipt>();
  let allowed = true; let loseResponse = false; let failWrite = false;
  let queue = Promise.resolve();
  let barrier: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  const authorize = () => { if (!allowed) throw new Error('NOT_ALLOWED'); };
  const list = (id: string) => { const found = lists.get(id); if (!found) throw new Error('LIST_NOT_FOUND'); return found; };
  const snapshots = (selections: readonly SnapshotSelection[]): readonly AtomicSnapshot[] => selections.map(selection => {
    const value = list(selection.listId);
    return structuredClone({ listId: selection.listId, token: `${selection.listId}:${value.revision}`, info: value.info,
      items: selection.kind === 'all' ? value.items : value.items.filter(item => selection.itemIds.includes(item._id)) });
  });
  const makePort = (): AtomicListsPort => ({
    async snapshot(selections) { authorize(); return snapshots(selections); },
    async receipt(operationId, intent) {
      authorize(); const existing = receipts.get(operationId); if (!existing) return { kind: 'absent' };
      if (existing.intent !== canonical(intent)) throw new Error('OPERATION_MISMATCH');
      return { kind: 'committed', operationId, result: structuredClone(existing.result) };
    },
    async commit(command: AtomicCommand): Promise<AtomicCommitResult> {
      const previous = queue; const finished = deferred(); queue = finished.promise;
      try {
        await previous;
        const hold = barrier; barrier = undefined;
        if (hold) { hold.entered.resolve(); await hold.release.promise; }
        authorize();
        if (new TextEncoder().encode(JSON.stringify(command)).length > requestLimitBytes) throw new Error('REQUEST_TOO_LARGE');
        const intent = canonical(command.intent); const existing = receipts.get(command.operationId);
        if (existing) return existing.intent === intent
          ? { kind: 'committed', replayed: true, result: structuredClone(existing.result) }
          : { kind: 'operation-mismatch' };
        if (command.expected.some(expected => expected.token !== `${expected.listId}:${list(expected.listId).revision}`)) return { kind: 'conflict' };
        if (command.patches.some(patch => !command.expected.some(expected => expected.listId === patch.listId))) throw new Error('SNAPSHOT_REQUIRED');
        const staged = structuredClone(lists); const changed = new Set<string>();
        for (const patch of command.patches) {
          const target = staged.get(patch.listId); const item = target?.items.find(candidate => candidate._id === patch.itemId);
          if (!target || !item) throw new Error('ITEM_NOT_FOUND');
          for (const [fieldId, value] of Object.entries(patch.fields)) {
            const fields = item.customFields ?? (item.customFields = []); const field = fields.find(candidate => candidate.fieldId === fieldId);
            if (field) field.value = structuredClone(value); else fields.push({ fieldId, value: structuredClone(value) });
          }
          if (patch.stageId !== undefined) item.stageId = patch.stageId;
          changed.add(patch.listId);
          if (failWrite) { failWrite = false; throw new Error('WRITE_FAILED'); }
        }
        for (const id of changed) { const target = staged.get(id); if (target) target.revision++; }
        // Publish staged item state and immutable receipt in one synchronous boundary.
        const stored = { intent, result: structuredClone(command.result) };
        lists = staged; receipts.set(command.operationId, stored);
        if (loseResponse) { loseResponse = false; throw new Error('RESPONSE_LOST'); }
        return { kind: 'committed', replayed: false, result: structuredClone(stored.result) };
      } finally { finished.resolve(); }
    },
  });
  const value = (item: HubItem, fieldId: string): unknown => item.customFields?.find(field => field.fieldId === fieldId)?.value;
  const readJson = (input: unknown): Json => {
    // Test state is produced exclusively from JSON-valued command fields.
    return structuredClone(input === undefined ? null : input) as Json;
  };
  return {
    portA: makePort(), portB: makePort(),
    seed() {
      lists = new Map(['hires', 'run'].map(id => [id, { revision: 0, info: { list: { _id: id, name: id, roomId: 'room', fieldDefinitions: [] }, stages: [] },
        items: id === 'hires' ? [{ _id: 'hire', customFields: [{ fieldId: 'attempts', value: [] }] }] : [{ _id: 'q1' }, { _id: 'q2' }] }]));
      receipts.clear(); allowed = true;
    },
    readState() {
      const hire = list('hires').items[0]; const attempts = readJson(value(hire, 'attempts'));
      const questions = list('run').items.map(item => readJson(value(item, 'selected')));
      const last = Array.isArray(attempts) ? attempts[attempts.length - 1] : undefined;
      const answers = last && typeof last === 'object' && !Array.isArray(last) && 'answers' in last ? last.answers : [];
      return { hire: { attempts: Array.isArray(attempts) ? [...attempts] : [], stageId: hire.stageId }, questions,
        lastCommittedAnswers: Array.isArray(answers) ? [...answers] : [], receipts: receipts.size,
        snapshots: snapshots([{ listId: 'hires', kind: 'all' }, { listId: 'run', kind: 'all' }]) };
    },
    nativeEdit(edit: NativeEdit) {
      const target = list(edit.listId);
      switch (edit.kind) {
        case 'add': target.items.push(structuredClone(edit.item)); break;
        case 'delete': target.items = target.items.filter(item => item._id !== edit.itemId); break;
        case 'update': { const item = target.items.find(candidate => candidate._id === edit.itemId); if (!item) throw new Error('ITEM_NOT_FOUND'); item.name = edit.name; break; }
        case 'schema': target.info.list.fieldDefinitions = []; break;
        case 'stage': target.info.stages = []; break;
      }
      target.revision++;
    },
    revokeActor() { allowed = false; }, dropNextCommitResponse() { loseResponse = true; }, failNextTransactionWrite() { failWrite = true; },
    holdNextCommit() { const entered = deferred(); const release = deferred(); barrier = { entered, release }; return { entered: entered.promise, release: release.resolve }; },
  };
}
