import type { McpApp } from '@privos_ai/app-react';
import type { Lifetime } from '../../../../shared/ports/effects';
import type { ActorSession } from '../../ports/session';
import type { MembersGateway } from '../../ports/members';
import { listRoomMembers, lookupUser } from '../room-members';

export function createPrivosMembers(app: McpApp, actor: ActorSession, lifetime: Lifetime): MembersGateway {
  const active = async <T>(operation: () => Promise<T>): Promise<T> => {
    lifetime.assertActive();
    const value = await operation();
    lifetime.assertActive();
    return value;
  };
  return {
    // rooms:read lists members of the current room; users:read resolves typed identities.
    list: () => active(() => listRoomMembers(app, actor.roomId, actor.roomType)),
    lookup: (value) => active(() => lookupUser(app, value)),
  };
}
