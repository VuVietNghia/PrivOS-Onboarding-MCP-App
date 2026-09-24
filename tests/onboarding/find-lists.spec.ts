// tests/onboarding/find-lists.spec.ts
import { describe, expect, it } from 'vitest';
import { createTemplateList, ensureHiresList, findHiresList, listTemplateLists, loadListWithFields } from '../../src/ui/onboarding/data/find-lists';
import { F, HIRES_FIELDS } from '../../src/ui/onboarding/domain/fields';
import { fakeRestApp, ok } from './fake-app';

const lists = [
  { _id: 'H', name: 'Onboarding · Nhân sự', key: 'onb-hires' },
  { _id: 'T2', name: 'QA', key: 'onb-tpl-qa' },
  { _id: 'T1', name: 'Backend', key: 'onb-tpl-backend' },
  { _id: 'X', name: 'Sprint', key: 'sprint' },
];

describe('find-lists', () => {
  it('findHiresList theo key', async () => {
    const { app, toolCalls } = fakeRestApp([{ method: 'GET', path: 'lists.listByRoomId', reply: () => ok({ lists }) }]);
    expect((await findHiresList(app, 'R'))?._id).toBe('H');
    expect(toolCalls).toEqual([{ name: 'mcpapp.lists.getAll', arguments: { roomId: 'R' } }]);
  });

  it('findHiresList fallback theo tên khi key bị sinh lại', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'lists.listByRoomId', reply: () => ok({ lists: [{ _id: 'H2', name: 'Onboarding · Nhân sự', key: 'onboarding-nhan-su' }] }) }]);
    expect((await findHiresList(app, 'R'))?._id).toBe('H2');
  });

  it('ensureHiresList tạo list khi chưa có, với đủ field và 4 stage', async () => {
    const { app, calls, toolCalls } = fakeRestApp([
      { method: 'GET', path: 'lists.listByRoomId', reply: () => ok({ lists: [] }) },
      { method: 'POST', path: 'lists.create', reply: () => ok({ list: { _id: 'H3', name: 'Onboarding · Nhân sự', key: 'onb-hires' } }) },
    ]);
    expect((await ensureHiresList(app, 'R'))._id).toBe('H3');
    const body = calls[1].body;
    expect(body.key).toBe('onb-hires');
    expect(body.isolatedList).toBe(true);
    expect(body.fieldDefinitions.map((f: { name: string }) => f.name)).toEqual(HIRES_FIELDS.map((f) => f.name));
    expect(body.stages.map((s: { name: string }) => s.name)).toEqual(['Đang khởi tạo', 'Đang onboarding', 'Hoàn tất', 'Khởi tạo lỗi']);
    expect(toolCalls.map((call) => call.name)).toEqual(['mcpapp.lists.getAll', 'mcpapp.lists.create']);
    expect(toolCalls[1].arguments).toMatchObject({ roomId: 'R', isolatedList: true, crossTeamWorkflow: false });
  });

  it('listTemplateLists lọc tiền tố và sắp theo tên', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'lists.listByRoomId', reply: () => ok({ lists }) }]);
    expect((await listTemplateLists(app, 'R')).map((l) => l._id)).toEqual(['T1', 'T2']);
  });

  it('createTemplateList từ chối key trùng', async () => {
    const { app } = fakeRestApp([{ method: 'GET', path: 'lists.listByRoomId', reply: () => ok({ lists }) }]);
    await expect(createTemplateList(app, 'R', 'Backend', ['Ngày đầu'])).rejects.toThrow('TEMPLATE_INVALID');
  });

  it('loadListWithFields ném SCHEMA_DRIFT khi thiếu field', async () => {
    const { app, toolCalls } = fakeRestApp([{ method: 'GET', path: 'lists.info', reply: () => ok({ list: { _id: 'H', name: 'x', fieldDefinitions: [{ _id: 'a', name: F.position, type: 'TEXT' }] }, stages: [] }) }]);
    await expect(loadListWithFields(app, 'H', HIRES_FIELDS)).rejects.toThrow('SCHEMA_DRIFT');
    expect(toolCalls.map((call) => call.name)).toEqual(['mcpapp.lists.get', 'mcpapp.stages.getByList']);
  });

  it('createTemplateList từ chối vị trí toàn ký tự đặc biệt (slug rỗng)', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'lists.listByRoomId', reply: () => ok({ lists }) }]);
    await expect(createTemplateList(app, 'R', '!!!', ['Ngày đầu'])).rejects.toThrow('TEMPLATE_INVALID');
    expect(calls.length).toBe(0);
  });

  it('createTemplateList từ chối vị trí toàn khoảng trắng (slug rỗng)', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'lists.listByRoomId', reply: () => ok({ lists }) }]);
    await expect(createTemplateList(app, 'R', '   ', ['Ngày đầu'])).rejects.toThrow('TEMPLATE_INVALID');
    expect(calls.length).toBe(0);
  });

  it('ensureHiresList không tạo list mới khi đã có', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'lists.listByRoomId', reply: () => ok({ lists }) }]);
    expect((await ensureHiresList(app, 'R'))._id).toBe('H');
    expect(calls.length).toBe(1);
    expect(calls[0].path).toBe('lists.listByRoomId');
  });

  it('loadListWithFields ném SCHEMA_DRIFT khi field đủ tên nhưng sai kiểu', async () => {
    const fieldDefinitions = HIRES_FIELDS.map((f, i) => ({
      _id: `f${i}`, name: f.name, type: f.name === F.startDate ? 'TEXT' : f.type,
    }));
    const { app } = fakeRestApp([{ method: 'GET', path: 'lists.info', reply: () => ok({ list: { _id: 'H', name: 'x', fieldDefinitions }, stages: [] }) }]);
    await expect(loadListWithFields(app, 'H', HIRES_FIELDS)).rejects.toThrow('SCHEMA_DRIFT');
  });

  it('loadListWithFields không ném khi mọi field đủ tên và đúng kiểu', async () => {
    const fieldDefinitions = HIRES_FIELDS.map((f, i) => ({ _id: `f${i}`, name: f.name, type: f.type }));
    const { app } = fakeRestApp([{ method: 'GET', path: 'lists.info', reply: () => ok({ list: { _id: 'H', name: 'x', fieldDefinitions }, stages: [] }) }]);
    const result = await loadListWithFields(app, 'H', HIRES_FIELDS);
    expect(Object.keys(result.ids).sort()).toEqual(HIRES_FIELDS.map((f) => f.name).sort());
  });
});
