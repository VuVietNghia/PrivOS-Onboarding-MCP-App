import { describe, expect, it } from 'vitest';
import { listRoomMembers, lookupUser } from '../../src/ui/onboarding/data/room-members';
import { pickEmployee } from '../../src/ui/onboarding/domain/pick-employee';
import { hireLabel } from '../../src/ui/onboarding/domain/hire-label';
import { fakeRestApp, forbidden, ok } from './fake-app';

describe('listRoomMembers', () => {
  it('gọi GET rooms.membersOrderedByRole với roomId và trả id/username/name', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'rooms.membersOrderedByRole', reply: () => ok({
      members: [{ _id: 'u1', username: 'hung', name: 'Hung' }, { _id: 'u2', username: 'lan' }],
    }) }]);
    expect(await listRoomMembers(app, 'R1')).toEqual([
      { id: 'u1', username: 'hung', name: 'Hung' },
      { id: 'u2', username: 'lan', name: 'lan' },
    ]);
    expect(calls[0].query).toMatchObject({ roomId: 'R1' });
  });

  it('bỏ qua phần tử thiếu _id', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'rooms.membersOrderedByRole', reply: () => ok({
      members: [{ username: 'x' }, { _id: 'u1', username: 'hung', name: 'Hung' }],
    }) }]);
    expect((await listRoomMembers(app, 'R1'))?.map((m) => m.id)).toEqual(['u1']);
  });

  it('trả null khi thiếu quyền rooms:read (403)', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'rooms.membersOrderedByRole', reply: () => forbidden() }]);
    expect(await listRoomMembers(app, 'R1')).toBeNull();
  });

  it('trả null khi Hub từ chối endpoint (404/400)', async () => {
    const { app } = fakeRestApp([]);
    expect(await listRoomMembers(app, 'R1')).toBeNull();
  });
});

describe('lookupUser', () => {
  it('tìm thấy theo username', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'users.info', reply: () => ok({ user: { _id: 'u9', username: 'mai', name: 'Mai' } }) }]);
    expect(await lookupUser(app, '  mai ')).toEqual({ kind: 'found', member: { id: 'u9', username: 'mai', name: 'Mai' } });
    expect(calls[0].query).toEqual({ username: 'mai' });
  });

  it('không tìm thấy khi Hub trả lỗi user', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'users.info', reply: () => ({ statusCode: 400, body: { success: false, error: 'User not found' } }) }]);
    expect(await lookupUser(app, 'ghost')).toEqual({ kind: 'not-found' });
  });

  it('unavailable khi thiếu quyền users:read', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'users.info', reply: () => forbidden() }]);
    expect(await lookupUser(app, 'mai')).toEqual({ kind: 'unavailable' });
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
