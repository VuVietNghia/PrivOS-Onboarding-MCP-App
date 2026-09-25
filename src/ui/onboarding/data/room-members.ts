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
 * Members of the current room (`rooms:read`). Returns `null` only when access to the route is
 * unavailable, so the form can fall back to typed input. Hub and malformed-response failures throw.
 */
export async function listRoomMembers(app: McpApp, roomId: string, roomType: unknown): Promise<RoomMember[] | null> {
  const path = roomType === 'c' ? 'channels.members' : roomType === 'p' ? 'groups.members' : null;
  if (!path) return null;
  try {
    const members: RoomMember[] = [];
    let offset = 0;
    for (let page = 0; page < 1000; page += 1) {
      const body = await restCall<{ data?: { members?: RawUser[]; offset?: number; total?: number } }>(
        app, 'GET', path, { query: { roomId, offset, count: MEMBER_PAGE } },
      );
      const result = body.data;
      const pageMembers = result?.members;
      const total = result?.total;
      if (!Array.isArray(pageMembers) || result?.offset !== offset ||
        typeof total !== 'number' || !Number.isInteger(total) || total < 0) throw new Error('ROOM_MEMBERS_RESPONSE_INVALID');
      members.push(...pageMembers.map(toMember).filter((member): member is RoomMember => member !== null));
      offset += pageMembers.length;
      if (offset >= total) return members;
      if (!pageMembers.length) throw new Error('ROOM_MEMBERS_RESPONSE_INVALID');
    }
    throw new Error('ROOM_MEMBERS_PAGINATION_LIMIT');
  } catch (err) {
    if (err instanceof OptionalFeatureUnavailableError ||
      (err instanceof PrivosRestError && (err.statusCode === 404 || err.statusCode === 405))) return null;
    throw err;
  }
}

/** Resolve a typed username or user ID (`users:read`). `unavailable` when the scope is not granted. */
export async function lookupUser(app: McpApp, username: string): Promise<LookupResult> {
  try {
    const value = username.trim();
    // Keep query keys and operators fixed; only the username value comes from user input.
    const body = await restCall<{ data?: { users?: RawUser[] } }>(app, 'GET', 'users.list', {
      query: { query: JSON.stringify({ username: value }), fields: JSON.stringify({ username: 1, name: 1 }), offset: 0, count: 2 },
    });
    if (!Array.isArray(body.data?.users)) throw new Error('USER_LOOKUP_RESPONSE_INVALID');
    const match = body.data.users.find((user) => user.username === value);
    if (match) {
      const member = toMember(match);
      if (!member) throw new Error('USER_LOOKUP_RESPONSE_INVALID');
      return { kind: 'found', member };
    }
    try {
      const info = await restCall<{ data?: { user?: RawUser } }>(app, 'GET', 'users.info', { query: { userId: value } });
      const member = info.data?.user ? toMember(info.data.user) : null;
      if (!member || member.id !== value) throw new Error('USER_LOOKUP_RESPONSE_INVALID');
      return { kind: 'found', member };
    } catch (error) {
      if (error instanceof PrivosRestError && (error.statusCode === 400 || error.statusCode === 404)) return { kind: 'not-found' };
      throw error;
    }
  } catch (err) {
    if (err instanceof OptionalFeatureUnavailableError) return { kind: 'unavailable' };
    if (err instanceof PrivosRestError && (err.statusCode === 404 || err.statusCode === 405)) return { kind: 'unavailable' };
    throw err;
  }
}
