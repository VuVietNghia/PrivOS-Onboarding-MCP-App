import type { HubItem } from '../domain/fields';
import type { ListReadPort } from './lists';

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type SnapshotSelection =
  | { readonly listId: string; readonly kind: 'items'; readonly itemIds: readonly string[] }
  | { readonly listId: string; readonly kind: 'all' };
export interface AtomicSnapshot {
  readonly listId: string;
  readonly token: string;
  readonly info: Awaited<ReturnType<ListReadPort['readListInfo']>>;
  readonly items: readonly HubItem[];
}
export interface AtomicPatch {
  readonly listId: string;
  readonly itemId: string;
  readonly fields: Readonly<Record<string, Json>>;
  readonly stageId?: string;
}
export interface AtomicCommand {
  readonly operationId: string;
  readonly intent: Json;
  readonly expected: readonly { readonly listId: string; readonly token: string }[];
  readonly patches: readonly AtomicPatch[];
  readonly result: Json;
}
export type AtomicReceipt =
  | { readonly kind: 'committed'; readonly operationId: string; readonly result: Json }
  | { readonly kind: 'absent' };
export type AtomicCommitResult =
  | { readonly kind: 'committed'; readonly replayed: boolean; readonly result: Json }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'operation-mismatch' };
/** Proposed app contract; implementation requires verified public Hub capability. */
export interface AtomicListsPort {
  snapshot(selections: readonly SnapshotSelection[]): Promise<readonly AtomicSnapshot[]>;
  commit(command: AtomicCommand): Promise<AtomicCommitResult>;
  receipt(operationId: string, intent: Json): Promise<AtomicReceipt>;
}
