import { describe, expect, it, vi } from 'vitest';
import { createCatalogs } from '../../src/ui/onboarding/data/catalogs';
import { OnboardingError } from '../../src/ui/onboarding/domain/errors';
import { readAllItems, readItem } from '../../src/ui/onboarding/data/v2-lists';
import { V2, V2_HIRE_FIELDS, V2_POSITION_FIELDS, V2_TEMPLATE_FIELDS } from '../../src/ui/onboarding/domain/v2-fields';
import { fakeRestApp, forbidden, ok } from './fake-app';

const binding = { roomId: 'room-1', positionsListId: 'positions-1', hiresListId: 'hires-1' };
const defs = (fields: readonly { name: string; type: string; options?: string[] }[]) => fields.map((field) => ({
  _id: `id:${field.name}`, name: field.name, type: field.type,
  ...(field.options ? { options: field.options.map((value) => ({ value })) } : {}),
}));
const position = {
  _id: 'position-1', name: 'Kỹ sư', stageId: 'stage-ready', customFields: [
    { fieldId: `id:${V2.template}`, value: 'template-1' },
    { fieldId: `id:${V2.weeks}`, value: 2 }, { fieldId: `id:${V2.days}`, value: 10 },
    { fieldId: `id:${V2.lessons}`, value: 15 }, { fieldId: `id:${V2.questions}`, value: 5 },
    { fieldId: `id:${V2.missingAnswers}`, value: 0 }, { fieldId: `id:${V2.inUse}`, value: 3 },
  ],
};
const hire = {
  _id: 'hire-1', name: 'An', stageId: 'stage-learning', customFields: [
    { fieldId: `id:${V2.employee}`, value: ['user-1'] },
    { fieldId: `id:${V2.position}`, value: 'position-1' },
    { fieldId: `id:${V2.positionName}`, value: 'Kỹ sư' },
    { fieldId: `id:${V2.totalDays}`, value: 10 },
    { fieldId: `id:${V2.startDate}`, value: '2026-09-23' },
    { fieldId: `id:${V2.doneDays}`, value: 2 },
  ],
};

describe('v4 Catalogs read adapter', () => {
  it('requires migration before reading a template List without Cha', async () => {
    const { app, calls } = fakeRestApp([{ method: 'GET', path: 'lists.info', reply: () => ok({ list: {
      _id: 'template-1', roomId: 'room-1', name: 'Template', fieldDefinitions: defs(V2_TEMPLATE_FIELDS.filter((field) => field.name !== V2.parent)),
    }, stages: [{ _id: 'content', name: 'Nội dung', order: 0 }] }) }]);
    await expect(createCatalogs(app, binding).template('template-1')).rejects.toMatchObject({ code: 'SCHEMA_MIGRATION_REQUIRED' });
    expect(calls.some((call) => call.path === 'items.query')).toBe(false);
  });
  it('rejects a template list belonging to another room before querying its items', async () => {
    const { app, toolCalls } = fakeRestApp([{ method: 'GET', path: 'lists.info', reply: () => ok({ list: { _id: 'template-1', roomId: 'other-room', name: 'Template', fieldDefinitions: defs(V2_TEMPLATE_FIELDS) }, stages: [] }) }]);
    await expect(createCatalogs(app, binding).template('template-1')).rejects.toMatchObject({ code: 'SCHEMA_DRIFT' });
    expect(toolCalls.map((call) => call.name)).toEqual(['mcpapp.lists.get']);
  });
  it('reports invalid and unknown stage filters with typed errors', async () => {
    const { app } = fakeRestApp([
      { method: 'GET', path: 'lists.info', reply: () => ok({ list: { _id: binding.positionsListId, name: 'Positions', fieldDefinitions: defs(V2_POSITION_FIELDS) }, stages: [{ _id: 'stage-ready', name: 'Sẵn sàng' }] }) },
    ]);
    const catalogs = createCatalogs(app, binding);
    await expect(catalogs.positions({ text: '', status: 'ready', stageId: 'stage-ready' })).rejects.toMatchObject<OnboardingError>({ code: 'FILTER_INVALID' });
    await expect(catalogs.positions({ text: '', status: 'draft' })).rejects.toMatchObject<OnboardingError>({ code: 'SCHEMA_DRIFT' });
  });

  it('backs off and retries a 429 response from the Hub on a read', async () => {
    vi.useFakeTimers();
    try {
      const { app, calls } = fakeRestApp([
        { method: 'GET', path: 'lists.info', reply: (_request, index) => index === 0
          ? { statusCode: 429, body: { success: false, error: 'rate limit' } }
          : ok({ list: { _id: binding.positionsListId, name: 'Positions', fieldDefinitions: defs(V2_POSITION_FIELDS) }, stages: [{ _id: 'stage-ready', name: 'Sẵn sàng' }] }) },
        { method: 'POST', path: 'items.query', reply: () => ok({ items: [], nextCursor: null }) },
      ]);
      const pending = createCatalogs(app, binding).positions({ text: '' });
      const settled = expect(pending).resolves.toMatchObject({ items: [] });
      await vi.advanceTimersByTimeAsync(999);
      expect(calls.map((call) => call.path)).toEqual(['lists.info']);
      await vi.advanceTimersByTimeAsync(1);
      await settled;
      expect(calls.map((call) => call.path)).toEqual(['lists.info', 'lists.info', 'items.query']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('queries the configured positions list with 50 rows and server-side name/stage filters', async () => {
    const { app, calls, toolCalls } = fakeRestApp([
      { method: 'GET', path: 'lists.info', reply: () => ok({ list: { _id: binding.positionsListId, name: 'Positions', fieldDefinitions: defs(V2_POSITION_FIELDS) }, stages: [{ _id: 'stage-ready', name: 'Sẵn sàng' }] }) },
      { method: 'POST', path: 'items.query', reply: () => ok({ items: [position], nextCursor: 'next-1' }) },
    ]);
    const page = await createCatalogs(app, binding).positions({ text: 'Kỹ', status: 'ready' });
    expect(page).toEqual({ items: [{ id: 'position-1', name: 'Kỹ sư', templateListId: 'template-1', status: 'ready', weeks: 2, days: 10, lessons: 15, questions: 5, missingAnswers: 0, inUse: 3 }], nextCursor: 'next-1' });
    expect(calls.map((call) => call.path)).toEqual(['lists.info', 'items.query']);
    expect(toolCalls.map((call) => call.name)).toEqual(['mcpapp.lists.get', 'mcpapp.lists.queryItems']);
    expect(toolCalls[1].arguments).toMatchObject({ listId: 'positions-1', count: 50 });
    expect(calls[1].body).toEqual({ listId: 'positions-1', count: 50,
      filter: { stageId: 'stage-ready', archived: false, customFields: [{ fieldId: 'name', op: 'contains', value: 'Kỹ' }] },
      sort: { field: 'order', direction: 1 }, fields: ['name', 'description', 'stageId', 'parentId', 'customFields'],
    });
  });

  it('filters hires by position field ID, preserving the opaque cursor', async () => {
    const { app, calls } = fakeRestApp([
      { method: 'GET', path: 'lists.info', reply: () => ok({ list: { _id: binding.hiresListId, name: 'Hires', fieldDefinitions: defs(V2_HIRE_FIELDS) }, stages: [{ _id: 'stage-learning', name: 'Đang học' }] }) },
      { method: 'POST', path: 'items.query', reply: () => ok({ items: [hire], nextCursor: null }) },
    ]);
    const page = await createCatalogs(app, binding).hires({ text: 'An', positionId: 'position-1', status: 'learning' }, 'opaque-1');
    expect(page.items[0]).toMatchObject({ id: 'hire-1', employeeId: 'user-1', positionId: 'position-1', status: 'learning', doneDays: 2 });
    expect(page.nextCursor).toBeNull();
    expect(calls[1].body).toEqual({ listId: 'hires-1', count: 50, cursor: 'opaque-1', filter: { archived: false, stageId: 'stage-learning', customFields: [
      { fieldId: 'name', op: 'contains', value: 'An' },
      { fieldId: `id:${V2.position}`, op: 'is', value: 'position-1' },
    ] }, sort: { field: 'order', direction: 1 }, fields: ['name', 'description', 'stageId', 'parentId', 'customFields'] });
  });

  it('loads 601 template items over four 200-row windows without parent filter', async () => {
    const pages = [200, 200, 200, 1];
    const { app, calls } = fakeRestApp([
      { method: 'GET', path: 'lists.info', reply: () => ok({ list: { _id: 'template-1', name: 'Template', fieldDefinitions: defs(V2_TEMPLATE_FIELDS) }, stages: [{ _id: 'week-1', name: 'Tuần đầu', order: 0 }] }) },
      { method: 'POST', path: 'items.query', reply: (_req, index) => ok({
        items: Array.from({ length: pages[index] }, (_, offset) => ({
          _id: `day-${index * 200 + offset}`, name: 'Ngày', stageId: 'week-1', parentId: null,
          customFields: [{ fieldId: `id:${V2.kind}`, value: 'Ngày' }, { fieldId: `id:${V2.order}`, value: index * 200 + offset + 1 }],
        })),
        nextCursor: index < 3 ? `cursor-${index + 1}` : null,
      }) },
    ]);
    const tree = await createCatalogs(app, binding).template('template-1');
    expect(tree.items).toHaveLength(601);
    expect(tree.items.at(-1)?.id).toBe('day-600');
    expect(tree.weeks).toEqual([{ id: 'week-1', name: 'Tuần đầu', order: 0 }]);
    expect(calls.filter((call) => call.path === 'items.query')).toHaveLength(4);
    expect(calls[1].body).toMatchObject({ listId: 'template-1', count: 200 });
    expect(calls[1].body.filter?.parentId).toBeUndefined();
  });

  it('does not fall back to capped list retrieval after a 403 query response', async () => {
    const { app, calls } = fakeRestApp([{ method: 'POST', path: 'items.query', reply: () => forbidden() }]);
    await expect(readAllItems(app, 'template-1')).rejects.toThrow();
    expect(calls.map((call) => call.path)).toEqual(['items.query']);
  });

  it('accepts a successful tool response with an inner data envelope', async () => {
    const { app, toolCalls } = fakeRestApp([{ method: 'POST', path: 'items.query', reply: () => ok({ data: { items: [{ _id: 'one', name: 'One', stageId: 'week-1' }], nextCursor: null } }) }]);
    expect((await readAllItems(app, 'template-1')).map((item) => item._id)).toEqual(['one']);
    expect(toolCalls.map((call) => call.name)).toEqual(['mcpapp.lists.queryItems']);
  });

  it('rejects a repeated cursor instead of looping indefinitely', async () => {
    const { app, calls } = fakeRestApp([{ method: 'POST', path: 'items.query', reply: () => ok({ items: [], nextCursor: 'repeated' }) }]);
    await expect(readAllItems(app, 'template-1')).rejects.toThrow('PAGINATION_INVALID');
    expect(calls).toHaveLength(2);
  });

  it('keeps ID lookup unavailable until a public Hub lookup contract is proven', async () => {
    const { app, toolCalls } = fakeRestApp([{ method: 'GET', path: 'items.get', reply: () => ok({ item: { ...hire, listId: 'hires-1' } }) }]);
    expect(await readItem(app, 'hires-1', 'hire-1')).toMatchObject({ _id: 'hire-1', name: 'An' });
    expect(toolCalls.map((call) => call.name)).toEqual(['mcpapp.lists.getItem']);
  });

  it('loads position and hire details through item tools', async () => {
    const { app, toolCalls } = fakeRestApp([
      { method: 'GET', path: 'lists.info', reply: (request) => ok({ list: { _id: request.query?.listId,
        name: 'Registry', fieldDefinitions: defs(request.query?.listId === 'positions-1' ? V2_POSITION_FIELDS : V2_HIRE_FIELDS) },
      stages: request.query?.listId === 'positions-1'
        ? [{ _id: 'stage-ready', name: 'Sẵn sàng', order: 1 }]
        : [{ _id: 'stage-learning', name: 'Đang học', order: 1 }] }) },
      { method: 'GET', path: 'items.get', reply: (request) => ok({ item: request.query?.itemId === 'position-1'
        ? { ...position, listId: 'positions-1' } : { ...hire, listId: 'hires-1' } }) },
    ]);
    const catalogs = createCatalogs(app, binding);
    expect((await catalogs.position('position-1')).id).toBe('position-1');
    expect((await catalogs.hire('hire-1')).employeeId).toBe('user-1');
    expect(toolCalls.map((call) => call.name)).toEqual([
      'mcpapp.lists.get', 'mcpapp.lists.getItem', 'mcpapp.lists.get', 'mcpapp.lists.getItem',
    ]);
  });
});
