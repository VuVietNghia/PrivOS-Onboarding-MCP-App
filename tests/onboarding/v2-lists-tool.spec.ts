import type { McpApp } from '@privos_ai/app-react';
import { describe, expect, it } from 'vitest';
import { patchFields, queryItems, readAllItems, readItem } from '../../src/ui/onboarding/data/v2-lists';

function tool(value: unknown): unknown {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

describe('v4 List item tool adapter', () => {
  it('keeps query rows when Hub uses id and object customFields', async () => {
    const app = { callServerTool: async () => tool({ items: [{ id: 'item-1', name: 'Ngày 1', stage_id: 'week-1',
      customFields: { kind: 'Ngày', order: 1 } }], nextCursor: null }) } as unknown as McpApp;
    const page = await queryItems(app, 'list-1', {}, 50);
    expect(page.items).toEqual([{ _id: 'item-1', name: 'Ngày 1', stageId: 'week-1',
      customFields: [{ fieldId: 'kind', value: 'Ngày' }, { fieldId: 'order', value: 1 }] }]);
  });

  it('rejects a repeated item ID across cursor pages instead of silently dropping a row', async () => {
    let page = 0;
    const app = { callServerTool: async () => tool({ items: [{ id: 'same', name: 'Ngày', stageId: 'week-1' }],
      nextCursor: page++ === 0 ? 'next-page' : null }) } as unknown as McpApp;
    await expect(readAllItems(app, 'list-1')).rejects.toMatchObject({ code: 'SCHEMA_DRIFT' });
  });

  it('reads an item through getItem and checks its List binding', async () => {
    const calls: string[] = [];
    const app = { callServerTool: async (request: { name: string }) => {
      calls.push(request.name);
      return tool({ item: { id: 'item-1', listId: 'list-1', name: 'Tổng quan', stage: { id: 'stage-1' },
        customFields: [{ fieldDefinitionId: 'assignee', value: ['user-1'] }] } });
    } } as unknown as McpApp;
    expect(await readItem(app, 'list-1', 'item-1')).toEqual({ _id: 'item-1', name: 'Tổng quan', stageId: 'stage-1',
      customFields: [{ fieldId: 'assignee', value: ['user-1'] }] });
    expect(calls).toEqual(['mcpapp.lists.getItem']);
    await expect(readItem(app, 'other-list', 'item-1')).rejects.toMatchObject({ code: 'SCHEMA_DRIFT' });
  });

  it('patches one field while preserving ASSIGNEE and a file object', async () => {
    const calls: { name: string; arguments: Record<string, unknown> }[] = [];
    let item = { _id: 'item-1', listId: 'list-1', name: 'Ngày 1', stageId: 'week-1', customFields: [
      { fieldId: 'assignee', value: ['user-1'] },
      { fieldId: 'attachments', value: [{ _id: 'file-1', name: 'guide.pdf', mimeType: 'application/pdf' }] },
      { fieldId: 'read', value: false },
    ] };
    const app = { callServerTool: async (request: { name: string; arguments: Record<string, unknown> }) => {
      calls.push(request);
      if (request.name === 'mcpapp.lists.getItem') return tool({ item });
      if (request.name === 'mcpapp.lists.updateItem') {
        item = { ...item, customFields: request.arguments.customFields as typeof item.customFields };
        return tool({ item });
      }
      throw new Error(`unexpected ${request.name}`);
    } } as unknown as McpApp;
    await patchFields(app, 'list-1', 'item-1', { read: true });
    expect(calls.map((call) => call.name)).toEqual(['mcpapp.lists.getItem', 'mcpapp.lists.updateItem', 'mcpapp.lists.getItem']);
    expect(calls[1].arguments).toMatchObject({ itemId: 'item-1', customFields: [
      { fieldId: 'assignee', value: ['user-1'] },
      { fieldId: 'attachments', value: [{ _id: 'file-1', name: 'guide.pdf', mimeType: 'application/pdf' }] },
      { fieldId: 'read', value: true },
    ] });
  });
});
