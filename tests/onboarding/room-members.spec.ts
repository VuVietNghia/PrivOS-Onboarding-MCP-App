import { describe, expect, it } from 'vitest';
import type { McpApp } from '@privos_ai/app-react';
import { listRoomMembers, lookupUser } from '../../src/ui/onboarding/data/room-members';
import { pickEmployee } from '../../src/ui/onboarding/domain/pick-employee';
import { hireLabel } from '../../src/ui/onboarding/domain/hire-label';
import { fakeRestApp, forbidden, ok } from './fake-app';

describe('listRoomMembers', () => {
  it('uses groups.members for a private room', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: () => ok({
      data: { members: [{ _id: 'u1', username: 'an', name: 'An' }], offset: 0, total: 1 },
    }) }]);
    expect(await listRoomMembers(app, 'R1', 'p')).toEqual([{ id: 'u1', username: 'an', name: 'An' }]);
    expect(calls.map(({ path }) => path)).toEqual(['groups.members']);
  });

  it('does not guess an endpoint for an unknown room type', async () => {
    const { app, calls } = fakeRestApp([]);
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
      data: { members: [{ _id: 'u1' }], offset: 0 },
    }) }]);
    await expect(listRoomMembers(app, 'R1', 'p')).rejects.toThrow('ROOM_MEMBERS_RESPONSE_INVALID');
  });

  it('rejects a repeated offset', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'groups.members', reply: (_request, index) => ok({
      data: { members: [{ _id: `u${index}` }], offset: 0, total: 2 },
    }) }]);
    await expect(listRoomMembers(app, 'R1', 'p')).rejects.toThrow('ROOM_MEMBERS_RESPONSE_INVALID');
  });

  it('đọc data.members từ GET channels.members của room', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: () => ok({
      data: { members: [{ _id: 'u1', username: 'hung', name: 'Hung' }, { _id: 'u2', username: 'lan' }], count: 2, offset: 0, total: 2 },
    }) }]);
    expect(await listRoomMembers(app, 'R1', 'c')).toEqual([
      { id: 'u1', username: 'hung', name: 'Hung' },
      { id: 'u2', username: 'lan', name: 'lan' },
    ]);
    expect(calls[0].query).toMatchObject({ roomId: 'R1', offset: 0 });
  });

  it('bỏ qua phần tử thiếu _id', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: () => ok({
      data: { members: [{ username: 'x' }, { _id: 'u1', username: 'hung', name: 'Hung' }], count: 2, offset: 0, total: 2 },
    }) }]);
    expect((await listRoomMembers(app, 'R1', 'c'))?.map((m) => m.id)).toEqual(['u1']);
  });

  it('tải đủ các trang thành viên khi Hub giới hạn count', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: (_request, index) => ok({
      data: index === 0
        ? { members: [{ _id: 'u1', username: 'an' }, { _id: 'u2', username: 'binh' }], count: 2, offset: 0, total: 3 }
        : { members: [{ _id: 'u3', username: 'chi' }], count: 1, offset: 2, total: 3 },
    }) }]);
    expect((await listRoomMembers(app, 'R1', 'c'))?.map((member) => member.id)).toEqual(['u1', 'u2', 'u3']);
    expect(calls.map((call) => call.query?.offset)).toEqual([0, 2]);
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

  it('không coi lỗi Hub 500 là danh sách thành viên không khả dụng', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'channels.members', reply: () => ({
      statusCode: 500, body: { success: false, error: 'internal failure' },
    }) }]);
    await expect(listRoomMembers(app, 'R1', 'c')).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe('lookupUser', () => {
  it('tìm đúng username bằng users.list và đọc data.users', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'users.list', reply: () => ok({
      data: { users: [{ _id: 'u9', username: 'mai', name: 'Mai' }], count: 1, offset: 0, total: 1 },
    }) }]);
    expect(await lookupUser(app, '  mai ')).toEqual({ kind: 'found', member: { id: 'u9', username: 'mai', name: 'Mai' } });
    expect(calls[0].query).toMatchObject({ query: '{"username":"mai"}', count: 2 });
  });

  it('không tìm thấy khi users.list trả danh sách rỗng', async () => {
    const { app } = fakeRestApp([
      { method: 'GET', path: 'users.list', reply: () => ok({ data: { users: [], count: 0, offset: 0, total: 0 } }) },
      { method: 'GET', path: 'users.info', reply: () => ({ statusCode: 404, body: { success: false, error: 'User not found' } }) },
    ]);
    expect(await lookupUser(app, 'ghost')).toEqual({ kind: 'not-found' });
  });

  it('tìm được user ID qua users.info khi username không khớp', async () => {
    const { app, calls } = fakeRestApp([
      { method: 'GET', path: 'users.list', reply: () => ok({ data: { users: [], count: 0, offset: 0, total: 0 } }) },
      { method: 'GET', path: 'users.info', reply: () => ok({ data: { user: { _id: 'user-123', username: 'mai', name: 'Mai' } } }) },
    ]);
    expect(await lookupUser(app, 'user-123')).toEqual({ kind: 'found', member: { id: 'user-123', username: 'mai', name: 'Mai' } });
    expect(calls[1].query).toMatchObject({ userId: 'user-123' });
  });

  it('unavailable khi thiếu quyền users:read', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'users.list', reply: () => forbidden() }]);
    expect(await lookupUser(app, 'mai')).toEqual({ kind: 'unavailable' });
  });

  it('không báo không tìm thấy người khi Hub lỗi 500', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'users.list', reply: () => ({
      statusCode: 500, body: { success: false, error: 'internal failure' },
    }) }]);
    await expect(lookupUser(app, 'mai')).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe('pickEmployee', () => {
  it('ô trống thì báo lỗi', () => {
    expect(pickEmployee('  ', { kind: 'unavailable' })).toEqual({ ok: false, message: 'Chọn hoặc nhập nhân sự.' });
  });
  it('tìm thấy thì dùng id của người đó', () => {
    expect(pickEmployee('mai', { kind: 'found', member: { id: 'u9', username: 'mai', name: 'Mai' } })).toEqual({ ok: true, employeeId: 'u9' });
  });
  it('không tìm thấy thì báo lỗi, không dùng giá trị thô', () => {
    expect(pickEmployee('ghost', { kind: 'not-found' })).toEqual({ ok: false, message: 'Không tìm thấy người dùng "ghost".' });
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
