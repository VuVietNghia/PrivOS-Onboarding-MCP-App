import type { McpApp } from '@privos_ai/app-react';
import type { Lifetime } from '../../../../shared/ports/effects';
import type { ListReadPort, ListWritePort, ListLifecyclePort } from '../../ports/lists';
import {
  listRoomLists, getListInfo, listAllItems, createItem, updateItem,
  deleteItem, createList, renameList, deleteList,
} from '../onboarding-lists';
import {
  listRoomListsViaTool, getIsolatedListViaTool, createIsolatedListViaTool,
} from '../isolated-lists';
import { readListInfo, queryItems, readAllItems, readItem, patchFields } from '../v2-lists';
import { unwrapToolResult } from '../tool-result';

interface ReadBudget {
  run<T>(operation: () => Promise<T>): Promise<T>;
  dispose(): void;
}

export function createPrivosLists(
  app: McpApp,
  effects: { lifetime: Lifetime; budget: ReadBudget },
): { read: ListReadPort; write: ListWritePort; lifecycle: ListLifecyclePort } {
  const runRead = async <T>(operation: () => Promise<T>): Promise<T> => {
    effects.lifetime.assertActive();
    const result = await effects.budget.run(operation);
    effects.lifetime.assertActive();
    return result;
  };
  const guardRead = async <T>(operation: () => Promise<T>): Promise<T> => {
    effects.lifetime.assertActive();
    const result = await operation();
    effects.lifetime.assertActive();
    return result;
  };
  const runWrite = async <T>(operation: () => Promise<T>): Promise<T> => {
    effects.lifetime.assertActive();
    const result = await operation();
    effects.lifetime.assertActive();
    return result;
  };

  const read: ListReadPort = {
    // lists:read and lists:query are consumed by the read-only list methods below.
    listRoomLists: (roomId) => runRead(() => listRoomLists(app, roomId)),
    registryLists: (roomId) => runRead(() => listRoomListsViaTool(app, roomId)),
    isolatedInfo: (listId) => runRead(() => getIsolatedListViaTool(app, listId)),
    getListInfo: (listId) => guardRead(() => getListInfo(app, listId, effects.budget)),
    readListInfo: (listId) => runRead(() => readListInfo(app, listId)),
    queryItems: (listId, filter, count, cursor, sort) => runRead(() => queryItems(app, listId, filter, count, cursor, sort)),
    readAllItems: (listId) => guardRead(() => readAllItems(app, listId, effects.budget)),
    readItem: (listId, itemId) => runRead(() => readItem(app, listId, itemId)),
    listAllItems: (listId) => guardRead(() => listAllItems(app, listId, effects.budget)),
  };
  const write: ListWritePort = {
    // lists:write is consumed by item creation, updates, deletion and stage moves.
    createItem: (input) => runWrite(() => createItem(app, input)),
    updateItem: (input) => runWrite(() => updateItem(app, input)),
    patchFields: (listId, itemId, changes) => runWrite(() => patchFields(app, listId, itemId, changes)),
    deleteItem: (itemId) => runWrite(() => deleteItem(app, itemId)),
    moveItemToStage: (itemId, stageId) => runWrite(async () => {
      unwrapToolResult(await app.callServerTool({
        name: 'mcpapp.lists.moveItemToStage', arguments: { itemId, stageId },
      }));
    }),
  };
  const lifecycle: ListLifecyclePort = {
    createList: (input) => runWrite(() => createList(app, input)),
    createIsolatedList: (input) => runWrite(() => createIsolatedListViaTool(app, input)),
    renameList: (listId, name) => runWrite(() => renameList(app, listId, name)),
    deleteList: (listId) => runWrite(() => deleteList(app, listId)),
  };
  return { read, write, lifecycle };
}
