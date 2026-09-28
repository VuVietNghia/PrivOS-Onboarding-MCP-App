import type { McpApp } from '@privos_ai/app-react';
import { createLifetime } from '../../../../shared/lifetime';
import { resolveRoomBinding } from '../room-bootstrap';
import type { RoomBootstrap } from '../../ports/bootstrap';
import { createPrivosLists } from './lists-adapter';

export function resolvePrivosRoomBinding(app: McpApp, roomId: string,
  actor: { userId: string; canManage: boolean }): Promise<RoomBootstrap> {
  const ports = createPrivosLists(app, {
    lifetime: createLifetime(),
    budget: { run: operation => operation(), dispose() {} },
  });
  return resolveRoomBinding({ read: ports.read, lifecycle: ports.lifecycle }, {
    roomId, roomType: 'c', userId: actor.userId,
    roles: actor.canManage ? ['admin'] : [], grantedScopes: [],
  });
}
