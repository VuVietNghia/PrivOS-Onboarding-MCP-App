// Call sites for rooms:read (room member list) and users:read (username lookup) — scope-audit.
import type { McpApp } from '@privos_ai/app-react';
import { OptionalFeatureUnavailableError, PrivosRestError, restCall } from '../../privos-rest';
import type { LookupResult, RoomMember } from '../domain/pick-employee';

const MEMBER_PAGE = 500;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function endpointPayload(body: unknown): Record<string, unknown> | null {
  const response = asRecord(body);
  if (!response) return null;
  return response.data === undefined ? response : asRecord(response.data);
}

function toMember(raw: unknown): RoomMember | null {
  const user = asRecord(raw);
  if (typeof user?._id !== 'string' || !user._id) return null;
  const username = typeof user.username === 'string' ? user.username : user._id;
  const name = typeof user.name === 'string' && user.name.trim() ? user.name : username;
  return { id: user._id, username, name };
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
      const body = await restCall<unknown>(
        app, 'GET', path, { query: { roomId, offset, count: MEMBER_PAGE } },
      );
      const result = endpointPayload(body);
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
    if (!value) return { kind: 'not-found' };
    // The live public users.list route ignores its username filter. users.info resolves either value.
    const info = await restCall<unknown>(app, 'GET', 'users.info', { query: { userId: value } });
    const member = toMember(endpointPayload(info)?.user);
    if (!member || (member.id !== value && member.username !== value)) throw new Error('USER_LOOKUP_RESPONSE_INVALID');
    return { kind: 'found', member };
  } catch (err) {
    if (err instanceof OptionalFeatureUnavailableError) return { kind: 'unavailable' };
    if (err instanceof PrivosRestError && (err.statusCode === 400 || err.statusCode === 404)) return { kind: 'not-found' };
    if (err instanceof PrivosRestError && err.statusCode === 405) return { kind: 'unavailable' };
    // The host SDK rejects the observed users.info HTTP 400 as a plain Error,
    // discarding statusCode and the response body before restCall can inspect either.
    if (err instanceof Error && err.message === 'User not found.') return { kind: 'not-found' };
    throw err;
  }
}
