import type { HubItem } from '../domain/fields';
import type { ListLifecyclePort, ListWritePort } from './lists';
import type { ProvisionDeps } from './provision';

export interface GuardedProvisionAccess {
  readonly write: Pick<ListWritePort, 'createItem' | 'patchFields' | 'moveItemToStage' | 'deleteItem'>;
  readonly lifecycle: Pick<ListLifecyclePort, 'createIsolatedList' | 'deleteList'>;
}

/** Proposed Hub contract only; no production adapter is qualified yet.
 * The authenticated adapter binds actor/installation/room. Each mutation must
 * validate its fence atomically at the server mutation boundary. Server time
 * decides expiry; cancellation acquires only after release or expiry. Callbacks
 * remain local. Acquire/renew/release use the current session lifetime/abort.
 */
export interface ProvisionGuardPort {
  /** Same scoped operation and payload replay the hire; changed payload fails. */
  createHireOnce(operationId: string,
    input: Parameters<ProvisionDeps['write']['createItem']>[0]): Promise<HubItem>;
  run<T>(hireId: string, mode: 'provision' | 'cancel',
    operation: (access: GuardedProvisionAccess) => Promise<T>): Promise<T>;
}
