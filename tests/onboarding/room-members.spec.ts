import { describe, expect, it, vi } from 'vitest';
import type { McpApp } from '@privos_ai/app-react';
import { listRoomMembers, lookupUser } from '../../src/ui/onboarding/data/room-members';
import { pickEmployee } from '../../src/ui/onboarding/domain/pick-employee';
import { hireLabel } from '../../src/ui/onboarding/domain/hire-label';
import { fakeRestApp, forbidden, ok } from './fake-app';

describe('listRoomMembers', () => {
  it('recovers a private room type from the bound raw context', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      members: [{ _id: 'u1', username: 'an', name: 'An' }], offset: 0, total: 1,
    }) }]);
    const contextCall = vi.spyOn(app, 'callServerTool').mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ roomId: 'R1', roomType: 'p' }) }],
    });
    expect(await listRoomMembers(app, 'R1', 'unsupported')).toEqual([{ id: 'u1', username: 'an', name: 'An' }]);
    expect(contextCall).toHaveBeenCalledTimes(1);
    expect(contextCall).toHaveBeenCalledWith({ name: 'mcpapp.context.get', arguments: {} });
    expect(calls.map(({ path }) => path)).toEqual(['groups.members']);
    expect(calls[0].query?.roomId).toBe('R1');
  });

  it('uses groups.members for a private room', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      members: [{ _id: 'u1', username: 'an', name: 'An' }], count: 1, offset: 0, total: 1,
    }) }]);
    expect(await listRoomMembers(app, 'R1', 'p')).toEqual([{ id: 'u1', username: 'an', name: 'An' }]);
    expect(calls.map(({ path }) => path)).toEqual(['groups.members']);
  });

  it.each([
    [{ roomId: 'R2', roomType: 'p' }, 'ROOM_CONTEXT_MISMATCH'],
    [{ roomType: 'p' }, 'ROOM_CONTEXT_INVALID'],
  ])('rejects an unbound raw context before REST', async (context, error) => {
    const { app, calls } = fakeRestApp([]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(context) }],
    });
    await expect(listRoomMembers(app, 'R1', 'unsupported')).rejects.toThrow(error);
    expect(calls).toHaveLength(0);
  });

  it.each(['d', undefined])('falls back when raw room type is %s', async (roomType) => {
    const { app, calls } = fakeRestApp([]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ roomId: 'R1', roomType }) }],
    });
    expect(await listRoomMembers(app, 'R1', 'unsupported')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it.each([403, 404])('keeps manual fallback after raw context when groups.members returns %i', async (statusCode) => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'groups.members',
      reply: () => ({ statusCode, body: { success: false } }) }]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ roomId: 'R1', roomType: 'p' }) }],
    });
    expect(await listRoomMembers(app, 'R1', 'unsupported')).toBeNull();
    expect(calls.map(({ path }) => path)).toEqual(['groups.members']);
  });

  it('keeps a server error visible after raw-context recovery', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members',
      reply: () => ({ statusCode: 500, body: { success: false } }) }]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ roomId: 'R1', roomType: 'p' }) }],
    });
    await expect(listRoomMembers(app, 'R1', 'unsupported')).rejects.toMatchObject({ statusCode: 500 });
  });

  it('rejects a malformed member page after raw-context recovery', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members',
      reply: () => ok({ members: [], offset: 0 }) }]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ roomId: 'R1', roomType: 'p' }) }],
    });
    await expect(listRoomMembers(app, 'R1', 'unsupported')).rejects.toThrow('ROOM_MEMBERS_RESPONSE_INVALID');
  });

  it('does not guess an endpoint for an unknown room type', async () => {
    const { app, calls } = fakeRestApp([]);
    vi.spyOn(app, 'callServerTool').mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ roomId: 'R1', roomType: 'd' }) }],
    });
    expect(await listRoomMembers(app, 'R1', 'd')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('keeps manual fallback on private-room 403', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => forbidden() }]);
    expect(await listRoomMembers(app, 'R1', 'p')).toBeNull();
  });

  it('rejects a page that cannot advance', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      data: { members: [], offset: 0, total: 2 },
    }) }]);
    await expect(listRoomMembers(app, 'R1', 'p')).rejects.toThrow('ROOM_MEMBERS_RESPONSE_INVALID');
  });

  it('rejects a page without total', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      members: [{ _id: 'u1' }], offset: 0,
    }) }]);
    await expect(listRoomMembers(app, 'R1', 'p')).rejects.toThrow('ROOM_MEMBERS_RESPONSE_INVALID');
  });

  it('rejects a page without offset', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      members: [{ _id: 'u1' }], total: 1,
    }) }]);
    await expect(listRoomMembers(app, 'R1', 'p')).rejects.toThrow('ROOM_MEMBERS_RESPONSE_INVALID');
  });

  it('rejects a top-level response without members', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({ offset: 0, total: 1 }) }]);
    await expect(listRoomMembers(app, 'R1', 'p')).rejects.toThrow('ROOM_MEMBERS_RESPONSE_INVALID');
  });

  it('rejects a repeated offset', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: (_request, index) => ok({
      data: { members: [{ _id: `u${index}` }], offset: 0, total: 2 },
    }) }]);
    await expect(listRoomMembers(app, 'R1', 'p')).rejects.toThrow('ROOM_MEMBERS_RESPONSE_INVALID');
  });

  it('đọc members cấp ngoài từ GET channels.members của room', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: () => ok({
      members: [{ _id: 'u1', username: 'hung', name: 'Hung' }, { _id: 'u2', username: 'lan' }], count: 2, offset: 0, total: 2,
    }) }]);
    expect(await listRoomMembers(app, 'R1', 'c')).toEqual([
      { id: 'u1', username: 'hung', name: 'Hung' },
      { id: 'u2', username: 'lan', name: 'lan' },
    ]);
    expect(calls[0].query).toMatchObject({ roomId: 'R1', offset: 0 });
  });

  it('vẫn đọc được data.members khi Hub trả envelope có data', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      data: { members: [{ _id: 'u1', username: 'an', name: 'An' }], offset: 0, total: 1 },
    }) }]);
    expect(await listRoomMembers(app, 'R1', 'p')).toEqual([{ id: 'u1', username: 'an', name: 'An' }]);
  });

  it('rejects a member row without _id instead of returning a shortened list', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: () => ok({
      data: { members: [{ username: 'x' }, { _id: 'u1', username: 'hung', name: 'Hung' }], count: 2, offset: 0, total: 2 },
    }) }]);
    await expect(listRoomMembers(app, 'R1', 'c')).rejects.toThrow('ROOM_MEMBERS_RESPONSE_INVALID');
  });

  it.each([null, '', '  ', 12])('rejects an invalid member ID %s', async (_id) => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: () => ok({
      members: [{ _id }], offset: 0, total: 1,
    }) }]);
    await expect(listRoomMembers(app, 'R1', 'c')).rejects.toThrow('ROOM_MEMBERS_RESPONSE_INVALID');
  });

  it('rejects a changed total between pages', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: (_request, index) => ok(
      index === 0
        ? { members: [{ _id: 'u1' }], offset: 0, total: 3 }
        : { members: [{ _id: 'u2' }], offset: 1, total: 4 },
    ) }]);
    await expect(listRoomMembers(app, 'R1', 'c')).rejects.toThrow('ROOM_MEMBERS_CHANGED');
  });

  it('rejects pages that contain fewer unique IDs than total', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: (_request, index) => ok(
      index === 0
        ? { members: [{ _id: 'u1' }, { _id: 'u2' }], offset: 0, total: 3 }
        : { members: [{ _id: 'u2' }], offset: 2, total: 3 },
    ) }]);
    await expect(listRoomMembers(app, 'R1', 'c')).rejects.toThrow('ROOM_MEMBERS_INCOMPLETE');
  });

  it('accepts a confirmed empty room', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      members: [], offset: 0, total: 0,
    }) }]);
    expect(await listRoomMembers(app, 'R1', 'p')).toEqual([]);
  });

  it('rejects a page that exceeds the stated total', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      members: [{ _id: 'u1' }, { _id: 'u2' }], offset: 0, total: 1,
    }) }]);
    await expect(listRoomMembers(app, 'R1', 'p')).rejects.toThrow('ROOM_MEMBERS_RESPONSE_INVALID');
  });

  it.each([1000, 1001])('enforces the 1000-page ceiling for %i members', async (total) => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: (_request, index) => ok({
      members: [{ _id: `u${index}` }], offset: index, total,
    }) }]);
    if (total === 1000) {
      expect((await listRoomMembers(app, 'R1', 'p'))?.length).toBe(1000);
    } else {
      await expect(listRoomMembers(app, 'R1', 'p')).rejects.toThrow('ROOM_MEMBERS_PAGINATION_LIMIT');
    }
    expect(calls).toHaveLength(1000);
  });

  it('tải đủ các trang thành viên khi Hub giới hạn count', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: (_request, index) => ok({
      ...(index === 0
        ? { members: [{ _id: 'u1', username: 'an' }, { _id: 'u2', username: 'binh' }], count: 2, offset: 0, total: 3 }
        : { members: [{ _id: 'u3', username: 'chi' }], count: 1, offset: 2, total: 3 }),
    }) }]);
    expect((await listRoomMembers(app, 'R1', 'c'))?.map((member) => member.id)).toEqual(['u1', 'u2', 'u3']);
    expect(calls.map((call) => call.query?.offset)).toEqual([0, 2]);
    expect(calls.map((call) => call.query?.count)).toEqual([500, 500]);
  });

  it('trả null khi thiếu quyền rooms:read (403)', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: () => forbidden() }]);
    expect(await listRoomMembers(app, 'R1', 'c')).toBeNull();
  });

  it('trả null khi host SDK từ chối Promise do route thành viên không được cấp quyền', async () => {
    const app = { rest: async () => { throw new Error('App is not permitted to call GET /channels.members'); } } as unknown as McpApp;
    expect(await listRoomMembers(app, 'R1', 'c')).toBeNull();
  });

  it('trả null khi Hub không có endpoint (404)', async () => {
    const { app } = fakeRestApp([]);
    expect(await listRoomMembers(app, 'R1', 'c')).toBeNull();
  });

  it('returns null when member route is not allowed (405)', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: () => ({
      statusCode: 405, body: { success: false },
    }) }]);
    expect(await listRoomMembers(app, 'R1', 'c')).toBeNull();
  });

  it('không coi lỗi Hub 500 là danh sách thành viên không khả dụng', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: () => ({
      statusCode: 500, body: { success: false, error: 'internal failure' },
    }) }]);
    await expect(listRoomMembers(app, 'R1', 'c')).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe('lookupUser', () => {
  it('tra username bằng users.info khi users.list của Hub bỏ qua bộ lọc', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'users.info', reply: () => ok({
      user: { _id: 'WnpL3euE3JKv6yEcj', username: 'hungdev', name: 'Hung' },
    }) }]);
    expect(await lookupUser(app, 'hungdev')).toEqual({ kind: 'found', member: {
      id: 'WnpL3euE3JKv6yEcj', username: 'hungdev', name: 'Hung',
    } });
    expect(calls.map(({ path }) => path)).toEqual(['users.info']);
    expect(calls[0].query).toEqual({ userId: 'hungdev' });
  });

  it('cắt khoảng trắng quanh username trước khi gọi users.info', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'users.info', reply: () => ok({
      user: { _id: 'u9', username: 'mai', name: 'Mai' },
    }) }]);
    expect(await lookupUser(app, '  mai ')).toEqual({ kind: 'found', member: { id: 'u9', username: 'mai', name: 'Mai' } });
    expect(calls[0].query).toEqual({ userId: 'mai' });
  });

  it('vẫn tìm username khi users.info trả data.user', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'users.info', reply: () => ok({
      data: { user: { _id: 'u9', username: 'mai', name: 'Mai' } },
    }) }]);
    expect(await lookupUser(app, 'mai')).toEqual({ kind: 'found', member: { id: 'u9', username: 'mai', name: 'Mai' } });
  });

  it('không tìm thấy username khi users.info trả 400', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'users.info', reply: () => ({
      statusCode: 400, body: { success: false, error: 'User not found.' },
    }) }]);
    expect(await lookupUser(app, 'ghost')).toEqual({ kind: 'not-found' });
  });

  it('không tìm thấy username khi SDK ném thông báo lỗi 400 của Hub', async () => {
    const { app } = fakeRestApp([]);
    vi.spyOn(app, 'rest').mockRejectedValueOnce(new Error('User not found.'));
    expect(await lookupUser(app, 'ghost')).toEqual({ kind: 'not-found' });
  });

  it('tìm được user ID qua users.info', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'users.info', reply: () => ok({
      user: { _id: 'user-123', username: 'mai', name: 'Mai' },
    }) }]);
    expect(await lookupUser(app, 'user-123')).toEqual({ kind: 'found', member: { id: 'user-123', username: 'mai', name: 'Mai' } });
    expect(calls[0].query).toEqual({ userId: 'user-123' });
  });

  it('vẫn tìm user ID khi users.info trả data.user', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'users.info', reply: () => ok({
      data: { user: { _id: 'user-123', username: 'mai', name: 'Mai' } },
    }) }]);
    expect(await lookupUser(app, 'user-123')).toEqual({ kind: 'found', member: { id: 'user-123', username: 'mai', name: 'Mai' } });
  });

  it('rejects a successful users.info response without user', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'users.info', reply: () => ok({}) }]);
    await expect(lookupUser(app, 'user-123')).rejects.toThrow('USER_LOOKUP_RESPONSE_INVALID');
  });

  it('rejects a users.info response for another user', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'users.info', reply: () => ok({
      user: { _id: 'different-id', username: 'someone-else' },
    }) }]);
    await expect(lookupUser(app, 'user-123')).rejects.toThrow('USER_LOOKUP_RESPONSE_INVALID');
  });

  it('unavailable khi thiếu quyền users:read', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'users.info', reply: () => forbidden() }]);
    expect(await lookupUser(app, 'mai')).toEqual({ kind: 'unavailable' });
  });

  it('không báo không tìm thấy người khi Hub lỗi 500', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'users.info', reply: () => ({
      statusCode: 500, body: { success: false, error: 'internal failure' },
    }) }]);
    await expect(lookupUser(app, 'mai')).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe('pickEmployee', () => {
  it('ô trống thì báo lỗi', () => {
    expect(pickEmployee('  ', { kind: 'unavailable' })).toEqual({ ok: false, code: 'EMPLOYEE_REQUIRED', message: 'Chọn hoặc nhập nhân sự.' });
  });
  it('tìm thấy thì dùng id của người đó', () => {
    expect(pickEmployee('mai', { kind: 'found', member: { id: 'u9', username: 'mai', name: 'Mai' } })).toEqual({ ok: true, employeeId: 'u9' });
  });
  it('không tìm thấy thì báo lỗi, không dùng giá trị thô', () => {
    expect(pickEmployee('ghost', { kind: 'not-found' })).toEqual({ ok: false, code: 'EMPLOYEE_NOT_FOUND', message: 'Không tìm thấy người dùng "ghost".' });
  });
  it('không tra được (thiếu quyền) thì coi giá trị nhập là user id', () => {
    expect(pickEmployee(' abc123 ', { kind: 'unavailable' })).toEqual({ ok: true, employeeId: 'abc123' });
  });
});

describe('hireLabel', () => {
  const names = new Map([['u1', 'Hung']]);
  it('ưu tiên ASSIGNEE, đổi id thành tên', () => {
    expect(hireLabel({ name: 'u9', employeeIds: ['u1'] }, names)).toBe('Hung');
  });
  it('chưa có ASSIGNEE thì dùng tên item (user id)', () => {
    expect(hireLabel({ name: 'u1', employeeIds: [] }, names)).toBe('Hung');
  });
  it('không có trong danh sách thành viên thì hiện id', () => {
    expect(hireLabel({ name: 'u7', employeeIds: [] }, names)).toBe('u7');
  });
  it('không có gì thì hiện gạch', () => {
    expect(hireLabel({ name: '', employeeIds: [] }, names)).toBe('—');
  });
});
