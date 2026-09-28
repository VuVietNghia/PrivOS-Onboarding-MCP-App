import type { ActorSession } from '../onboarding/ports/session';

export function sessionKey(actor: ActorSession): string {
  return JSON.stringify([
    actor.roomId, actor.roomType, actor.userId,
    [...new Set(actor.roles)].sort(), [...new Set(actor.grantedScopes)].sort(),
  ]);
}
