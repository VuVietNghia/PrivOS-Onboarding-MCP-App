import { describe, expect, it } from 'vitest';
import type { McpApp } from '@privos_ai/app-react';
import { createItem, createList, getListInfo, listRoomLists, updateItem } from '../../src/ui/onboarding/data/onboarding-lists';

function fakeToolApp(replies: Record<string, unknown>): { app: McpApp; calls: { name: string; arguments: Record<string, unknown> }[] } {
  const calls: { name: string; arguments: Record<string, unknown> }[] = [];
  return { app: { callServerTool: async (call: { name: string; arguments: Record<string, unknown> }) => {
    calls.push(call);
    const reply = replies[call.name];
    if (reply === undefined) throw new Error(`Unexpected tool ${call.name}`);
    return reply;
  } } as McpApp, calls };
}

describe('tool mediated List and Item writes', () => {
  it('fails a List read when the tool resolves isError, so it cannot create a duplicate', async () => {
    const { app } = fakeToolApp({ 'mcpapp.lists.getAll': { isError: true, content: [{ type: 'text', text: '{"errorType":"forbidden","statusCode":403}' }] } });
    await expect(listRoomLists(app, 'room-1')).rejects.toThrow();
  });

  it('creates an isolated List with colored initial stages through the tool', async () => {
    const { app, calls } = fakeToolApp({ 'mcpapp.lists.create': { content: [{ type: 'text', text: '{"list":{"id":"list-1","name":"Template"},"stages":[{"id":"stage-1","name":"Week 1"}]}' }] } });
    const list = await createList(app, { roomId: 'room-1', name: 'Template', key: 'template', isolated: true,
      fields: [{ name: 'Note', type: 'TEXTAREA' }], stages: [{ name: 'Week 1', color: '#3b82f6' }] });
    expect(list._id).toBe('list-1');
    expect(calls).toEqual([{ name: 'mcpapp.lists.create', arguments: { roomId: 'room-1', name: 'Template', key: 'template',
      isolatedList: true, crossTeamWorkflow: false, fieldDefinitions: [{ name: 'Note', type: 'TEXTAREA' }],
      stages: [{ name: 'Week 1', color: '#3b82f6' }] } }]);
  });

  it('creates by title then moves to requested stage and returns readback identity', async () => {
    const { app, calls } = fakeToolApp({
      'mcpapp.lists.createItem': { item: { id: 'item-1', name: 'Lesson', stageId: 'first-stage' } },
      'mcpapp.lists.moveItemToStage': { success: true },
      'mcpapp.lists.getItem': { item: { id: 'item-1', name: 'Lesson', stageId: 'target-stage', parentId: 'day-1', customFields: [{ fieldId: 'owner', value: 'user-1' }] } },
    });
    const item = await createItem(app, { listId: 'list-1', name: 'Lesson', stageId: 'target-stage', parentId: 'day-1', customFields: [{ fieldId: 'owner', value: 'user-1' }] });
    expect(item).toMatchObject({ _id: 'item-1', stageId: 'target-stage', parentId: 'day-1' });
    expect(calls.map((call) => call.name)).toEqual(['mcpapp.lists.createItem', 'mcpapp.lists.moveItemToStage', 'mcpapp.lists.getItem']);
    expect(calls[0].arguments).toEqual({ listId: 'list-1', title: 'Lesson', parentId: 'day-1', customFields: [{ fieldId: 'owner', value: 'user-1' }] });
  });

  it('preserves existing file fields while updating one ordinary field', async () => {
    const { app, calls } = fakeToolApp({
      'mcpapp.lists.getItem': { item: { id: 'item-1', name: 'Lesson', stageId: 'stage-1', customFields: [
        { fieldId: 'file', value: [{ id: 'file-1' }] }, { fieldId: 'note', value: 'old' },
      ] } },
      'mcpapp.lists.updateItem': { success: true },
    });
    await updateItem(app, { itemId: 'item-1', customFields: [{ fieldId: 'note', value: 'new' }] });
    expect(calls[1]).toEqual({ name: 'mcpapp.lists.updateItem', arguments: { itemId: 'item-1', customFields: [
      { fieldId: 'file', value: [{ id: 'file-1' }] }, { fieldId: 'note', value: 'new' },
    ] } });
  });

  it('normalizes field, stage and item IDs returned under id and object customFields', async () => {
    const { app } = fakeToolApp({
      'mcpapp.lists.get': { list: { id: 'list-1', name: 'Template', fieldDefinitions: [{ id: 'note', name: 'Note', type: 'TEXT' }] } },
      'mcpapp.stages.getByList': { stages: [{ id: 'stage-1', name: 'Week 1' }] },
      'mcpapp.lists.createItem': { item: { id: 'item-1', name: 'Lesson', stage_id: 'stage-1' } },
      'mcpapp.lists.getItem': { item: { id: 'item-1', name: 'Lesson', stage_id: 'stage-1', customFields: { note: { value: 'Read' } } } },
    });
    const info = await getListInfo(app, 'list-1');
    expect(info.list.fieldDefinitions).toEqual([{ id: 'note', _id: 'note', name: 'Note', type: 'TEXT' }]);
    const item = await createItem(app, { listId: 'list-1', name: 'Lesson', stageId: 'stage-1', customFields: [{ fieldId: 'note', value: 'Read' }] });
    expect(item).toMatchObject({ _id: 'item-1', stageId: 'stage-1', customFields: [{ fieldId: 'note', value: 'Read' }] });
  });
});
