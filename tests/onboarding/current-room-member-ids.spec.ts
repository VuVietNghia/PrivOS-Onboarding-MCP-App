import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentRoomMemberIds, RoomMemberIdsError } from '../../src/ui/onboarding/data/room-members';
import { fakeRestApp, ok } from './fake-app';

function context(roomId: unknown, roomType: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify({ roomId, roomType }) }] };
}

describe('getCurrentRoomMemberIds', () => {
  it('discovers an unknown room ID from connected context and returns its member IDs', async () => {
    const roomId = `fixture-${randomUUID()}`;
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      members: [{ _id: 'u1' }, { _id: 'u2' }], offset: 0, total: 2,
    }) }]);
    const contextCall = vi.spyOn(app, 'callServerTool').mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ roomId, roomType: 'p' }) }],
    });

    expect(await getCurrentRoomMemberIds(app)).toEqual({ roomId, memberIds: ['u1', 'u2'] });
    expect(calls[0].query).toEqual({ roomId, offset: 0, count: 500 });
    expect(contextCall).toHaveBeenCalledTimes(2);
    expect(contextCall).toHaveBeenCalledWith({ name: 'mcpapp.context.get', arguments: {} });
  });

  it.each([['c', 'channels.members'], ['p', 'groups.members']] as const)(
    'routes room type %s through %s', async (roomType, path) => {
      const roomId = `opaque-${randomUUID()}`;
      const { app, calls } = fakeRestApp([{ method: 'GET', path, reply: () => ok({
        members: [{ _id: 'u1' }], offset: 0, total: 1,
      }) }]);
      vi.spyOn(app, 'callServerTool').mockResolvedValue(context(roomId, roomType));
      expect(await getCurrentRoomMemberIds(app)).toEqual({ roomId, memberIds: ['u1'] });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ path, query: { roomId, offset: 0, count: 500 } });
    },
  );

  it('discovers a different room on the next invocation of the same SDK', async () => {
    const first = `A-${randomUUID()}`;
    const second = `B-${randomUUID()}`;
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: (req) => ok({
      members: [{ _id: req.query?.roomId === first ? 'member-A' : 'member-B' }], offset: 0, total: 1,
    }) }]);
    vi.spyOn(app, 'callServerTool')
      .mockResolvedValueOnce(context(first, 'p')).mockResolvedValueOnce(context(first, 'p'))
      .mockResolvedValueOnce(context(second, 'p')).mockResolvedValueOnce(context(second, 'p'));
    expect(await getCurrentRoomMemberIds(app)).toEqual({ roomId: first, memberIds: ['member-A'] });
    expect(await getCurrentRoomMemberIds(app)).toEqual({ roomId: second, memberIds: ['member-B'] });
    expect(calls.map(({ query }) => query?.roomId)).toEqual([first, second]);
  });

  it('keeps concurrent SDK sessions isolated', async () => {
    const roomA = `A-${randomUUID()}`;
    const roomB = `B-${randomUUID()}`;
    const a = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      members: [{ _id: 'member-A' }], offset: 0, total: 1,
    }) }]);
    const b = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      members: [{ _id: 'member-B' }], offset: 0, total: 1,
    }) }]);
    vi.spyOn(a.app, 'callServerTool').mockResolvedValue(context(roomA, 'p'));
    vi.spyOn(b.app, 'callServerTool').mockResolvedValue(context(roomB, 'p'));
    let releaseA: () => void = () => undefined;
    const holdA = new Promise<void>((resolve) => { releaseA = resolve; });
    const aRest = a.app.rest.bind(a.app);
    vi.spyOn(a.app, 'rest').mockImplementation(async (request) => { await holdA; return aRest(request); });
    const pendingA = getCurrentRoomMemberIds(a.app);
    expect(await getCurrentRoomMemberIds(b.app)).toEqual({ roomId: roomB, memberIds: ['member-B'] });
    releaseA();
    expect(await pendingA).toEqual({ roomId: roomA, memberIds: ['member-A'] });
    expect(a.calls[0].query?.roomId).toBe(roomA);
    expect(b.calls[0].query?.roomId).toBe(roomB);
  });

  it.each([null, undefined, '', '  ', 12])('rejects invalid current room ID %s before REST', async (roomId) => {
    const { app, calls } = fakeRestApp([]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue(context(roomId, 'p'));
    await expect(getCurrentRoomMemberIds(app)).rejects.toMatchObject({ code: 'ROOM_CONTEXT_INVALID' });
    expect(calls).toHaveLength(0);
  });

  it.each(['d', 'l', 'v', 'unknown', undefined])('rejects unsupported room type %s before REST', async (roomType) => {
    const { app, calls } = fakeRestApp([]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue(context('room-1', roomType));
    await expect(getCurrentRoomMemberIds(app)).rejects.toMatchObject({ code: 'ROOM_TYPE_UNSUPPORTED' });
    expect(calls).toHaveLength(0);
  });

  it.each([['other-room', 'p'], ['room-1', 'c']] as const)(
    'rejects a context change to %s/%s after reading members', async (endRoomId, endRoomType) => {
      const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
        members: [{ _id: 'u1' }], offset: 0, total: 1,
      }) }]);
      vi.spyOn(app, 'callServerTool')
        .mockResolvedValueOnce(context('room-1', 'p'))
        .mockResolvedValueOnce(context(endRoomId, endRoomType));
      await expect(getCurrentRoomMemberIds(app)).rejects.toMatchObject({ code: 'ROOM_CONTEXT_CHANGED' });
    },
  );

  it('rejects a malformed completion context after reading members', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      members: [{ _id: 'u1' }], offset: 0, total: 1,
    }) }]);
    vi.spyOn(app, 'callServerTool')
      .mockResolvedValueOnce(context('room-1', 'p'))
      .mockResolvedValueOnce(context('', 'p'));
    await expect(getCurrentRoomMemberIds(app)).rejects.toMatchObject({ code: 'ROOM_CONTEXT_INVALID' });
  });

  it('does not call REST when the context tool rejects', async () => {
    const { app, calls } = fakeRestApp([]);
    vi.spyOn(app, 'callServerTool').mockRejectedValue(new Error('context tool failed'));
    await expect(getCurrentRoomMemberIds(app)).rejects.toThrow('context tool failed');
    expect(calls).toHaveLength(0);
  });

  it('returns [] only after a confirmed empty member response and stable context', async () => {
    const roomId = `empty-${randomUUID()}`;
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      members: [], offset: 0, total: 0,
    }) }]);
    const contextCall = vi.spyOn(app, 'callServerTool').mockResolvedValue(context(roomId, 'p'));
    expect(await getCurrentRoomMemberIds(app)).toEqual({ roomId, memberIds: [] });
    expect(contextCall).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(1);
  });

  it('includes all IDs when Hub caps each page', async () => {
    const roomId = `paged-${randomUUID()}`;
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: (_req, index) => ok(
      index === 0
        ? { data: { members: [{ _id: 'u1' }, { _id: 'u2' }], offset: 0, total: 3 } }
        : { data: { members: [{ _id: 'u3' }], offset: 2, total: 3 } },
    ) }]);
    const tool = vi.spyOn(app, 'callServerTool').mockResolvedValue(context(roomId, 'c'));
    expect(await getCurrentRoomMemberIds(app)).toEqual({ roomId, memberIds: ['u1', 'u2', 'u3'] });
    expect(calls.map(({ path, query }) => [path, query?.roomId, query?.offset])).toEqual([
      ['channels.members', roomId, 0], ['channels.members', roomId, 2],
    ]);
    expect(tool.mock.calls.map(([call]) => call.name)).toEqual(['mcpapp.context.get', 'mcpapp.context.get']);
  });

  it.each([403, 404, 405])('reports member route HTTP %i as unavailable, never empty', async (statusCode) => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ({
      statusCode, body: { success: false },
    }) }]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue(context('room-1', 'p'));
    await expect(getCurrentRoomMemberIds(app)).rejects.toMatchObject({
      name: 'RoomMemberIdsError', code: 'ROOM_MEMBERS_UNAVAILABLE',
    });
  });

  it('reports a rejected SDK member route as unavailable', async () => {
    const { app } = fakeRestApp([]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue(context('room-1', 'p'));
    vi.spyOn(app, 'rest').mockRejectedValue(new Error('App is not permitted to call GET /groups.members'));
    await expect(getCurrentRoomMemberIds(app)).rejects.toBeInstanceOf(RoomMemberIdsError);
    await expect(getCurrentRoomMemberIds(app)).rejects.toMatchObject({ code: 'ROOM_MEMBERS_UNAVAILABLE' });
  });

  it('preserves a Hub HTTP 500 failure', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ({
      statusCode: 500, body: { success: false, error: 'server failure' },
    }) }]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue(context('room-1', 'p'));
    await expect(getCurrentRoomMemberIds(app)).rejects.toMatchObject({ statusCode: 500 });
  });

  it('rejects a malformed successful member response', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      members: [{ username: 'wrong' }], offset: 0, total: 1,
    }) }]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue(context('room-1', 'p'));
    await expect(getCurrentRoomMemberIds(app)).rejects.toThrow('ROOM_MEMBERS_RESPONSE_INVALID');
  });

  it('keeps private payload fields out of its own errors', async () => {
    const { app } = fakeRestApp([]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue(context('token-secret', 'd'));
    try {
      await getCurrentRoomMemberIds(app);
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(RoomMemberIdsError);
      expect(String(error)).not.toContain('token-secret');
    }
  });
});
