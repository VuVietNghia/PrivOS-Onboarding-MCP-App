// tests/onboarding/onboarding-lists.spec.ts
import { describe, expect, it } from 'vitest';
import { createItem, createList, deleteList, listAllItems, listRoomLists } from '../../src/ui/onboarding/data/onboarding-lists';
import { fakeRestApp, forbidden, ok } from './fake-app';

describe('onboarding-lists', () => {
  it('listRoomLists gọi GET lists.listByRoomId với roomId', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'lists.listByRoomId', reply: () => ok({ lists: [{ _id: 'L1', name: 'A' }] }) }]);
    expect(await listRoomLists(app, 'R1')).toEqual([{ _id: 'L1', name: 'A' }]);
    expect(calls[0].query).toEqual({ roomId: 'R1' });
  });

  it('createList gửi key, isolatedList, field và stage', async () => {
    const { app, toolCalls } = fakeRestApp([{ method: 'POST', path: 'lists.create', reply: () => ok({ list: { _id: 'L2', name: 'T', key: 'onb-tpl-t' } }) }]);
    const list = await createList(app, { roomId: 'R1', name: 'T', key: 'onb-tpl-t', isolated: true,
      fields: [{ name: 'Người thực hiện', type: 'SELECT', options: ['Nhân sự', 'HR'] }], stages: [{ name: 'Ngày đầu', order: 0 }] });
    expect(list._id).toBe('L2');
    expect(toolCalls[0]).toEqual({ name: 'mcpapp.lists.create', arguments: { roomId: 'R1', name: 'T', key: 'onb-tpl-t', isolatedList: true, crossTeamWorkflow: false,
      fieldDefinitions: [{ name: 'Người thực hiện', type: 'SELECT', options: [{ value: 'Nhân sự' }, { value: 'HR' }] }],
      stages: [{ name: 'Ngày đầu', color: '#3b82f6' }] } });
  });

  it('createItem gửi name, stageId, parentId, customFields', async () => {
    const { app, toolCalls } = fakeRestApp([
      { method: 'POST', path: 'items.create', reply: () => ok({ item: { _id: 'I1', name: 'Ký NDA', stageId: 'S1', parentId: 'root' } }) },
      { method: 'GET', path: 'items.get', reply: () => ok({ item: { _id: 'I1', name: 'Ký NDA', stageId: 'S1', parentId: 'root' } }) },
    ]);
    const item = await createItem(app, { listId: 'L2', name: 'Ký NDA', stageId: 'S1', parentId: 'root', customFields: [{ fieldId: 'f1', value: true }] });
    expect(item._id).toBe('I1');
    expect(toolCalls[0]).toEqual({ name: 'mcpapp.lists.createItem', arguments: { listId: 'L2', title: 'Ký NDA', parentId: 'root', customFields: [{ fieldId: 'f1', value: true }] } });
  });

  it('listAllItems phân trang items.query tới khi hết cursor', async () => {
    const { app, calls } = fakeRestApp([{ method: 'POST', path: 'items.query', reply: (req) =>
      req.body.cursor ? ok({ items: [{ _id: 'b' }], nextCursor: null }) : ok({ items: [{ _id: 'a' }], nextCursor: 'c1' }) }]);
    expect(await listAllItems(app, 'L2')).toEqual({ items: [{ _id: 'a' }, { _id: 'b' }], capped: false });
    expect(calls[0].body.cursor).toBeUndefined();
    expect(calls[1].body.cursor).toBe('c1');
  });

  it('listAllItems ném ITEM_PAGING_RUNAWAY khi nextCursor lặp lại cùng giá trị', async () => {
    const { app } = fakeRestApp([{ method: 'POST', path: 'items.query', reply: () => ok({ items: [{ _id: 'a' }], nextCursor: 'c1' }) }]);
    await expect(listAllItems(app, 'L2')).rejects.toThrow('ITEM_PAGING_RUNAWAY');
  });

  it('listAllItems fallback items.listByListId khi thiếu lists:query', async () => {
    const { app, calls } = fakeRestApp([
      { method: 'POST', path: 'items.query', reply: () => forbidden() },
      { method: 'GET', path: 'items.listByListId', reply: () => ok({ items: [{ _id: 'a' }], truncated: true }) },
    ]);
    expect(await listAllItems(app, 'L2')).toEqual({ items: [{ _id: 'a' }], capped: true });
    expect(calls.map((c) => c.path)).toEqual(['items.query', 'items.listByListId']);
  });

  it('deleteList trả false khi route không tồn tại', async () => {
    const { app } = fakeRestApp([{ method: 'POST', path: 'lists.delete', reply: () => ({ statusCode: 404, body: { success: false, error: 'not found' } }) }]);
    expect(await deleteList(app, 'L2')).toBe(false);
  });

  it('deleteList trả false khi route trả 405', async () => {
    const { app } = fakeRestApp([{ method: 'POST', path: 'lists.delete', reply: () => ({ statusCode: 405, body: { success: false, error: 'method not allowed' } }) }]);
    expect(await deleteList(app, 'L2')).toBe(false);
  });

  it('deleteList trả false khi route trả 403', async () => {
    const { app } = fakeRestApp([{ method: 'POST', path: 'lists.delete', reply: () => forbidden() }]);
    expect(await deleteList(app, 'L2')).toBe(false);
  });

  it('deleteList vẫn ném khi route trả 500', async () => {
    const { app } = fakeRestApp([{ method: 'POST', path: 'lists.delete', reply: () => ({ statusCode: 500, body: { success: false, error: 'server error' } }) }]);
    await expect(deleteList(app, 'L2')).rejects.toThrow();
  });
});
