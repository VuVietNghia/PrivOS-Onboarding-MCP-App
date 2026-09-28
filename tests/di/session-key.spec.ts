import { expect, it } from 'vitest';
import { sessionKey } from '../../src/ui/composition/session-key';
import type { ActorSession } from '../../src/ui/onboarding/ports/session';

it('invalidates on identity and grants but ignores ordering', () => {
  const actor: ActorSession = { roomId: 'r1', roomType: 'c', userId: 'u1',
    roles: ['member', 'admin'], grantedScopes: ['rooms:read', 'users:read'] };
  expect(sessionKey(actor)).toBe(sessionKey({ ...actor, roles: ['admin', 'member'],
    grantedScopes: ['users:read', 'rooms:read'] }));
  expect(sessionKey(actor)).not.toBe(sessionKey({ ...actor, roomId: 'r2' }));
  expect(sessionKey(actor)).not.toBe(sessionKey({ ...actor, userId: 'u2' }));
  expect(sessionKey(actor)).not.toBe(sessionKey({ ...actor, grantedScopes: [] }));
});
