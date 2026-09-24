import type { McpApp } from '@privos_ai/app-react';
import type { RoomBinding } from '../../src/ui/onboarding/domain/models';
import { isRoomAdmin } from '../../src/ui/onboarding/domain/roles';
import { createMcpImportV4Gateway, importPositionV4, type ImportPositionOutcome } from '../../src/ui/onboarding/flows/import-v4';
import { preflightPosition, type ImportPreflight } from './preflight';
import { readPositions } from './read-source';

export async function* dryRunSourceV4(source: string): AsyncGenerator<ImportPreflight> {
  for await (const position of readPositions(source)) yield preflightPosition(position);
}

export async function* importSourceV4(app: McpApp, binding: RoomBinding, actorRoomId: string,
  actorRoles: readonly string[], source: string): AsyncGenerator<ImportPositionOutcome> {
  if (!isRoomAdmin(actorRoles)) throw new Error('NOT_ADMIN');
  if (!actorRoomId || actorRoomId !== binding.roomId) throw new Error('ROOM_MISMATCH');
  const gateway = createMcpImportV4Gateway(app, binding);
  for await (const position of readPositions(source)) yield await importPositionV4(gateway, position);
}
