import { expect, it } from 'vitest';
import { fakeRestApp, ok } from '../onboarding/fake-app';
import { createPrivosLists } from '../../src/ui/onboarding/data/privos/lists-adapter';

it('propagates a denied room-list request without writing or returning an empty catalog', async () => {
  const { app, calls, toolCalls } = fakeRestApp([{
    method: 'GET', path: 'lists.listByRoomId',
    reply: () => ({ statusCode: 403, body: { error: 'denied' } }),
  }]);
  const lists = createPrivosLists(app, {
    lifetime: { assertActive() {}, dispose() {} },
    budget: { run: (operation) => operation(), dispose() {} },
  });

  await expect(lists.read.listRoomLists('room-1')).rejects.toMatchObject({ statusCode: 403 });
  expect(calls).toHaveLength(1);
  expect(toolCalls.map((call) => call.name)).toEqual(['mcpapp.lists.getAll']);
});

it('does not retry a rejected stage move as a second write', async () => {
  const { app, calls, toolCalls } = fakeRestApp([{
    method: 'POST', path: 'items.update',
    reply: () => ({ statusCode: 403, body: { error: 'denied' } }),
  }]);
  const lists = createPrivosLists(app, {
    lifetime: { assertActive() {}, dispose() {} },
    budget: { run: () => { throw new Error('WRITE_USED_READ_BUDGET'); }, dispose() {} },
  });

  await expect(lists.write.moveItemToStage('hire-1', 'learning')).rejects.toMatchObject({ statusCode: 403 });
  expect(calls).toHaveLength(1);
  expect(toolCalls.map((call) => call.name)).toEqual(['mcpapp.lists.moveItemToStage']);
});

it('charges each page of a tree read to the request budget', async () => {
  let budgetStarts = 0;
  const { app, toolCalls } = fakeRestApp([{
    method: 'POST', path: 'items.query',
    reply: (_request, index) => ok({
      items: [{ _id: `item-${index}`, name: `Item ${index}`, stageId: 'content', customFields: [] }],
      nextCursor: index === 0 ? 'next-page' : null,
    }),
  }]);
  const lists = createPrivosLists(app, {
    lifetime: { assertActive() {}, dispose() {} },
    budget: { async run(operation) { budgetStarts += 1; return operation(); }, dispose() {} },
  });

  await expect(lists.read.readAllItems('run-1')).resolves.toHaveLength(2);
  expect(toolCalls.map((call) => call.name)).toEqual(['mcpapp.lists.queryItems', 'mcpapp.lists.queryItems']);
  expect(budgetStarts).toBe(2);
});

it('charges list metadata and stages as separate Hub reads', async () => {
  let budgetStarts = 0;
  const { app, calls } = fakeRestApp([{
    method: 'GET', path: 'lists.info',
    reply: () => ok({
      list: { _id: 'list-1', name: 'Template', roomId: 'room-1', isolatedList: true },
      stages: [{ _id: 'content', name: 'Nội dung' }],
    }),
  }]);
  const lists = createPrivosLists(app, {
    lifetime: { assertActive() {}, dispose() {} },
    budget: { async run(operation) { budgetStarts += 1; return operation(); }, dispose() {} },
  });
  await expect(lists.read.getListInfo('list-1')).resolves.toMatchObject({ list: { _id: 'list-1' } });
  expect(calls).toHaveLength(2);
  expect(budgetStarts).toBe(2);
});

it('charges every page of a legacy list read to the request budget', async () => {
  let budgetStarts = 0;
  const { app, calls } = fakeRestApp([{
    method: 'POST', path: 'items.query',
    reply: (_request, index) => ok({
      items: [{ _id: `item-${index}`, name: `Item ${index}`, stageId: 'content' }],
      nextCursor: index === 0 ? 'next-page' : null,
    }),
  }]);
  const lists = createPrivosLists(app, {
    lifetime: { assertActive() {}, dispose() {} },
    budget: { async run(operation) { budgetStarts += 1; return operation(); }, dispose() {} },
  });
  await expect(lists.read.listAllItems('run-1')).resolves.toMatchObject({ capped: false });
  expect(calls).toHaveLength(2);
  expect(budgetStarts).toBe(2);
});
