import type { HubItem } from '../../../src/ui/onboarding/domain/fields';
import type { CreateItemInput } from '../../../src/ui/onboarding/ports/lists';
import type { GuardedProvisionAccess, ProvisionGuardPort } from '../../../src/ui/onboarding/ports/provision-guard';
import { z } from 'zod';
interface Lease { readonly fence: number; readonly expiresAt: number }
function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object' && value !== null) {
    return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => JSON.stringify(key) + ':' + canonical(entry)).join(',') + '}';
  }
  throw new Error('INVALID_PAYLOAD');
}

const wireInputSchema = z.object({
  listId: z.string(), name: z.string(), stageId: z.string(),
  parentId: z.string().optional(), description: z.string().optional(),
  customFields: z.array(z.object({ fieldId: z.string(), value: z.unknown() })),
});

function prepareWireInput(value: CreateItemInput): { payload: string; input: CreateItemInput } {
  // Match JSON transport semantics, including Date.toJSON, omitted object
  // values, and array nulls, before sorting keys in the normalized JSON tree.
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('INVALID_PAYLOAD');
    const normalized: unknown = JSON.parse(encoded);
    const parsed = wireInputSchema.parse(normalized);
    const input: CreateItemInput = { ...parsed,
      customFields: parsed.customFields.map((field) => ({ fieldId: field.fieldId, value: field.value })),
    };
    return { payload: canonical(normalized), input };
  } catch {
    throw new Error('INVALID_PAYLOAD');
  }
}

/** LOCAL server simulator. One instance has a fixed authenticated scope;
 * Date.now is its server clock, controlled by Vitest. Synchronous checks and
 * mutations model one server boundary. This is never a runtime adapter.
 */
export class FakeProvisionGuard implements ProvisionGuardPort {
  readonly state = { createdHires: 0, createdRuns: 0, newRunsAfterCancel: 0, hire: { stage: 'provisioning' } };
  loseNextCreateResponse = false;
  private readonly leases = new Map<string, Lease>();
  private readonly receipts = new Map<string, { payload: string; hire: HubItem }>();
  private nextFence = 0;

  async createHireOnce(operationId: string, input: CreateItemInput): Promise<HubItem> {
    const { payload, input: wireInput } = prepareWireInput(input);
    const previous = this.receipts.get(operationId);
    if (previous) {
      if (previous.payload !== payload) throw new Error('OPERATION_MISMATCH');
      return structuredClone(previous.hire);
    }
    const hire: HubItem = { _id: 'hire-' + (this.state.createdHires + 1), name: wireInput.name,
      stageId: wireInput.stageId, customFields: structuredClone(wireInput.customFields) };
    const receipt = { payload, hire: structuredClone(hire) };
    this.state.createdHires++;
    this.receipts.set(operationId, receipt);
    if (this.loseNextCreateResponse) {
      this.loseNextCreateResponse = false;
      throw new Error('RESPONSE_LOST');
    }
    return hire;
  }

  async run<T>(hireId: string, _mode: 'provision' | 'cancel',
    operation: (access: GuardedProvisionAccess) => Promise<T>): Promise<T> {
    const current = this.leases.get(hireId);
    if (current && current.expiresAt > Date.now()) throw new Error('HIRE_BUSY');
    const lease: Lease = { fence: ++this.nextFence, expiresAt: Date.now() + 1000 };
    this.leases.set(hireId, lease);
    const mutate = <R>(action: () => R): R => {
      const latest = this.leases.get(hireId);
      if (latest?.fence !== lease.fence || lease.expiresAt <= Date.now()) throw new Error('WRITE_CONFLICT');
      return action();
    };
    const access: GuardedProvisionAccess = {
      write: {
        createItem: async (input) => mutate(() => ({ _id: 'item', name: input.name })),
        patchFields: async () => mutate(() => undefined),
        deleteItem: async () => mutate(() => undefined),
        moveItemToStage: async (_itemId, stageId) => mutate(() => { this.state.hire.stage = stageId; }),
      },
      lifecycle: {
        createIsolatedList: async () => mutate(() => {
          if (this.state.hire.stage === 'cancelled') this.state.newRunsAfterCancel++;
          return { _id: 'run-' + ++this.state.createdRuns };
        }),
        deleteList: async () => mutate(() => true),
      },
    };
    try { return await operation(access); }
    finally {
      if (this.leases.get(hireId)?.fence === lease.fence) this.leases.delete(hireId);
    }
  }
}
