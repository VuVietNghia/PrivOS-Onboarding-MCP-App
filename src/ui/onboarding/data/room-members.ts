// Call sites for rooms:read (room member list) and users:read (username lookup) — scope-audit.
import type { McpApp } from '@privos_ai/app-react';
import { OptionalFeatureUnavailableError, PrivosRestError, restCall } from '../../privos-rest';
import type { LookupResult, RoomMember } from '../domain/pick-employee';

const MEMBER_PAGE = 500;

interface RawUser { _id?: unknown; username?: unknown; name?: unknown }

function toMember(raw: RawUser): RoomMember | null {
  if (typeof raw._id !== 'string' || !raw._id) return null;
  const username = typeof raw.username === 'string' ? raw.username : raw._id;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : username;
  return { id: raw._id, username, name };
}

/**
 * Members of the current room (`rooms:read`). Returns `null` — never throws — when the list is not
 * available to this app (scope not granted, or the Hub refuses the route), so the form can fall back
 * to typing a username. Network failures still throw.
 */
export async function listRoomMembers(app: McpApp, roomId: string): Promise<RoomMember[] | null> {
  try {
    const body = await restCall<{ members?: RawUser[] }>(app, 'GET', 'rooms.membersOrderedByRole', { query: { roomId, count: MEMBER_PAGE } });
    const members = Array.isArray(body.members) ? body.members : [];
    return members.map(toMember).filter((m): m is RoomMember => m !== null);
  } catch (err) {
    if (err instanceof OptionalFeatureUnavailableError || err instanceof PrivosRestError) return null;
    throw err;
  }
}

/** Resolve a typed username (`users:read`). `unavailable` when the scope is not granted. */
export async function lookupUser(app: McpApp, username: string): Promise<LookupResult> {
  try {
    const body = await restCall<{ user?: RawUser }>(app, 'GET', 'users.info', { query: { username: username.trim() } });
    const member = body.user ? toMember(body.user) : null;
    return member ? { kind: 'found', member } : { kind: 'not-found' };
  } catch (err) {
    if (err instanceof OptionalFeatureUnavailableError) return { kind: 'unavailable' };
    if (err instanceof PrivosRestError) return { kind: 'not-found' };
    throw err;
  }
}
