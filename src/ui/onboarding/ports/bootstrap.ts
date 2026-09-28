import type { RoomBinding } from '../domain/models';

export type RoomBootstrap =
  | { state: 'ready'; binding: RoomBinding }
  | { state: 'needs-admin' }
  | { state: 'blocked'; code: 'SCHEMA_DRIFT' | 'BOOTSTRAP_STAGE_UNAVAILABLE' | 'ROOM_LIST_DISCOVERY_UNAVAILABLE' | 'DUPLICATE_REGISTRY' };
